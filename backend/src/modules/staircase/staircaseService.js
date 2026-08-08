import { getMqttClient, publishToTopic } from '../../integrations/mqtt/mqttManager.js';

// All nodes accept four-channel arrays; node6 uses only channels 1-3.
const NODE_IDS = ['node1', 'node2', 'node3', 'node4', 'node5', 'node6'];
const CHANNELS_PER_NODE = 4;
const TOTAL_STEPS = 23;
const SEQUENCE_MAX_BRIGHTNESS = 200;
const FEEDBACK_TIMEOUT_MS = 2000;
const MAX_COMMAND_RETRIES = 3;
let io = null;

let settings = {
  maxBrightness: 255,
  fadeTime: 850,
  fadeStep: (255 * 5) / 850,
  nodeCount: 6,
  topSensorDeviceId: 'staircase_top',
  bottomSensorDeviceId: 'staircase_bottom'
};

let lastPublished = {};
let currentState = "IDLE";
let animTimer = null;
let stopAnim = false;
const pendingCommands = new Map();
let activeSequence = false;
const queuedDirections = [];
const sensorStates = new Map();
let sequenceGeneration = 0;
let autoOffTimer = null;

// Staircase brightness profile: first three steps full, then 150, 100, 50.
// Steps after step 6 use the configured maximum brightness.
function brightnessForStep(step) {
  if (step <= 3) return settings.maxBrightness;
  if (step === 4) return 150;
  if (step === 5) return 100;
  if (step === 6) return 50;
  return 0;
}

export function initStaircase(socketIo) {
  io = socketIo;
  
  io.on('connection', (socket) => {
    socket.emit('staircase_sys_status', { mqtt: true });
    socket.emit('staircase_state_update', { state: currentState });
    socket.emit('staircase_settings_sync', settings);

    socket.on('staircase_trigger', (data) => {
      const cmd = data.cmd || '';
      handleTrigger(cmd);
    });

    socket.on('staircase_update_settings', (data) => {
      const next = { ...data };
      if (next.fadeTime !== undefined) {
        next.fadeTime = Math.max(50, Math.min(10000, Number(next.fadeTime) || 850));
        next.fadeStep = (255 * 5) / next.fadeTime;
        publishCommandWithRetry('node6', { fadeTime: next.fadeTime });
      }
      if (next.nodeCount !== undefined) next.nodeCount = 6;
      settings = { ...settings, ...next };
      io.emit('staircase_settings_sync', settings);
    });
  });
}

function publishToMQTT(topic, payload, options = {}) {
  const mqttClient = getMqttClient();
  if (mqttClient && mqttClient.connected) {
    mqttClient.publish(topic, payload, options);
    if (io) {
      io.emit('staircase_mqtt_log', {
        topic: topic,
        payload: JSON.parse(payload),
        status: 'ok',
        t: new Date().toLocaleTimeString()
      });
    }
  } else {
    if (io) {
      io.emit('staircase_mqtt_log', {
        topic: topic,
        payload: JSON.parse(payload),
        status: 'fail',
        t: new Date().toLocaleTimeString()
      });
    }
  }
}

function publishStep(step, brightness) {
  if (lastPublished[step] === brightness) return;
  lastPublished[step] = brightness;
  
  const channel = ((step - 1) % CHANNELS_PER_NODE) + 1;
  
  const node = NODE_IDS[Math.floor((step - 1) / CHANNELS_PER_NODE)];
  if (node) publishCommandWithRetry(node, { channel, brightness });
}

function publishCommandWithRetry(node, payload, attempt = 1) {
  const topic = `smart_home/staircase/${node}/command`;
  const key = `${node}:${payload.channel ?? 'all'}`;
  const command = { node, payload, key, attempt };
  const previous = pendingCommands.get(key);
  if (previous) clearTimeout(previous.timer);
  publishToMQTT(topic, JSON.stringify(payload), { qos: 1 });
  const timer = setTimeout(() => {
    if (pendingCommands.get(key) !== command) return;
    if (attempt < MAX_COMMAND_RETRIES) publishCommandWithRetry(node, payload, attempt + 1);
    else {
      pendingCommands.delete(key);
      if (io) io.emit('staircase_mqtt_log', { topic, payload, status: 'timeout', attempts: attempt, t: new Date().toLocaleTimeString() });
    }
  }, FEEDBACK_TIMEOUT_MS);
  command.timer = timer;
  pendingCommands.set(key, command);
}

function publishOneShot(node, payload) {
  publishToMQTT(`smart_home/staircase/${node}/command`, JSON.stringify(payload), { qos: 1 });
}

function waitForFadeTime() {
  return new Promise(resolve => setTimeout(resolve, Math.max(50, Number(settings.fadeTime) || 850)));
}

function waitMilliseconds(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function sendReliableStage(commands) {
  const fadeTime = Math.max(50, Number(settings.fadeTime) || 850);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    commands.forEach(({ node, payload }) => publishOneShot(node, payload));
    if (attempt < 2) await waitMilliseconds(100);
  }
  await waitMilliseconds(Math.max(0, fadeTime - 200));
}

// Expected feedback topic: smart_home/staircase/nodeN/status
// Supports {channel, brightness} and {channels: [brightness, ...]}.
export function handleStaircaseFeedback(topic, rawPayload) {
  const match = topic.match(/^smart_home\/staircase\/(node[1-6])\/status$/);
  if (!match) return false;
  let data;
  try { data = JSON.parse(rawPayload); } catch {
    if (io) io.emit('staircase_feedback_error', { node: match[1], message: 'Invalid JSON feedback payload' });
    return true;
  }
  const node = match[1];
  const allPending = pendingCommands.get(`${node}:all`);
  if (allPending && Array.isArray(allPending.payload.channels) && Array.isArray(data.current) && Array.isArray(data.target)) {
    const complete = allPending.payload.channels.every((value, index) =>
      Number(data.current[index]) === Number(value) && Number(data.target[index]) === Number(value)
    );
    if (complete) {
      clearTimeout(allPending.timer);
      pendingCommands.delete(`${node}:all`);
    }
  }
  const entries = data?.channel !== undefined
    ? [[data.channel, data.brightness]]
    : Array.isArray(data?.channels) ? data.channels.map((value, i) => [i + 1, value])
      : Array.isArray(data?.current) ? data.current.map((value, i) => [i + 1, value]) : [];
  for (const [channel, brightness] of entries) {
    const key = `${node}:${channel}`;
    const pending = pendingCommands.get(key);
    if (pending && (pending.payload.brightness === undefined || Number(brightness) === Number(pending.payload.brightness))) {
      clearTimeout(pending.timer);
      pendingCommands.delete(key);
    }
  }
  if (io) io.emit('staircase_mqtt_log', { topic, payload: data, status: 'feedback', t: new Date().toLocaleTimeString() });
  if (data && sequenceFeedback.has(node)) {
    const expected = sequenceFeedback.get(node);
    const values = Array.isArray(data.current) ? data.current : entries.map(([, value]) => Number(value));
    const targets = Array.isArray(data.target) ? data.target : values;
    const currentValue = expected.channel ? Number(values[expected.channel - 1]) : null;
    const targetValue = expected.channel ? Number(targets[expected.channel - 1]) : null;
    const matches = expected.channel
      ? currentValue === expected.value && targetValue === expected.value
      : values.length >= expected.length && targets.length >= expected.length
        && expected.every((value, index) => Number(values[index]) === value && Number(targets[index]) === value);
    // Sequence completion is determined only by current and target values.
    // direction, rangeLimit, and globalBusy are informational status fields.
    if (matches) {
      sequenceFeedback.get(node).resolve();
      sequenceFeedback.delete(node);
    }
  }
  return true;
}

export function publishAllOff() {
  NODE_IDS.forEach(node => publishCommandWithRetry(node, { command: 'EMERGENCY_OFF' }));
  for (let s = 1; s <= TOTAL_STEPS; s++) {
    lastPublished[s] = 0;
  }
}

function smoothstep(t) {
  t = Math.max(0.0, Math.min(1.0, t));
  return t * t * (3.0 - 2.0 * t);
}

const sequenceFeedback = new Map();

function waitForNode(node, expected, channel = null) {
  return new Promise(resolve => {
    const feedback = channel ? { channel, value: expected, resolve } : { expected, resolve };
    sequenceFeedback.set(node, feedback);
    setTimeout(() => {
      if (sequenceFeedback.get(node)?.resolve === resolve) {
        sequenceFeedback.delete(node);
        if (io) io.emit('staircase_feedback_error', { node, expected, message: `No matching feedback received from ${node}` });
        resolve();
      }
    }, Math.max(7000, settings.fadeTime + 4000));
  });
}

const STAGED_NODE_PROFILE = [
  [255, 255, 255, 150],
  [150, 100, 50, 0],
  [255, 150, 100, 50],
  [255, 255, 150, 100],
  [255, 255, 255, 150],
  [255, 255, 255, 255]
];

function stagedNodeValues(nodeIndex, stage) {
  const channels = 4;
  if (nodeIndex === 0) {
    if (stage === 0) return [255, 255, 255, 150];
    if (stage === 1) return [255, 255, 255, 255];
    return null;
  }
  const startStage = (nodeIndex - 1) * 2;
  const profileIndex = stage - startStage;
  if (profileIndex < 0 || profileIndex >= STAGED_NODE_PROFILE.length) return null;
  if (profileIndex === 0) {
    return (nodeIndex === 1 ? [100, 50, 0, 0] : [50, 0, 0, 0]).slice(0, channels);
  }
  return STAGED_NODE_PROFILE[profileIndex].slice(0, channels);
}

async function runStagedUpSequence(generation) {
  const previous = new Map();
  const finalStage = (NODE_IDS.length - 2) * 2 + STAGED_NODE_PROFILE.length - 1;

  for (let stage = 0; stage <= finalStage; stage += 1) {
    if (generation !== sequenceGeneration) return;
    const commands = [];
    NODE_IDS.forEach((node, nodeIndex) => {
      const values = stagedNodeValues(nodeIndex, stage);
      if (!values || JSON.stringify(previous.get(node)) === JSON.stringify(values)) return;
      previous.set(node, values);
      commands.push({ node, values });
    });

    // Send the whole stage together. Status feedback is informational only;
    // the configured fade time controls when the next stage is sent.
    commands.forEach(({ node, values }) => publishOneShot(node, { channels: values }));
    if (stage < finalStage) await waitForFadeTime();
  }
}

async function runIncrementalSequence(generation, direction) {
  const orderedSteps = Array.from({ length: TOTAL_STEPS }, (_, index) => (
    direction === 'UP' ? index + 1 : TOTAL_STEPS - index
  ));
  const initialSteps = orderedSteps.slice(0, 5);
  const initialByNode = new Map();
  initialSteps.forEach(step => {
    const node = NODE_IDS[Math.floor((step - 1) / CHANNELS_PER_NODE)];
    const channel = ((step - 1) % CHANNELS_PER_NODE) + 1;
    if (!initialByNode.has(node)) initialByNode.set(node, [0, 0, 0, 0]);
    initialByNode.get(node)[channel - 1] = SEQUENCE_MAX_BRIGHTNESS;
  });

  // The first five physical steps in the travel direction start together.
  await sendReliableStage([...initialByNode.entries()].map(([node, channels]) => ({
    node,
    payload: { channels }
  })));

  // Remaining steps start one by one at full brightness.
  for (const step of orderedSteps.slice(5)) {
    if (generation !== sequenceGeneration) return;
    const node = NODE_IDS[Math.floor((step - 1) / CHANNELS_PER_NODE)];
    const channel = ((step - 1) % CHANNELS_PER_NODE) + 1;
    const brightness = SEQUENCE_MAX_BRIGHTNESS;
    await sendReliableStage([{ node, payload: { channel, brightness } }]);
  }

  if (generation !== sequenceGeneration) return;
  await sendReliableStage(NODE_IDS.map(node => ({
    node,
    payload: { channels: node === 'node6'
      ? [SEQUENCE_MAX_BRIGHTNESS, SEQUENCE_MAX_BRIGHTNESS, SEQUENCE_MAX_BRIGHTNESS, 0]
      : Array(4).fill(SEQUENCE_MAX_BRIGHTNESS) }
  })));
}

async function runSameDirectionOffWave(generation, direction) {
  // Turn off one physical step at a time in the same travel direction. Node6
  // has only three active channels; its unused fourth channel is never commanded.
  const nodeOrder = direction === 'UP'
    ? NODE_IDS
    : [...NODE_IDS].reverse();
  for (const node of nodeOrder) {
    const lastChannel = node === 'node6' ? 3 : 4;
    const channels = direction === 'UP'
      ? Array.from({ length: lastChannel }, (_, index) => index + 1)
      : Array.from({ length: lastChannel }, (_, index) => lastChannel - index);
    for (const channel of channels) {
      if (generation !== sequenceGeneration) return;
      await sendReliableStage([{
        node,
        payload: { channel, brightness: 0 }
      }]);
    }
  }
}

async function runSequence(direction, targetBrightness = null) {
  activeSequence = true;
  const generation = ++sequenceGeneration;
  const order = direction === 'UP' ? NODE_IDS : [...NODE_IDS].reverse();
  const sequence = order.map(node => ({ node, channels: node === 'node6' ? 3 : 4 }));
  currentState = `ANIMATING_${direction}`;
  if (io) io.emit('staircase_state_update', { state: currentState });

  if (targetBrightness === 0) {
    await runSameDirectionOffWave(generation, direction);
    if (generation !== sequenceGeneration) return;
    activeSequence = false;
    currentState = 'IDLE';
    if (io) io.emit('staircase_state_update', { state: currentState });
    const nextOff = queuedDirections.shift();
    if (nextOff) runSequence(nextOff.direction, nextOff.target);
    return;
  }

  if (targetBrightness === null) {
    await runIncrementalSequence(generation, direction);
    if (generation !== sequenceGeneration) return;
    activeSequence = false;
    currentState = 'ON';
    if (io) io.emit('staircase_state_update', { state: currentState });
    const nextUp = queuedDirections.shift();
    if (nextUp) runSequence(nextUp.direction, nextUp.target);
    if (autoOffTimer) clearTimeout(autoOffTimer);
    autoOffTimer = setTimeout(() => {
      // Keep the OFF wave in the same direction as the sensor-triggered ON
      // wave. A top sensor starts DOWN (step 23 -> step 1), so its auto-OFF
      // must also run DOWN rather than using the old hard-coded UP direction.
      if (activeSequence) queuedDirections.push({ direction, target: 0 });
      else runSequence(direction, 0);
    }, 10000);
    return;
  }

  for (const { node, channels } of sequence) {
    // The first three staircase channels must start together immediately.
    if (node === 'node1' && (targetBrightness === null || targetBrightness === 0)) {
      const firstThree = targetBrightness === 0
        ? [0, 0, 0, 0]
        : [brightnessForStep(1), brightnessForStep(2), brightnessForStep(3), 0];
      const feedbackWait = waitForNode(node, firstThree);
      publishCommandWithRetry(node, { channels: firstThree });
      await feedbackWait;
    }
    const firstChannel = node === 'node1' && (targetBrightness === null || targetBrightness === 0) ? 4 : 1;
    for (let channel = firstChannel; channel <= channels; channel += 1) {
      if (generation !== sequenceGeneration) return;
      // One channel at a time: do not send a four-channel array here.
      const step = NODE_IDS.indexOf(node) * CHANNELS_PER_NODE + channel;
      const brightness = targetBrightness === null ? brightnessForStep(step) : targetBrightness;
      const feedbackWait = waitForNode(node, brightness, channel);
      publishCommandWithRetry(node, { channel, brightness });
      await feedbackWait;
    }
  }
  activeSequence = false;
  currentState = targetBrightness === null || targetBrightness > 0 ? 'ON' : 'IDLE';
  if (io) io.emit('staircase_state_update', { state: currentState });
  const next = queuedDirections.shift();
  if (next) runSequence(next.direction, next.target);
}

function runAnimation(stepsOrder, targetBrightness, directionLabel) {
  const fadeTime = settings.fadeTime / 1000;
  const maxB = targetBrightness;

  currentState = `ANIMATING_${directionLabel}`;
  if (io) io.emit('staircase_state_update', { state: currentState });

  const totalDuration = fadeTime;
  const frameIntervalMs = 50;

  const startBrightness = {};
  for (const s of stepsOrder) {
    startBrightness[s] = lastPublished[s] || 0;
  }

  const t0 = Date.now();

  if (animTimer) clearInterval(animTimer);

  animTimer = setInterval(() => {
    if (stopAnim) {
      clearInterval(animTimer);
      return;
    }

    const elapsed = (Date.now() - t0) / 1000.0;
    if (elapsed > totalDuration) {
      clearInterval(animTimer);
      // Final pass
      const visData = {};
      for (const step of stepsOrder) {
        publishStep(step, maxB);
        visData[step] = maxB;
      }
      if (io) io.emit('staircase_vis_update', visData);

      currentState = maxB > 0 ? "ON" : "IDLE";
      if (io) io.emit('staircase_state_update', { state: currentState });
      return;
    }

    const visData = {};
    for (let idx = 0; idx < stepsOrder.length; idx++) {
      const step = stepsOrder[idx];
      const stepStart = 0;
      let progress = (elapsed - stepStart) / fadeTime;
      progress = Math.max(0.0, Math.min(1.0, progress));
      const smoothP = smoothstep(progress);

      const sb = startBrightness[step];
      let brightness = Math.round(sb + (maxB - sb) * smoothP);
      brightness = Math.max(0, Math.min(255, brightness));

      publishStep(step, brightness);
      visData[step] = brightness;
    }

    if (io) io.emit('staircase_vis_update', visData);
  }, frameIntervalMs);
}

export function handleTrigger(cmd) {
  stopAnim = true;
  if (animTimer) clearInterval(animTimer);
  stopAnim = false;

  const maxB = settings.maxBrightness;
  const stepsUp = Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1);
  const stepsDown = Array.from({ length: TOTAL_STEPS }, (_, i) => TOTAL_STEPS - i);

  if (cmd === 'UP') {
    if (activeSequence) queuedDirections.push({ direction: 'UP', target: null }); else runSequence('UP');
  } else if (cmd === 'DOWN') {
    if (activeSequence) queuedDirections.push({ direction: 'DOWN', target: null }); else runSequence('DOWN');
  } else if (cmd === 'OFF_UP') {
    if (activeSequence) queuedDirections.push({ direction: 'UP', target: 0 }); else runSequence('UP', 0);
  } else if (cmd === 'OFF_DOWN') {
    if (activeSequence) queuedDirections.push({ direction: 'DOWN', target: 0 }); else runSequence('DOWN', 0);
  } else if (cmd === 'EMERGENCY_OFF') {
    sequenceGeneration += 1;
    activeSequence = false;
    queuedDirections.length = 0;
    if (autoOffTimer) clearTimeout(autoOffTimer);
    publishAllOff();
    const visData = {};
    for (let s = 1; s <= TOTAL_STEPS; s++) visData[s] = 0;
    if (io) {
      io.emit('staircase_vis_update', visData);
      currentState = "IDLE";
      io.emit('staircase_state_update', { state: currentState });
    }
  }
}

export function handleStaircaseSensor(deviceId, value) {
  const id = String(deviceId);
  const isTop = Boolean(settings.topSensorDeviceId) && id === settings.topSensorDeviceId;
  const isBottom = id === settings.bottomSensorDeviceId;
  if (!isTop && !isBottom) return false;
  const detected = String(value).trim() === '1' || value === true || value === 1;
  const wasDetected = sensorStates.get(id) === true;
  sensorStates.set(id, detected);
  if (detected && !wasDetected) {
    if (detected) {
      if (autoOffTimer) clearTimeout(autoOffTimer);
      const direction = isTop ? 'DOWN' : 'UP';
      if (activeSequence) queuedDirections.push({ direction, target: null });
      else runSequence(direction);
    }
  }
  return true;
}
