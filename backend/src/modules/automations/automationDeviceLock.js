const deviceLocks = new Map();

export const getPresetDeviceIds = preset => [
  ...new Set((preset?.targets || []).map(target => String(target.panelDeviceId || '').trim()).filter(Boolean))
];

export const lockAutomationDevices = (deviceIds, lockId, io) => {
  const normalizedLockId = String(lockId);
  for (const deviceId of deviceIds) {
    if (!deviceLocks.has(deviceId)) deviceLocks.set(deviceId, new Set());
    deviceLocks.get(deviceId).add(normalizedLockId);
  }
  io?.emit('automation_device_lock', { deviceIds, lockId: normalizedLockId });
};

export const unlockAutomationDevices = (deviceIds, lockId, io) => {
  const normalizedLockId = String(lockId);
  for (const deviceId of deviceIds) {
    const locks = deviceLocks.get(deviceId);
    if (!locks) continue;
    locks.delete(normalizedLockId);
    if (locks.size === 0) deviceLocks.delete(deviceId);
  }
  io?.emit('automation_device_unlock', { deviceIds, lockId: normalizedLockId });
};

export const isAutomationDeviceLocked = deviceId =>
  Boolean(deviceLocks.get(String(deviceId || '').trim())?.size);
