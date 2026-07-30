import { getWaterLevelState, publishToTopic } from '../../integrations/mqtt/mqttManager.js';
import Device from '../../modules/devices/Device.js';
import Automation from '../../modules/automations/Automation.js';
import { getSensorData, updateSensorData, evaluateAutomations } from '../../modules/automations/automationEngine.js';
import { callService, sendMessage, cachedHaStates } from '../../integrations/homeassistant/ha-client.js';
import { publishStateToHA } from '../../integrations/homeassistant/ha-discovery.js';
import { initStaircase } from '../../modules/staircase/staircaseService.js';
import WaterLevelConfig from '../../modules/devices/WaterLevelConfig.js';
import { rememberTouchPanelState } from '../../modules/devices/touchPanelCommandGuard.js';
import { getPanelCommandTopic, getPanelTopicPrefix, isPanelDevice } from '../../modules/devices/panelDevice.js';
import { isAutomationDeviceLocked } from '../../modules/automations/automationDeviceLock.js';


export const initSocket = (io, mqttClient) => {
  initStaircase(io);

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    if (socket.profile?.id) socket.join(`user:${socket.profile.id}`);

    const alwaysAllowedEvents = new Set(['request_initial_states', 'request_mqtt_status']);
    const permissionForEvent = event => {
      if (event.startsWith('wli_')) return 'water-level';
      if (/audio|music|media|speaker|volume/i.test(event)) return 'audio-devices';
      if (/staircase/i.test(event)) return 'staircase';
      if (/scene|automation|schedule/i.test(event)) return 'scenes';
      return 'devices';
    };
    const canSeeState = state =>
      socket.profile?.role === 'admin' ||
      socket.profile?.allRoomsAccess ||
      (socket.profile?.allowedRoomNames || []).includes(state?.room);
    socket.use(async ([event, payload = {}], next) => {
      if (alwaysAllowedEvents.has(event) || socket.profile?.role === 'admin') return next();
      const permission = permissionForEvent(event);
      if (!(socket.profile?.permissions || []).includes(permission)) {
        return next(new Error(`Profile cannot use ${permission}`));
      }
      if (socket.profile?.allRoomsAccess) return next();
      const deviceId = payload.deviceId || payload.entityId || payload.entity_id;
      if (!deviceId) return next();
      const device = await Device.findOne({ deviceId }).select('room roomId');
      if (device && !(socket.profile?.allowedRoomIds || []).map(String).includes(String(device.roomId))) {
        return next(new Error('Profile cannot access this room'));
      }
      next();
    });



    // Send current MQTT status immediately
    socket.emit('mqtt_status', { 
      status: mqttClient.connected ? 'Connected' : 'Offline' 
    });

    // Send currently cached Home Assistant states to the new client
    cachedHaStates.forEach(state => {
      if (canSeeState(state)) socket.emit('ha_entity_state_change', state);
    });

    socket.on('request_initial_states', () => {
      socket.emit('mqtt_status', {
        status: mqttClient.connected ? 'Connected' : 'Offline'
      });
      cachedHaStates.forEach(state => {
        if (canSeeState(state)) socket.emit('ha_entity_state_change', state);
      });
    });

    socket.on('request_mqtt_status', (ack) => {
      const result = { status: mqttClient.connected ? 'Connected' : 'Offline' };
      if (typeof ack === 'function') ack(result);
      else socket.emit('mqtt_status', result);
    });

    socket.on('wli_subscribe', (data = {}) => {
      const deviceId = String(data.deviceId || '').trim();
      if (!/^[A-Za-z0-9_-]+$/.test(deviceId)) return;

      const retainedState = getWaterLevelState(deviceId);
      if (retainedState) {
        Object.entries(retainedState).forEach(([metric, value]) => {
          socket.emit('water_level_update', { deviceId, metric, value });
        });
      }

      const topics = ['TANK', 'BATTERY', 'MOTOR', 'ALERT']
        .map(metric => `SMARTHOME/WLI/${deviceId}/${metric}`);
      mqttClient.subscribe(topics, (err) => {
        if (err) {
          console.error(`[WLI] Failed to subscribe for ${deviceId}:`, err.message);
        }
      });
    });

    socket.on('wli_motor_command', async (data = {}, ack) => {
      const deviceId = String(data.deviceId || '').trim();
      const state = String(data.state || '').trim().toUpperCase();
      if (!/^[A-Za-z0-9_-]+$/.test(deviceId) || !['ON', 'OFF'].includes(state)) {
        if (ack) ack({ ok: false, error: 'Invalid water-level device or motor state' });
        return;
      }

      try {
        const ok = await publishToTopic(`SMARTHOME/WLI/${deviceId}/SWITCH`, state);
        if (ack) ack({ ok });
      } catch (err) {
        console.error(`[WLI] Motor command failed for ${deviceId}:`, err.message);
        if (ack) ack({ ok: false, error: 'MQTT publish failed' });
      }
    });

    socket.on('wli_get_automation', async (data = {}, ack) => {
      const deviceId = String(data.deviceId || '').trim().toUpperCase();
      if (!/^[A-Z0-9_-]+$/.test(deviceId)) return ack?.({ ok: false });
      try {
        const config = await WaterLevelConfig.findOne({ deviceId }).lean();
        ack?.({ ok: true, config: config || { deviceId, enabled: false, onLevel: 25, offLevel: 90 } });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on('wli_save_automation', async (data = {}, ack) => {
      const deviceId = String(data.deviceId || '').trim().toUpperCase();
      const onLevel = Number(data.onLevel);
      const offLevel = Number(data.offLevel);
      if (!/^[A-Z0-9_-]+$/.test(deviceId) || onLevel < 0 || offLevel > 100 || onLevel >= offLevel) {
        return ack?.({ ok: false, error: 'ON level must be lower than OFF level' });
      }
      try {
        const config = await WaterLevelConfig.findOneAndUpdate(
          { deviceId },
          { deviceId, enabled: Boolean(data.enabled), onLevel, offLevel },
          { upsert: true, new: true, runValidators: true }
        ).lean();
        ack?.({ ok: true, config });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on('ha_command', (data) => {
      const { domain, service, entityId, serviceData } = data;
      console.log(`[HA] Received command from frontend: ${domain}.${service} on ${entityId}`);
      callService(domain, service, { entity_id: entityId, ...serviceData });
    });

    socket.on('ha_browse_media', (data, ack) => {
      let targetEntityId = data.entity_id;
      const state = cachedHaStates.get(targetEntityId);
      
      // If the target is unavailable, try to find ANY active Music Assistant player to browse instead
      if (!state || state.state === 'unavailable') {
        const fallback = Array.from(cachedHaStates.values()).find(s => 
          s.entity_id.startsWith('media_player.') && 
          (s.attributes?.mass_player_id || s.attributes?.provider === 'music_assistant' || s.platform === 'music_assistant') && 
          s.state !== 'unavailable'
        );
        if (fallback) {
          console.log(`[HA] ${targetEntityId} is unavailable. Using fallback ${fallback.entity_id} for browsing.`);
          targetEntityId = fallback.entity_id;
        }
      }

      console.log(`[HA] Browsing media for ${targetEntityId} (${data.media_content_type || 'root'})`);
      const payload = {
        type: 'media_player/browse_media',
        entity_id: targetEntityId
      };
      // Only include content_type and content_id if provided (root browse omits them)
      if (data.media_content_type) payload.media_content_type = data.media_content_type;
      if (data.media_content_id) payload.media_content_id = data.media_content_id;
      
      sendMessage(payload, (response) => {
        if (response.success === false) {
          console.error(`[HA] Browse media error:`, JSON.stringify(response.error || response).slice(0, 300));
        } else {
          const childCount = response?.result?.children?.length || 0;
          console.log(`[HA] Browse media result: ${childCount} children for ${data.entity_id}`);
        }
        if (ack) ack(response);
      });
    });

    socket.on('ha_search_media', (data, ack) => {
      console.log(`[HA] Searching media for "${data.query}" on Music Assistant`);
      
      let maConfigEntryId = null;
      for (const [id, state] of cachedHaStates.entries()) {
        if (state.platform === 'music_assistant' && state.configEntryId) {
          maConfigEntryId = state.configEntryId;
          break;
        }
      }

      // Use call_service with return_response to get the search results directly
      const payload = {
        type: 'call_service',
        domain: 'music_assistant',
        service: 'search',
        service_data: {
          name: data.query,
          media_type: ['track', 'album', 'artist', 'playlist'],
          limit: 25,
          library_only: false,
          ...(maConfigEntryId && { config_entry_id: maConfigEntryId })
        },
        return_response: true
      };
      
      sendMessage(payload, (response) => {
        if (response && response.result && response.result.response) {
          // Transform MA search results into browse_media-like format for the frontend
          const raw = response.result.response || {};
          const children = [];
          
          // Process tracks
          if (raw.tracks) {
            raw.tracks.forEach(t => {
              children.push({
                title: `${t.name}${t.artists ? ' — ' + t.artists.map(a => a.name).join(', ') : ''}`,
                media_content_id: t.uri,
                media_content_type: 'music',
                media_class: 'track',
                can_play: true,
                can_expand: false,
                thumbnail: typeof t.image === 'string' ? t.image : (t.image?.url || t.metadata?.images?.[0]?.url || null)
              });
            });
          }
          // Process albums  
          if (raw.albums) {
            raw.albums.forEach(a => {
              children.push({
                title: `${a.name}${a.artists ? ' — ' + a.artists.map(ar => ar.name).join(', ') : ''}`,
                media_content_id: a.uri,
                media_content_type: 'music',
                media_class: 'album',
                can_play: true,
                can_expand: true,
                thumbnail: typeof a.image === 'string' ? a.image : (a.image?.url || a.metadata?.images?.[0]?.url || null)
              });
            });
          }
          // Process artists
          if (raw.artists) {
            raw.artists.forEach(a => {
              children.push({
                title: a.name,
                media_content_id: a.uri,
                media_content_type: 'music',
                media_class: 'artist',
                can_play: false,
                can_expand: true,
                thumbnail: typeof a.image === 'string' ? a.image : (a.image?.url || a.metadata?.images?.[0]?.url || null)
              });
            });
          }
          // Process playlists
          if (raw.playlists) {
            raw.playlists.forEach(p => {
              children.push({
                title: p.name,
                media_content_id: p.uri,
                media_content_type: 'playlist',
                media_class: 'playlist',
                can_play: true,
                can_expand: true,
                thumbnail: typeof p.image === 'string' ? p.image : (p.image?.url || p.metadata?.images?.[0]?.url || null)
              });
            });
          }
          
          if (ack) ack({ success: true, result: { children } });
        } else {
          console.log('[HA] Search response:', JSON.stringify(response));
          if (ack) ack({ success: false, result: { children: [] } });
        }
      });
    });

    socket.on('power_toggle', async (data) => {
      const { deviceId, state, relayStatus, entityId } = data;
      const requestedState = typeof state === 'string' ? state.toUpperCase() : undefined;
      const on = requestedState === 'ON'
        ? true
        : requestedState === 'OFF'
          ? false
          : (relayStatus === 'ON');
      const id = deviceId || entityId;
      
      // Look up device to get its type and topic
      const device = await Device.findOne({ deviceId: id });
      if (!device) return;

      let topic = device.topic || `smarthome/${device.type}/${device.deviceId}`;
      
      if (device.type === 'rgbw' && !device.topic) {
        topic = `rgbw-light/${id}/light/command`;
      } else if (device.type === 'light' && !device.topic) {
        topic = `smart_home/rgbw/${id}/command`;
      } else if (id.startsWith('B3E') || id.startsWith('B1E')) {
        topic = `energy-meter/three-phase/command/${id}`;
      } else if (id.startsWith('BSP') || device.type === 'plug' || device.type === 'switch') {
        topic = `smart-switch/command/${id}`;
      }

      let mqttPayload;
      if (device.type === 'rgbw') {
        topic = device.topic || `rgbw-light/${id}/light/command`;
        const stateUpdate = { on };
        if (on) {
          stateUpdate.brightness = 128;
          mqttPayload = { command: 'brightness_change', brightness: stateUpdate.brightness };
        } else {
          stateUpdate.brightness = 0;
          stateUpdate.effect = 'solid';
          mqttPayload = { command: 'brightness_change', brightness: 0 };
        }
        await updateDeviceAndPublish(device.deviceId, stateUpdate, mqttPayload, topic);
      } else if (device.type === 'tunable-light' || device.type === 'tune light') {
        topic = `tunable-light/${id}/light/command`;
        const defaultBrightnessPct = 50;
        mqttPayload = { type: 'brightness', value: on ? defaultBrightnessPct : 0 };
        // When turning ON, set a default mid-scale brightness for both the device and the UI slider.
        // When turning OFF, reset brightness to 0 in the DB so the slider resets.
        const stateUpdate = { on };
        if (on) {
          stateUpdate.brightness = Math.round((defaultBrightnessPct / 100) * 255);
        } else {
          stateUpdate.brightness = 0;
        }
        await updateDeviceAndPublish(device.deviceId, stateUpdate, mqttPayload, topic);
      } else if (id.startsWith('B3E') || id.startsWith('B1E') || id.startsWith('BSP') || device.type === 'plug' || device.type === 'switch') {
        mqttPayload = { entityId: id, relayStatus: on ? 'ON' : 'OFF' };
        await updateDeviceAndPublish(device.deviceId, { on }, mqttPayload, topic);
      } else {
        mqttPayload = { state: on ? 'ON' : 'OFF' };
        await updateDeviceAndPublish(device.deviceId, { on }, mqttPayload, topic);
      }
    });

    socket.on('touch_panel_all_off', async (data) => {
      const { deviceId } = data;
      if (isAutomationDeviceLocked(deviceId)) {
        socket.emit('toast_message', 'This device is locked until its timer or schedule automation completes');
        return;
      }
      const device = await Device.findOne({ deviceId });
      if (!device || !device.subDevices) return;

      const topic = getPanelCommandTopic(device);
      for (const subDevice of device.subDevices) {
        if (!subDevice.on) continue;
        rememberTouchPanelState(deviceId, subDevice.index, false);
        await publishToTopic(topic, {
          entityId: deviceId,
          type: 'switch',
          value: `${subDevice.index}0`
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Update all to OFF in DB
      await Device.updateOne(
        { deviceId },
        { $set: { "subDevices.$[].on": false, "subDevices.$[].speed": 0 } }
      );

      const updatedDevice = await Device.findOne({ deviceId });
      io.emit('device_state_update', updatedDevice);
      try {
        await publishStateToHA(updatedDevice);
      } catch (haErr) {
        console.error(`[HA PANEL SYNC] Failed to sync panel all-off:`, haErr.message);
      }
    });

    socket.on('touch_panel_action', async (data) => {
      const { deviceId, subDeviceIndex, type, value } = data;
      if (isAutomationDeviceLocked(deviceId)) {
        socket.emit('toast_message', 'This device is locked until its timer or schedule automation completes');
        return;
      }
      const device = await Device.findOne({ deviceId });
      if (!device) return;
      const index = Number(subDeviceIndex);
      const subDevice = device.subDevices?.find(sd => Number(sd.index) === index);
      if (!Number.isInteger(index) || index < 1 || !subDevice) return;

      const topic = getPanelCommandTopic(device);
      let mqttPayload = { entityId: deviceId };

      if (type === 'switch') {
        const state = value ? '1' : '0';
        mqttPayload.type = 'switch';
        mqttPayload.value = `${index}${state}`;

        // Send to the panel immediately; persistence should not delay physical response.
        await publishToTopic(topic, mqttPayload);
        await Device.updateOne(
          { deviceId, "subDevices.index": index },
          { $set: { "subDevices.$.on": value } }
        );
      } else if (type === 'fan') {
        const speed = Number(value);
        if (subDevice.type !== 'fan' || !subDevice.on || !Number.isInteger(speed) || speed < 1 || speed > 5) return;
        mqttPayload.type = 'dimmer';
        mqttPayload.dimmer = String(index);
        mqttPayload.value = String(speed);

        await publishToTopic(topic, mqttPayload);
        await Device.updateOne(
          { deviceId, "subDevices.index": index },
          { $set: { "subDevices.$.speed": speed, "subDevices.$.on": true } }
        );
      } else {
        return;
      }

      // Update local devices and emit
      const updatedDevice = await Device.findOne({ deviceId });
      io.emit('device_state_update', updatedDevice);
      try {
        await publishStateToHA(updatedDevice);
      } catch (haErr) {
        console.error(`[HA PANEL ACTION SYNC] Failed to sync:`, haErr.message);
      }
    });

    socket.on('touch_panel_backlight', async (data, ack) => {
      try {
        const deviceId = String(data?.deviceId || '').trim();
        const device = await Device.findOne({ deviceId });
        const isTouchPanel = isPanelDevice(device);
        if (!isTouchPanel) throw new Error('Touch panel not found');

        const clampInteger = (value, min, max) => {
          const number = Number(value);
          if (!Number.isFinite(number)) throw new Error('Invalid backlight value');
          return Math.min(max, Math.max(min, Math.round(number)));
        };
        const normalizeColor = color => {
          if (!Array.isArray(color) || color.length !== 3) throw new Error('Invalid backlight color');
          return color.map(value => clampInteger(value, 0, 255));
        };

        const backlight = {
          onColor: normalizeColor(data.onColor),
          offColor: normalizeColor(data.offColor),
          onBrightness: clampInteger(data.onBrightness, 0, 100),
          transitionSeconds: clampInteger(data.transitionSeconds, 0, 255),
          offBrightness: clampInteger(data.offBrightness, 0, 100)
        };
        const bklt = [
          ...backlight.onColor,
          ...backlight.offColor,
          backlight.onBrightness,
          backlight.transitionSeconds,
          backlight.offBrightness
        ];

        const published = await publishToTopic(`${getPanelTopicPrefix(device)}/${deviceId}/backlight/command`, { bklt });
        if (!published) throw new Error('MQTT broker is not connected');
        const updatedDevice = await Device.findOneAndUpdate(
          { deviceId },
          { $set: { touchPanelBacklight: backlight } },
          { returnDocument: 'after' }
        );
        io.emit('device_state_update', updatedDevice);
        if (typeof ack === 'function') ack({ ok: true, bklt });
      } catch (error) {
        if (typeof ack === 'function') ack({ ok: false, error: error.message });
      }
    });

    socket.on('set_offline_timer', async (data) => {
      const { deviceId, timer, timerSeconds, action } = data;
      const device = await Device.findOne({ deviceId });
      if (!device) return;
      const totalSeconds = Number.isFinite(Number(timerSeconds))
        ? Math.max(0, Math.round(Number(timerSeconds)))
        : Math.max(0, Math.round(Number(timer) * 60));
      const timerMinutes = totalSeconds / 60;

      // Determine topic prefix based on device ID prefix
      let prefix = 'smart-switch';
      if (deviceId.startsWith('B3E') || deviceId.startsWith('B1E')) {
        prefix = 'three-phase';
      } else if (deviceId.startsWith('BSP')) {
        prefix = 'smart-switch';
      } else if (device.type === 'tunable-light' || device.type === 'tune light') {
        prefix = 'tunable-light';
      }

      const topic = `${prefix}/${device.deviceId}/timer/command`;
      
      let hwAction = "10";
      if (action === 'ON') hwAction = "11";
      if (Number(timer) === 0) hwAction = "0";

      const mqttPayload = {
        timer: String(timerMinutes),
        action: hwAction
      };

      await publishToTopic(topic, mqttPayload);
      
      const updatedDevice = await Device.findOneAndUpdate(
        { deviceId },
        { timerRemaining: totalSeconds, timerAction: String(action) },
        { returnDocument: 'after' }
      );
      if (updatedDevice) {
        io.emit('device_state_update', updatedDevice);
      }

      console.log(`[TIMER] Set offline timer for ${deviceId} on topic ${topic}: ${totalSeconds}s, action ${action}`);
    });

    socket.on('add_schedule', async (data) => {
      const { deviceId, startTime, endTime, days, startAction, endAction } = data;
      const device = await Device.findOneAndUpdate(
        { deviceId },
        { $push: { schedules: { startTime, endTime, days, startAction, endAction, enabled: true } } },
        { returnDocument: 'after' }
      );
      if (device) {
        io.emit('device_state_update', device);
        console.log(`[SCHEDULE] Added custom action schedule for ${deviceId}`);
      }
    });

    socket.on('add_rgbw_schedule', async (data = {}, ack) => {
      const deviceId = String(data.deviceId || '').trim();
      const actionTime = String(data.actionTime || '');
      const actionType = String(data.actionType || '').toUpperCase();
      const restoreAfterEnd = ['COLOR', 'ANIMATION'].includes(actionType) && Boolean(data.restoreAfterEnd);
      const endEnabled = Boolean(data.endEnabled);
      const endActionType = String(data.endActionType || 'OFF').toUpperCase();
      const days = Array.isArray(data.days) ? data.days.filter(day =>
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(day)
      ) : [];
      if (!deviceId || !/^\d{2}:\d{2}$/.test(actionTime) || days.length === 0 ||
          !['ON', 'OFF', 'BRIGHTNESS', 'COLOR', 'ANIMATION'].includes(actionType) ||
          !['ON', 'OFF'].includes(endActionType) ||
          ((restoreAfterEnd || endEnabled) && !/^\d{2}:\d{2}$/.test(String(data.endTime || '')))) {
        return ack?.({ ok: false, error: 'Complete the schedule details' });
      }

      const clamp = value => Math.min(255, Math.max(0, Math.round(Number(value) || 0)));
      const schedule = {
        actionTime,
        actionType,
        days,
        enabled: true,
        restoreAfterEnd,
        endEnabled,
        endActionType,
        ...((restoreAfterEnd || endEnabled) && /^\d{2}:\d{2}$/.test(String(data.endTime || ''))
          ? { endTime: String(data.endTime) }
          : {}),
        ...(actionType === 'BRIGHTNESS' ? {
          scheduledBrightness: Math.min(100, Math.max(1, Math.round(Number(data.scheduledBrightness) || 50)))
        } : {}),
        ...(actionType === 'COLOR' ? {
          rgbwColor: {
            r: clamp(data.rgbwColor?.r),
            g: clamp(data.rgbwColor?.g),
            b: clamp(data.rgbwColor?.b),
            w: clamp(data.rgbwColor?.w)
          }
        } : {}),
        ...(actionType === 'ANIMATION' ? {
          animationEffect: String(data.animationEffect || 'rainbow')
        } : {})
      };

      const device = await Device.findOneAndUpdate(
        { deviceId, type: { $in: ['rgbw', 'tunable-light', 'tune light'] } },
        { $push: { schedules: schedule } },
        { returnDocument: 'after' }
      );
      if (!device) return ack?.({ ok: false, error: 'Supported light device not found' });
      io.emit('device_state_update', device);
      ack?.({ ok: true });
    });

    socket.on('remove_schedule', async (data) => {
      const { deviceId, scheduleId } = data;
      const device = await Device.findOneAndUpdate(
        { deviceId },
        { $pull: { schedules: { _id: scheduleId } } },
        { returnDocument: 'after' }
      );
      if (device) {
        io.emit('device_state_update', device);
        console.log(`[SCHEDULE] Removed schedule for ${deviceId}`);
      }
    });

    const getRgbwMqttPayload = (topic, command, data) => {
      if (!topic) return data;
      const isRgbwTopic = topic.startsWith('rgbw-light/');
      const isTunableTopic = topic.startsWith('tunable-light/');

      if (!isRgbwTopic && !isTunableTopic) {
        return data;
      }

      if (isRgbwTopic && command === 'legacy') {
        if (data.type) return data;
        return { type: 'brightness', value: 0 };
      }

      switch (command) {
        case 'color_change':
          return { type: 'colour', colour: [data.r, data.g, data.b, data.w] };
        case 'brightness_change':
          return isRgbwTopic
            ? { type: 'brightness', value: Math.min(255, Math.max(0, Math.round(Number(data.brightness) || 0))) }
            : { type: 'brightness', value: Math.round((data.brightness / 255) * 100) };
        case 'white_change':
          return { type: 'colour', colour: [data.r || 0, data.g || 0, data.b || 0, data.white] };
        case 'set_effect':
          return { type: 'animations', model: data.effect };
        case 'force_white_mode':
          return { type: 'colour', colour: [0, 0, 0, 255] };
        case 'rgbw_power_off':
          return { type: 'brightness', value: 0 };
        default:
          return data;
      }
    };

    // Modified helper to accept optional topic override
    const updateDeviceAndPublish = async (deviceId, updates, mqttPayload, topicOverride) => {
      // Find the device first to get the correct topic if not provided
      const device = await Device.findOne({ deviceId });
      if (!device) {
        console.warn(`[MQTT BRIDGE] Device not found for command: ${deviceId}`);
        return null;
      }

      const topic = topicOverride || device.topic || `smarthome/${device.type}/${device.deviceId}`;
      let finalTopic = topic;
      if (!topicOverride && !device.topic && device.type === 'rgbw') {
        finalTopic = `rgbw-light/${device.deviceId}/light/command`;
      } else if (!topicOverride && !device.topic && device.type === 'light') {
        finalTopic = `smart_home/rgbw/${device.deviceId}/command`;
      }

      const payload = getRgbwMqttPayload(finalTopic, mqttPayload.command || 'legacy', mqttPayload);

      // Execute publish and DB update in parallel for maximum speed
      console.log(`[MQTT BRIDGE] Command ${mqttPayload.command || 'legacy'} for ${deviceId} -> ${finalTopic}`);

      const [updatedDevice] = await Promise.all([
        Device.findOneAndUpdate({ deviceId }, updates, { returnDocument: 'after' }),
        publishToTopic(finalTopic, payload)
      ]);

      if (updatedDevice) {
        io.emit('device_state_update', updatedDevice);
        try {
          await publishStateToHA(updatedDevice);
        } catch (haErr) {
          console.error(`[HA SOCKET SYNC] Failed to sync ${deviceId} to HA:`, haErr.message);
        }
        return updatedDevice;
      }
      return null;
    };

    socket.on('color_change', async (data) => {
      const { deviceId } = data;
      const clampRgbw = value => Math.min(255, Math.max(0, Math.round(Number(value) || 0)));
      const r = clampRgbw(data.r);
      const g = clampRgbw(data.g);
      const b = clampRgbw(data.b);
      const w = clampRgbw(data.w);
      const rgb = (r << 16) | (g << 8) | b;
      
      const basePayload = {
        command: 'color_change',
        r, g, b, w
      };

      await updateDeviceAndPublish(deviceId, { 
        spectrumRgb: rgb, 
        on: true, 
        effect: 'solid' 
      }, basePayload);
    });

    socket.on('brightness_change', async (data) => {
      const { deviceId, brightness } = data;
      
      const device = await Device.findOne({ deviceId });
      if (!device) return;

      // Derive on/off from brightness: 0 = off, any value > 0 = on
      const isOn = brightness > 0;
      let mqttPayload;
      let finalTopic = undefined;

      if (device.type === 'tunable-light' || device.type === 'tune light') {
        finalTopic = `tunable-light/${deviceId}/light/command`;
        mqttPayload = { command: 'brightness_change', type: 'brightness', value: Math.round((brightness / 255) * 100), brightness };
      } else {
        mqttPayload = {
          command: 'brightness_change',
          state: isOn ? 'ON' : 'OFF',
          brightness
        };
      }

      await updateDeviceAndPublish(deviceId, { brightness, on: isOn }, mqttPayload, finalTopic);
    });

    socket.on('white_change', async (data) => {
      const { deviceId, white } = data;
      const device = await Device.findOne({ deviceId });
      if (!device) return;

      const r = (device.spectrumRgb >> 16) & 0xFF;
      const g = (device.spectrumRgb >> 8) & 0xFF;
      const b = device.spectrumRgb & 0xFF;

      const mqttPayload = {
        command: 'white_change',
        r, g, b, white
      };

      await updateDeviceAndPublish(deviceId, { on: true }, mqttPayload);
    });

    socket.on('set_effect', async (data) => {
      const { deviceId, effect, speed } = data;
      const mqttPayload = {
        command: 'set_effect',
        effect,
        ...(speed !== undefined ? { speed } : {})
      };
      await updateDeviceAndPublish(deviceId, { effect, on: true, ...(speed !== undefined ? { speed } : {}) }, mqttPayload);
      console.log(`[RGBW] Effect set for ${deviceId}: ${effect}${speed !== undefined ? `, speed=${speed}` : ''}`);
    });

    socket.on('toggle_auto_mode', async (data) => {
      const { deviceId, enabled } = data;
      
      const mqttPayload = {
        command: 'force_white_mode',
        effect: enabled ? 'auto' : 'solid'
      };
      
      await updateDeviceAndPublish(deviceId, { effect: mqttPayload.effect, on: true }, mqttPayload);
    });

    socket.on('rgbw_power_off', async (data) => {
      const { deviceId } = data;
      const mqttPayload = {
        command: 'rgbw_power_off'
      };
      await updateDeviceAndPublish(deviceId, { on: false, brightness: 0, effect: 'solid' }, mqttPayload);
    });

    socket.on('curtain_action', async (data) => {
      const { deviceId, action } = data; // action is 10, 11, 20, 21
      
      const device = await Device.findOne({ deviceId });
      if (!device) return;

      const topic = `touch-panel/${deviceId}/switch/command`;
      const mqttPayload = { 
        type: 'switch',
        value: String(action)
      };
      
      await publishToTopic(topic, mqttPayload);
      console.log(`[CURTAIN] Sent action ${action} to ${deviceId} on topic ${topic}`);
    });

    socket.on('force_white_mode', async (data) => {
      const { deviceId } = data;
      
      const mqttPayload = {
        command: 'force_white_mode',
        effect: 'auto_white'
      };
      
      await updateDeviceAndPublish(deviceId, { effect: 'auto_white', on: true }, mqttPayload);
    });

    // ─── Automation / Sensor Events ───

    // Request current sensor data
    socket.on('get_sensor_data', () => {
      socket.emit('sensor_data_update', getSensorData());
    });

    // Simulate sensor data change (for testing without physical sensors)
    socket.on('simulate_sensor', async (data) => {
      console.log('[SENSOR SIM] Simulating sensor update:', data);
      updateSensorData(data);
      io.emit('sensor_data_update', getSensorData());
      // Evaluate automations with new sensor data
      await evaluateAutomations(io);
    });

    // ──────────────────────────────────

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};
