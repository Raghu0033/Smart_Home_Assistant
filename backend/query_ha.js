import http from 'http';

http.get('http://localhost:3000/api/ha/entities', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const entities = JSON.parse(data);
    const mediaPlayers = Object.values(entities).filter(e => e.entity_id.startsWith('media_player.'));
    
    console.log(`Found ${mediaPlayers.length} media players.`);
    mediaPlayers.forEach(p => {
      console.log(`\n- ${p.entity_id} | Name: ${p.attributes.friendly_name} | State: ${p.state}`);
      console.log(`  Group Members: ${p.attributes.group_members ? JSON.stringify(p.attributes.group_members) : 'none'}`);
      console.log(`  Mass Player ID: ${p.attributes.mass_player_id || 'none'}`);
    });
  });
}).on('error', err => console.log('Error:', err.message));
