/**
 * Shared MQTT Manager
 * Allows the Smart Home controller (and any other module) to publish
 * commands to the physical MQTT light without circular imports.
 */

const MQTT_COMMAND_TOPIC = 'smart_home/rgbw/rgbw1/command';

let _mqttClient = null;

/**
 * Set the MQTT client reference (called once from server.js after connection).
 */
export function setMqttClient(client) {
  _mqttClient = client;
}

/**
 * Get the current MQTT client.
 */
export function getMqttClient() {
  return _mqttClient;
}

/**
 * Publish a command to a specific device topic.
 * @param {string} topic - The MQTT topic to publish to
 * @param {object} payload - The JSON payload to send
 * @returns {Promise<boolean>} - Whether the publish succeeded
 */
export function publishToTopic(topic, payload) {
  return new Promise((resolve, reject) => {
    if (!_mqttClient || !_mqttClient.connected) {
      console.warn('[MQTT BRIDGE] MQTT client not connected, skipping publish');
      return resolve(false);
    }

    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    _mqttClient.publish(topic, message, (err) => {
      if (err) {
        console.error(`[MQTT BRIDGE] Publish error on ${topic}:`, err.message);
        return reject(err);
      }
      console.log(`[MQTT BRIDGE] Published to ${topic}: ${message}`);
      return resolve(true);
    });
  });
}

// Keep a wrapper for the legacy light for compatibility if needed, 
// but we should migrate away from it.
export function publishToLight(payload) {
  return publishToTopic(MQTT_COMMAND_TOPIC, payload);
}

export { MQTT_COMMAND_TOPIC };
