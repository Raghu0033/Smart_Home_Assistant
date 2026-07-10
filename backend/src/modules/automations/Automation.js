import mongoose from 'mongoose';

/**
 * Automation Rule Schema
 * 
 * Stores condition-based automation rules like:
 *   "If temperature > 30°C → Turn ON Air Conditioner"
 *   "If lux < 50 → Turn ON Living Room Light at 80% brightness"
 */
const conditionSchema = new mongoose.Schema({
  sensor: {
    type: String,
    required: true,
  },
  operator: {
    type: String,
    required: true,
    enum: ['gt', 'lt', 'eq', 'gte', 'lte', 'neq'],
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  startTime: {
    type: String, // format: "HH:mm"
    default: '',
  },
  endTime: {
    type: String, // format: "HH:mm"
    default: '',
  },
}, { _id: false });

const actionSchema = new mongoose.Schema({
  targetDevice: {
    type: String,
  },
  targetDeviceId: {
    type: String,
    required: true,
  },
  subDeviceIndex: {
    type: Number, // For multi-channel devices like touch panels
    default: null,
  },
  command: {
    type: String,
    required: true,
    enum: ['turn_on', 'turn_off', 'set_brightness', 'set_color', 'set_effect', 'set_speed', 'relay_toggle'],
  },
  params: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, { _id: false });

const automationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  icon: {
    type: String,
    default: '⚡',
  },
  room: {
    type: String,
    default: 'Global',
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  // 'all' = AND logic (all conditions must be true)
  // 'any' = OR logic (at least one condition must be true)
  conditionLogic: {
    type: String,
    enum: ['all', 'any'],
    default: 'all',
  },
  conditions: {
    type: [conditionSchema],
    validate: [arr => arr.length > 0, 'At least one condition is required'],
  },
  actions: {
    type: [actionSchema],
    validate: [arr => arr.length > 0, 'At least one action is required'],
  },
  // Track last trigger time to prevent rapid re-triggering
  lastTriggered: {
    type: Date,
    default: null,
  },
  // Cooldown in seconds before the rule can fire again
  cooldownSeconds: {
    type: Number,
    default: 60,
  },
  // How many times this rule has been triggered total
  triggerCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

const Automation = mongoose.model('Automation', automationSchema);

export default Automation;
