import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
  },
  title: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    default: 'light',
  },
  icon: {
    type: String,
    default: '💡',
  },
  room: {
    type: String,
    default: 'Unassigned',
  },
  isConfigured: {
    type: Boolean,
    default: false,
  },
  on: {
    type: Boolean,
    default: false,
  },
  brightness: {
    type: Number,
    default: 100,
    min: 0,
    max: 100,
  },
  spectrumRgb: {
    type: Number,
    default: 16777215, 
  },
  speed: {
    type: Number,
    default: 1,
  },
  effect: {
    type: String,
    default: 'solid',
  },
  topic: {
    type: String,
  },
  timerRemaining: {
    type: Number,
    default: 0,
  },
  timerAction: {
    type: String,
  },
  voltage: Number,
  current: Number,
  power: Number,
  energy: Number,
  pf: Number,
  // 3-Phase Metrics
  voltageR: Number, voltageY: Number, voltageB: Number,
  currentR: Number, currentY: Number, currentB: Number,
  powerR: Number, powerY: Number, powerB: Number,
  pfR: Number, pfY: Number, pfB: Number,
  apparentPowerR: Number, apparentPowerY: Number, apparentPowerB: Number,
  reactivePowerR: Number, reactivePowerY: Number, reactivePowerB: Number,
  apparentEnergy: Number,
  reactiveEnergy: Number,
  phaseAngle: Number,
  phaseAngle: Number,
  temperature: Number,
  externalTemp: Number,
  subDevices: [{
    index: Number,
    type: { type: String, enum: ['switch', 'fan'] },
    label: String,
    on: { type: Boolean, default: false },
    speed: { type: Number, default: 1 } // for fans: 1-5
  }],
  schedules: [{
    startTime: String,
    endTime: String,
    startAction: { type: String, default: 'ON' },
    endAction: { type: String, default: 'OFF' },
    days: [String],
    enabled: { type: Boolean, default: true }
  }],
  lastSeen: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
});

const Device = mongoose.model('Device', deviceSchema);

export default Device;
