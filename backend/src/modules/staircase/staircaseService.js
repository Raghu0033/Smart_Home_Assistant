import { getMqttClient, publishToTopic } from '../../integrations/mqtt/mqttManager.js';

const TOTAL_STEPS = 28;
let io = null;

let settings = {
  maxBrightness: 255,
  fadeTime: 0.8,
  stepGap: 0.25,
  fps: 30,
  autoOffTimeout: 20
};

let lastPublished = {};
let currentState = "IDLE";
let animTimer = null;
let autoOffTimer = null;
let stopAnim = false;

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
      settings = { ...settings, ...data };
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
  
  const node = Math.floor((step - 1) / 4) + 1;
  const channel = ((step - 1) % 4) + 1;
  const topic = `smart_home/staircase/node${node}/command`;
  
  publishToMQTT(topic, JSON.stringify({ channel, brightness }), { qos: 1 });
}

export function publishAllOff() {
  const numNodes = Math.floor((TOTAL_STEPS + 3) / 4);
  for (let n = 1; n <= numNodes; n++) {
    const topic = `smart_home/staircase/node${n}/command`;
    publishToMQTT(topic, JSON.stringify({ channels: [0, 0, 0, 0] }), { qos: 1 });
  }
  for (let s = 1; s <= TOTAL_STEPS; s++) {
    lastPublished[s] = 0;
  }
}

function smoothstep(t) {
  t = Math.max(0.0, Math.min(1.0, t));
  return t * t * (3.0 - 2.0 * t);
}

function runAnimation(stepsOrder, targetBrightness, directionLabel) {
  const fadeTime = settings.fadeTime;
  const stepGap = settings.stepGap;
  const fps = settings.fps;
  const maxB = targetBrightness;

  currentState = `ANIMATING_${directionLabel}`;
  if (io) io.emit('staircase_state_update', { state: currentState });

  const num = stepsOrder.length;
  const totalDuration = (num - 1) * stepGap + fadeTime;
  const frameIntervalMs = 1000 / fps;

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
      const stepStart = idx * stepGap;
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
  if (autoOffTimer) clearTimeout(autoOffTimer);
  stopAnim = false;

  const maxB = settings.maxBrightness;
  const stepsUp = Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1);
  const stepsDown = Array.from({ length: TOTAL_STEPS }, (_, i) => TOTAL_STEPS - i);

  if (cmd === 'UP') {
    runAnimation(stepsUp, maxB, "UP");
    scheduleAutoOff("UP");
  } else if (cmd === 'DOWN') {
    runAnimation(stepsDown, maxB, "DOWN");
    scheduleAutoOff("DOWN");
  } else if (cmd === 'OFF_UP') {
    runAnimation(stepsUp, 0, "OFF_UP");
  } else if (cmd === 'OFF_DOWN') {
    runAnimation(stepsDown, 0, "OFF_DOWN");
  } else if (cmd === 'EMERGENCY_OFF') {
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

function scheduleAutoOff(direction) {
  if (autoOffTimer) clearTimeout(autoOffTimer);
  autoOffTimer = setTimeout(() => {
    handleTrigger(`OFF_${direction}`);
  }, settings.autoOffTimeout * 1000);
}
