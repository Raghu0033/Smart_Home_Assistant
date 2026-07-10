import WebSocket from 'ws';
import fetch from 'node-fetch';
import Device from '../../modules/devices/Device.js';
import Sensor from '../../modules/sensors/Sensor.js';
import mongoose from 'mongoose';
import { normalizeEntity } from './ha-mapper.js';

let haSocket = null;
let messageId = 1;
const callbacks = new Map();

// Caches for resolving Home Assistant areas (rooms)
let areaRegistry = {};
let deviceRegistry = {};
let entityRegistry = {};

// Cache for the latest states of all HA entities to send to newly connected UI clients
export const cachedHaStates = new Map();

/**
 * Connect to Home Assistant WebSocket API
 * @param {Server} io - Socket.io instance for emitting events to the frontend
 */
export const connectHomeAssistant = (io) => {
  const HA_URL = process.env.HA_URL || 'ws://homeassistant.local:8123/api/websocket';
  const HA_TOKEN = process.env.HA_TOKEN;

  if (!HA_TOKEN) {
    console.warn('⚠️ HA_TOKEN not set in .env. Home Assistant integration disabled.');
    return;
  }

  console.log(`🔌 Connecting to Home Assistant at ${HA_URL}...`);
  
  haSocket = new WebSocket(HA_URL);

  haSocket.on('open', () => {
    console.log('🔗 WebSocket connection opened to Home Assistant');
  });

  haSocket.on('message', (data) => {
    const message = JSON.parse(data.toString());

    // 1. Authentication Phase
    if (message.type === 'auth_required') {
      console.log('🔐 Home Assistant requires authentication...');
      haSocket.send(JSON.stringify({
        type: 'auth',
        access_token: HA_TOKEN
      }));
    } else if (message.type === 'auth_invalid') {
      console.error('❌ Home Assistant Authentication Failed:', message.message);
    } else if (message.type === 'auth_ok') {
      console.log('✅ Home Assistant Authentication Successful!');
      
      // Fetch registries and initial states to correctly map rooms
      Promise.all([
        new Promise(resolve => sendMessage({ type: 'config/area_registry/list' }, resolve)),
        new Promise(resolve => sendMessage({ type: 'config/device_registry/list' }, resolve)),
        new Promise(resolve => sendMessage({ type: 'config/entity_registry/list' }, resolve)),
        new Promise(resolve => sendMessage({ type: 'get_states' }, resolve))
      ]).then(([areaRes, deviceRes, entityRes, statesRes]) => {
        if (areaRes.result) areaRes.result.forEach(a => areaRegistry[a.area_id] = a.name);
        if (deviceRes.result) deviceRes.result.forEach(d => deviceRegistry[d.id] = { area_id: d.area_id, manufacturer: d.manufacturer });
        if (entityRes.result) entityRes.result.forEach(e => {
          entityRegistry[e.entity_id] = { device_id: e.device_id, area_id: e.area_id, config_entry_id: e.config_entry_id, platform: e.platform };
        });

        if (statesRes.result) {
          console.log(`📦 Received ${statesRes.result.length} initial states. Mapping to rooms...`);
          statesRes.result.forEach(entity => {
            const ent = entityRegistry[entity.entity_id];
            const normalized = normalizeEntity(entity, ent);
            
            let areaId = null;
            let manufacturer = null;
            if (ent) {
              const dev = ent.device_id ? deviceRegistry[ent.device_id] : null;
              areaId = ent.area_id || (dev ? dev.area_id : null);
              manufacturer = dev ? dev.manufacturer : null;
            }

            // Ignore devices that originated from our own system via MQTT Discovery to prevent duplication
            if (manufacturer === 'Coral Innovations') {
              return;
            }

            normalized.room = areaId && areaRegistry[areaId] ? areaRegistry[areaId] : 'Home Assistant';
            
            // Only emit to UI if it's a supported capability
            if (normalized.capabilities && normalized.capabilities.length > 0) {
              cachedHaStates.set(normalized.entity_id, normalized);
              if (io) {
                io.emit('ha_entity_state_change', normalized);
              }
            }
          });
        }
      });

      // Subscribe to all state changes to stream them in real-time
      sendMessage({ type: 'subscribe_events', event_type: 'state_changed' }, (res) => {
        if (res.success) {
          console.log('📡 Subscribed to Home Assistant state changes');
        }
      });
      // Subscribe to registry updates to keep rooms in sync dynamically
      sendMessage({ type: 'subscribe_events', event_type: 'area_registry_updated' });
      sendMessage({ type: 'subscribe_events', event_type: 'device_registry_updated' });
      sendMessage({ type: 'subscribe_events', event_type: 'entity_registry_updated' });
    }

    // 2. Handle Event Subscriptions
    if (message.type === 'event') {
      const eventType = message.event.event_type;

      // Handle Registry Updates
      if (eventType === 'area_registry_updated') {
        sendMessage({ type: 'config/area_registry/list' }, (res) => {
          if (res.result) {
            res.result.forEach(a => areaRegistry[a.area_id] = a.name);
            recalculateRooms(io);
          }
        });
      } else if (eventType === 'device_registry_updated') {
        sendMessage({ type: 'config/device_registry/list' }, async (res) => {
          if (res.result) {
            res.result.forEach(d => deviceRegistry[d.id] = { area_id: d.area_id, manufacturer: d.manufacturer, identifiers: d.identifiers });
            recalculateRooms(io);

            // Two-Way Sync: Update MongoDB for Coral Innovations devices that were moved in HA
            const coralDevices = res.result.filter(d => d.manufacturer === 'Coral Innovations');
            for (const d of coralDevices) {
              const mqttId = d.identifiers?.find(i => i[0] === 'mqtt')?.[1];
              if (!mqttId) continue;
              
              const roomName = d.area_id ? areaRegistry[d.area_id] : 'Unassigned';
              if (!roomName) continue;
              
              try {
                const device = await Device.findOne({ deviceId: mqttId });
                if (device && device.room !== roomName) {
                  console.log(`[HA SYNC] Moving Device ${mqttId} from ${device.room} to ${roomName} based on HA changes`);
                  await Device.updateOne({ deviceId: mqttId }, { $set: { room: roomName } });
                  if (io) {
                    const updatedDevice = await Device.findOne({ deviceId: mqttId });
                    io.emit('device_state_update', updatedDevice);
                  }
                } else if (mongoose.Types.ObjectId.isValid(mqttId)) {
                  const sensor = await Sensor.findById(mqttId);
                  if (sensor && sensor.room !== roomName) {
                    console.log(`[HA SYNC] Moving Sensor ${mqttId} from ${sensor.room} to ${roomName} based on HA changes`);
                    await Sensor.updateOne({ _id: mqttId }, { $set: { room: roomName } });
                  }
                }
              } catch (err) {
                console.error('[HA SYNC] Error syncing room:', err.message);
              }
            }
          }
        });
      } else if (eventType === 'entity_registry_updated') {
        sendMessage({ type: 'config/entity_registry/list' }, (res) => {
          if (res.result) {
            res.result.forEach(e => {
              entityRegistry[e.entity_id] = { device_id: e.device_id, area_id: e.area_id, config_entry_id: e.config_entry_id, platform: e.platform, name: e.name || e.original_name };
            });
            recalculateRooms(io);
            
            // Re-fetch states to catch updated friendly names since registry updates
            // don't always trigger an immediate state_changed event
            sendMessage({ type: 'get_states' }, (stateRes) => {
              if (stateRes.result) {
                stateRes.result.forEach(entity => {
                  const ent = entityRegistry[entity.entity_id];
                  const normalized = normalizeEntity(entity, ent);
                  if (normalized.capabilities && normalized.capabilities.length > 0) {
                    const existing = cachedHaStates.get(normalized.entity_id);
                    // Only broadcast if the name or room actually changed
                    if (!existing || existing.name !== normalized.name || existing.room !== normalized.room) {
                      cachedHaStates.set(normalized.entity_id, normalized);
                      if (io) io.emit('ha_entity_state_change', normalized);
                    }
                  }
                });
              }
            });
          }
        });
      }

      // Handle State Changes
      if (eventType === 'state_changed') {
        const entity = message.event.data.new_state;
        if (!entity) return;

        const ent = entityRegistry[entity.entity_id];
        const normalized = normalizeEntity(entity, ent);
        
        let areaId = null;
        let manufacturer = null;
        if (ent) {
          const dev = ent.device_id ? deviceRegistry[ent.device_id] : null;
          areaId = ent.area_id || (dev ? dev.area_id : null);
          manufacturer = dev ? dev.manufacturer : null;
        }

        // Ignore devices that originated from our own system to prevent UI duplication
        if (manufacturer === 'Coral Innovations') {
          return;
        }

        normalized.room = areaId && areaRegistry[areaId] ? areaRegistry[areaId] : 'Home Assistant';
        
        // Cache and emit the normalized entity directly to the React frontend via Socket.io
        if (normalized.capabilities && normalized.capabilities.length > 0) {
          cachedHaStates.set(normalized.entity_id, normalized);
          if (io) {
            io.emit('ha_entity_state_change', normalized);
          }
        }
      }
    }

    // 3. Resolve request callbacks
    if (message.id && callbacks.has(message.id)) {
      callbacks.get(message.id)(message);
      callbacks.delete(message.id);
    }
  });

  haSocket.on('close', () => {
    console.log('⚠️ Home Assistant connection closed. Reconnecting in 5s...');
    setTimeout(() => connectHomeAssistant(io), 5000);
  });

  haSocket.on('error', (err) => {
    console.error('❌ Home Assistant WebSocket Error:', err.message);
  });
};

function recalculateRooms(io) {
  for (const [entityId, normalized] of cachedHaStates.entries()) {
    const ent = entityRegistry[entityId];
    let areaId = null;
    if (ent) {
      const dev = ent.device_id ? deviceRegistry[ent.device_id] : null;
      areaId = ent.area_id || (dev ? dev.area_id : null);
    }
    const newRoom = areaId && areaRegistry[areaId] ? areaRegistry[areaId] : 'Home Assistant';
    if (normalized.room !== newRoom) {
      normalized.room = newRoom;
      if (io) io.emit('ha_entity_state_change', normalized);
    }
  }
}

/**
 * Send a command to Home Assistant and optionally wait for a callback
 */
export const sendMessage = (payload, callback) => {
  if (!haSocket || haSocket.readyState !== WebSocket.OPEN) {
    console.error('⚠️ Cannot send message: Home Assistant not connected');
    return;
  }

  const id = messageId++;
  const msg = { id, ...payload };
  
  if (callback) {
    callbacks.set(id, callback);
  }
  
  haSocket.send(JSON.stringify(msg));
};

/**
 * Call a Home Assistant service (e.g. turn on a light)
 * Uses the target-based format required by HA WebSocket API
 */
export const callService = (domain, service, serviceData) => {
  // Extract entity_id from serviceData to use as target
  const { entity_id, ...cleanData } = serviceData || {};
  
  const payload = {
    type: 'call_service',
    domain,
    service,
    target: entity_id ? { entity_id } : undefined,
    service_data: Object.keys(cleanData).length > 0 ? cleanData : undefined
  };

  console.log(`[HA COMMAND] Calling ${domain}.${service}`, JSON.stringify(payload));
  sendMessage(payload);
};

/**
 * Dynamic room creation in Home Assistant (Areas)
 */
export const createHaArea = (roomName) => {
  if (!haSocket || haSocket.readyState !== WebSocket.OPEN) {
    console.warn('⚠️ Cannot create area: Home Assistant not connected via WebSocket');
    return;
  }

  console.log(`[HA AREA] Creating Area inside Home Assistant: ${roomName}`);
  sendMessage({
    type: 'config/area_registry/create',
    name: roomName
  }, (res) => {
    if (res.success) {
      console.log(`[HA AREA] Successfully created area: ${roomName} in Home Assistant!`);
    } else {
      console.warn(`[HA AREA] Could not create area ${roomName} (might already exist or unsupported):`, res.error?.message);
    }
  });
};

/**
 * Requests an HLS stream URL for a specific camera entity using HA WebSocket.
 * @param {string} entityId 
 * @returns {Promise<string>} The HLS stream path
 */
export function requestCameraStream(entityId) {
  return new Promise((resolve, reject) => {
    sendMessage({ type: 'camera/stream', entity_id: entityId }, (res) => {
      if (res && res.success && res.result && res.result.url) {
        resolve(res.result.url);
      } else {
        reject(new Error(res ? res.error?.message || 'Failed to get stream' : 'Timeout'));
      }
    });
  });
}
