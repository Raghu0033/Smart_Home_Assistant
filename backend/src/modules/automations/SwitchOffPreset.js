import mongoose from 'mongoose';

const switchOffPresetSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  room: { type: String, required: true, trim: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, enum: ['on', 'off'], default: 'off' },
  executionMode: { type: String, enum: ['manual', 'timer', 'schedule'], default: 'manual' },
  timerMinutes: { type: Number, min: 0, max: 10080 },
  timerSeconds: { type: Number, min: 0, max: 59, default: 0 },
  scheduleTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  scheduleDays: [{ type: String, enum: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }],
  enabled: { type: Boolean, default: true },
  nextRunAt: { type: Date },
  lastRunAt: { type: Date },
  lastRunKey: { type: String, default: '' },
  targets: [{
    panelDeviceId: { type: String, required: true },
    subDeviceIndex: { type: Number, required: true, min: 1 },
    label: { type: String, default: '' },
    type: { type: String, enum: ['switch', 'fan'], default: 'switch' },
    applianceType: {
      type: String,
      enum: ['switch', 'plug', 'light', 'fan', 'fridge', 'ac', 'geyser', 'tv', 'projector', 'socket', 'other'],
      default: 'switch'
    },
    fanSpeed: { type: Number, min: 1, max: 5, default: 1 }
  }]
}, { timestamps: true });

switchOffPresetSchema.path('targets').validate(
  targets => Array.isArray(targets) && targets.length > 0,
  'Select at least one switch'
);

export default mongoose.model('SwitchOffPreset', switchOffPresetSchema);
