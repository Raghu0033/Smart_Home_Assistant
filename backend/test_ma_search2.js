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
      type: 'config_entries/get',
      domain: 'music_assistant'
    }));
  } else if (msg.type === 'result') {
    console.log(JSON.stringify(msg, null, 2));
    process.exit(0);
  }
});
