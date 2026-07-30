const waiters = new Map();

const keyFor = (deviceId, index, field) => `${deviceId}:${Number(index)}:${field}`;

const waitForValue = (deviceId, index, field, expected, timeoutMs = 10000) => new Promise(resolve => {
  const key = keyFor(deviceId, index, field);
  const previous = waiters.get(key);
  if (previous) {
    clearTimeout(previous.timeout);
    previous.resolve(false);
  }
  const timeout = setTimeout(() => {
    waiters.delete(key);
    resolve(false);
  }, timeoutMs);
  waiters.set(key, { expected, timeout, resolve });
});

const notifyValue = (deviceId, index, field, value) => {
  const key = keyFor(deviceId, index, field);
  const waiter = waiters.get(key);
  if (!waiter || waiter.expected !== value) return;
  clearTimeout(waiter.timeout);
  waiters.delete(key);
  waiter.resolve(true);
};

export const waitForTouchPanelPower = (deviceId, index, on, timeoutMs) =>
  waitForValue(deviceId, index, 'power', Boolean(on), timeoutMs);

export const waitForTouchPanelSpeed = (deviceId, index, speed, timeoutMs) =>
  waitForValue(deviceId, index, 'speed', Number(speed), timeoutMs);

export const notifyTouchPanelPower = (deviceId, index, on) =>
  notifyValue(deviceId, index, 'power', Boolean(on));

export const notifyTouchPanelSpeed = (deviceId, index, speed) =>
  notifyValue(deviceId, index, 'speed', Number(speed));
