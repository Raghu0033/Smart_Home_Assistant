const DEVICE_ICON_SOURCES = {
  light: '/icons/devices/light.png',
  plug: '/icons/devices/plug.png',
  rgbw: '/icons/devices/rgbw.png',
  curtain: '/icons/devices/curtain.png',
  'ir-blaster': '/icons/devices/ir_blaster.svg',
  auditor: '/icons/devices/auditor.png',
  'touch-panel': '/icons/devices/touch_panel.png',
  'retro-fit': '/icons/icons/switch.png',
  audio: '/icons/devices/audio.png',
  staircase: '/icons/devices/staircase.png',
  'water-tank': '/icons/devices/water_tank.svg',
};

const normalizeDeviceType = (device) => {
  if (!device) return 'light';

  const type = String(device.type || '').toLowerCase();
  const deviceId = String(device.deviceId || '').toUpperCase();
  const title = String(device.title || '').toLowerCase();
  const hasSubDevices = Array.isArray(device.subDevices) && device.subDevices.length > 0;

  if (type === 'retro-fit' || device.panelType === 'retro-fit') return 'retro-fit';
  if (type === 'touch-panel' || hasSubDevices || /^BS(?:Q|4)/i.test(deviceId)) return 'touch-panel';
  if (type === 'ir-blaster' || type === 'ir_blaster' || title.includes('ir blaster') || title.includes('ac remote')) return 'ir-blaster';
  if (type === 'rgbw') return 'rgbw';
  if (type === 'curtain') return 'curtain';
  if (type === 'media_player' || type === 'audio' || title.includes('speaker') || title.includes('audio')) return 'audio';
  if (type === 'staircase' || title.includes('stair')) return 'staircase';
  if (type === 'water-tank' || type === 'water_tank' || title.includes('water tank')) return 'water-tank';
  if (type === 'plug' || type === 'switch' || deviceId.startsWith('BSP')) return 'plug';
  if (['three-phase', 'single-phase'].includes(type) || type.includes('auditor') || type.includes('energy') || deviceId.startsWith('B1E') || deviceId.startsWith('B3E')) return 'auditor';
  return 'light';
};

export const isDeviceIconImage = (icon) => /^(\/|https?:\/\/|data:image\/)/i.test(String(icon || '').trim());

export const getDeviceIconSrc = (device) => {
  if (normalizeDeviceType(device) === 'retro-fit') {
    return '/icons/icons/switch.png';
  }
  if (isDeviceIconImage(device?.icon)) return String(device.icon).trim();
  return DEVICE_ICON_SOURCES[normalizeDeviceType(device)] || DEVICE_ICON_SOURCES.light;
};

export const getDefaultDeviceIconSrc = (device) =>
  normalizeDeviceType(device) === 'retro-fit'
    ? '/icons/icons/switch.png'
    : DEVICE_ICON_SOURCES[normalizeDeviceType(device)] || DEVICE_ICON_SOURCES.light;

export const getDeviceIconText = (device) => {
  const icon = String(device?.icon || '').trim();
  return icon && !isDeviceIconImage(icon) ? icon : null;
};

export const getDeviceIconLabel = (device) => {
  const normalizedType = normalizeDeviceType(device);
  if (normalizedType === 'touch-panel') return 'Touch Panel';
  if (normalizedType === 'retro-fit') return 'Retro Fit';
  if (normalizedType === 'ir-blaster') return 'IR Blaster';
  if (normalizedType === 'rgbw') return 'RGBW Light';
  if (normalizedType === 'curtain') return 'Curtain';
  if (normalizedType === 'audio') return 'Audio Device';
  if (normalizedType === 'staircase') return 'Staircase';
  if (normalizedType === 'water-tank') return 'Water Tank';
  if (normalizedType === 'auditor') return 'Auditor';
  if (normalizedType === 'plug') return 'Smart Plug';
  return 'Tune Light';
};
