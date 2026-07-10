import mqtt from 'mqtt';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const MQTT_URL = process.env.MQTT_BROKER || 'mqtt://35.154.62.193:1883';
  console.log("Connecting to", MQTT_URL);
  
  const client = mqtt.connect(MQTT_URL, {
    username: process.env.MQTT_USERNAME || 'admin',
    password: process.env.MQTT_PASSWORD || 'admin'
  });

  await new Promise(r => client.on('connect', r));
  console.log("Connected to MQTT");

  const zombies = [
    { name: 'Tune', id: 'rgbw2', type: 'light' },
    { name: 'Pir', id: '6a06bc079907720255bc0519', type: 'sensor' },
    { name: 'asd', id: 'asdff', type: 'light' },
    { name: '1Phase', id: 'B1E20000072', type: 'switch' },
    { name: 'Plug', id: 'BSP00000629', type: 'switch' },
    { name: 'Bedroom Switches', id: 'BS40000009', type: 'switch' },
    { name: 'Presence', id: '6a170867b988646e1796e31e', type: 'sensor' },
    { name: 'Presence2', id: '6a170b83b988646e1796e3fb', type: 'sensor' },
    { name: 'FSR', id: '6a044641e32dfae9e01028d1', type: 'sensor' },
    { name: 'Co2', id: '6a0c017df44341190277046f', type: 'sensor' },
    { name: 'Temperature', id: '6a0c01c0f4434119027704c5', type: 'sensor' },
    { name: 'Humidity', id: '6a0c01d4f4434119027704e4', type: 'sensor' },
    { name: 'Lux', id: '6a0c01eff44341190277050d', type: 'sensor' }
  ];

  for (const z of zombies) {
    console.log(`Cleaning up zombie ${z.name} (${z.id})`);
    const topic = `homeassistant/${z.type}/${z.id}/config`;
    client.publish(topic, '', { retain: true });
  }
  
  console.log("Cleanup complete");
  setTimeout(() => process.exit(0), 1000);
}

run().catch(console.error);
