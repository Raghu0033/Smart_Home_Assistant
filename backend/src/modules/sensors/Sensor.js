import mongoose from 'mongoose';

const sensorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  topic: {
    type: String,
    required: true,
    unique: true,
  },
  room: {
    type: String,
    default: 'Unassigned',
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  unit: {
    type: String,
    default: '',
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  }
}, {
  timestamps: true,
});

const Sensor = mongoose.model('Sensor', sensorSchema);

export default Sensor;
