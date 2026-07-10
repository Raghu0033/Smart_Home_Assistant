import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const HA_URL = process.env.HA_URL ? process.env.HA_URL.replace('ws://', 'http://').replace('/api/websocket', '') : 'http://localhost:8123';
const HA_TOKEN = process.env.HA_TOKEN;

async function check() {
  const res = await fetch(`${HA_URL}/api/template`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: "{{ device_attr('media_player.ambiance_speaker_11_2', 'name_by_user') }} - {{ device_attr('media_player.ambiance_speaker_11_2', 'name') }}" })
  });
  const text = await res.text();
  console.log('Template out:', text);
}

check().catch(console.error);
