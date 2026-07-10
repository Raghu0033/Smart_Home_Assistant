import express from 'express';
import { smarthome } from 'actions-on-google';
import Device from '../../modules/devices/Device.js';
import { publishToTopic } from '../mqtt/mqttManager.js';

const router = express.Router();

// ==========================================
// MOCK OAUTH2 SERVER (FOR DEVELOPMENT ONLY)
// ==========================================
// Google requires account linking via OAuth2.
// In production, use a real identity provider (Auth0, Firebase Auth, or a complete OAuth server).

router.get('/auth', (req, res) => {
  const { client_id, redirect_uri, state, response_type } = req.query;
  // Auto-approve for testing purposes and redirect back to Google
  const authCode = 'mock_auth_code_123';
  res.redirect(`${redirect_uri}?code=${authCode}&state=${state}`);
});

router.post('/token', (req, res) => {
  const { grant_type, client_id, client_secret } = req.body;
  // Return dummy tokens
  res.status(200).json({
    token_type: 'Bearer',
    access_token: 'mock_access_token_abc123',
    refresh_token: 'mock_refresh_token_xyz789',
    expires_in: 3600 // 1 hour
  });
});

// ==========================================
// GOOGLE SMART HOME FULFILLMENT
// ==========================================
const app = smarthome({
  debug: true,
});

// Helper: Map our DB types to Google device types
const getGoogleDeviceType = (type) => {
  switch (type) {
    case 'light':
    case 'rgbw':
      return 'action.devices.types.LIGHT';
    case 'plug':
    case 'switch':
      return 'action.devices.types.OUTLET';
    case 'curtain':
      return 'action.devices.types.BLINDS';
    case 'touch-panel':
      return 'action.devices.types.SWITCH'; // For individual subdevices
    default:
      return 'action.devices.types.SWITCH';
  }
};

// 1. SYNC Intent: Tell Google what devices exist
app.onSync(async (body, headers) => {
  const devices = await Device.find({ isConfigured: true });
  const googleDevices = [];

  for (const device of devices) {
    if (device.type === 'touch-panel' && device.subDevices && device.subDevices.length > 0) {
      // Expose each touch panel subdevice as a distinct switch/fan to Google
      for (const sd of device.subDevices) {
        googleDevices.push({
          id: `${device.deviceId}_${sd.index}`,
          type: sd.type === 'fan' ? 'action.devices.types.FAN' : 'action.devices.types.SWITCH',
          traits: [
            'action.devices.traits.OnOff',
            ...(sd.type === 'fan' ? ['action.devices.traits.FanSpeed'] : [])
          ],
          name: {
            name: sd.label || `${device.title} ${sd.type} ${sd.index}`,
            defaultNames: [`${sd.type} ${sd.index}`],
            nicknames: [sd.label || `${device.title} ${sd.type} ${sd.index}`],
          },
          willReportState: false, // Set true if you push state via Report State API
          roomHint: device.room !== 'Unassigned' ? device.room : undefined,
          deviceInfo: {
            manufacturer: 'BSS Smart Home',
            model: 'Touch Panel Entity',
            hwVersion: '1.0',
            swVersion: '1.0',
          },
        });
      }
    } else {
      // Standard devices
      const traits = ['action.devices.traits.OnOff'];
      if (device.type === 'light' || device.type === 'rgbw') {
        traits.push('action.devices.traits.Brightness');
      }
      if (device.type === 'rgbw') {
        traits.push('action.devices.traits.ColorSetting');
      }
      if (device.type === 'curtain') {
        // Replace OnOff with OpenClose for curtains
        traits[0] = 'action.devices.traits.OpenClose';
      }

      googleDevices.push({
        id: device.deviceId,
        type: getGoogleDeviceType(device.type),
        traits: traits,
        name: {
          name: device.title,
          defaultNames: [device.title],
          nicknames: [device.title],
        },
        willReportState: false,
        roomHint: device.room !== 'Unassigned' ? device.room : undefined,
        deviceInfo: {
          manufacturer: 'BSS Smart Home',
          model: device.type,
          hwVersion: '1.0',
          swVersion: '1.0',
        },
        attributes: device.type === 'rgbw' ? { colorModel: 'rgb' } : undefined,
      });
    }
  }

  return {
    requestId: body.requestId,
    payload: {
      agentUserId: '123', // Hardcoded user ID for mock OAuth
      devices: googleDevices,
    },
  };
});

// 2. QUERY Intent: Return current status of requested devices
app.onQuery(async (body, headers) => {
  const { devices } = body.inputs[0].payload;
  const payloadDevices = {};

  for (const requestedDevice of devices) {
    if (requestedDevice.id.includes('_')) {
      // Touch panel subdevice
      const [deviceId, index] = requestedDevice.id.split('_');
      const device = await Device.findOne({ deviceId });
      if (device) {
        const sd = device.subDevices.find(s => s.index === parseInt(index));
        if (sd) {
          payloadDevices[requestedDevice.id] = {
            online: true,
            status: 'SUCCESS',
            on: sd.on,
          };
        }
      }
    } else {
      // Standard device
      const device = await Device.findOne({ deviceId: requestedDevice.id });
      if (device) {
        payloadDevices[requestedDevice.id] = {
          online: true,
          status: 'SUCCESS',
        };
        
        if (device.type === 'curtain') {
          payloadDevices[requestedDevice.id].openPercent = device.on ? 100 : 0;
        } else {
          payloadDevices[requestedDevice.id].on = device.on;
        }

        if (device.type === 'light' || device.type === 'rgbw') {
          payloadDevices[requestedDevice.id].brightness = Math.round((device.brightness / 255) * 100);
        }
        if (device.type === 'rgbw') {
          payloadDevices[requestedDevice.id].color = { spectrumRgb: device.spectrumRgb };
        }
      }
    }
  }

  return {
    requestId: body.requestId,
    payload: {
      devices: payloadDevices,
    },
  };
});

// 3. EXECUTE Intent: Handle commands from Google Assistant
app.onExecute(async (body, headers) => {
  const commands = body.inputs[0].payload.commands;
  const successfulDevices = [];

  for (const command of commands) {
    for (const deviceReq of command.devices) {
      for (const execution of command.execution) {
        const commandType = execution.command;
        const params = execution.params;

        if (deviceReq.id.includes('_')) {
          // TOUCH PANEL COMMAND
          const [deviceId, indexStr] = deviceReq.id.split('_');
          const index = parseInt(indexStr);
          
          if (commandType === 'action.devices.commands.OnOff') {
            const on = params.on;
            const topic = `touch-panel/${deviceId}/switch/command`;
            
            await publishToTopic(topic, {
              entityId: deviceId,
              type: 'switch',
              value: `${index}${on ? '1' : '0'}`
            });
            
            await Device.updateOne(
              { deviceId, "subDevices.index": index },
              { $set: { "subDevices.$.on": on } }
            );
            successfulDevices.push(deviceReq.id);
          }
        } else {
          // STANDARD DEVICE COMMAND
          const device = await Device.findOne({ deviceId: deviceReq.id });
          if (!device) continue;

          let topic = device.topic || `smarthome/${device.type}/${device.deviceId}`;
          
          if (device.deviceId.startsWith('BSP') || device.type === 'plug' || device.type === 'switch') {
            topic = `smart-switch/command/${device.deviceId}`;
          }

          // SPECIAL HANDLING FOR CURTAINS
          if (device.type === 'curtain') {
            const topic = `touch-panel/${device.deviceId}/switch/command`;
            let curtainValue = '10'; // Default to stop/off

            if (commandType === 'action.devices.commands.OpenClose') {
              curtainValue = params.openPercent > 50 ? '11' : '21';
            } else if (commandType === 'action.devices.commands.OnOff') {
              // Map On to Open (11), Off to Stop (10) or Close (21)? 
              // Usually Off = Stop (10) for curtains
              curtainValue = params.on ? '11' : '10';
            }

            await publishToTopic(topic, {
              type: 'switch',
              value: curtainValue
            });

            await Device.updateOne({ deviceId: device.deviceId }, { $set: { on: curtainValue === '11' } });
            successfulDevices.push(deviceReq.id);
            continue; // Skip standard processing
          }

          // STANDARD DEVICE COMMANDS (Lights, Plugs, etc.)
          const updates = {};
          let mqttPayload = { entityId: device.deviceId };

          if (commandType === 'action.devices.commands.OnOff') {
            updates.on = params.on;
            if (topic.includes('smart-switch')) {
              mqttPayload.relayStatus = params.on ? 'ON' : 'OFF';
            } else if (device.type === 'tunable-light' || device.type === 'tune light') {
              topic = `tunable-light/${device.deviceId}/light/command`;
              mqttPayload = { type: 'brightness', value: params.on ? 0 : 100 };
            } else {
              mqttPayload.state = params.on ? 'ON' : 'OFF';
            }
          } 
          else if (commandType === 'action.devices.commands.BrightnessAbsolute') {
            const val255 = Math.round((params.brightness / 100) * 255);
            updates.brightness = val255;
            if (device.type === 'tunable-light' || device.type === 'tune light') {
              topic = `tunable-light/${device.deviceId}/light/command`;
              mqttPayload = { type: 'brightness', value: 100 - params.brightness };
            } else {
              mqttPayload.brightness = val255;
            }
          } 
          else if (commandType === 'action.devices.commands.ColorAbsolute') {
            updates.spectrumRgb = params.color.spectrumRGB;
            mqttPayload.color = {
              r: (params.color.spectrumRGB >> 16) & 255,
              g: (params.color.spectrumRGB >> 8) & 255,
              b: params.color.spectrumRGB & 255
            };
          }

          // Publish to MQTT
          await publishToTopic(topic, mqttPayload);
          
          // Update Database
          await Device.updateOne({ deviceId: device.deviceId }, { $set: updates });
          successfulDevices.push(deviceReq.id);
        }
      }
    }
  }

  return {
    requestId: body.requestId,
    payload: {
      commands: [{
        ids: successfulDevices,
        status: 'SUCCESS',
        states: {
          online: true,
        },
      }],
    },
  };
});

router.post('/fulfillment', app);

export default router;
