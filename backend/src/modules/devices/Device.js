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
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
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
  tankCapacity: {
    type: Number,
    min: 1,
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
    applianceType: {
      type: String,
      enum: ['switch', 'plug', 'light', 'fan', 'fridge', 'ac', 'geyser', 'tv', 'projector', 'socket', 'other'],
      default: 'switch'
    },
    label: String,
    icon: String,
    on: { type: Boolean, default: false },
    speed: { type: Number, default: 1 } // for fans: 1-5
  }],
  touchPanelBacklight: {
    onColor: { type: [Number], default: [102, 204, 0] },
    offColor: { type: [Number], default: [0, 102, 255] },
    onBrightness: { type: Number, default: 100, min: 0, max: 100 },
    transitionSeconds: { type: Number, default: 10, min: 0, max: 255 },
    offBrightness: { type: Number, default: 100, min: 0, max: 100 }
  },
  schedules: [{
    startTime: String,
    endTime: String,
    actionTime: String,
    startAction: { type: String, default: 'ON' },
    endAction: { type: String, default: 'OFF' },
    actionType: { type: String, enum: ['ON', 'OFF', 'BRIGHTNESS', 'COLOR', 'ANIMATION'] },
    scheduledBrightness: { type: Number, min: 1, max: 100 },
    endEnabled: { type: Boolean, default: false },
    endActionType: { type: String, enum: ['ON', 'OFF'], default: 'OFF' },
    rgbwColor: {
      r: Number,
      g: Number,
      b: Number,
      w: Number
    },
    animationEffect: String,
    restoreAfterEnd: { type: Boolean, default: false },
    restorePending: { type: Boolean, default: false },
    restoreState: mongoose.Schema.Types.Mixed,
    days: [String],
    enabled: { type: Boolean, default: true }
  }],
  lastSeen: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
});

const Device = mongoose.model('Device', deviceSchema);

export default Device;
