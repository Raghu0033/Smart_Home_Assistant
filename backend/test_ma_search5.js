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
      type: 'call_service',
      domain: 'music_assistant',
      service: 'search',
      service_data: { 
        name: 'neeli', 
        media_type: ['track', 'album', 'artist', 'playlist'],
        limit: 25,
        library_only: false,
        config_entry_id: '01KRXH6Z2KY3VWDP7514X8FJJE' 
      },
      return_response: true
    }));
  } else if (msg.type === 'result') {
    console.log(JSON.stringify(msg, null, 2));
    process.exit(0);
  }
});
