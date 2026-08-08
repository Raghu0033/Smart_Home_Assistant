import express from 'express';
import jwt from 'jsonwebtoken';
import User, { HOME_PERMISSIONS } from './User.js';
import ActivityLog from './ActivityLog.js';
import ChangeRequest from './ChangeRequest.js';
import authMiddleware from '../../core/middleware/auth.middleware.js';
import Device from '../devices/Device.js';
import Sensor from '../sensors/Sensor.js';
import Room from '../rooms/Room.js';
import { publishDeviceToHA, publishSensorToHA } from '../../integrations/homeassistant/ha-discovery.js';

const router = express.Router();

// @route   POST /api/auth/login
// @desc    Authenticate user and get token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    
    if (!identifier || !password) {
      return res.status(400).json({ message: 'Please provide username/phone and password' });
    }

    // Check for user by username or phone
    const user = await User.findOne({
      $or: [{ username: identifier }, { phone: identifier }]
    });

    if (!user) {
      await ActivityLog.create({ username: String(identifier), action: 'login-failed', ip: req.ip, userAgent: req.get('user-agent') || '' });
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await ActivityLog.create({ userId: user._id, username: user.username, action: 'login-failed', ip: req.ip, userAgent: req.get('user-agent') || '' });
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    await user.syncAgeStatus();
    await ActivityLog.create({ userId: user._id, username: user.username, action: 'login', ip: req.ip, userAgent: req.get('user-agent') || '' });

    const payload = {
      user: {
        id: user.id
      }
    };

    const secret = process.env.JWT_SECRET || 'fallback_secret_for_development_only';
    
    jwt.sign(
      payload,
      secret,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({ token, user: user.toProfileJSON() });
      }
    );
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).send('Server error');
  }
});

const loadUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Profile not found' });
    await user.syncAgeStatus();
    req.profileUser = user;
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.profileUser.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};
const requireAdult = (req, res, next) => {
  if (req.profileUser.role !== 'admin' && req.profileUser.accountType !== 'adult') {
    return res.status(403).json({ message: 'Adult access required' });
  }
  next();
};

router.get('/me', authMiddleware, loadUser, (req, res) => {
  res.json(req.profileUser.toProfileJSON());
});

router.post('/logout', authMiddleware, loadUser, async (req, res) => {
  await ActivityLog.create({
    userId: req.profileUser._id,
    username: req.profileUser.username,
    action: 'logout',
    ip: req.ip,
    userAgent: req.get('user-agent') || ''
  });
  res.json({ message: 'Logged out' });
});

router.put('/me', authMiddleware, loadUser, async (req, res) => {
  try {
    const user = req.profileUser;
    if (req.body.name !== undefined) user.name = String(req.body.name).trim();
    if (req.body.phone !== undefined) {
      const phone = String(req.body.phone).trim();
      if (!phone) return res.status(400).json({ message: 'Phone number is required' });
      user.phone = phone;
    }
    if (req.body.gender !== undefined) user.gender = req.body.gender;
    if (req.body.avatar !== undefined) user.avatar = String(req.body.avatar).trim() || 'avatar-1';
    await user.save();
    await user.syncAgeStatus();
    res.json(user.toProfileJSON());
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/me/password', authMiddleware, loadUser, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'Current password and a new password of at least 8 characters are required' });
  }
  if (!(await req.profileUser.comparePassword(currentPassword))) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  req.profileUser.password = newPassword;
  await req.profileUser.save();
  res.json({ message: 'Password updated' });
});

router.get('/members', authMiddleware, loadUser, requireAdmin, async (req, res) => {
  const members = await User.find({ _id: { $ne: req.profileUser._id } }).sort({ createdAt: 1 });
  for (const member of members) await member.syncAgeStatus();
  res.json(members.map(member => member.toProfileJSON()));
});

router.post('/members', authMiddleware, loadUser, requireAdmin, async (req, res) => {
  try {
    const isKid = Boolean(req.body.permanentChild);
    const phone = String(req.body.phone || '').trim();
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });
    const member = await User.create({
      name: String(req.body.name || '').trim(),
      username: String(req.body.username || '').trim(),
      phone,
      password: req.body.password,
      gender: req.body.gender || 'prefer-not-to-say',
      avatar: String(req.body.avatar || 'avatar-1').trim(),
      role: 'member',
      accountType: isKid ? 'child' : 'adult',
      permanentChild: isKid,
      permissions: Array.isArray(req.body.permissions)
        ? req.body.permissions.filter(permission => HOME_PERMISSIONS.includes(permission))
        : (isKid ? ['dashboard'] : HOME_PERMISSIONS),
      allowedRoomIds: Array.isArray(req.body.allowedRoomIds) ? req.body.allowedRoomIds : [],
      allRoomsAccess: req.body.allRoomsAccess !== undefined
        ? Boolean(req.body.allRoomsAccess)
        : !isKid,
      guardianId: req.profileUser._id
    });
    res.status(201).json(member.toProfileJSON());
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/members/:id', authMiddleware, loadUser, requireAdmin, async (req, res) => {
  try {
    const member = await User.findById(req.params.id);
    if (!member || member.role === 'admin') return res.status(404).json({ message: 'Household member not found' });
    if (req.body.phone !== undefined) {
      const phone = String(req.body.phone).trim();
      if (!phone) return res.status(400).json({ message: 'Phone number is required' });
      member.phone = phone;
    }
    ['name', 'avatar'].forEach(field => {
      if (req.body[field] !== undefined) member[field] = String(req.body[field]).trim();
    });
    if (req.body.gender !== undefined) member.gender = req.body.gender;
    if (req.body.permanentChild !== undefined) {
      member.permanentChild = Boolean(req.body.permanentChild);
      if (member.permanentChild) {
        member.accountType = 'child';
        member.adultApprovalRequestedAt = null;
      } else {
        member.accountType = 'adult';
      }
    }
    if (Array.isArray(req.body.permissions)) {
      member.permissions = req.body.permissions.filter(permission => HOME_PERMISSIONS.includes(permission));
    }
    if (Array.isArray(req.body.allowedRoomIds)) member.allowedRoomIds = req.body.allowedRoomIds;
    if (req.body.allRoomsAccess !== undefined) member.allRoomsAccess = Boolean(req.body.allRoomsAccess);
    await member.save();
    await member.syncAgeStatus();
    res.json(member.toProfileJSON());
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/activity', authMiddleware, loadUser, requireAdmin, async (req, res) => {
  const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(250);
  res.json(logs);
});

router.get('/change-requests', authMiddleware, loadUser, requireAdult, async (req, res) => {
  const requests = await ChangeRequest.find({ status: 'pending' })
    .populate('requestedBy', 'name username avatar')
    .sort({ createdAt: -1 });
  res.json(requests);
});

router.get('/my-change-requests', authMiddleware, loadUser, async (req, res) => {
  const requests = await ChangeRequest.find({ requestedBy: req.profileUser._id })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json(requests);
});

router.post('/change-requests/:id/:decision', authMiddleware, loadUser, requireAdult, async (req, res) => {
  if (!['approve', 'reject'].includes(req.params.decision)) {
    return res.status(400).json({ message: 'Invalid decision' });
  }
  const request = await ChangeRequest.findOne({ _id: req.params.id, status: 'pending' });
  if (!request) return res.status(404).json({ message: 'Pending request not found' });
  request.status = req.params.decision === 'approve' ? 'approved' : 'rejected';
  request.reviewedBy = req.profileUser._id;
  request.reviewedAt = new Date();
  if (req.params.decision === 'approve' && request.method === 'POST') {
    if (request.resource === 'devices') {
      const body = request.body || {};
      let device = await Device.findOne({ deviceId: body.deviceId });
      if (!device) {
        device = await Device.create({
          deviceId: body.deviceId,
          title: body.title,
          type: body.type,
          icon: body.icon,
          room: body.room,
          roomId: body.roomId || undefined,
          subDevices: body.subDevices,
          tankCapacity: body.tankCapacity,
          topic: body.topic,
          on: false,
          brightness: 100,
          isConfigured: true
        });
        if (device.type !== 'water-tank') publishDeviceToHA(device).catch(() => {});
      }
      request.status = 'executed';
    } else if (request.resource === 'sensors') {
      const body = request.body || {};
      let sensor = await Sensor.findOne({ topic: body.topic });
      if (!sensor) {
        sensor = await Sensor.create({ name: body.name, topic: body.topic, room: body.room, unit: body.unit, icon: body.icon });
        publishSensorToHA(sensor).catch(() => {});
      }
      request.status = 'executed';
    } else if (request.resource === 'rooms') {
      const body = request.body || {};
      await Room.findOneAndUpdate(
        { name: body.name, icon: body.icon },
        { name: body.name, icon: body.icon },
        { upsert: true, new: true }
      );
      request.status = 'executed';
    }
  }
  await request.save();
  res.json(request);
});

export default router;
