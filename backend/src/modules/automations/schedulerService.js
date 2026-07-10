import Device from '../devices/Device.js';
import { publishToTopic } from '../../integrations/mqtt/mqttManager.js';

export const startScheduler = (io) => {
  console.log('⏰ Custom Action Scheduler Service started');
  
  setInterval(async () => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
    
    try {
      const devices = await Device.find({
        'schedules.enabled': true,
        'schedules.days': currentDay
      });

      for (const device of devices) {
        let stateChanged = false;
        
        for (const schedule of device.schedules) {
          if (!schedule.enabled || !schedule.days.includes(currentDay)) continue;

          let action = null;
          if (schedule.startTime === currentTime) action = schedule.startAction || 'ON';
          else if (schedule.endTime === currentTime) action = schedule.endAction || 'OFF';

          if (action) {
            console.log(`[SCHEDULE] Triggering ${action} for ${device.deviceId} at ${currentTime}`);
            
            const on = action === 'ON';
            const id = device.deviceId;
            
            let topic = device.topic || `smarthome/${device.type}/${device.deviceId}`;
            if (id.startsWith('B3E') || id.startsWith('B1E')) {
              topic = `energy-meter/three-phase/command/${id}`;
            } else if (id.startsWith('BSP') || device.type === 'plug' || device.type === 'switch') {
              topic = `smart-switch/command/${id}`;
            }

            const mqttPayload = (id.startsWith('B3E') || id.startsWith('B1E') || id.startsWith('BSP') || device.type === 'plug' || device.type === 'switch')
              ? { entityId: id, relayStatus: action }
              : { state: action };

            await publishToTopic(topic, mqttPayload);
            device.on = on;
            stateChanged = true;
          }
        }

        if (stateChanged) {
          await device.save();
          io.emit('device_state_update', device);
        }
      }
    } catch (err) {
      console.error('Error in scheduler interval:', err);
    }
  }, 60000); 
};
