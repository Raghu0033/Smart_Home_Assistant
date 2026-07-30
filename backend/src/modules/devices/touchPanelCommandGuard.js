const pendingStates = new Map();
const COMMAND_GUARD_MS = 3500;

const keyFor = (deviceId, index) => `${deviceId}:${Number(index)}`;

export const rememberTouchPanelState = (deviceId, index, on) => {
  pendingStates.set(keyFor(deviceId, index), {
    on: Boolean(on),
    expiresAt: Date.now() + COMMAND_GUARD_MS
  });
};

export const resolveTouchPanelState = (deviceId, index, reportedOn) => {
  const key = keyFor(deviceId, index);
  const pending = pendingStates.get(key);
  if (!pending) return Boolean(reportedOn);
  if (Date.now() >= pending.expiresAt) {
    pendingStates.delete(key);
    return Boolean(reportedOn);
  }
  if (pending.on === Boolean(reportedOn)) {
    pendingStates.delete(key);
    return Boolean(reportedOn);
  }
  return null;
};
