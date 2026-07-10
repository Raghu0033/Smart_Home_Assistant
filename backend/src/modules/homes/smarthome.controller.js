import Device from '../devices/Device.js';
import { publishToTopic } from '../../integrations/mqtt/mqttManager.js';

// ═══════════════════════════════════════════════════════════════════════
//  DEVICE TYPE MAPPING
//  Maps your internal device types → Google Home types, traits, and attributes.
//  To add a new device type, just add an entry here. Nothing else changes.
// ═══════════════════════════════════════════════════════════════════════
const DEVICE_TYPE_MAP = {
  'rgbw': {
    googleType: 'action.devices.types.LIGHT',
    traits: [
      'action.devices.traits.OnOff',
      'action.devices.traits.Brightness',
      'action.devices.traits.ColorSetting',
      'action.devices.traits.Modes',
    ],
    attributes: {
      colorModel: 'rgb',
      colorTemperatureRange: { temperatureMinK: 2000, temperatureMaxK: 9000 },
      availableModes: [{
        name: 'lighting_mode',
        name_values: [{ name_synonym: ['lighting mode', 'light mode', 'mode'], lang: 'en' }],
        settings: [
          { setting_name: 'solid', setting_values: [{ setting_synonym: ['manual', 'normal', 'solid'], lang: 'en' }] },
          { setting_name: 'auto', setting_values: [{ setting_synonym: ['auto', 'automatic', 'sensor'], lang: 'en' }] },
          { setting_name: 'auto_white', setting_values: [{ setting_synonym: ['white', 'pure white', 'reading'], lang: 'en' }] },
        ],
        ordered: false,
      }],
    },
  },
  'light': {
    googleType: 'action.devices.types.LIGHT',
    traits: [
      'action.devices.traits.OnOff',
      'action.devices.traits.Brightness',
      'action.devices.traits.Modes',
    ],
    attributes: {
      availableModes: [{
        name: 'lighting_mode',
        name_values: [{ name_synonym: ['lighting mode', 'light mode', 'mode'], lang: 'en' }],
        settings: [
          { setting_name: 'solid', setting_values: [{ setting_synonym: ['manual', 'normal', 'solid'], lang: 'en' }] },
          { setting_name: 'auto', setting_values: [{ setting_synonym: ['auto', 'automatic', 'sensor'], lang: 'en' }] },
        ],
        ordered: false,
      }],
    },
  },
  'plug': {
    googleType: 'action.devices.types.OUTLET',
    traits: ['action.devices.traits.OnOff'],
    attributes: {},
  },
  'switch': {
    googleType: 'action.devices.types.SWITCH',
    traits: ['action.devices.traits.OnOff'],
    attributes: {},
  },
  'curtain': {
    googleType: 'action.devices.types.BLINDS',
    traits: [
      'action.devices.traits.OpenClose',
    ],
    attributes: {
      discreteOnlyOpenClose: true, // We only support open/close, not percentages
      openDirection: ['UP', 'DOWN'],
    },
  },
  'touch-panel': {
    googleType: 'action.devices.types.SWITCH',
    traits: ['action.devices.traits.OnOff'],
    attributes: {},
  },
  'fan': {
    googleType: 'action.devices.types.FAN',
    traits: [
      'action.devices.traits.OnOff',
      'action.devices.traits.FanSpeed',
    ],
    attributes: {
      availableFanSpeeds: {
        speeds: [
          { speed_name: '1', speed_values: [{ speed_synonym: ['low', 'speed 1', 'one'], lang: 'en' }] },
          { speed_name: '2', speed_values: [{ speed_synonym: ['medium low', 'speed 2', 'two'], lang: 'en' }] },
          { speed_name: '3', speed_values: [{ speed_synonym: ['medium', 'speed 3', 'three'], lang: 'en' }] },
          { speed_name: '4', speed_values: [{ speed_synonym: ['medium high', 'speed 4', 'four'], lang: 'en' }] },
          { speed_name: '5', speed_values: [{ speed_synonym: ['high', 'speed 5', 'five', 'max'], lang: 'en' }] },
        ],
        ordered: true,
      },
      reversible: false,
    },
  },
};

// Fallback for unknown types — at minimum they can be turned on/off
const DEFAULT_TYPE_MAP = {
  googleType: 'action.devices.types.SWITCH',
  traits: ['action.devices.traits.OnOff'],
  attributes: {},
};


// ═══════════════════════════════════════════════════════════════════════
//  TOPIC RESOLVER
//  Determines the correct MQTT topic for a given device.
// ═══════════════════════════════════════════════════════════════════════
function resolveDeviceTopic(device) {
  // If the device has a custom topic stored in DB, use it
  if (device.topic) return device.topic;

  const id = device.deviceId;
  const type = device.type;

  if (type === 'rgbw') {
    return `rgbw-light/${id}/light/command`;
  }
  if (type === 'light') {
    return `smart_home/rgbw/${id}/command`;
  }
  if (id.startsWith('B3E') || id.startsWith('B1E')) {
    return `energy-meter/three-phase/command/${id}`;
  }
  if (id.startsWith('BSP') || type === 'plug' || type === 'switch') {
    return `smart-switch/command/${id}`;
  }
  if (id.startsWith('BSQ') || type === 'touch-panel') {
    return `touch-panel/${id}/switch/command`;
  }
  if (type === 'curtain') {
    return `touch-panel/${id}/switch/command`;
  }

  return `smarthome/${type}/${id}/command`;
}


// ═══════════════════════════════════════════════════════════════════════
//  HANDLE SYNC — Dynamic, reads all devices from MongoDB
// ═══════════════════════════════════════════════════════════════════════
async function handleSync(requestId) {
  const allDevices = await Device.find({ isConfigured: true });
  const googleDevices = [];

  allDevices.forEach(device => {
    // Check if it's a touch panel with sub-devices
    if (device.type === 'touch-panel' && device.subDevices && device.subDevices.length > 0) {
      device.subDevices.forEach(sd => {
        const typeConfig = DEVICE_TYPE_MAP[sd.type] || DEVICE_TYPE_MAP['switch'];
        
        googleDevices.push({
          id: `${device.deviceId}_${sd.index}`,
          type: typeConfig.googleType,
          traits: typeConfig.traits,
          attributes: typeConfig.attributes,
          name: {
            defaultNames: [sd.label || `${device.title} ${sd.type} ${sd.index}`],
            name: sd.label || `${device.title} ${sd.type} ${sd.index}`,
            nicknames: [sd.label || `${device.title} ${sd.type} ${sd.index}`],
          },
          willReportState: false,
          roomHint: device.room || 'Unassigned',
          deviceInfo: {
            manufacturer: 'Coral Innovations',
            model: `CI-subdevice-${sd.type}`,
            hwVersion: '1.0',
            swVersion: '2.0',
          },
        });
      });
    } else {
      // Standard device
      const typeConfig = DEVICE_TYPE_MAP[device.type] || DEFAULT_TYPE_MAP;
      googleDevices.push({
        id: device.deviceId,
        type: typeConfig.googleType,
        traits: typeConfig.traits,
        attributes: typeConfig.attributes,
        name: {
          defaultNames: [device.title],
          name: device.title,
          nicknames: [device.title],
        },
        willReportState: false,
        roomHint: device.room || 'Unassigned',
        deviceInfo: {
          manufacturer: 'Coral Innovations',
          model: `CI-${device.type}-${device.deviceId}`,
          hwVersion: '1.0',
          swVersion: '2.0',
        },
      });
    }
  });

  const syncResponse = {
    requestId,
    payload: {
      agentUserId: 'smarthome-user-1',
      devices: googleDevices,
    },
  };

  console.log(`[SYNC] Returning ${googleDevices.length} devices to Google Home`);
  return syncResponse;
}


// ═══════════════════════════════════════════════════════════════════════
//  HANDLE QUERY — Dynamic, builds state based on device type
// ═══════════════════════════════════════════════════════════════════════
async function handleQuery(requestId, payload) {
  const { devices } = payload;
  const deviceStates = {};

  for (const device of devices) {
    let dbDevice;
    let subDevice;
    let mainDeviceId = device.id;
    let subIndex = null;

    if (device.id.includes('_')) {
      const parts = device.id.split('_');
      mainDeviceId = parts[0];
      subIndex = parseInt(parts[1]);
      dbDevice = await Device.findOne({ deviceId: mainDeviceId });
      if (dbDevice && dbDevice.subDevices) {
        subDevice = dbDevice.subDevices.find(sd => sd.index === subIndex);
      }
    } else {
      dbDevice = await Device.findOne({ deviceId: mainDeviceId });
    }

    if (!dbDevice || (subIndex !== null && !subDevice)) {
      deviceStates[device.id] = {
        online: false,
        status: 'ERROR',
        errorCode: 'deviceNotFound',
      };
      continue;
    }

    // Build state object
    const state = {
      online: true,
      status: 'SUCCESS',
      on: subIndex !== null ? subDevice.on : dbDevice.on,
    };

    const type = subIndex !== null ? subDevice.type : dbDevice.type;
    const typeConfig = DEVICE_TYPE_MAP[type] || DEFAULT_TYPE_MAP;

    // Traits handling
    if (typeConfig.traits.includes('action.devices.traits.Brightness')) {
      state.brightness = dbDevice.brightness || 0;
    }

    if (typeConfig.traits.includes('action.devices.traits.ColorSetting')) {
      state.color = { spectrumRgb: dbDevice.spectrumRgb || 16777215 };
    }

    if (typeConfig.traits.includes('action.devices.traits.Modes')) {
      state.currentModeSettings = { lighting_mode: dbDevice.effect || 'solid' };
    }

    if (typeConfig.traits.includes('action.devices.traits.FanSpeed')) {
      state.currentFanSpeedSetting = subIndex !== null ? String(subDevice.speed || 1) : String(dbDevice.speed || 1);
    }

    if (typeConfig.traits.includes('action.devices.traits.OpenClose')) {
      state.openPercent = dbDevice.on ? 100 : 0;
    }

    deviceStates[device.id] = state;
  }

  const queryResponse = {
    requestId,
    payload: { devices: deviceStates },
  };

  console.log(`[QUERY] Handled status for ${Object.keys(deviceStates).length} devices`);
  return queryResponse;
}


// ═══════════════════════════════════════════════════════════════════════
//  HANDLE EXECUTE — Generic command processor for all device types
// ═══════════════════════════════════════════════════════════════════════
async function handleExecute(requestId, payload) {
  const { commands } = payload;
  const results = [];

  for (const command of commands) {
    for (const device of command.devices) {
      for (const execution of command.execution) {
        
        let dbDevice;
        let mainDeviceId = device.id;
        let subIndex = null;

        if (device.id.includes('_')) {
          const parts = device.id.split('_');
          mainDeviceId = parts[0];
          subIndex = parseInt(parts[1]);
        }

        dbDevice = await Device.findOne({ deviceId: mainDeviceId });
        
        if (!dbDevice) {
          results.push({
            ids: [device.id],
            status: 'ERROR',
            errorCode: 'deviceNotFound',
          });
          continue;
        }

        const dbUpdate = {};
        const mqttPayload = { entityId: mainDeviceId };
        let mqttTopic = resolveDeviceTopic(dbDevice);

        // Special handling for sub-devices (Touch Panel)
        if (subIndex !== null) {
          mqttTopic = `touch-panel/${mainDeviceId}/switch/command`;
          mqttPayload.type = 'switch';
          
          let executionStatus = { online: true };

          if (execution.command === 'action.devices.commands.OnOff') {
            const on = execution.params.on;
            mqttPayload.value = `${subIndex}${on ? '1' : '0'}`;
            await Device.updateOne(
              { deviceId: mainDeviceId, "subDevices.index": subIndex },
              { $set: { "subDevices.$.on": on } }
            );
            executionStatus.on = on;
          } else if (execution.command === 'action.devices.commands.SetFanSpeed') {
            let speed = parseInt(execution.params.fanSpeed);
            if (isNaN(speed)) {
              const s = String(execution.params.fanSpeed).toLowerCase();
              if (s.includes('low')) speed = 1;
              else if (s.includes('medium')) speed = 3;
              else if (s.includes('high') || s.includes('max')) speed = 5;
              else speed = 1; 
            }
            mqttPayload.type = 'dimmer';
            mqttPayload.dimmer = String(subIndex);
            mqttPayload.value = String(speed);
            await Device.updateOne(
              { deviceId: mainDeviceId, "subDevices.index": subIndex },
              { $set: { "subDevices.$.on": speed > 0, "subDevices.$.speed": speed } }
            );
            executionStatus.on = speed > 0;
            executionStatus.currentFanSpeedSetting = String(speed);
          }

          results.push({
            ids: [device.id],
            status: 'SUCCESS',
            states: executionStatus
          });

          // Publish sub-device command
          try {
            await publishToTopic(mqttTopic, mqttPayload);
            console.log(`[EXECUTE] Sub-device command sent to ${mqttTopic}:`, mqttPayload);
          } catch (err) {
            console.error(`[EXECUTE] Sub-device MQTT failed:`, err.message);
          }
          continue;
        }

        // --- Standard Device Logic ---
        const deviceType = dbDevice.type;
        const isRgbw = deviceType === 'rgbw';
        const isLight = deviceType === 'rgbw' || deviceType === 'light';
        const isPlug = deviceType === 'plug' || deviceType === 'switch' ||
                       dbDevice.deviceId.startsWith('BSP') ||
                       dbDevice.deviceId.startsWith('B3E') ||
                       dbDevice.deviceId.startsWith('B1E');

        switch (execution.command) {
          case 'action.devices.commands.OnOff': {
            dbUpdate.on = execution.params.on;
            if (isRgbw) {
              delete mqttPayload.entityId;
              if (execution.params.on) {
                mqttPayload.type = 'brightness';
                mqttPayload.value = 100;
                dbUpdate.brightness = 255;
              } else {
                mqttPayload.type = 'colour';
                mqttPayload.colour = [0, 0, 0, 0];
                dbUpdate.brightness = 0;
                dbUpdate.spectrumRgb = 0;
                dbUpdate.effect = 'solid';
              }
            } else if (isPlug) {
              mqttPayload.relayStatus = execution.params.on ? 'ON' : 'OFF';
            } else {
              mqttPayload.state = execution.params.on ? 'ON' : 'OFF';
            }
            break;
          }

          case 'action.devices.commands.BrightnessAbsolute': {
            dbUpdate.brightness = execution.params.brightness;
            dbUpdate.on = true;
            if (isRgbw) {
              delete mqttPayload.entityId;
              if (execution.params.brightness === 0) {
                mqttPayload.type = 'colour';
                mqttPayload.colour = [0, 0, 0, 0];
                dbUpdate.on = false;
                dbUpdate.spectrumRgb = 0;
                dbUpdate.effect = 'solid';
              } else {
                mqttPayload.type = 'brightness';
                mqttPayload.value = execution.params.brightness;
              }
            } else {
              mqttPayload.state = 'ON';
              mqttPayload.brightness = Math.round((execution.params.brightness / 100) * 255);
            }
            break;
          }

          case 'action.devices.commands.ColorAbsolute': {
            if (execution.params.color && execution.params.color.spectrumRGB) {
              const rgb = execution.params.color.spectrumRGB;
              dbUpdate.spectrumRgb = rgb;
              dbUpdate.on = true;
              if (isRgbw) {
                delete mqttPayload.entityId;
                mqttPayload.type = 'colour';
                mqttPayload.colour = [(rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF, 0];
              } else {
                mqttPayload.state = 'ON';
                mqttPayload.color = [(rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF, 0];
              }
            }
            break;
          }

          case 'action.devices.commands.SetFanSpeed': {
            let speed = parseInt(execution.params.fanSpeed);
            if (isNaN(speed)) {
              const s = String(execution.params.fanSpeed).toLowerCase();
              if (s.includes('low')) speed = 1;
              else if (s.includes('medium')) speed = 3;
              else if (s.includes('high') || s.includes('max')) speed = 5;
              else speed = 1; 
            }
            dbUpdate.speed = speed;
            dbUpdate.on = speed > 0;
            mqttPayload.type = 'dimmer';
            mqttPayload.value = String(speed);
            break;
          }

          case 'action.devices.commands.OpenClose': {
            const openPercent = execution.params.openPercent;
            mqttPayload.type = 'switch';
            
            if (openPercent > 0) {
              // OPEN PULSE: 11 (start) -> 5s -> 10 (stop)
              mqttPayload.value = '11';
              dbUpdate.on = true;
              setTimeout(async () => {
                try {
                  await publishToTopic(mqttTopic, { ...mqttPayload, value: '10' });
                  console.log(`[CURTAIN] Auto-stop (10) sent for ${mainDeviceId}`);
                } catch (err) {
                  console.error(`[CURTAIN] Auto-stop failed:`, err.message);
                }
              }, 5000);
            } else {
              // CLOSE PULSE: 21 (start) -> 5s -> 20 (stop)
              mqttPayload.value = '21';
              dbUpdate.on = false;
              setTimeout(async () => {
                try {
                  await publishToTopic(mqttTopic, { ...mqttPayload, value: '20' });
                  console.log(`[CURTAIN] Auto-stop (20) sent for ${mainDeviceId}`);
                } catch (err) {
                  console.error(`[CURTAIN] Auto-stop failed:`, err.message);
                }
              }, 5000);
            }
            break;
          }
        }

        // Update DB and publish for standard devices
        const updatedDevice = await Device.findOneAndUpdate({ deviceId: mainDeviceId }, dbUpdate, { new: true });
        try {
          await publishToTopic(mqttTopic, mqttPayload);
          console.log(`[EXECUTE] Standard command sent to ${mqttTopic}:`, mqttPayload);
        } catch (err) {
          console.error(`[EXECUTE] Standard MQTT failed:`, err.message);
        }

        results.push({
          ids: [device.id],
          status: 'SUCCESS',
          states: { online: true, on: updatedDevice.on }
        });
      }
    }
  }

  return { requestId, payload: { commands: results } };
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN FULFILLMENT HANDLER
// ═══════════════════════════════════════════════════════════════════════
export async function smarthomeFulfillment(req, res) {
  const { requestId, inputs } = req.body;

  console.log('\n========== Incoming Smart Home Request ==========');
  console.log(JSON.stringify(req.body, null, 2));
  console.log('=================================================\n');

  if (!inputs || inputs.length === 0) {
    console.error('[ERROR] No inputs in request body');
    return res.status(400).json({ error: 'No inputs provided' });
  }

  const intent = inputs[0].intent;
  let response;

  try {
    switch (intent) {
      case 'action.devices.SYNC':
        response = await handleSync(requestId);
        break;

      case 'action.devices.QUERY':
        response = await handleQuery(requestId, inputs[0].payload);
        break;

      case 'action.devices.EXECUTE':
        response = await handleExecute(requestId, inputs[0].payload);
        break;

      default:
        console.error(`[ERROR] Unknown intent: ${intent}`);
        response = {
          requestId,
          payload: { errorCode: 'notSupported' },
        };
    }

    console.log('\n========== Smart Home Response ==========');
    console.log(JSON.stringify(response, null, 2));
    console.log('=========================================\n');

    return res.json(response);
  } catch (error) {
    console.error('[ERROR] Smart Home fulfillment error:', error);
    return res.status(500).json({
      requestId,
      payload: {
        errorCode: 'hardError',
        debugString: error.message,
      },
    });
  }
}


// ═══════════════════════════════════════════════════════════════════════
//  OAUTH ENDPOINTS (unchanged)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fake OAuth authorization endpoint for Google Actions Console.
 */
export function fakeAuth(req, res) {
  const { client_id, redirect_uri, state } = req.query;

  console.log('[FAKEAUTH] Authorization endpoint hit');
  console.log('[FAKEAUTH] Query params:', JSON.stringify(req.query, null, 2));
  console.log(`[FAKEAUTH] Client ID received: ${client_id}`);

  if (!redirect_uri) {
    return res.json({
      success: true,
      message: 'Fake authorization endpoint is working. Google will send redirect_uri param during actual linking.',
    });
  }

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', 'fake-auth-code');
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }

  console.log('[FAKEAUTH] Redirecting to:', redirectUrl.toString());
  return res.redirect(redirectUrl.toString());
}

/**
 * Fake OAuth token endpoint for Google Actions Console.
 */
export function fakeToken(req, res) {
  const { grant_type, client_id, client_secret } = req.body;

  console.log('[FAKETOKEN] Token endpoint hit');
  console.log('[FAKETOKEN] Body:', JSON.stringify(req.body, null, 2));
  console.log(`[FAKETOKEN] Client ID received: ${client_id}`);

  if (grant_type === 'authorization_code') {
    console.log('[FAKETOKEN] Exchanging authorization code for tokens');
    return res.json({
      token_type: 'bearer',
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      expires_in: 3600,
    });
  } else if (grant_type === 'refresh_token') {
    console.log('[FAKETOKEN] Refreshing access token');
    return res.json({
      token_type: 'bearer',
      access_token: 'fake-access-token',
      expires_in: 3600,
    });
  }

  console.log('[FAKETOKEN] Unknown grant_type, returning tokens anyway');
  return res.json({
    token_type: 'bearer',
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    expires_in: 3600,
  });
}
