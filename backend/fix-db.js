import mongoose from 'mongoose';
import WebSocket from 'ws';
import dotenv from 'dotenv';
dotenv.config();

import Device from './src/modules/devices/Device.js';
import Sensor from './src/modules/sensors/Sensor.js';

const HA_URL = process.env.HA_URL || 'ws://192.168.31.35.205:8123/api/websocket';
const HA_TOKEN = process.env.HA_TOKEN;

async function run() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const ws = new WebSocket(HA_URL);
  let messageId = 1;

  ws.on('open', () => {
    console.log("Connected to HA");
  });

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'auth_required') {
      ws.send(JSON.stringify({ type: 'auth', access_token: HA_TOKEN }));
    } else if (msg.type === 'auth_ok') {
      ws.send(JSON.stringify({ id: messageId++, type: 'config/area_registry/list' }));
      ws.send(JSON.stringify({ id: messageId++, type: 'config/device_registry/list' }));
      ws.send(JSON.stringify({ id: messageId++, type: 'config/entity_registry/list' }));
    } else if (msg.type === 'result' && msg.id === 1) {
      global.areas = msg.result.reduce((acc, a) => { acc[a.area_id] = a.name; return acc; }, {});
    } else if (msg.type === 'result' && msg.id === 2) {
      global.devices = msg.result;
    } else if (msg.type === 'result' && msg.id === 3) {
      global.entities = msg.result;
      
      const coralDevices = global.devices.filter(d => d.manufacturer === 'Coral Innovations');
      for (const d of coralDevices) {
        const mqttId = d.identifiers.find(i => i[0] === 'mqtt')?.[1];
        if (!mqttId) continue;
        
        const roomName = d.area_id ? global.areas[d.area_id] : 'Unassigned';
        
        let foundInDb = false;
        
        const device = await Device.findOne({ deviceId: mqttId });
        if (device) {
          foundInDb = true;
          if (device.room !== roomName) {
            console.log(`Updating Device ${mqttId} (${d.name}) room: ${device.room} -> ${roomName}`);
            await Device.updateOne({ deviceId: mqttId }, { $set: { room: roomName } });
          }
        } else if (mongoose.Types.ObjectId.isValid(mqttId)) {
          const sensor = await Sensor.findById(mqttId);
          if (sensor) {
            foundInDb = true;
            if (sensor.room !== roomName) {
              console.log(`Updating Sensor ${mqttId} (${d.name}) room: ${sensor.room} -> ${roomName}`);
              await Sensor.updateOne({ _id: mqttId }, { $set: { room: roomName } });
            }
          }
        }

        if (!foundInDb) {
          console.log(`ZOMBIE DEVICE in HA: ${d.name} (${mqttId}) in room: ${roomName}`);
        }
      }
      
      console.log("DB Sync complete");
      setTimeout(() => process.exit(0), 1000);
    }
  });
}

run().catch(console.error);
