import WebSocket from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const ws = new WebSocket(process.env.HA_URL || 'ws://192.168.31.35.205:8123/api/websocket');
let messageId = 1;

ws.on('open', () => console.log('Connected'));
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'auth_required') {
    ws.send(JSON.stringify({ type: 'auth', access_token: process.env.HA_TOKEN }));
  } else if (msg.type === 'auth_ok') {
    ws.send(JSON.stringify({ id: messageId++, type: 'config/device_registry/list' }));
    ws.send(JSON.stringify({ id: messageId++, type: 'config/entity_registry/list' }));
  } else if (msg.type === 'result' && msg.id === 1) {
    console.log("DEVICES:");
    msg.result.filter(d => d.area_id === 'living_room').forEach(d => console.log(d.name, d.manufacturer));
  } else if (msg.type === 'result' && msg.id === 2) {
    console.log("ENTITIES:");
    msg.result.filter(e => e.area_id === 'living_room').forEach(e => console.log(e.entity_id, e.original_name));
    process.exit(0);
  }
});
