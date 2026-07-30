import express from 'express';
import Room from './Room.js';
import Device from '../devices/Device.js';
import User from '../users/User.js';

const router = express.Router();


// Get all rooms
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const query = user.role === 'admin' || user.allRoomsAccess ? {} : { _id: { $in: user.allowedRoomIds } };
    const rooms = await Room.find(query);
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

import { createHaArea } from '../../integrations/homeassistant/ha-client.js';

// Add a new room
router.post('/', async (req, res) => {
  const { name, icon } = req.body;
  const room = new Room({ name, icon });

  try {
    // Older installations used a name-only unique index. Replace it so the
    // same display name can be used for different room types.
    const indexes = await Room.collection.indexes();
    const legacyNameIndex = indexes.find(index => index.unique && Object.keys(index.key).length === 1 && index.key.name === 1);
    if (legacyNameIndex) await Room.collection.dropIndex(legacyNameIndex.name);
    await Room.collection.createIndex({ name: 1, icon: 1 }, { unique: true });
    const newRoom = await room.save();
    try {
      createHaArea(name);
    } catch (haErr) {
      console.warn('Failed to sync new room to Home Assistant:', haErr.message);
    }
    res.status(201).json(newRoom);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a room and keep assigned devices in sync.
router.put('/:id', async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    const previousName = room.name;
    room.name = String(req.body.name || '').trim();
    room.icon = req.body.icon || 'Home';
    if (!room.name) return res.status(400).json({ message: 'Room name is required' });
    await room.save();
    await Device.updateMany(
      { roomId: room._id },
      { $set: { room: room.name } }
    );
    await Device.updateMany(
      { room: previousName, $or: [{ roomId: { $exists: false } }, { roomId: null }] },
      { $set: { room: room.name, roomId: room._id } }
    );
    res.json(room);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Remove a room
router.delete('/:id', async (req, res) => {
  try {
    const room = await Room.findByIdAndDelete(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    // Update devices that were in this room
    await Device.updateMany({ roomId: room._id }, { $set: { room: 'Unassigned' }, $unset: { roomId: 1 } });
    const sameNameRoomStillExists = await Room.exists({ name: room.name });
    if (!sameNameRoomStillExists) {
      await Device.updateMany(
        { room: room.name, $or: [{ roomId: { $exists: false } }, { roomId: null }] },
        { $set: { room: 'Unassigned' }, $unset: { roomId: 1 } }
      );
    }
    res.json({ message: 'Room removed successfully' });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
