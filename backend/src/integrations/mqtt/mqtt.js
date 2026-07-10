import mqtt from 'mqtt';
import { setMqttClient } from './mqttManager.js';
import { getState, updateState } from '../../modules/devices/deviceState.js';
import { updateSensorData, evaluateAutomations, getSensorData, isEngineExecuting } from '../../modules/automations/automationEngine.js';
import Device from '../../modules/devices/Device.js';
import Sensor from '../../modules/sensors/Sensor.js';
import { publishStateToHA, syncAllDevicesToHA, handleHomeAssistantCommand, publishSensorStateToHA } from '../homeassistant/ha-discovery.js';
import { callService, cachedHaStates } from '../homeassistant/ha-client.js';
import { handlePresenceChange } from '../../modules/audio/followMeAudio.js';
import { handleTrigger } from '../../modules/staircase/staircaseService.js';
import { escapeRegExp } from './topicUtils.js';

const DEBUG_MQTT = process.env.MQTT_DEBUG === 'true';

export function parseSensorValueFromMqttData(data) {
  let sensorVal = data;

  if (typeof data === 'string') {
    const match = data.match(/value=["']?([^"']+)["']?/i);
    if (match) {
      sensorVal = match[1];
    }
  } else if (typeof data === 'object' && data !== null) {
    sensorVal = (data.value !== undefined) ? data.value : data;
  }

  if (typeof sensorVal === 'string' && !isNaN(sensorVal) && sensorVal.trim() !== '') {
    sensorVal = Number(sensorVal);
  }

  return sensorVal;
}

export function isPresenceValue(sensorVal) {
  return sensorVal === 1 || sensorVal === true || sensorVal === 'on' || sensorVal === 'ON' || sensorVal === '1';
}

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://35.154.62.193:1883';
const MQTT_STATUS_TOPIC = 'smart_home/rgbw/+/status';
const MQTT_LOG_TOPIC = 'smart_home/rgbw/+/debug';

export const connectMQTT = (io) => {
  const mqttClient = mqtt.connect(MQTT_BROKER, {
    keepalive: 60,
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000
  });

  mqttClient.on('connect', async () => {
    console.log('📡 Connected to MQTT broker at:', MQTT_BROKER);
    setMqttClient(mqttClient);
    io.emit('mqtt_status', { status: 'Connected' });

    // Subscribe to all smarthome device topics including specific HA proxy topics
    mqttClient.subscribe([
      'smarthome/+/+/status', 
      'smarthome/+/+/log', 
      'smart-switch/data',
      'smart-switch/+/data',
      'smart-switch/+/ping/status',
      'three-phase/+/ping/status',
      'energy-meter/three-phase',
      'energy-meter/single-phase',
      'touch-panel/+/switch/status',
      'touch-panel/+/ping/status',
      'smart_home/rgbw/+/status',
      'smart_home/rgbw/+/debug',
      'rgbw-light/+/light/status',
      'rgbw-light/+/light/debug',
      'smarthome/ha/+/command',
      'smart_home/staircase/trigger',
      'tunable-light/+/light/status',
      'tunable-light/+/status'
    ]);

    // Dynamic boot sync to ensure all devices appear in Home Assistant
    try {
      await syncAllDevicesToHA();
    } catch (syncErr) {
      console.error('[MQTT BOOT] Failed to sync devices to HA registry:', syncErr.message);
    }

    // Dynamically subscribe to all configured custom sensor topics on boot
    try {
      const sensors = await Sensor.find();
      if (sensors && sensors.length > 0) {
        const topics = sensors.map(s => s.topic).filter(Boolean);
        if (topics.length > 0) {
          mqttClient.subscribe(topics, (err) => {
            if (!err) {
              console.log(`📡 Dynamically subscribed to ${topics.length} custom sensor topics on boot.`);
            } else {
              console.error(`❌ Failed to subscribe to custom sensor topics on boot:`, err.message);
            }
          });
        }
      }
    } catch (sensorErr) {
      console.error('❌ Failed to fetch custom sensors for boot subscription:', sensorErr.message);
    }
  });

  mqttClient.on('message', async (topic, message) => {
    const payload = message.toString();
    if (DEBUG_MQTT) {
      console.log('[MQTT DEBUG] received message', { topic, payload });
    }
    const topicParts = topic.split('/');
    
    // Intercept Home Assistant Proxy commands first and completely ignore any other HA proxy status/log messages to prevent loop feedback
    if (topicParts[0] === 'smarthome' && topicParts[1] === 'ha') {
      if (topicParts[3] === 'command') {
        const entityId = topicParts[2];
        try {
          await handleHomeAssistantCommand(entityId, payload, io);
        } catch (err) {
          console.error(`[MQTT] Failed to process HA command for ${entityId}:`, err.message);
        }
      }
      return;
    } else if (topic === 'smart_home/staircase/trigger') {
      let data = null;
      try { data = JSON.parse(payload); } catch (e) { data = payload; }
      if (data && data.trigger) {
        handleTrigger(data.trigger);
      }
      return;
    }

    let deviceId = null;
    let data = null;

    try {
      data = JSON.parse(payload);
    } catch (e) {
      data = payload; // Fallback to raw string if it is not valid JSON
    }

    // Identify deviceId based on topic patterns
    if (topicParts[0] === 'smarthome' && topicParts[3] === 'status') {
      deviceId = topicParts[2];
    } else if ((topicParts[0] === 'three-phase' || topicParts[0] === 'smart-switch') && topicParts[2] === 'ping') {
      deviceId = topicParts[1];
    } else if (topic === 'smart-switch/data' || topicParts[0] === 'smart-switch') {
      // For smart-switch, ID might be in the topic or payload
      deviceId = topicParts[1] !== 'data' ? topicParts[1] : (data.entityId || data.deviceId);
    } else if (topic === 'energy-meter/three-phase' || topic === 'energy-meter/single-phase') {
      deviceId = data.DeviceID;
    } else if (topicParts[0] === 'touch-panel') {
      deviceId = topicParts[1];
    } else if (topicParts[0] === 'smart_home' && topicParts[1] === 'rgbw') {
      deviceId = topicParts[2];
    } else if (topicParts[0] === 'rgbw-light' && topicParts[2] === 'light' && topicParts[3] === 'status') {
      deviceId = topicParts[1];
    } else if (topicParts[0] === 'tunable-light') {
      deviceId = topicParts[1];
      let rawVal = undefined;
      
      console.log(`[TUNABLE LIGHT] Received status for ${deviceId}. Raw payload:`, payload);

      // Extract the raw PWM value from the payload
      if (data.type && data.type.toLowerCase() === 'brightness' && data.value !== undefined) {
        rawVal = Number(data.value);
      } else if (data.brightness !== undefined) {
        rawVal = Number(data.brightness);
      }

      if (rawVal !== undefined) {
        const parseBooleanLike = (value) => {
          if (typeof value === 'boolean') return value;
          if (typeof value === 'number') return value !== 0;
          if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (['true', '1', 'on', 'yes', 'enable', 'enabled'].includes(normalized)) return true;
            if (['false', '0', 'off', 'no', 'disable', 'disabled'].includes(normalized)) return false;
          }
          return undefined;
        };

        const stateFromPayload = parseBooleanLike(data.value) ?? parseBooleanLike(data.state) ?? parseBooleanLike(data.on);

        if (stateFromPayload === false) {
          data.brightness = 0;
          data.on = false;
          console.log(`[TUNABLE LIGHT] ${deviceId} is OFF -> brightness set to 0`);
        } else {
          let pct = Math.min(100, Math.max(0, Number(rawVal)));

          // Frontend expects 0-255 scale
          data.brightness = Math.round((pct / 100) * 255);
          data.on = stateFromPayload ?? (pct > 0);
          console.log(`[TUNABLE LIGHT] ${deviceId} ON: rawVal=${rawVal} -> pct=${pct}% -> 255scale=${data.brightness} -> on=${data.on}`);
        }
      } else {
        console.warn(`[TUNABLE LIGHT] Could not parse brightness from payload for ${deviceId}`);
      }
    }

    if (deviceId && data) {
      deviceId = String(deviceId).trim();
      try {
        const updates = { lastSeen: new Date() };
        if (data.lux !== undefined) updates.lastLux = data.lux;
        if (data.brightness !== undefined) updates.brightness = data.brightness;
        if (data.on !== undefined) updates.on = data.on;
        
        // Electrical parameters from smart-switch/data
        if (data.voltage !== undefined) updates.voltage = Number(data.voltage);
        if (data.current !== undefined) updates.current = Number(data.current);
        if (data.power !== undefined) updates.power = Number(data.power);
        if (data.energy !== undefined) updates.energy = Number(data.energy);
        if (data.PF !== undefined) updates.pf = Number(data.PF);
        if (data.temperature !== undefined) updates.temperature = Number(data.temperature);
        if (data.external_temp !== undefined) updates.externalTemp = Number(data.external_temp);

        // 3-Phase specific fields
        if (data.Voltage_R !== undefined) updates.voltageR = Number(data.Voltage_R);
        if (data.Voltage_Y !== undefined) updates.voltageY = Number(data.Voltage_Y);
        if (data.Voltage_B !== undefined) updates.voltageB = Number(data.Voltage_B);
        if (data.Current_R !== undefined) updates.currentR = Number(data.Current_R);
        if (data.Current_Y !== undefined) updates.currentY = Number(data.Current_Y);
        if (data.Current_B !== undefined) updates.currentB = Number(data.Current_B);
        if (data.Power_R !== undefined) updates.powerR = Number(data.Power_R);
        if (data.Power_Y !== undefined) updates.powerY = Number(data.Power_Y);
        if (data.Power_B !== undefined) updates.powerB = Number(data.Power_B);
        if (data.PF_R !== undefined) updates.pfR = Number(data.PF_R);
        if (data.PF_Y !== undefined) updates.pfY = Number(data.PF_Y);
        if (data.PF_B !== undefined) updates.pfB = Number(data.PF_B);
        if (data.Energy !== undefined) updates.energy = Number(data.Energy);
        if (data.Apparent_Energy !== undefined) updates.apparentEnergy = Number(data.Apparent_Energy);
        if (data.Reactive_Energy !== undefined) updates.reactiveEnergy = Number(data.Reactive_Energy);

        // Single-Phase specific fields (Bijli Auditor)
        if (data.Voltage !== undefined) updates.voltage = Number(data.Voltage);
        if (data.Current !== undefined) updates.current = Number(data.Current);
        if (data.PF !== undefined) updates.pf = Number(data.PF);
        if (data.Power !== undefined) updates.power = Number(data.Power);
        if (data.Apparent !== undefined) updates.apparentPowerR = Number(data.Apparent); // reuse R-phase field for single phase total
        if (data.Reactive !== undefined) updates.reactivePowerR = Number(data.Reactive);
        if (data.PhaseAngle !== undefined) updates.phaseAngle = Number(data.PhaseAngle);

        // Touch Panel Switch/Fan Status Parsing
        if (topic.includes('/switch/status') || topic.includes('/ping/status')) {
          if (data.switch || data.dimmer) {
            const device = await Device.findOne({ deviceId });
            if (!device || !device.subDevices) return;
            
            device.lastSeen = new Date();

            // 1. Sync Switch & Fan "ON" states
            if (data.switch && Array.isArray(data.switch)) {
              data.switch.forEach((status, i) => {
                const index = i + 1;
                const sd = device.subDevices.find(s => s.index === index);
                if (sd) sd.on = (status === 1);
              });
            }

            // 2. Sync Fan Speeds
            if (data.dimmer && Array.isArray(data.dimmer)) {
              const fans = device.subDevices.filter(sd => sd.type === 'fan');
              data.dimmer.forEach((speed, i) => {
                if (fans[i]) {
                  const sVal = Number(speed);
                  if (sVal > 0) fans[i].speed = sVal;
                }
              });
            }

            // Save all changes at once
            const updated = await device.save();
            
            // Emit the fully updated device to frontend
            io.emit('device_state_update', updated);

            // Sync updated states with Home Assistant
            try {
              await publishStateToHA(updated);
            } catch (haErr) {
              console.error(`[HA SYNC] Failed to sync touch-panel ${deviceId} to HA:`, haErr.message);
            }
            return;
          }
        }

        // Map relay status: PDF uses "relayStatus":"ON" or "switch":[1]
        if (data.relayStatus !== undefined) updates.on = data.relayStatus === 'ON';
        if (data.switch !== undefined && Array.isArray(data.switch)) updates.on = data.switch[0] === 1;
        if (data.state !== undefined) updates.on = data.state === 'ON';
        if (data.on !== undefined) updates.on = data.on;
        
        if (data.effect !== undefined) updates.effect = data.effect;
        if (data.color !== undefined) {
          const [r, g, b] = data.color;
          updates.spectrumRgb = (r << 16) | (g << 8) | b;
        }

        // Timer parsing from PDF format: {"timer":{"remaining":30,"action":10}}
        let isStatusPing = data.relayStatus !== undefined || data.switch !== undefined || data.state !== undefined;
        
        if (data.timer) {
          updates.timerRemaining = data.timer.remaining;
          updates.timerAction = String(data.timer.action);
        } else if (isStatusPing) {
          updates.timerRemaining = 0;
          updates.timerAction = null;
        }
        
        const updatedDevice = await Device.findOneAndUpdate({ deviceId }, updates, { returnDocument: 'after' });
        if (updatedDevice) {
          io.emit('device_state_update', updatedDevice);
          try {
            await publishStateToHA(updatedDevice);
          } catch (haErr) {
            console.error(`[HA SYNC] Failed to sync device ${deviceId} to HA:`, haErr.message);
          }
        }

        // Handle sensor data for automation engine
        const sensorUpdates = {};
        if (data.lux !== undefined) sensorUpdates.lux = data.lux;
        if (data.temperature !== undefined) sensorUpdates.temperature = data.temperature;
        if (data.humidity !== undefined) sensorUpdates.humidity = data.humidity;
        if (data.motion !== undefined) sensorUpdates.motion = data.motion;

        if (Object.keys(sensorUpdates).length > 0) {
          updateSensorData(sensorUpdates);
          io.emit('sensor_data_update', getSensorData());
          // Only evaluate automations if the engine isn't currently executing/suppressing
          if (!isEngineExecuting()) {
            await evaluateAutomations(io);
          }
        }

    } catch (e) {
      console.error(`Error processing MQTT status for ${deviceId}`, e);
    }
  }

  // Handle custom sensors - this should run even if it's not a standard device
  try {
    let customSensor = await Sensor.findOne({ topic });
    if (!customSensor) {
      customSensor = await Sensor.findOne({
        topic: { $regex: `^${escapeRegExp(topic)}$`, $options: 'i' }
      });
    }
    if (DEBUG_MQTT) {
      console.log('[MQTT DEBUG] custom sensor lookup', {
        topic,
        found: Boolean(customSensor),
        exactMatch: Boolean(customSensor && customSensor.topic === topic),
        sensorTopic: customSensor?.topic,
        sensorRecord: customSensor ? { name: customSensor.name, topic: customSensor.topic, room: customSensor.room } : null
      });
    }
    if (customSensor) {
      // Robustly extract and parse sensor value (handling JSON objects, raw numbers, or key-value strings like value="612")
      let sensorVal = parseSensorValueFromMqttData(data);

      if (DEBUG_MQTT) {
        console.log('[MQTT DEBUG] custom sensor packet', {
          topic,
          payload,
          dataType: typeof data,
          parsedValue: sensorVal,
          sensorName: customSensor.name,
          sensorTopic: customSensor.topic,
          currentSensorData: getSensorData()
        });
      }

      // --- THROTTLE & DELTA FILTER ---
      // Prevent massive lag from sensors spamming (like presence or lux)
      const now = Date.now();
      if (!global.sensorThrottleMap) global.sensorThrottleMap = new Map();
      const lastUpdate = global.sensorThrottleMap.get(topic) || { value: null, time: 0 };
      
      const isDuplicate = lastUpdate.value === sensorVal;
      const isThrottled = (now - lastUpdate.time) < 1000; // max 1 update per second

      // If it's a duplicate, we STILL want to show it's "alive" in the UI by updating lastUpdated,
      // but we can throttle duplicate saves to every 30 seconds to save IO. Values that change should still propagate immediately.
      const shouldSaveToDb = !isDuplicate || (now - lastUpdate.time) > 30000;

      if (DEBUG_MQTT) {
        console.log('[MQTT DEBUG] custom sensor throttle', {
          lastValue: lastUpdate.value,
          lastTime: lastUpdate.time,
          isDuplicate,
          isThrottled,
          shouldSaveToDb,
          now,
          deltaMs: now - lastUpdate.time
        });
      }

      customSensor.lastUpdated = new Date();
      if (shouldSaveToDb) {
        global.sensorThrottleMap.set(topic, { value: sensorVal, time: now });
        customSensor.value = sensorVal;
        await customSensor.save();

        if (customSensor.room && customSensor.room !== 'Unassigned' && (customSensor.name.toLowerCase().includes('presence') || customSensor.name.toLowerCase().includes('motion'))) {
          // If value is truthy (1, true, "on", "ON", "1"), it means presence is active
          const isPresent = sensorVal === 1 || sensorVal === true || sensorVal === 'on' || sensorVal === 'ON' || sensorVal === '1';
          if (DEBUG_MQTT) console.log('[MQTT DEBUG] presence change', { room: customSensor.room, isPresent, rawValue: sensorVal });
          handlePresenceChange(customSensor.room, isPresent);
        }

        // Update automation engine with custom sensor data
        updateSensorData({ [customSensor.name]: sensorVal });

        io.emit('custom_sensor_update', customSensor);
        io.emit('sensor_data_update', getSensorData());

        if (DEBUG_MQTT) {
          console.log('[MQTT DEBUG] sensor data updated', getSensorData());
        }

        try {
          await publishSensorStateToHA(customSensor);
        } catch (haErr) {
          console.error(`[HA SENSOR SYNC] Failed to sync custom sensor ${topic}:`, haErr.message);
        }

        // Only evaluate automations if the engine isn't currently executing/suppressing
        if (!isEngineExecuting()) {
          if (DEBUG_MQTT) console.log('[MQTT DEBUG] evaluating automations after sensor update');
          await evaluateAutomations(io);
        } else if (DEBUG_MQTT) {
          console.log('[MQTT DEBUG] skipped automation evaluation, engine busy/suppressed', {
            isExecuting: isEngineExecuting(),
            suppressUntil: _suppressUntil
          });
        }
      } else if (DEBUG_MQTT) {
        console.log('[MQTT DEBUG] custom sensor update skipped due to throttle/duplicate');
      }
    }
  } catch (err) {
    console.error(`Error processing custom sensor for ${topic}`, err);
  }

  io.emit('mqtt_message', { topic, message: payload });
});

  mqttClient.on('error', (err) => {
    console.error('MQTT error:', err);
    io.emit('mqtt_status', { status: 'Error' });
  });

  return mqttClient;
};
