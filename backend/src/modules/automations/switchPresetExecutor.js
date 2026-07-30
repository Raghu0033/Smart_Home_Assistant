import Device from '../devices/Device.js';
import { publishToTopic } from '../../integrations/mqtt/mqttManager.js';
import { rememberTouchPanelState } from '../devices/touchPanelCommandGuard.js';
import { waitForTouchPanelPower, waitForTouchPanelSpeed } from '../devices/touchPanelStatusWaiter.js';
import { getPanelCommandTopic } from '../devices/panelDevice.js';
import { getPresetDeviceIds, lockAutomationDevices, unlockAutomationDevices } from './automationDeviceLock.js';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const executeSwitchPresetUnlocked = async (preset, io) => {
  const on = preset.action === 'on';
  const groupedTargets = new Map();
  let executedCount = 0;
  let skippedCount = 0;
  let hasPublishedCommand = false;
  let aborted = false;
  let failedTarget = null;
  const statusChecks = [];

  for (const target of preset.targets || []) {
    const deviceId = String(target.panelDeviceId || '').trim();
    const index = Number(target.subDeviceIndex);
    if (!deviceId || !Number.isInteger(index) || index < 1) continue;
    if (!groupedTargets.has(deviceId)) groupedTargets.set(deviceId, []);
    groupedTargets.get(deviceId).push({ ...target, subDeviceIndex: index });
  }

  const publishCommand = async (topic, payload, waitForConfirmation, beforeAttempt) => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (hasPublishedCommand) await wait(300);
      beforeAttempt?.();
      const confirmation = waitForConfirmation();
      await publishToTopic(topic, payload);
      hasPublishedCommand = true;
      executedCount += 1;
      if (await confirmation) return { confirmed: true, attempts: attempt };
    }
    return { confirmed: false, attempts: 2 };
  };

  for (const [deviceId, targets] of groupedTargets) {
    if (aborted) break;
    // Read the board at execution time so schedules compare their requested
    // state with the latest MQTT-confirmed state, not an older scheduler copy.
    const device = await Device.findOne({ deviceId }).lean();
    if (!device) continue;
    let boardChanged = false;
    const topic = getPanelCommandTopic(device);

    for (const target of targets) {
      if (aborted) break;
      const index = target.subDeviceIndex;
      const subDevice = device.subDevices?.find(item => Number(item.index) === index);
      if (!subDevice) continue;

      const isFan = target.type === 'fan' || subDevice.type === 'fan';
      const requestedSpeed = Number(target.fanSpeed);
      const hasValidFanSpeed = Number.isInteger(requestedSpeed) && requestedSpeed >= 1 && requestedSpeed <= 5;
      if (on && isFan && !hasValidFanSpeed) {
        aborted = true;
        failedTarget = {
          panelDeviceId: deviceId,
          subDeviceIndex: index,
          label: target.label || subDevice.label || `Fan ${index}`,
          command: 'fan level missing',
          attempts: 0
        };
        break;
      }
      const desiredSpeed = requestedSpeed;
      const presentOn = subDevice.on === true;
      const appliedOn = on;
      const needsPowerChange = presentOn !== appliedOn;
      const needsSpeedChange = on && isFan
        && (!presentOn || Number(subDevice.speed) !== desiredSpeed);

      statusChecks.push({
        panelDeviceId: deviceId,
        subDeviceIndex: index,
        presentStatus: presentOn ? 'ON' : 'OFF',
        appliedStatus: appliedOn ? 'ON' : 'OFF',
        presentSpeed: isFan ? Number(subDevice.speed) || 0 : undefined,
        appliedSpeed: isFan && appliedOn ? desiredSpeed : undefined,
        publishRequired: needsPowerChange || needsSpeedChange
      });

      if (!needsPowerChange && !needsSpeedChange) {
        console.info(
          `[SWITCH AUTOMATION] "${preset.name}" ${deviceId}:${index} already ${appliedOn ? 'ON' : 'OFF'}; publish skipped`
        );
        skippedCount += 1;
        continue;
      }

      console.info(
        `[SWITCH AUTOMATION] "${preset.name}" ${deviceId}:${index} present=${presentOn ? 'ON' : 'OFF'} apply=${appliedOn ? 'ON' : 'OFF'}; publishing change`
      );

      if (needsPowerChange) {
        const confirmation = await publishCommand(topic, {
          entityId: deviceId,
          type: 'switch',
          value: `${index}${on ? '1' : '0'}`
        }, () => waitForTouchPanelPower(deviceId, index, on, 10000), () =>
          rememberTouchPanelState(deviceId, index, on)
        );
        boardChanged = true;
        if (!confirmation.confirmed) {
          aborted = true;
          failedTarget = {
            panelDeviceId: deviceId,
            subDeviceIndex: index,
            label: target.label || subDevice.label || `Switch ${index}`,
            command: on ? 'on' : 'off',
            attempts: confirmation.attempts
          };
          break;
        }
      }

      if (needsSpeedChange) {
        console.info(
          `[SWITCH AUTOMATION] "${preset.name}" sending fan channel ${index} at level ${desiredSpeed}`
        );
        const confirmation = await publishCommand(topic, {
          entityId: deviceId,
          type: 'dimmer',
          dimmer: String(index),
          value: String(desiredSpeed)
        }, () => waitForTouchPanelSpeed(deviceId, index, desiredSpeed, 10000));
        boardChanged = true;
        if (!confirmation.confirmed) {
          aborted = true;
          failedTarget = {
            panelDeviceId: deviceId,
            subDeviceIndex: index,
            label: target.label || subDevice.label || `Fan ${index}`,
            command: `fan level ${desiredSpeed}`,
            attempts: confirmation.attempts
          };
          break;
        }
        await Device.updateOne(
          { deviceId, 'subDevices.index': index },
          { $set: { 'subDevices.$.on': true, 'subDevices.$.speed': desiredSpeed } }
        );
      }
    }

    if (boardChanged) {
      const updatedDevice = await Device.findOne({ deviceId });
      if (updatedDevice) io?.emit('device_state_update', updatedDevice);
    }
  }

  return {
    action: preset.action,
    targetCount: preset.targets?.length || 0,
    executedCount,
    skippedCount,
    statusChecks,
    aborted,
    failedTarget
  };
};

export const executeSwitchPreset = async (preset, io) => {
  const deviceIds = getPresetDeviceIds(preset);
  const lockId = `execution:${preset._id || Date.now()}`;
  lockAutomationDevices(deviceIds, lockId, io);
  try {
    return await executeSwitchPresetUnlocked(preset, io);
  } finally {
    unlockAutomationDevices(deviceIds, lockId, io);
  }
};
