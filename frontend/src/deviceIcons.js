const DEVICE_ICON_SOURCES = {
  light: '/icons/devices/light.png',
  plug: '/icons/devices/plug.png',
  rgbw: '/icons/devices/rgbw.png',
  curtain: '/icons/devices/curtain.png',
  auditor: '/icons/devices/auditor.png',
  'touch-panel': '/icons/devices/touch_panel.png',
  audio: '/icons/devices/audio.png',
  staircase: '/icons/devices/staircase.png',
};

const normalizeDeviceType = (device) => {
  if (!device) return 'light';

  const type = String(device.type || '').toLowerCase();
  const deviceId = String(device.deviceId || '').toUpperCase();
  const title = String(device.title || '').toLowerCase();
  const hasSubDevices = Array.isArray(device.subDevices) && device.subDevices.length > 0;

  if (type === 'touch-panel' || hasSubDevices || deviceId.startsWith('BSQ')) return 'touch-panel';
  if (type === 'rgbw') return 'rgbw';
  if (type === 'curtain') return 'curtain';
  if (type === 'media_player' || type === 'audio' || title.includes('speaker') || title.includes('audio')) return 'audio';
  if (type === 'staircase' || title.includes('stair')) return 'staircase';
  if (type === 'plug' || type === 'switch' || deviceId.startsWith('BSP')) return 'plug';
  if (type.includes('auditor') || type.includes('energy') || deviceId.startsWith('B1E') || deviceId.startsWith('B3E')) return 'auditor';
  return 'light';
};

export const getDeviceIconSrc = (device) => DEVICE_ICON_SOURCES[normalizeDeviceType(device)] || DEVICE_ICON_SOURCES.light;

export const getDeviceIconLabel = (device) => {
  const normalizedType = normalizeDeviceType(device);
  if (normalizedType === 'touch-panel') return 'Touch Panel';
  if (normalizedType === 'rgbw') return 'RGBW Light';
  if (normalizedType === 'curtain') return 'Curtain';
  if (normalizedType === 'audio') return 'Audio Device';
  if (normalizedType === 'staircase') return 'Staircase';
  if (normalizedType === 'auditor') return 'Auditor';
  if (normalizedType === 'plug') return 'Smart Plug';
  return 'Tune Light';
};
