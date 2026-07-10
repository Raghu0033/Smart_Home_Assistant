import Automation from './Automation.js';
import Device from '../devices/Device.js';
import { publishToLight, publishToTopic } from '../../integrations/mqtt/mqttManager.js';
import { getState, updateState } from '../devices/deviceState.js';
import { callService } from '../../integrations/homeassistant/ha-client.js';

const ACTION_EXECUTION_DELAY_MS = 250;
const DEBUG_AUTOMATION = process.env.AUTOMATION_DEBUG === 'true';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Automation Engine
 * 
 * Evaluates all enabled automation rules against current sensor data.
 * When conditions are met, executes the configured actions.
 * 
 * LOOP PREVENTION:
 * 1. Execution lock – prevents re-evaluation while actions are running
 * 2. Per-rule state tracking – only fires when condition transitions from false→true
 * 3. Post-execution suppression – ignores MQTT echoes for a brief window after actions
 * 4. Cooldown timer – existing per-rule cooldown from the schema
 */

// Current sensor readings (updated by MQTT messages)
let sensorData = {
  temperature: 25,
  humidity: 50,
  lux: 0,
  motion: false,
};

// ── Loop Prevention State ──
let _isExecuting = false;                    // True while actions are being executed
let _suppressUntil = 0;                       // Timestamp: ignore evaluations until this time
const SUPPRESSION_WINDOW_MS = 2000;           // 2-second window after execution to ignore echoes
const _previousConditionState = new Map();    // ruleId → boolean (was condition met last time?)

/**
 * Update sensor readings from MQTT or any other source.
 */
export function updateSensorData(updates) {
  if (DEBUG_AUTOMATION) {
    console.log('[AUTOMATION DEBUG] updateSensorData', { updates, before: sensorData });
  }
  sensorData = { ...sensorData, ...updates };
  if (DEBUG_AUTOMATION) {
    console.log('[AUTOMATION DEBUG] currentSensorData', sensorData);
  }
  return sensorData;
}

/**
 * Get current sensor readings.
 */
export function getSensorData() {
  return { ...sensorData };
}

/**
 * Check if the automation engine is currently executing actions.
 * External callers (like mqtt.js) can use this to skip evaluation.
 */
export function isEngineExecuting() {
  return _isExecuting || Date.now() < _suppressUntil;
}

/**
 * Reset the edge-trigger state for a specific rule.
 * Call this when a rule is updated so it can trigger again.
 */
export function resetRuleState(ruleId) {
  _previousConditionState.delete(ruleId.toString());
}

/**
 * Evaluate a single condition against current sensor data.
 */
function normalizeSensorValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return trimmed;
    const lower = trimmed.toLowerCase();

    if (!isNaN(trimmed)) return Number(trimmed);
    if (['true', 'on', 'yes'].includes(lower)) return true;
    if (['false', 'off', 'no'].includes(lower)) return false;
    return lower;
  }
  return value;
}

function evaluateCondition(condition) {
  // Check optional time bounds first
  if (condition.startTime && condition.endTime) {
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    
    const [startH, startM] = condition.startTime.split(':').map(Number);
    const startMins = startH * 60 + startM;
    
    const [endH, endM] = condition.endTime.split(':').map(Number);
    const endMins = endH * 60 + endM;
    
    if (startMins <= endMins) {
      if (currentMins < startMins || currentMins > endMins) return false;
    } else {
      // Overnight (e.g. 20:00 to 06:00)
      if (currentMins < startMins && currentMins > endMins) return false;
    }
  }

  const sensorKey = Object.prototype.hasOwnProperty.call(sensorData, condition.sensor)
    ? condition.sensor
    : Object.keys(sensorData).find(key => String(key).toLowerCase() === String(condition.sensor).toLowerCase());

  const currentValue = sensorKey ? sensorData[sensorKey] : undefined;
  if (currentValue === undefined) {
    if (DEBUG_AUTOMATION) {
      console.log('[AUTOMATION DEBUG] missing sensor', { requested: condition.sensor, resolved: sensorKey, sensorData });
    }
    return false;
  }

  const normalizedCurrent = normalizeSensorValue(currentValue);
  const normalizedTarget = normalizeSensorValue(condition.value);

  let result;
  switch (condition.operator) {
    case 'gt':
      return (typeof normalizedCurrent === 'number' && typeof normalizedTarget === 'number')
        ? normalizedCurrent > normalizedTarget
        : false;
    case 'lt':
      return (typeof normalizedCurrent === 'number' && typeof normalizedTarget === 'number')
        ? normalizedCurrent < normalizedTarget
        : false;
    case 'eq':
      result = normalizedCurrent === normalizedTarget;
      break;
    case 'gte':
      result = (typeof normalizedCurrent === 'number' && typeof normalizedTarget === 'number')
        ? normalizedCurrent >= normalizedTarget
        : false;
      break;
    case 'lte':
      return (typeof normalizedCurrent === 'number' && typeof normalizedTarget === 'number')
        ? normalizedCurrent <= normalizedTarget
        : false;
    case 'neq':
      result = normalizedCurrent !== normalizedTarget;
      break;
    default:
      result = false;
  }

  if (DEBUG_AUTOMATION) {
    console.log('[AUTOMATION DEBUG] evaluateCondition', {
      sensor: condition.sensor,
      sensorKey,
      currentValue,
      normalizedCurrent,
      operator: condition.operator,
      targetValue: condition.value,
      normalizedTarget,
      result
    });
  }

  return result;
}

/**
 * Execute a single action on a device.
 */
async function executeAction(action, io) {
  try {
    const { targetDeviceId, subDeviceIndex, command, params } = action;
    console.log(`[AUTOMATION ENGINE] Executing action: ${command} on ${targetDeviceId} (Sub: ${subDeviceIndex})`);

    if (targetDeviceId && targetDeviceId.includes('.')) {
      console.log(`[AUTOMATION ENGINE] Routing HA action: ${command} on entity ${targetDeviceId}`);
      const domain = targetDeviceId.split('.')[0];
      let service = command;
      let serviceData = params || {};
      
      if (domain === 'media_player') {
        if (command === 'turn_off') service = 'media_pause';
        else if (command === 'turn_on') service = 'media_play';
      }

      try {
        await callService(domain, service, { entity_id: targetDeviceId, ...serviceData });
      } catch (err) {
        console.error(`[AUTOMATION ENGINE] Failed to route HA action for ${targetDeviceId}:`, err.message);
      }
      return;
    }

    // Generic device handling
    const device = await Device.findOne({ deviceId: targetDeviceId });
    if (!device) {
      console.warn(`[AUTOMATION ENGINE] Device not found: ${targetDeviceId}`);
      return;
    }

    let topic = '';
    let payload = {};

    // Determine default topic and payload for RGBW lights and tunable lights
    if (device.type === 'rgbw' || device.type === 'light' || device.type === 'tunable-light' || device.type === 'tune light') {
      if (device.type === 'tunable-light' || device.type === 'tune light') {
        topic = `tunable-light/${targetDeviceId}/light/command`;
        const defaultBrightnessPct = 50;
        switch (command) {
          case 'turn_on':
            payload = { type: 'brightness', value: defaultBrightnessPct };
            break;
          case 'turn_off':
            payload = { type: 'brightness', value: 0 };
            break;
          case 'set_brightness': {
            const brightness = params?.brightness ?? 255;
            const pct = Math.round((brightness / 255) * 100);
            payload = { type: 'brightness', value: pct };
            break;
          }
          default:
            payload = {};
        }

        if (topic && Object.keys(payload).length > 0) {
          const [updatedDevice] = await Promise.all([
            Device.findOneAndUpdate({ deviceId: targetDeviceId }, {
              on: (command !== 'turn_off'),
              ...(command === 'set_brightness' && { brightness: params.brightness }),
              ...(command === 'turn_on' && { brightness: Math.round((defaultBrightnessPct / 100) * 255) }),
              ...(command === 'turn_off' && { brightness: 0 })
            }, { returnDocument: 'after' }),
            publishToTopic(topic, payload)
          ]);

          if (io && updatedDevice) io.emit('device_state_update', updatedDevice);
          return;
        }
      } else {
        topic = device.type === 'rgbw'
          ? `rgbw-light/${targetDeviceId}/light/command`
          : `smart_home/rgbw/${targetDeviceId}/command`;
        const isRgbwLight = device.type === 'rgbw';
        switch (command) {
          case 'turn_on':
            payload = isRgbwLight ? { type: 'brightness', value: 100 } : { state: 'ON' };
            break;
          case 'turn_off':
            payload = isRgbwLight ? { type: 'colour', colour: [0, 0, 0, 0] } : { state: 'OFF' };
            break;
          case 'set_brightness': {
            const brightness = params?.brightness ?? 255;
            payload = isRgbwLight
              ? { type: 'brightness', value: Math.round((brightness / 255) * 100) }
              : { state: 'ON', brightness };
            break;
          }
          case 'set_color':
            payload = isRgbwLight
              ? { type: 'colour', colour: params?.color || [255, 255, 255, 255] }
              : { state: 'ON', effect: 'solid', color: params?.color || [255, 255, 255, 255] };
            break;
          case 'set_effect':
            payload = isRgbwLight
              ? { type: 'animations', model: params?.effect || 'solid' }
              : { state: 'ON', effect: params?.effect || 'solid' };
            break;
        }
        
        if (topic && Object.keys(payload).length > 0) {
          // Execute in parallel
          const [updatedDevice] = await Promise.all([
            Device.findOneAndUpdate({ deviceId: targetDeviceId }, {
              on: (command !== 'turn_off'),
              ...(command === 'set_brightness' && { brightness: params.brightness }),
              ...(command === 'set_color' && { spectrumRgb: (params.color[0] << 16) | (params.color[1] << 8) | params.color[2] })
            }, { returnDocument: 'after' }),
            publishToTopic(topic, payload)
          ]);

          if (io && updatedDevice) io.emit('device_state_update', updatedDevice);
          return;
        }
      }
    }

    if (targetDeviceId.startsWith('BSQ') || device.type === 'touch-panel') {
      // Touch Panel Logic (Multi-channel)
      topic = `touch-panel/${targetDeviceId}/switch/command`;
      const idx = subDeviceIndex !== null && subDeviceIndex !== undefined ? Number(subDeviceIndex) : 0;
      const matchedSubDevice = Array.isArray(device.subDevices)
        ? device.subDevices.find(sd => Number(sd.index) === idx)
        : null;
      
      if (command === 'turn_on' || command === 'turn_off') {
        if (matchedSubDevice?.type === 'fan') {
          const nextSpeed = Math.max(1, Number(params?.speed) || Number(matchedSubDevice.speed) || 1);

          await publishToTopic(topic, {
            entityId: targetDeviceId,
            type: 'switch',
            value: `${idx}${command === 'turn_on' ? '1' : '0'}`
          });

          if (command === 'turn_on') {
            await sleep(120);
            await publishToTopic(topic, {
              entityId: targetDeviceId,
              type: 'dimmer',
              dimmer: String(idx),
              value: String(nextSpeed)
            });
            matchedSubDevice.speed = nextSpeed;
          }

          matchedSubDevice.on = (command === 'turn_on');
          await device.save();
          if (io) io.emit('device_state_update', device);
          return;
        } else {
          payload = {
            entityId: targetDeviceId,
            type: 'switch',
            value: `${idx}${command === 'turn_on' ? '1' : '0'}`
          };
          // Update local DB state
          if (matchedSubDevice) {
            matchedSubDevice.on = (command === 'turn_on');
          }
        }
      } else if (command === 'set_speed') {
        if (matchedSubDevice?.type === 'fan') {
          await publishToTopic(topic, {
            entityId: targetDeviceId,
            type: 'switch',
            value: `${idx}1`
          });
          await sleep(120);
          payload = {
            entityId: targetDeviceId,
            type: 'dimmer',
            dimmer: String(idx),
            value: String(params?.speed || 1)
          };
          matchedSubDevice.speed = params?.speed || 1;
          matchedSubDevice.on = true;
        }
      }
    } else if (targetDeviceId.startsWith('BSP') || device.type === 'plug' || device.type === 'switch') {
      // Smart Plug / Single Channel Switch
      topic = `smart-switch/command/${targetDeviceId}`;
      const status = (command === 'turn_on' ? 'ON' : 'OFF');
      payload = { entityId: targetDeviceId, relayStatus: status };
      device.on = (command === 'turn_on');
    } else if (device.type === 'curtain') {
      // Specialized Curtain/Touch-Panel Logic (e.g. BS900000001)
      topic = `touch-panel/${targetDeviceId}/switch/command`;
      if (command === 'turn_on' || command === 'turn_off') {
        const startValue = command === 'turn_on' ? '11' : '21';
        const stopValue = command === 'turn_on' ? '10' : '20';
        
        // 1. Send Start Command
        payload = { type: 'switch', value: startValue };
        await publishToTopic(topic, payload);
        
        // 2. Wait 5 seconds
        console.log(`[AUTOMATION ENGINE] Curtain ${targetDeviceId} moving, waiting 5s to stop...`);
        setTimeout(async () => {
          try {
            await publishToTopic(topic, { type: 'switch', value: stopValue });
            console.log(`[AUTOMATION ENGINE] Curtain ${targetDeviceId} stopped.`);
          } catch (err) {
            console.error(`[AUTOMATION ENGINE] Error stopping curtain ${targetDeviceId}:`, err);
          }
        }, 5000);

        device.on = (command === 'turn_on');
        await device.save();
        if (io) io.emit('device_state_update', device);
        payload = {}; // Prevent duplicate publish at the end of the function
      }
    }

    if (topic && Object.keys(payload).length > 0) {
      await publishToTopic(topic, payload);
      await device.save();
      if (io) io.emit('device_state_update', device);
    }

  } catch (err) {
    console.error('[AUTOMATION ENGINE] Error executing action:', err);
  }
}

/**
 * Evaluate all enabled automation rules and execute matching ones.
 * Called whenever sensor data changes.
 * 
 * LOOP PREVENTION: This function will bail out if:
 *   - Actions are currently being executed (_isExecuting)
 *   - We are within the post-execution suppression window
 *   - A rule's conditions haven't transitioned (were already met before)
 */
export async function evaluateAutomations(io) {
  // ── Guard: don't re-enter while executing or during suppression window ──
  if (_isExecuting) {
    console.log('[AUTOMATION ENGINE] ⏸ Skipping evaluation – actions in progress');
    return;
  }
  if (Date.now() < _suppressUntil) {
    console.log('[AUTOMATION ENGINE] ⏸ Skipping evaluation – in post-execution suppression window');
    return;
  }

  try {
    const rules = await Automation.find({ enabled: true });

    for (const rule of rules) {
      const ruleId = rule._id.toString();

      let skippedReason = null;
      // Check cooldown
      if (rule.lastTriggered) {
        const elapsed = (Date.now() - rule.lastTriggered.getTime()) / 1000;
        if (elapsed < rule.cooldownSeconds) {
          skippedReason = `cooldown (${elapsed.toFixed(1)}s < ${rule.cooldownSeconds}s)`;
          if (DEBUG_AUTOMATION) console.log('[AUTOMATION DEBUG] skipping rule on cooldown', { rule: rule.name, ruleId, skippedReason });
          continue; // Still in cooldown
        }
      }

      // Evaluate conditions
      const results = rule.conditions.map(evaluateCondition);
      const conditionsMet = rule.conditionLogic === 'all'
        ? results.every(Boolean)
        : results.some(Boolean);

      if (DEBUG_AUTOMATION) {
        console.log('[AUTOMATION DEBUG] rule evaluation', {
          rule: rule.name,
          ruleId,
          conditionLogic: rule.conditionLogic,
          results,
          conditionsMet,
          lastTriggered: rule.lastTriggered,
          cooldownSeconds: rule.cooldownSeconds
        });
      }

      // ── Edge-trigger: only fire on FALSE → TRUE transition ──
      const wasPreviouslyMet = _previousConditionState.get(ruleId) || false;
      _previousConditionState.set(ruleId, conditionsMet);

      if (!conditionsMet) {
        continue; // Conditions not met, nothing to do
      }

      if (wasPreviouslyMet) {
        // Conditions were already met last time – don't re-fire (edge-trigger)
        continue;
      }

      console.log(`[AUTOMATION ENGINE] ✅ Rule "${rule.name}" triggered!`);

      // ── Lock execution to prevent recursive evaluation ──
      _isExecuting = true;

      try {
        // Execute all actions
        for (let actionIndex = 0; actionIndex < rule.actions.length; actionIndex += 1) {
          const action = rule.actions[actionIndex];
          await executeAction(action, io);
          if (actionIndex < rule.actions.length - 1) {
            await sleep(ACTION_EXECUTION_DELAY_MS);
          }
        }
      } finally {
        // Unlock execution and start suppression window
        _isExecuting = false;
        _suppressUntil = Date.now() + SUPPRESSION_WINDOW_MS;
      }

      // Update trigger metadata
      rule.lastTriggered = new Date();
      rule.triggerCount += 1;
      await rule.save();

      // Notify frontend about the trigger
      if (io) {
        io.emit('automation_triggered', {
          ruleId: rule._id,
          ruleName: rule.name,
          triggeredAt: rule.lastTriggered,
          triggerCount: rule.triggerCount,
        });
      }
    }
  } catch (err) {
    console.error('[AUTOMATION ENGINE] Error evaluating automations:', err);
    // Always reset lock on error to prevent permanent deadlock
    _isExecuting = false;
  }
}

export { evaluateCondition, normalizeSensorValue };
