const io = require('socket.io-client');
const socket = io('http://localhost:3000', { path: '/socket.io/' });

socket.on('connect', () => {
  socket.emit('ha_browse_media', { entity_id: 'media_player.vlc_telnet' }, (response) => {
    if (response && response.result) {
        console.log("VLC-TELNET ROOT:", JSON.stringify(response.result.children.map(c => c.title), null, 2));
    } else {
        console.log("VLC-TELNET FAILED", response);
    }
    
    // Also try to find ANY playing or available media player and dump its root
    socket.emit('ha_command', { domain: 'homeassistant', service: 'update_entity' });
    setTimeout(() => process.exit(0), 1000);
  });
});
