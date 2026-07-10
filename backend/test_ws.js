import { io } from 'socket.io-client';
const socket = io('http://192.168.31.35.205:3000');
socket.on('connect', () => console.log('connected'));
socket.on('initial_state', (data) => {
  const players = data.devices.filter(d => d.capabilities && d.capabilities.includes('media_control'));
  console.log(JSON.stringify(players.map(p => ({ id: p.deviceId, state: p.state, duration: p.mediaDuration, position: p.mediaPosition, update: p.mediaPositionUpdatedAt })), null, 2));
  process.exit(0);
});
