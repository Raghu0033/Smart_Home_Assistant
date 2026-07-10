import { publishToLight } from '../../integrations/mqtt/mqttManager.js';

let currentState = {
  state: 'OFF',
  color: [255, 255, 255, 255],
  brightness: 255,
  autoMode: false,
  lastLux: 0,
  effect: 'solid'
};

export const getState = () => currentState;

export const updateState = (updates) => {
  currentState = { ...currentState, ...updates };
  return currentState;
};

// Removed handleAutoBrightness from backend as it is now handled internally by ESP8266 
// to ensure smoother transitions and lower latency.
