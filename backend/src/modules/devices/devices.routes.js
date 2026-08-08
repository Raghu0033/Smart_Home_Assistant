import express from 'express';
import Device from './Device.js';
import Automation from '../automations/Automation.js';
import { publishDeviceToHA, removeDeviceFromHA } from '../../integrations/homeassistant/ha-discovery.js';
import User from '../users/User.js';

const router = express.Router();

// Get all devices
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const query = user.role === 'admin' || user.allRoomsAccess
      ? {}
      : { roomId: { $in: user.allowedRoomIds } };
    const devices = await Device.find(query);
    const deviceIds = devices.map(device => device.deviceId);
    const enabledAutomations = await Automation.find({
      enabled: true,
      'actions.targetDeviceId': { $in: deviceIds }
    }).select('actions.targetDeviceId');
    const automatedDeviceIds = new Set(
      enabledAutomations.flatMap(automation =>
        automation.actions.map(action => action.targetDeviceId)
      )
    );
    
    // Add isOnline property based on lastSeen (heartbeat)
    const now = new Date();
    const heartbeatThreshold = 30 * 1000;
    
    const enhancedDevices = devices.map(device => {
      const devObj = device.toObject();
      const lastSeen = devObj.lastSeen ? new Date(devObj.lastSeen) : null;
      devObj.isOnline = Boolean(lastSeen && (now - lastSeen) < heartbeatThreshold);
      devObj.connectivityStatus = devObj.isOnline ? 'connected' : 'disconnected';
      devObj.automationEnabled =
        (devObj.schedules || []).some(schedule => schedule.enabled) ||
        automatedDeviceIds.has(devObj.deviceId);
      return devObj;
    });

    res.json(enhancedDevices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update device runtime state (IR blaster persistence, on/off, etc.)
router.patch('/:deviceId/state', async (req, res) => {
  const { on, irMode, targetTemp, fanSpeed, receiverDeviceId, lastIrAction } = req.body;
  const update = {};

  if (on !== undefined) update.on = on;
  if (irMode !== undefined) update.irMode = irMode;
  if (targetTemp !== undefined) update.targetTemp = targetTemp;
  if (fanSpeed !== undefined) update.fanSpeed = fanSpeed;
  if (receiverDeviceId !== undefined) update.receiverDeviceId = receiverDeviceId;
  if (lastIrAction !== undefined) update.lastIrAction = lastIrAction;

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ message: 'No state fields provided' });
  }

  update.lastIrCommandAt = new Date();

  try {
    const updatedDevice = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId },
      { $set: update },
      { new: true }
    );

    if (!updatedDevice) return res.status(404).json({ message: 'Device not found' });
    res.json(updatedDevice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new device
router.post('/', async (req, res) => {
  const { deviceId, title, type, icon, room, roomId, subDevices, tankCapacity } = req.body;
  const device = new Device({
    deviceId,
    title,
    type,
    icon,
    room,
    roomId,
    subDevices,
    tankCapacity,
    on: false,
    brightness: 100,
    isConfigured: true
  });

  try {
    const newDevice = await device.save();
    if (newDevice.type !== 'water-tank') {
      try {
        await publishDeviceToHA(newDevice);
      } catch (haErr) {
        console.error('Failed to sync new device to HA:', haErr.message);
      }
    }
    res.status(201).json(newDevice);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update/Configure a device
router.put('/:deviceId', async (req, res) => {
  const { deviceId: requestedDeviceId, title, type, icon, room, roomId, subDevices, tankCapacity } = req.body;
  try {
    const oldDeviceId = req.params.deviceId;
    const nextDeviceId = String(requestedDeviceId || oldDeviceId).trim();
    if (!nextDeviceId) return res.status(400).json({ message: 'Device ID is required' });

    if (nextDeviceId !== oldDeviceId) {
      const duplicate = await Device.exists({ deviceId: nextDeviceId });
      if (duplicate) return res.status(409).json({ message: 'That Device ID is already in use' });
    }

    const updatedDevice = await Device.findOneAndUpdate(
      { deviceId: oldDeviceId },
      { deviceId: nextDeviceId, title, type, icon, room, roomId: roomId || undefined, subDevices, tankCapacity, isConfigured: true },
      { new: true }
    );
    if (!updatedDevice) return res.status(404).json({ message: 'Device not found' });

    if (nextDeviceId !== oldDeviceId) {
      await Automation.updateMany(
        { 'actions.targetDeviceId': oldDeviceId },
        { $set: { 'actions.$[action].targetDeviceId': nextDeviceId } },
        { arrayFilters: [{ 'action.targetDeviceId': oldDeviceId }] }
      );
    }
    try {
      await publishDeviceToHA(updatedDevice);
    } catch (haErr) {
      console.error('Failed to update device in HA:', haErr.message);
    }
    res.json(updatedDevice);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Remove a device
router.delete('/:deviceId', async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    if (device) {
      try {
        await removeDeviceFromHA(device);
      } catch (haErr) {
        console.error('Failed to remove device from HA:', haErr.message);
      }
      await Device.deleteOne({ deviceId: req.params.deviceId });
    }
    res.json({ message: 'Device removed successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
