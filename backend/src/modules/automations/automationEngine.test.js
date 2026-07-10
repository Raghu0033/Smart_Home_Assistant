import assert from 'assert';
import { normalizeSensorValue, evaluateCondition, updateSensorData, getSensorData } from './automationEngine.js';

function runTests() {
  console.log('Running automationEngine tests...');

  // normalizeSensorValue tests
  assert.strictEqual(normalizeSensorValue('1'), 1);
  assert.strictEqual(normalizeSensorValue('0'), 0);
  assert.strictEqual(normalizeSensorValue('true'), true);
  assert.strictEqual(normalizeSensorValue('false'), false);
  assert.strictEqual(normalizeSensorValue('ON'), true);
  assert.strictEqual(normalizeSensorValue('off'), false);
  assert.strictEqual(normalizeSensorValue('hello'), 'hello');
  assert.strictEqual(normalizeSensorValue('  77  '), 77);

  // sensor name matching should be case-insensitive
  updateSensorData({ Human: '1', 'pir presence': '0' });
  let condition = { sensor: 'human', operator: 'eq', value: 1 };
  assert.strictEqual(evaluateCondition(condition), true, 'human sensor eq 1 should be true');

  condition = { sensor: 'human', operator: 'eq', value: '1' };
  assert.strictEqual(evaluateCondition(condition), true, 'human sensor eq "1" should be true');

  condition = { sensor: 'pir presence', operator: 'eq', value: 0 };
  assert.strictEqual(evaluateCondition(condition), true, 'pir presence sensor eq 0 should be true');

  condition = { sensor: 'pir presence', operator: 'eq', value: '0' };
  assert.strictEqual(evaluateCondition(condition), true, 'pir presence sensor eq "0" should be true');

  condition = { sensor: 'pir presence', operator: 'neq', value: '1' };
  assert.strictEqual(evaluateCondition(condition), true, 'pir presence sensor neq "1" should be true when value is 0');

  console.log('✅ automationEngine tests passed');
}

runTests();
