import { WebSocket } from 'ws';
import 'dotenv/config';
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
      type: 'get_services'
    }));
  } else if (msg.id === id - 1) {
    console.log(JSON.stringify(msg.result.music_assistant, null, 2));
    process.exit(0);
  }
});
