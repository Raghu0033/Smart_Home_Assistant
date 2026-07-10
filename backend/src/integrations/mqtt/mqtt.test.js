import assert from 'assert';
import { parseSensorValueFromMqttData, isPresenceValue } from './mqtt.js';

function runTests() {
  console.log('Running MQTT parser tests...');

  assert.strictEqual(parseSensorValueFromMqttData('1'), 1);
  assert.strictEqual(parseSensorValueFromMqttData('0'), 0);
  assert.strictEqual(parseSensorValueFromMqttData('true'), 'true');
  assert.strictEqual(parseSensorValueFromMqttData('false'), 'false');
  assert.strictEqual(parseSensorValueFromMqttData('value="1"'), 1);
  assert.strictEqual(parseSensorValueFromMqttData('value=0'), 0);
  assert.strictEqual(parseSensorValueFromMqttData({ value: '1' }), 1);
  assert.strictEqual(parseSensorValueFromMqttData({ value: 0 }), 0);

  assert.strictEqual(isPresenceValue(1), true);
  assert.strictEqual(isPresenceValue(0), false);
  assert.strictEqual(isPresenceValue('1'), true);
  assert.strictEqual(isPresenceValue('0'), false);
  assert.strictEqual(isPresenceValue('ON'), true);
  assert.strictEqual(isPresenceValue('off'), false);

  console.log('✅ MQTT parser tests passed');
}

runTests();
