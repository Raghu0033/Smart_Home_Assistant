import { WebSocket } from 'ws';
const ws = new WebSocket('ws://192.168.31.35.205:8123/api/websocket');
let id = 1;

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'auth', access_token: process.env.HA_TOKEN }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'auth_ok') {
    ws.send(JSON.stringify({
      id: id++,
      type: 'config/entity_registry/list'
    }));
  } else if (msg.type === 'result') {
    const ma_entities = msg.result.filter(e => e.platform === 'music_assistant' || e.platform === 'cast' || e.entity_id.includes('music_assistant'));
    console.log(JSON.stringify(ma_entities.slice(0, 5), null, 2));
    process.exit(0);
  }
});
