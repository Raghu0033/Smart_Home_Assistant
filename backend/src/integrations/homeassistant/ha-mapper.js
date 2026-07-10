export function normalizeEntity(entity, registryData = null) {
  const domain = entity.entity_id.split('.')[0];
  const attributes = entity.attributes || {};

  const base = {
    id: entity.entity_id.replace('.', '_'),
    entity_id: entity.entity_id,
    type: domain,
    name: attributes.friendly_name || entity.entity_id,
    state: entity.state,
    lastChanged: entity.last_changed,
    capabilities: [],
    // Add raw object for advanced frontend parsing if needed
    raw: entity,
  };

  switch (domain) {
    case 'light':
      base.capabilities.push('on_off');
      base.on = entity.state === 'on';
      if (attributes.brightness !== undefined) {
        base.capabilities.push('brightness');
        // Map HA brightness (0-255) to Frontend (0-100%)
        base.brightness = Math.round((attributes.brightness / 255) * 100);
      }
      if (attributes.color_mode || attributes.rgb_color) {
        base.capabilities.push('color');
        if (attributes.rgb_color) {
          base.color = {
            r: attributes.rgb_color[0],
            g: attributes.rgb_color[1],
            b: attributes.rgb_color[2]
          };
        }
      }
      break;

    case 'switch':
    case 'input_boolean':
      base.capabilities.push('on_off');
      base.on = entity.state === 'on';
      break;

    case 'binary_sensor':
      const deviceClass = attributes.device_class || 'sensor';
      base.capabilities.push('sensor');
      base.sensorType = deviceClass;
      base.isActive = entity.state === 'on';
      break;

    case 'sensor':
      base.capabilities.push('sensor_value');
      base.value = entity.state;
      base.unit = attributes.unit_of_measurement || '';
      break;
      
    case 'climate':
      base.capabilities.push('climate');
      base.currentTemp = attributes.current_temperature;
      base.targetTemp = attributes.temperature;
      base.hvacAction = attributes.hvac_action; // e.g., heating, cooling, idle
      break;

    case 'camera':
      base.capabilities.push('camera_stream');
      // Frontend will usually render this via WebRTC component pointing to HA/Frigate
      break;

    case 'media_player':
      base.capabilities.push('media_control', 'volume');
      base.state = entity.state; // 'playing', 'paused', 'idle', 'off', 'buffering'
      base.on = entity.state === 'playing';
      
      // Track metadata
      base.mediaTitle = attributes.media_title || '';
      base.mediaArtist = attributes.media_artist || '';
      base.mediaAlbum = attributes.media_album_name || '';
      
      // Dynamic cover art
      if (attributes.entity_picture) {
        if (attributes.entity_picture.startsWith('http')) {
          base.albumArt = attributes.entity_picture;
        } else {
          let baseUrl = 'http://192.168.31.35.205:8123';
          if (process.env.HA_URL) {
            baseUrl = process.env.HA_URL.replace('ws://', 'http://').replace('wss://', 'https://').split('/api/websocket')[0];
          } else if (process.env.HA_BASE_URL) {
            baseUrl = process.env.HA_BASE_URL;
          }
          base.albumArt = `${baseUrl}${attributes.entity_picture}`;
        }
      }
      
      base.deviceClass = attributes.device_class || 'speaker';
      base.appId = attributes.app_id || '';
      base.appName = attributes.app_name || '';
      base.sourceList = attributes.source_list || [];
      base.isMusicAssistant = (
        (registryData && (registryData.platform === 'music_assistant' || registryData.platform === 'mass')) || 
        entity.entity_id.includes('mass_') ||
        entity.entity_id.includes('music_assistant') ||
        !!attributes.mass_player_id
      );

      // Volume mapping (HA uses 0.0 - 1.0, map to 0-100)
      if (attributes.volume_level !== undefined) {
        base.volume = Math.round(attributes.volume_level * 100);
      }
      
      // Progress mapping
      base.mediaPosition = attributes.media_position || 0;
      base.mediaDuration = attributes.media_duration || 0;
      base.mediaPositionUpdatedAt = attributes.media_position_updated_at || null;
      // BROWSE_MEDIA feature flag = 131072 (bit 17)
      base.supportsBrowse = !!(attributes.supported_features & 131072);
      break;
  }

  if (registryData && registryData.config_entry_id) {
    base.configEntryId = registryData.config_entry_id;
  }
  if (registryData && registryData.platform) {
    base.platform = registryData.platform;
  }

  return base;
}
