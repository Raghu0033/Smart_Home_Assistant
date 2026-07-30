import mongoose from 'mongoose';

const changeRequestSchema = new mongoose.Schema({
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  resource: { type: String, required: true },
  method: { type: String, required: true },
  path: { type: String, required: true },
  body: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'executed'], default: 'pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('ChangeRequest', changeRequestSchema);
