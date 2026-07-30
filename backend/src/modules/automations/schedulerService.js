import Device from '../devices/Device.js';
import { publishToTopic } from '../../integrations/mqtt/mqttManager.js';
import SwitchOffPreset from './SwitchOffPreset.js';
import { executeSwitchPreset } from './switchPresetExecutor.js';

const emitPresetNotification = (io, preset, notification) => {
  if (preset.ownerUserId) {
    io.to(`user:${preset.ownerUserId}`).emit('automation_notification', notification);
  } else {
    io.emit('automation_notification', notification);
  }
};

const emitScheduleNotification = (io, device, message, schedule) => {
  io.emit('automation_notification', {
    id: `schedule-${schedule?._id || device.deviceId}-${Date.now()}`,
    deviceId: device.deviceId,
    deviceName: device.title || device.deviceId,
    deviceType: device.type || 'device',
    room: device.room || 'Unassigned',
    message,
    type: 'automation',
    triggeredAt: new Date()
  });
};

export const startScheduler = (io) => {
  console.log('⏰ Custom Action Scheduler Service started');
  
  setInterval(async () => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
    
    try {
      const dueTimers = await SwitchOffPreset.find({
        executionMode: 'timer',
        enabled: true,
        nextRunAt: { $lte: now }
      });
      for (const preset of dueTimers) {
        const claimed = await SwitchOffPreset.findOneAndUpdate(
          { _id: preset._id, enabled: true, nextRunAt: { $lte: now } },
          { $set: { enabled: false, lastRunAt: now }, $unset: { nextRunAt: 1 } },
          { new: true }
        );
        if (claimed) {
          io.emit('switch_preset_state', {
            presetId: String(claimed._id),
            enabled: false,
            nextRunAt: null,
            lastRunAt: now
          });
          // Re-read the target configuration immediately before running so an
          // edited fan level cannot be replaced by an older claimed snapshot.
          const latestPreset = await SwitchOffPreset.findById(claimed._id).lean();
          const result = await executeSwitchPreset(latestPreset || claimed, io);
          emitPresetNotification(io, claimed, {
            id: `switch-timer-${claimed._id}-${Date.now()}`,
            presetId: String(claimed._id),
            room: claimed.room,
            deviceName: result.aborted ? 'No response from the device' : claimed.name,
            message: result.aborted
              ? `Check WiFi connection. "${claimed.name}" stopped at ${result.failedTarget?.label || `Switch ${result.failedTarget?.subDeviceIndex}`} after 2 attempts.`
              : `${claimed.action === 'on' ? 'Turned ON' : 'Turned OFF'} by timer`,
            type: result.aborted ? 'automation-error' : 'automation',
            triggeredAt: now
          });
        }
      }

      const scheduleRunKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${currentTime}`;
      const scheduledPresets = await SwitchOffPreset.find({
        executionMode: 'schedule',
        enabled: true,
        scheduleTime: currentTime,
        scheduleDays: currentDay,
        lastRunKey: { $ne: scheduleRunKey }
      });
      for (const preset of scheduledPresets) {
        const claimed = await SwitchOffPreset.findOneAndUpdate(
          { _id: preset._id, enabled: true, lastRunKey: { $ne: scheduleRunKey } },
          { $set: { lastRunKey: scheduleRunKey, lastRunAt: now } },
          { new: true }
        );
        if (claimed) {
          // Re-read after claiming the run so edits made near the trigger time
          // are applied, then let the executor compare desired vs present state.
          const latestPreset = await SwitchOffPreset.findById(claimed._id).lean();
          const executablePreset = latestPreset || claimed;
          const result = await executeSwitchPreset(executablePreset, io);
          emitPresetNotification(io, claimed, {
            id: `switch-schedule-${claimed._id}-${Date.now()}`,
            room: claimed.room,
            deviceName: result.aborted ? 'No response from the device' : claimed.name,
            message: result.aborted
              ? `Check WiFi connection. "${claimed.name}" stopped at ${result.failedTarget?.label || `Switch ${result.failedTarget?.subDeviceIndex}`} after 2 attempts.`
              : result.executedCount > 0
                ? `${claimed.action === 'on' ? 'Turned ON' : 'Turned OFF'} by schedule`
                : `Schedule checked: already ${claimed.action === 'on' ? 'ON' : 'OFF'}, no publish required`,
            type: result.aborted ? 'automation-error' : 'automation',
            triggeredAt: now
          });
        }
      }

      const devices = await Device.find({
        'schedules.enabled': true,
        'schedules.days': currentDay
      });

      for (const device of devices) {
        let stateChanged = false;
        
        for (const schedule of device.schedules) {
          if (!schedule.enabled || !schedule.days.includes(currentDay)) continue;

          if (
            device.type === 'rgbw'
            && schedule.restoreAfterEnd
            && schedule.restorePending
            && schedule.endTime === currentTime
            && schedule.restoreState
          ) {
            const previous = schedule.restoreState;
            const topic = device.topic || `rgbw-light/${device.deviceId}/light/command`;
            if (!previous.on) {
              await publishToTopic(topic, { type: 'brightness', value: 0 });
            } else if (previous.effect && previous.effect !== 'solid') {
              await publishToTopic(topic, { type: 'animations', model: previous.effect });
            } else {
              const rgb = Number(previous.spectrumRgb) || 0;
              await publishToTopic(topic, {
                type: 'colour',
                colour: [(rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF, 0]
              });
              await publishToTopic(topic, { type: 'brightness', value: Math.max(1, Number(previous.brightness) || 128) });
            }
            device.on = Boolean(previous.on);
            device.brightness = Number(previous.brightness) || 0;
            device.spectrumRgb = Number(previous.spectrumRgb) || 0;
            device.effect = previous.effect || 'solid';
            schedule.restorePending = false;
            schedule.restoreState = undefined;
            stateChanged = true;
            emitScheduleNotification(io, device, 'Previous RGBW light state restored', schedule);
            continue;
          }

          if (
            (device.type === 'rgbw' || device.type === 'tunable-light' || device.type === 'tune light')
            && schedule.endEnabled
            && schedule.endTime === currentTime
          ) {
            const isTunable = device.type === 'tunable-light' || device.type === 'tune light';
            const endOn = (schedule.endActionType || 'OFF') === 'ON';
            const topic = isTunable
              ? `tunable-light/${device.deviceId}/light/command`
              : device.topic || `rgbw-light/${device.deviceId}/light/command`;
            const brightness = endOn
              ? Math.max(1, Number(device.brightness) || (isTunable ? 50 : 128))
              : 0;
            await publishToTopic(topic, {
              type: 'brightness',
              value: isTunable ? Math.min(100, Math.round(brightness > 100 ? brightness / 255 * 100 : brightness)) : brightness
            });
            device.on = endOn;
            device.brightness = brightness;
            stateChanged = true;
            emitScheduleNotification(io, device, `Turned ${endOn ? 'ON' : 'OFF'} by automation end action`, schedule);
            continue;
          }

          if (
            (device.type === 'rgbw' || device.type === 'tunable-light' || device.type === 'tune light')
            && schedule.actionTime === currentTime
            && schedule.actionType
          ) {
            const isTunable = device.type === 'tunable-light' || device.type === 'tune light';
            const topic = isTunable
              ? `tunable-light/${device.deviceId}/light/command`
              : device.topic || `rgbw-light/${device.deviceId}/light/command`;
            if (!isTunable && schedule.restoreAfterEnd) {
              schedule.restoreState = {
                on: device.on,
                brightness: device.brightness,
                spectrumRgb: device.spectrumRgb,
                effect: device.effect
              };
              schedule.restorePending = true;
            }
            let payload;
            if (schedule.actionType === 'ON') {
              const currentBrightness = Math.max(1, Number(device.brightness) || 128);
              payload = {
                type: 'brightness',
                value: isTunable
                  ? Math.min(100, Math.round(currentBrightness > 100 ? currentBrightness / 255 * 100 : currentBrightness))
                  : currentBrightness
              };
              device.on = true;
            } else if (schedule.actionType === 'OFF') {
              payload = { type: 'brightness', value: 0 };
              device.on = false;
              device.brightness = 0;
            } else if (schedule.actionType === 'BRIGHTNESS') {
              const percent = Math.min(100, Math.max(1, Number(schedule.scheduledBrightness) || 50));
              const nativeBrightness = Math.round(percent / 100 * 255);
              payload = { type: 'brightness', value: isTunable ? percent : nativeBrightness };
              device.brightness = nativeBrightness;
              device.on = true;
            } else if (!isTunable && schedule.actionType === 'COLOR') {
              const colour = schedule.rgbwColor || {};
              payload = { type: 'colour', colour: [colour.r || 0, colour.g || 0, colour.b || 0, colour.w || 0] };
              device.spectrumRgb = ((colour.r || 0) << 16) | ((colour.g || 0) << 8) | (colour.b || 0);
              device.effect = 'solid';
              device.on = true;
            } else if (!isTunable) {
              payload = { type: 'animations', model: schedule.animationEffect || 'rainbow' };
              device.effect = schedule.animationEffect || 'rainbow';
              device.on = true;
            } else {
              continue;
            }
            await publishToTopic(topic, payload);
            stateChanged = true;
            const rgbwMessage = schedule.actionType === 'ON'
              ? 'Turned ON by automation'
              : schedule.actionType === 'OFF'
                ? 'Turned OFF by automation'
                : schedule.actionType === 'BRIGHTNESS'
                  ? `Brightness set to ${schedule.scheduledBrightness || 50}%`
                : schedule.actionType === 'COLOR'
                  ? 'Scheduled colour applied'
                  : `${schedule.animationEffect || 'Rainbow'} animation started`;
            emitScheduleNotification(io, device, rgbwMessage, schedule);
            continue;
          }

          let action = null;
          if (schedule.startTime === currentTime) action = schedule.startAction || 'ON';
          else if (schedule.endTime === currentTime) action = schedule.endAction || 'OFF';

          if (action) {
            console.log(`[SCHEDULE] Triggering ${action} for ${device.deviceId} at ${currentTime}`);
            
            const on = action === 'ON';
            const id = device.deviceId;
            
            let topic = device.topic || `smarthome/${device.type}/${device.deviceId}`;
            if (id.startsWith('B3E') || id.startsWith('B1E')) {
              topic = `energy-meter/three-phase/command/${id}`;
            } else if (id.startsWith('BSP') || device.type === 'plug' || device.type === 'switch') {
              topic = `smart-switch/command/${id}`;
            } else if (device.type === 'tunable-light' || device.type === 'tune light') {
              topic = `tunable-light/${id}/light/command`;
            }

            const mqttPayload = device.type === 'tunable-light' || device.type === 'tune light'
              ? { type: 'brightness', value: on ? Math.max(1, Math.round((Number(device.brightness) || 128) / 255 * 100)) : 0 }
              : (id.startsWith('B3E') || id.startsWith('B1E') || id.startsWith('BSP') || device.type === 'plug' || device.type === 'switch')
                ? { entityId: id, relayStatus: action }
                : { state: action };

            await publishToTopic(topic, mqttPayload);
            device.on = on;
            if (device.type === 'tunable-light' || device.type === 'tune light') {
              device.brightness = on ? Math.max(1, Number(device.brightness) || 128) : 0;
            }
            stateChanged = true;
            emitScheduleNotification(
              io,
              device,
              `${on ? 'Turned ON' : 'Turned OFF'} by automation`,
              schedule
            );
          }
        }

        if (stateChanged) {
          await device.save();
          io.emit('device_state_update', device);
        }
      }
    } catch (err) {
      console.error('Error in scheduler interval:', err);
    }
  }, 15000);
};
