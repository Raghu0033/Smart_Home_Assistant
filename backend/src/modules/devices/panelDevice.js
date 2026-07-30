export const isPanelDevice = device => Boolean(device) && (
  device.type === 'touch-panel'
  || device.type === 'retro-fit'
  || Array.isArray(device.subDevices) && device.subDevices.length > 0
  || /^BS(?:Q|4)/i.test(String(device.deviceId || ''))
);

export const getPanelTopicPrefix = device =>
  device?.type === 'retro-fit' ? 'node-switch' : 'touch-panel';

export const getPanelCommandTopic = device =>
  `${getPanelTopicPrefix(device)}/${device.deviceId}/switch/command`;
