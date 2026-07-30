import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  icon: {
    type: String,
    default: '🏠',
  },
});

roomSchema.index({ name: 1, icon: 1 }, { unique: true });

const Room = mongoose.model('Room', roomSchema);

export default Room;
