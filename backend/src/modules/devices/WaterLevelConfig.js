import mongoose from 'mongoose';

const waterLevelConfigSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true, trim: true, uppercase: true },
  enabled: { type: Boolean, default: false },
  onLevel: { type: Number, default: 25, min: 0, max: 99 },
  offLevel: { type: Number, default: 90, min: 1, max: 100 }
}, { timestamps: true });

export default mongoose.model('WaterLevelConfig', waterLevelConfigSchema);
