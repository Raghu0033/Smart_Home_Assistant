import express from 'express';
import Device from './Device.js';
import { publishDeviceToHA, removeDeviceFromHA } from '../../integrations/homeassistant/ha-discovery.js';

const router = express.Router();

// Get all devices
router.get('/', async (req, res) => {
  try {
    const devices = await Device.find();
    
    // Add isOnline property based on lastSeen (heartbeat)
    const now = new Date();
    const heartbeatThreshold = 45 * 1000; // 45 seconds
    
    const enhancedDevices = devices.map(device => {
      const devObj = device.toObject();
      const lastSeen = devObj.lastSeen ? new Date(devObj.lastSeen) : null;
      devObj.isOnline = lastSeen && (now - lastSeen) < heartbeatThreshold;
      return devObj;
    });

    res.json(enhancedDevices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new device
router.post('/', async (req, res) => {
  const { deviceId, title, type, icon, room, subDevices } = req.body;
  const device = new Device({
    deviceId,
    title,
    type,
    icon,
    room,
    subDevices,
    on: false,
    brightness: 100,
    isConfigured: true
  });

  try {
    const newDevice = await device.save();
    try {
      await publishDeviceToHA(newDevice);
    } catch (haErr) {
      console.error('Failed to sync new device to HA:', haErr.message);
    }
    res.status(201).json(newDevice);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update/Configure a device
router.put('/:deviceId', async (req, res) => {
  const { title, type, icon, room, subDevices } = req.body;
  try {
    const updatedDevice = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId },
      { title, type, icon, room, subDevices, isConfigured: true },
      { new: true }
    );
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
