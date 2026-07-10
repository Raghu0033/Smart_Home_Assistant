import { publishToTopic } from '../mqtt/mqttManager.js';
import Device from '../../modules/devices/Device.js';
import Sensor from '../../modules/sensors/Sensor.js';

// ═══════════════════════════════════════════════════════════════════════
//  TOPIC RESOLVER (Aligned with smarthome.controller.js)
// ═══════════════════════════════════════════════════════════════════════
function resolveDeviceTopic(device) {
  if (device.topic) return device.topic;

  const id = device.deviceId;
  const type = device.type;

  if (type === 'rgbw' || type === 'light') {
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

/**
 * Normalizes device details for Home Assistant MQTT Discovery
 * and publishes the config payload to register the entities dynamically.
 * @param {object} device - MongoDB Device document
 */
export async function publishDeviceToHA(device) {
  if (!device || !device.isConfigured) return;

  const deviceId = device.deviceId;
  const roomName = device.room && device.room !== 'Unassigned' ? device.room : undefined;

  // Base device metadata for HA grouping
  const haDeviceMetadata = {
    identifiers: [deviceId],
    name: device.title || `BSS ${device.type}`,
    model: `CI-${device.type}-${deviceId}`,
    manufacturer: 'Coral Innovations',
    suggested_area: roomName
  };

  try {
    if (device.type === 'touch-panel' && device.subDevices && device.subDevices.length > 0) {
      // Expose each subdevice in the touch panel as an independent entity in HA
      for (const sd of device.subDevices) {
        const entityId = `${deviceId}_${sd.index}`;
        const name = sd.label || `${device.title} ${sd.type} ${sd.index}`;

        if (sd.type === 'fan') {
          // Register a speed-controlled Fan
          const configTopic = `homeassistant/fan/${entityId}/config`;
          const configPayload = {
            name,
            unique_id: `ha_fan_${entityId}`,
            command_topic: `smarthome/ha/${entityId}/command`,
            state_topic: `smarthome/ha/${entityId}/status`,
            percentage_command_topic: `smarthome/ha/${entityId}/command`,
            percentage_state_topic: `smarthome/ha/${entityId}/status`,
            percentage_value_template: '{{ value_json.percentage }}',
            state_value_template: '{{ value_json.state }}',
            speed_range_min: 1,
            speed_range_max: 5,
            device: haDeviceMetadata
          };
          await publishToTopic(configTopic, configPayload);
        } else {
          // Register a Switch
          const configTopic = `homeassistant/switch/${entityId}/config`;
          const configPayload = {
            name,
            unique_id: `ha_switch_${entityId}`,
            command_topic: `smarthome/ha/${entityId}/command`,
            state_topic: `smarthome/ha/${entityId}/status`,
            payload_on: 'ON',
            payload_off: 'OFF',
            state_on: 'ON',
            state_off: 'OFF',
            device: haDeviceMetadata
          };
          await publishToTopic(configTopic, configPayload);
        }
      }
    } else {
      // Standard devices
      const entityId = deviceId;
      const name = device.title;

      if (device.type === 'light' || device.type === 'rgbw') {
        const configTopic = `homeassistant/light/${entityId}/config`;
        const configPayload = {
          name,
          unique_id: `ha_light_${entityId}`,
          command_topic: `smarthome/ha/${entityId}/command`,
          state_topic: `smarthome/ha/${entityId}/status`,
          schema: 'json',
          brightness: true,
          color: device.type === 'rgbw',
          device: haDeviceMetadata
        };
        await publishToTopic(configTopic, configPayload);
      } else if (device.type === 'curtain') {
        const configTopic = `homeassistant/cover/${entityId}/config`;
        const configPayload = {
          name,
          unique_id: `ha_curtain_${entityId}`,
          command_topic: `smarthome/ha/${entityId}/command`,
          state_topic: `smarthome/ha/${entityId}/status`,
          payload_open: 'OPEN',
          payload_close: 'CLOSE',
          payload_stop: 'STOP',
          state_open: 'open',
          state_closed: 'closed',
          device: haDeviceMetadata
        };
        await publishToTopic(configTopic, configPayload);
      } else if (device.type === 'fan') {
        const configTopic = `homeassistant/fan/${entityId}/config`;
        const configPayload = {
          name,
          unique_id: `ha_fan_${entityId}`,
          command_topic: `smarthome/ha/${entityId}/command`,
          state_topic: `smarthome/ha/${entityId}/status`,
          percentage_command_topic: `smarthome/ha/${entityId}/command`,
          percentage_state_topic: `smarthome/ha/${entityId}/status`,
          percentage_value_template: '{{ value_json.percentage }}',
          state_value_template: '{{ value_json.state }}',
          speed_range_min: 1,
          speed_range_max: 5,
          device: haDeviceMetadata
        };
        await publishToTopic(configTopic, configPayload);
      } else {
        const isPureEnergyMonitor = deviceId.startsWith('B1E') || deviceId.startsWith('B3E') || device.type === '1phase' || device.type === '3phase';
        if (!isPureEnergyMonitor) {
          // Standard Switch/Plug
          const configTopic = `homeassistant/switch/${entityId}/config`;
          const configPayload = {
            name,
            unique_id: `ha_switch_${entityId}`,
            command_topic: `smarthome/ha/${entityId}/command`,
            state_topic: `smarthome/ha/${entityId}/status`,
            payload_on: 'ON',
            payload_off: 'OFF',
            state_on: 'ON',
            state_off: 'OFF',
            device: haDeviceMetadata
          };
          await publishToTopic(configTopic, configPayload);
        } else {
          // Ensure any previously retained switch configuration is deleted from MQTT
          const configTopic = `homeassistant/switch/${entityId}/config`;
          await publishToTopic(configTopic, null);
        }
      }
    }

    // Publish current state immediately after config so HA updates instantly
    await publishStateToHA(device);
    console.log(`[HA DISCOVERY] Registered device successfully: ${device.title} (${deviceId})`);
  } catch (err) {
    console.error(`[HA DISCOVERY] Failed to publish discovery config for ${deviceId}:`, err.message);
  }
}

/**
 * Normalizes and publishes the current state of a device to Home Assistant.
 * @param {object} device - MongoDB Device document
 */
export async function publishStateToHA(device) {
  if (!device || !device.isConfigured) return;

  const deviceId = device.deviceId;

  try {
    if (device.type === 'touch-panel' && device.subDevices && device.subDevices.length > 0) {
      for (const sd of device.subDevices) {
        const entityId = `${deviceId}_${sd.index}`;
        const stateTopic = `smarthome/ha/${entityId}/status`;

        if (sd.type === 'fan') {
          const speedPct = sd.speed ? Math.round((sd.speed / 5) * 100) : 0;
          const payload = {
            state: sd.on ? 'ON' : 'OFF',
            percentage: speedPct
          };
          await publishToTopic(stateTopic, payload);
        } else {
          const payload = sd.on ? 'ON' : 'OFF';
          await publishToTopic(stateTopic, payload);
        }
      }
    } else {
      const entityId = deviceId;
      const stateTopic = `smarthome/ha/${entityId}/status`;

      if (device.type === 'light' || device.type === 'rgbw') {
        const payload = {
          state: device.on ? 'ON' : 'OFF',
          brightness: Math.round((device.brightness / 100) * 255) // Map 0-100 to 0-255 for HA json schema
        };
        if (device.type === 'rgbw' && device.spectrumRgb !== undefined) {
          payload.color = {
            r: (device.spectrumRgb >> 16) & 0xFF,
            g: (device.spectrumRgb >> 8) & 0xFF,
            b: device.spectrumRgb & 0xFF
          };
        }
        await publishToTopic(stateTopic, payload);
      } else if (device.type === 'curtain') {
        const payload = device.on ? 'open' : 'closed';
        await publishToTopic(stateTopic, payload);
      } else if (device.type === 'fan') {
        const speedPct = device.speed ? Math.round((device.speed / 5) * 100) : 0;
        const payload = {
          state: device.on ? 'ON' : 'OFF',
          percentage: speedPct
        };
        await publishToTopic(stateTopic, payload);
      } else {
        const isPureEnergyMonitor = deviceId.startsWith('B1E') || deviceId.startsWith('B3E') || device.type === '1phase' || device.type === '3phase';
        if (!isPureEnergyMonitor) {
          // Switch/Plug
          const payload = device.on ? 'ON' : 'OFF';
          await publishToTopic(stateTopic, payload);
        }
      }
    }
  } catch (err) {
    console.error(`[HA STATE] Failed to publish status for ${deviceId}:`, err.message);
  }
}

/**
 * Removes a device (or its entities) from Home Assistant by publishing empty payloads.
 * @param {object} device - MongoDB Device document
 */
export async function removeDeviceFromHA(device) {
  if (!device) return;

  const deviceId = device.deviceId;

  try {
    if (device.type === 'touch-panel' && device.subDevices && device.subDevices.length > 0) {
      for (const sd of device.subDevices) {
        const entityId = `${deviceId}_${sd.index}`;
        const component = sd.type === 'fan' ? 'fan' : 'switch';
        await publishToTopic(`homeassistant/${component}/${entityId}/config`, null);
      }
    } else {
      let component = 'switch';
      if (device.type === 'light' || device.type === 'rgbw') component = 'light';
      else if (device.type === 'curtain') component = 'cover';
      else if (device.type === 'fan') component = 'fan';
      
      const isPureEnergyMonitor = deviceId.startsWith('B1E') || deviceId.startsWith('B3E') || device.type === '1phase' || device.type === '3phase';
      
      if (!isPureEnergyMonitor || component !== 'switch') {
        await publishToTopic(`homeassistant/${component}/${deviceId}/config`, null);
      }
    }
    console.log(`[HA DISCOVERY] Removed device from Home Assistant: ${device.title} (${deviceId})`);
  } catch (err) {
    console.error(`[HA DISCOVERY] Failed to remove ${deviceId} from Home Assistant:`, err.message);
  }
}

/**
 * Publishes a custom sensor to Home Assistant using MQTT Discovery.
 * @param {object} sensor - MongoDB Sensor document
 */
export async function publishSensorToHA(sensor) {
  if (!sensor) return;

  const sensorId = sensor._id.toString();
  const roomName = sensor.room && sensor.room !== 'Unassigned' ? sensor.room : undefined;

  const configTopic = `homeassistant/sensor/${sensorId}/config`;
  const configPayload = {
    name: sensor.name,
    unique_id: `ha_sensor_${sensorId}`,
    state_topic: `smarthome/ha/sensor/${sensorId}/status`,
    unit_of_measurement: sensor.unit || undefined,
    device: {
      identifiers: [sensorId],
      name: sensor.name,
      model: "Custom Sensor",
      manufacturer: "Coral Innovations",
      suggested_area: roomName
    }
  };

  try {
    await publishToTopic(configTopic, configPayload);
    await publishSensorStateToHA(sensor);
    console.log(`[HA DISCOVERY] Registered sensor successfully: ${sensor.name} (${sensorId})`);
  } catch (err) {
    console.error(`[HA DISCOVERY] Failed to publish discovery config for sensor ${sensorId}:`, err.message);
  }
}

/**
 * Publishes a custom sensor's current state to Home Assistant.
 * @param {object} sensor - MongoDB Sensor document
 */
export async function publishSensorStateToHA(sensor) {
  if (!sensor) return;
  const sensorId = sensor._id.toString();
  const stateTopic = `smarthome/ha/sensor/${sensorId}/status`;

  try {
    let displayValue = sensor.value;
    if (typeof sensor.value === 'object' && sensor.value !== null) {
      if (sensor.value.value !== undefined) {
        displayValue = sensor.value.value;
      } else {
        displayValue = JSON.stringify(sensor.value);
      }
    }
    const payload = String(displayValue ?? 'unknown');
      
    await publishToTopic(stateTopic, payload);
  } catch (err) {
    console.error(`[HA STATE] Failed to publish status for sensor ${sensorId}:`, err.message);
  }
}

/**
 * Removes a custom sensor from Home Assistant.
 * @param {object} sensor - MongoDB Sensor document
 */
export async function removeSensorFromHA(sensor) {
  if (!sensor) return;
  const sensorId = sensor._id.toString();
  try {
    await publishToTopic(`homeassistant/sensor/${sensorId}/config`, null);
    console.log(`[HA DISCOVERY] Removed sensor from Home Assistant: ${sensor.name} (${sensorId})`);
  } catch (err) {
    console.error(`[HA DISCOVERY] Failed to remove sensor ${sensorId} from Home Assistant:`, err.message);
  }
}

/**
 * Synchronizes all configured devices in the MongoDB registry with Home Assistant.
 */
export async function syncAllDevicesToHA() {
  try {
    const devices = await Device.find({ isConfigured: true });
    console.log(`[HA DISCOVERY] Syncing ${devices.length} devices to Home Assistant...`);
    for (const device of devices) {
      await publishDeviceToHA(device);
    }
    
    const sensors = await Sensor.find();
    console.log(`[HA DISCOVERY] Syncing ${sensors.length} custom sensors to Home Assistant...`);
    for (const sensor of sensors) {
      await publishSensorToHA(sensor);
    }
  } catch (err) {
    console.error('[HA DISCOVERY] Sync registry error:', err.message);
  }
}

/**
 * Translates Home Assistant MQTT commands to database updates and physical MQTT commands
 * @param {string} entityId - The HA registered unique ID (e.g. BSQ_1 or light123)
 * @param {string} payload - Incoming MQTT command payload
 * @param {object} io - Socket.io instance for UI streaming
 */
export async function handleHomeAssistantCommand(entityId, payload, io) {
  let mainDeviceId = entityId;
  let subIndex = null;

  if (entityId.includes('_')) {
    const parts = entityId.split('_');
    mainDeviceId = parts[0];
    subIndex = parseInt(parts[1]);
  }

  const device = await Device.findOne({ deviceId: mainDeviceId });
  if (!device) {
    console.warn(`[HA COMMAND] Received command for non-existent device: ${mainDeviceId}`);
    return;
  }

  // Parse command payload
  let cmd = {};
  try {
    cmd = JSON.parse(payload);
  } catch (e) {
    // Plain text payload (ON/OFF/OPEN/CLOSE/STOP)
    cmd = { state: payload };
  }

  console.log(`[HA COMMAND] Translated incoming for ${entityId}:`, cmd);

  const dbUpdates = {};
  const mqttPayload = { entityId: mainDeviceId };
  const physicalTopic = resolveDeviceTopic(device);

  // 1. Touch Panel Sub-Devices
  if (subIndex !== null) {
    const subDeviceTopic = `touch-panel/${mainDeviceId}/switch/command`;
    mqttPayload.type = 'switch';
    const targetSub = device.subDevices.find(s => s.index === subIndex);
    if (!targetSub) return;

    if (targetSub.type === 'fan') {
      let isOn = targetSub.on;
      let speed = targetSub.speed;

      if (cmd.state !== undefined) {
        isOn = cmd.state === 'ON';
      }
      if (cmd.percentage !== undefined) {
        const pct = parseInt(cmd.percentage);
        speed = Math.ceil((pct / 100) * 5);
        if (speed < 1) speed = 1;
        if (speed > 5) speed = 5;
        isOn = pct > 0;
      }

      mqttPayload.type = 'dimmer';
      mqttPayload.dimmer = String(subIndex);
      mqttPayload.value = isOn ? String(speed) : '0';

      await Device.updateOne(
        { deviceId: mainDeviceId, "subDevices.index": subIndex },
        { $set: { "subDevices.$.on": isOn, "subDevices.$.speed": speed } }
      );
    } else {
      const isOn = cmd.state === 'ON';
      mqttPayload.value = `${subIndex}${isOn ? '1' : '0'}`;

      await Device.updateOne(
        { deviceId: mainDeviceId, "subDevices.index": subIndex },
        { $set: { "subDevices.$.on": isOn } }
      );
    }

    // Publish to hardware touch-panel
    await publishToTopic(subDeviceTopic, mqttPayload);
  } else {
    // 2. Standard Devices
    const isPlug = device.type === 'plug' || device.type === 'switch' ||
                   device.deviceId.startsWith('BSP') ||
                   device.deviceId.startsWith('B3E') ||
                   device.deviceId.startsWith('B1E');

    if (device.type === 'light' || device.type === 'rgbw') {
      let isOn = device.on;
      if (cmd.state !== undefined) {
        isOn = cmd.state === 'ON';
        dbUpdates.on = isOn;
        mqttPayload.state = isOn ? 'ON' : 'OFF';
      }
      if (cmd.brightness !== undefined) {
        const val100 = Math.round((cmd.brightness / 255) * 100);
        dbUpdates.brightness = val100;
        dbUpdates.on = true;
        mqttPayload.state = 'ON';
        mqttPayload.brightness = cmd.brightness;
      }
      if (cmd.color !== undefined && (cmd.color.r !== undefined || cmd.color.g !== undefined || cmd.color.b !== undefined)) {
        const rgb = (cmd.color.r << 16) | (cmd.color.g << 8) | cmd.color.b;
        dbUpdates.spectrumRgb = rgb;
        dbUpdates.on = true;
        mqttPayload.state = 'ON';
        mqttPayload.color = [cmd.color.r, cmd.color.g, cmd.color.b, 0];
      }

      await Device.updateOne({ deviceId: mainDeviceId }, { $set: dbUpdates });
      await publishToTopic(physicalTopic, mqttPayload);
    } else if (device.type === 'curtain') {
      mqttPayload.type = 'switch';
      let curtainValue = '10'; // stop
      const action = String(cmd.state).toUpperCase();

      if (action === 'OPEN') {
        curtainValue = '11';
        dbUpdates.on = true;
        setTimeout(async () => {
          try {
            await publishToTopic(physicalTopic, { ...mqttPayload, value: '10' });
            console.log(`[HA CURTAIN] Auto-stop (10) sent for ${mainDeviceId}`);
          } catch (err) {
            console.error(`[HA CURTAIN] Auto-stop failed:`, err.message);
          }
        }, 5000);
      } else if (action === 'CLOSE') {
        curtainValue = '21';
        dbUpdates.on = false;
        setTimeout(async () => {
          try {
            await publishToTopic(physicalTopic, { ...mqttPayload, value: '20' });
            console.log(`[HA CURTAIN] Auto-stop (20) sent for ${mainDeviceId}`);
          } catch (err) {
            console.error(`[HA CURTAIN] Auto-stop failed:`, err.message);
          }
        }, 5000);
      } else {
        curtainValue = '10';
      }

      mqttPayload.value = curtainValue;
      await Device.updateOne({ deviceId: mainDeviceId }, { $set: dbUpdates });
      await publishToTopic(physicalTopic, mqttPayload);
    } else if (device.type === 'fan') {
      let isOn = device.on;
      let speed = device.speed;

      if (cmd.state !== undefined) {
        isOn = cmd.state === 'ON';
      }
      if (cmd.percentage !== undefined) {
        const pct = parseInt(cmd.percentage);
        speed = Math.ceil((pct / 100) * 5);
        if (speed < 1) speed = 1;
        if (speed > 5) speed = 5;
        isOn = pct > 0;
      }

      dbUpdates.on = isOn;
      dbUpdates.speed = speed;
      mqttPayload.type = 'dimmer';
      mqttPayload.value = isOn ? String(speed) : '0';

      await Device.updateOne({ deviceId: mainDeviceId }, { $set: dbUpdates });
      await publishToTopic(physicalTopic, mqttPayload);
    } else {
      const isOn = cmd.state === 'ON';
      dbUpdates.on = isOn;

      if (isPlug) {
        mqttPayload.relayStatus = isOn ? 'ON' : 'OFF';
      } else {
        mqttPayload.state = isOn ? 'ON' : 'OFF';
      }

      await Device.updateOne({ deviceId: mainDeviceId }, { $set: dbUpdates });
      await publishToTopic(physicalTopic, mqttPayload);
    }
  }

  // Broadcast state changes
  const updatedDevice = await Device.findOne({ deviceId: mainDeviceId });
  if (updatedDevice) {
    if (io) {
      io.emit('device_state_update', updatedDevice);
    }
    // Update Home Assistant state topic
    await publishStateToHA(updatedDevice);
  }
}
