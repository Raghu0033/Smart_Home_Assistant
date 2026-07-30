import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const HOME_PERMISSIONS = [
  'dashboard', 'devices', 'sensors', 'scenes', 'audio-devices',
  'staircase', 'water-level', 'surveillance', 'settings'
];

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    default: ''
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true,
    default: undefined,
    sparse: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'non-binary', 'prefer-not-to-say'],
    default: 'prefer-not-to-say'
  },
  avatar: {
    type: String,
    default: 'avatar-1'
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member'
  },
  accountType: {
    type: String,
    enum: ['child', 'adult', 'pending-adult'],
    default: 'adult'
  },
  permanentChild: {
    type: Boolean,
    default: false
  },
  permissions: {
    type: [String],
    default: []
  },
  allowedRoomIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Room',
    default: []
  },
  allRoomsAccess: {
    type: Boolean,
    default: true
  },
  guardianId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  adultApprovalRequestedAt: {
    type: Date,
    default: null
  },
  adultApprovedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.syncAgeStatus = async function () {
  return null;
};

userSchema.methods.toProfileJSON = function () {
  return {
    id: this.id,
    name: this.name || this.username,
    username: this.username,
    phone: this.phone,
    gender: this.gender,
    avatar: this.avatar,
    role: this.role,
    accountType: this.accountType,
    permanentChild: this.permanentChild,
    permissions: this.role === 'admin'
      ? HOME_PERMISSIONS
      : [...new Set(['dashboard', ...this.permissions])],
    allowedRoomIds: this.allowedRoomIds,
    allRoomsAccess: this.role === 'admin' ? true : this.allRoomsAccess,
    guardianId: this.guardianId,
    adultApprovalRequestedAt: this.adultApprovalRequestedAt,
    adultApprovedAt: this.adultApprovedAt
  };
};

export default mongoose.model('User', userSchema);
