import express from 'express';
import Sensor from './Sensor.js';
import { getMqttClient } from '../../integrations/mqtt/mqttManager.js';
import { publishSensorToHA, removeSensorFromHA } from '../../integrations/homeassistant/ha-discovery.js';
import User from '../users/User.js';
import Room from '../rooms/Room.js';

const router = express.Router();

// Get all sensors
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    let query = {};
    if (user.role !== 'admin' && !user.allRoomsAccess) {
      const allowedRooms = await Room.find({ _id: { $in: user.allowedRoomIds } }).select('name');
      query = { room: { $in: allowedRooms.map(room => room.name) } };
    }
    const sensors = await Sensor.find(query);
    res.json(sensors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new sensor
router.post('/', async (req, res) => {
  const { name, topic, room, unit, icon } = req.body;
  const sensor = new Sensor({ name, topic, room, unit, icon });

  try {
    const newSensor = await sensor.save();
    
    // Subscribe to the new MQTT topic
    const mqttClient = getMqttClient();
    if (mqttClient && mqttClient.connected) {
      mqttClient.subscribe(topic, (err) => {
        if (!err) {
          console.log(`📡 Dynamically subscribed to sensor topic: ${topic}`);
        }
      });
    }

    try {
      await publishSensorToHA(newSensor);
    } catch (haErr) {
      console.error('[HA SYNC] Failed to publish sensor discovery:', haErr);
    }

    res.status(201).json(newSensor);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update sensor metadata and move its live MQTT subscription when needed.
router.put('/:id', async (req, res) => {
  try {
    const sensor = await Sensor.findById(req.params.id);
    if (!sensor) return res.status(404).json({ message: 'Sensor not found' });
    const previousTopic = sensor.topic;
    sensor.name = String(req.body.name || '').trim();
    sensor.topic = String(req.body.topic || '').trim();
    sensor.room = req.body.room || 'Unassigned';
    sensor.unit = req.body.unit || '';
    sensor.icon = req.body.icon || '📡';
    if (!sensor.name || !sensor.topic) {
      return res.status(400).json({ message: 'Sensor name and MQTT topic are required' });
    }
    await sensor.save();

    const mqttClient = getMqttClient();
    if (mqttClient?.connected && previousTopic !== sensor.topic) {
      mqttClient.unsubscribe(previousTopic);
      mqttClient.subscribe(sensor.topic);
    }
    try {
      await publishSensorToHA(sensor);
    } catch (haErr) {
      console.error('[HA SYNC] Failed to update sensor discovery:', haErr);
    }
    res.json(sensor);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a sensor
router.delete('/:id', async (req, res) => {
  try {
    const sensor = await Sensor.findById(req.params.id);
    if (!sensor) return res.status(404).json({ message: 'Sensor not found' });

    // Unsubscribe from MQTT topic
    const mqttClient = getMqttClient();
    if (mqttClient && mqttClient.connected) {
      mqttClient.unsubscribe(sensor.topic);
    }

    try {
      await removeSensorFromHA(sensor);
    } catch (haErr) {
      console.error('[HA SYNC] Failed to remove sensor discovery:', haErr);
    }

    await Sensor.findByIdAndDelete(req.params.id);
    res.json({ message: 'Sensor deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
