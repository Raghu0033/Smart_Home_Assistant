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
    ws.send(JSON.stringify({ id: messageId++, type: 'config/area_registry/list' }));
  } else if (msg.type === 'result' && msg.id === 1) {
    console.log("CORAL DEVICES IN HA:");
    msg.result.filter(d => d.manufacturer === 'Coral Innovations').forEach(d => console.log(d.name, d.area_id, JSON.stringify(d.identifiers)));
  } else if (msg.type === 'result' && msg.id === 2) {
    console.log("AREAS:");
    msg.result.forEach(a => console.log(a.area_id, a.name));
    process.exit(0);
  }
});
