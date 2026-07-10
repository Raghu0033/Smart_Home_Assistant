import dotenv from 'dotenv';
dotenv.config();

import { connectMQTT, publishToTopic } from './src/integrations/mqtt/mqttManager.js';

async function run() {
  connectMQTT();
  
  // Wait for connection
  await new Promise(r => setTimeout(r, 2000));

  const zombies = [
    { name: 'Tune', id: 'rgbw2', type: 'light' },
    { name: 'Pir', id: '6a06bc079907720255bc0519', type: 'sensor' },
    { name: 'asd', id: 'asdff', type: 'light' },
    { name: '1Phase', id: 'B1E20000072', type: 'switch' },
    { name: 'Plug', id: 'BSP00000629', type: 'switch' },
    { name: 'Bedroom Switches', id: 'BS40000009', type: 'switch' },
    { name: 'Presence', id: '6a170867b988646e1796e31e', type: 'sensor' }
  ];

  for (const z of zombies) {
    console.log(`Cleaning up zombie ${z.name} (${z.id})`);
    await publishToTopic(`homeassistant/${z.type}/${z.id}/config`, null);
  }
  
  console.log("Cleanup complete");
  setTimeout(() => process.exit(0), 1000);
}

run().catch(console.error);
