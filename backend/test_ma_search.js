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
      type: 'execute_script',
      sequence: [{
        action: 'music_assistant.search',
        data: { name: 'neeli', limit: 5 },
        response_variable: 'res'
      }, {
        action: 'system_log.write',
        data: { message: '{{ res }}' }
      }]
    }));
  }
  console.log(msg);
});
