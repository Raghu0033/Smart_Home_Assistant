import React, { useState, useEffect, useCallback, useMemo } from 'react';

import './Scenes.css';
import AddRoomModal from './AddRoomModal';
import { fetchWithAuth } from '../App';

const API_BASE = `http://${window.location.hostname}:3000`;
const API_AUTOMATIONS = `${API_BASE}/api/automations`;
const API_SENSORS = `${API_BASE}/api/sensors`;

const OPS = { gt: '>', lt: '<', eq: '=', gte: '≥', lte: '≤', neq: '≠' };
const ICONS = [
  { id: 'zap', icon: <img src="/icons/icons/Power.svg" alt="Power" style={{width: 20, height: 20}} />, label: '⚡' },
  { id: 'temp', icon: <img src="/icons/icons/Theme.svg" alt="Temp" style={{width: 20, height: 20}} />, label: '🌡️' },
  { id: 'light', icon: <img src="/icons/icons/Theme.svg" alt="Light" style={{width: 20, height: 20}} />, label: '💡' },
  { id: 'home', icon: <img src="/icons/icons/Home.svg" alt="Home" style={{width: 20, height: 20}} />, label: '🏠' },
  { id: 'notif', icon: <img src="/icons/icons/Notification.svg" alt="Alert" style={{width: 20, height: 20}} />, label: '🔔' }
];

const EMPTY_COND = { sensor: 'temperature', operator: 'gt', value: 30, startTime: '', endTime: '' };
const EMPTY_ACTION = { targetDeviceId: '', targetDevice: '', command: 'turn_on', subDeviceIndex: null, params: {} };

const DEVICE_COMMANDS = {
  light: ['turn_on', 'turn_off', 'set_brightness', 'set_color', 'set_effect'],
  rgbw: ['turn_on', 'turn_off', 'set_brightness', 'set_color'],
  fan: ['turn_on', 'turn_off', 'set_speed'],
  switch: ['turn_on', 'turn_off'],
  plug: ['turn_on', 'turn_off'],
  curtain: ['turn_on', 'turn_off'],
  'touch-panel': ['turn_on', 'turn_off', 'set_speed'],
  media_player: ['play_media', 'media_play', 'media_pause', 'volume_up', 'volume_down', 'turn_off'],
  default: ['turn_on', 'turn_off']
};

const getDeviceCommandType = (device, subDevice) => {
  if (subDevice?.type === 'fan') return 'fan';
  if (subDevice?.type === 'switch') return 'switch';
  if (!device) return 'default';
  if (device.type === 'touch-panel' || device.deviceId?.startsWith('BSQ')) return 'touch-panel';
  return device.type || 'default';
};

const getSubDeviceDisplayName = (subDevice) => {
  if (!subDevice) return '';
  return subDevice.label || `${subDevice.type === 'fan' ? 'Fan' : 'Switch'} ${subDevice.index}`;
};

const getActionDisplayName = (device, subDevice, suffix = '') => {
  const deviceName = device?.title || device?.deviceId || 'Device';
  if (!subDevice) return deviceName;
  const subDeviceName = getSubDeviceDisplayName(subDevice);
  return `${deviceName} - ${subDeviceName}${suffix ? ` - ${suffix}` : ''}`;
};

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
    255 
  ] : [255, 255, 255, 255];
};

const rgbToHex = (rgb) => {
  if (!Array.isArray(rgb) || rgb.length < 3) return '#ffffff';
  return "#" + ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1);
};

const hueToRgb = (hue) => {
  const normalizedHue = ((Number(hue) % 360) + 360) % 360;
  const chroma = 1;
  const hueSection = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((hueSection % 2) - 1));

  let r = 0;
  let g = 0;
  let b = 0;

  if (hueSection >= 0 && hueSection < 1) [r, g, b] = [chroma, x, 0];
  else if (hueSection < 2) [r, g, b] = [x, chroma, 0];
  else if (hueSection < 3) [r, g, b] = [0, chroma, x];
  else if (hueSection < 4) [r, g, b] = [0, x, chroma];
  else if (hueSection < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255];
};

const rgbToHue = (rgb) => {
  if (!Array.isArray(rgb) || rgb.length < 3) return 0;

  const [r255, g255, b255] = rgb;
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) return 0;

  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;

  return Math.round((hue * 60 + 360) % 360);
};

const clampBrightnessValue = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 255;
  return Math.min(255, Math.max(1, Math.round(parsed)));
};

const Scenes = ({ socket, rooms, allDevices, sensors, onAddRoom }) => {
  const [rules, setRules] = useState([]);
  const [sensorData, setSensorData] = useState({ temperature: 25, humidity: 50, lux: 0, motion: false });
  const [allSensors, setAllSensors] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState(null);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [mediaList, setMediaList] = useState([]);

  const findSceneRoom = useCallback((roomName) => {
    if (!roomName) return null;
    if (roomName === 'Global') return { name: 'Global', icon: 'ðŸŒ' };
    return (Array.isArray(rooms) ? rooms : []).find((room) => room.name === roomName) || null;
  }, [rooms]);

  const [form, setForm] = useState({
    name: '', description: '', icon: '⚡', room: 'Global', conditionLogic: 'all', cooldownSeconds: 60,
    conditions: [{ ...EMPTY_COND }],
    actions: [{ ...EMPTY_ACTION }],
  });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetchWithAuth(API_AUTOMATIONS);
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch (e) { console.error('Fetch error:', e); }
  }, []);

  const fetchCustomSensors = useCallback(async () => {
    try {
      const res = await fetchWithAuth(API_SENSORS);
      const data = await res.json();
      setAllSensors(Array.isArray(data) ? data : []);
    } catch (e) { console.error('Fetch sensors error:', e); }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchCustomSensors();
  }, [fetchRules, fetchCustomSensors]);

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => setSensorData(data);
    const triggerHandler = (data) => {
      showToast(data.ruleName);
      fetchRules();
    };
    socket.on('sensor_data_update', handler);
    socket.on('automation_triggered', triggerHandler);
    socket.emit('get_sensor_data');
    return () => {
      socket.off('sensor_data_update', handler);
      socket.off('automation_triggered', triggerHandler);
    };
  }, [socket, fetchRules]);

  useEffect(() => {
    const handleScenePopState = (e) => {
      const state = e.state || {};

      if (state.tab !== 'scenes') {
        setShowModal(false);
        setIsRoomModalOpen(false);
        setCurrentRoom(null);
        return;
      }

      setShowModal(state.scenesModal === 'rule');
      setIsRoomModalOpen(state.scenesModal === 'room');
      setCurrentRoom(findSceneRoom(state.scenesRoom));
    };

    window.addEventListener('popstate', handleScenePopState);
    return () => window.removeEventListener('popstate', handleScenePopState);
  }, [findSceneRoom]);

  const pushSceneHistory = useCallback((nextState) => {
    window.history.pushState({ ...(window.history.state || {}), ...nextState }, '');
  }, []);

  const openSceneRoom = useCallback((room) => {
    pushSceneHistory({
      tab: 'scenes',
      scenesRoom: room.name,
      scenesModal: null,
      panel: null,
      roomName: null,
      detailDeviceId: null,
      modal: null
    });
    setCurrentRoom(room);
  }, [pushSceneHistory]);

  const closeSceneRoom = useCallback(() => {
    setCurrentRoom(null);
    if (window.history.state?.scenesRoom) {
      window.history.back();
    }
  }, []);

  const openSceneModal = useCallback((modalName) => {
    pushSceneHistory({
      tab: 'scenes',
      scenesRoom: currentRoom?.name || null,
      scenesModal: modalName,
      panel: null,
      roomName: null,
      detailDeviceId: null,
      modal: null
    });
    if (modalName === 'rule') setShowModal(true);
    if (modalName === 'room') setIsRoomModalOpen(true);
  }, [currentRoom, pushSceneHistory]);

  const closeSceneModal = useCallback((modalName) => {
    if (modalName === 'rule') setShowModal(false);
    if (modalName === 'room') setIsRoomModalOpen(false);
    if (window.history.state?.scenesModal === modalName) {
      window.history.back();
    }
  }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({
      name: '',
      description: '',
      icon: '⚡',
      room: currentRoom ? currentRoom.name : 'Global',
      conditionLogic: 'all',
      cooldownSeconds: 60,
      conditions: [{ ...EMPTY_COND }],
      actions: [{ ...EMPTY_ACTION }]
    });
    openSceneModal('rule');
  };

  const openEdit = (rule) => {
    setEditId(rule._id);
    setForm({
      name: rule.name,
      description: rule.description || '',
      icon: rule.icon || '⚡',
      room: rule.room || 'Global',
      conditionLogic: rule.conditionLogic,
      cooldownSeconds: rule.cooldownSeconds,
      conditions: rule.conditions.map(c => ({ ...c })),
      actions: rule.actions.map(a => ({ ...a }))
    });
    openSceneModal('rule');
  };

  const saveRule = async () => {
    if (!form.name.trim()) return showToast('⚠️ Rule name is required');
    try {
      const method = editId ? 'PUT' : 'POST';
      const url = editId ? `${API_AUTOMATIONS}/${editId}` : API_AUTOMATIONS;
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        closeSceneModal('rule');
        fetchRules();
        showToast(editId ? 'Updated' : 'Created');
      } else {
        const errData = await res.json().catch(() => ({}));
        const errorMsg = errData.error || res.statusText;
        showToast(`Error: ${errorMsg}`);
        console.error('Save rule error:', errorMsg);
      }
    } catch (e) { showToast('Error saving'); }
  };

  const toggleRule = async (id) => {
    await fetchWithAuth(`${API_AUTOMATIONS}/${id}/toggle`, { method: 'PATCH' });
    fetchRules();
  };

  const deleteRule = async (id) => {
    if (!window.confirm('Delete automation?')) return;
    await fetchWithAuth(`${API_AUTOMATIONS}/${id}`, { method: 'DELETE' });
    fetchRules();
    showToast('Deleted');
  };

  const handleAddRoomLocal = async (roomData) => {
    if (onAddRoom) {
      await onAddRoom(roomData);
      showToast('Room added');
    }
  };

  const selectedRuleRoom = currentRoom?.name || form.room || 'Global';
  const selectedRuleType = form.type || 'device';

  // Compute available sensors dynamically based on selected room
  const filteredSensorNames = useMemo(() => {
    let filtered = allSensors;
    if (selectedRuleRoom !== 'Global') {
      filtered = filtered.filter(s => s.room === selectedRuleRoom);
    }
    return [...new Set(filtered.map(s => s.name).filter(Boolean))];
  }, [allSensors, selectedRuleRoom]);

  const actionableDevices = (Array.isArray(allDevices) ? allDevices : []).filter((device) => {
    if (device?.isConfigured === false) return false;
    if (!device?.deviceId) return false;
    // Support media_player explicitly
    const effectiveType = device.type === 'touch-panel' || (Array.isArray(device.subDevices) && device.subDevices.length > 0)
      ? 'touch-panel'
      : device.type;
    return Boolean(DEVICE_COMMANDS[effectiveType] || DEVICE_COMMANDS.default);
  });

  const filteredDevicesByRoom = actionableDevices.filter((device) => {
    if (selectedRuleRoom === 'Global') return true;
    return device.room === selectedRuleRoom;
  });

  useEffect(() => {
    if (showModal && socket && mediaList.length === 0) {
      const firstMediaPlayer = actionableDevices.find(d => d.type === 'media_player');
      if (firstMediaPlayer) {
        // Fetch local media directory directly to populate the song list
        socket.emit('ha_browse_media', { 
          entity_id: firstMediaPlayer.deviceId,
          media_content_type: 'app',
          media_content_id: 'media-source://media_source/local/'
        }, (res) => {
          if (res?.result?.children) {
            setMediaList(res.result.children);
          } else {
            // Fallback to root if local media source fails
            socket.emit('ha_browse_media', { entity_id: firstMediaPlayer.deviceId }, (rootRes) => {
              if (rootRes?.result?.children) {
                setMediaList(rootRes.result.children);
              }
            });
          }
        });
      }
    }
  }, [showModal, actionableDevices, socket, mediaList.length]);

  const isTouchPanelDevice = (device) =>
    Boolean(device) && (device.type === 'touch-panel' || (Array.isArray(device.subDevices) && device.subDevices.length > 0) || device.deviceId?.startsWith('BSQ'));

  const findActionDevice = (targetDeviceId) =>
    filteredDevicesByRoom.find((device) => device.deviceId === targetDeviceId)
    || actionableDevices.find((device) => device.deviceId === targetDeviceId)
    || null;

  const findActionSubDevice = (device, subDeviceIndex) => {
    if (!Array.isArray(device?.subDevices) || subDeviceIndex === null || subDeviceIndex === undefined || subDeviceIndex === '') {
      return null;
    }
    return device.subDevices.find((item) => Number(item.index) === Number(subDeviceIndex)) || null;
  };

  const getSubDeviceOptions = (device) => {
    if (!isTouchPanelDevice(device) || !Array.isArray(device?.subDevices)) return [];
    return device.subDevices.map((subDevice) => ({
      value: String(subDevice.index),
      label: getSubDeviceDisplayName(subDevice),
      type: subDevice.type,
    }));
  };

  const getActionSummaryLabel = (action) => {
    const device = findActionDevice(action.targetDeviceId);
    const subDevice = findActionSubDevice(device, action.subDeviceIndex);
    const speedSuffix = action.command === 'set_speed' ? `Level ${action.params?.speed || 1}` : '';
    const colorSuffix = action.command === 'set_color' ? rgbToHex(action.params?.color).toUpperCase() : '';
    const suffix = speedSuffix || colorSuffix;
    return subDevice
      ? getActionDisplayName(device, subDevice, suffix)
      : (device?.title || action.targetDevice || action.targetDeviceId);
  };

  const getDefaultBrightness = (device) => clampBrightnessValue(device?.brightness ?? 255);
  const getDefaultColor = (device) => {
    const rgbNumber = device?.spectrumRgb;
    if (typeof rgbNumber === 'number' && Number.isFinite(rgbNumber)) {
      return [
        (rgbNumber >> 16) & 255,
        (rgbNumber >> 8) & 255,
        rgbNumber & 255,
        255,
      ];
    }
    return [255, 255, 255, 255];
  };

  const updateCond = (i, field, val) => {
    const c = [...form.conditions];
    if (field === 'sensor' && val === 'motion') c[i].value = "1";
    c[i] = { ...c[i], [field]: val };
    setForm({ ...form, conditions: c });
  };

  const addCond = () => setForm({ ...form, conditions: [...form.conditions, { ...EMPTY_COND }] });
  const removeCond = (i) => {
    if (form.conditions.length > 1) {
      const c = [...form.conditions];
      c.splice(i, 1);
      setForm({ ...form, conditions: c });
    }
  };

  const updateAction = (i, field, val) => {
    const a = [...form.actions];
    const currentAction = a[i];
    const currentDevice = findActionDevice(currentAction.targetDeviceId);
    const currentSubDevice = findActionSubDevice(currentDevice, currentAction.subDeviceIndex);

    if (field === 'targetDeviceId') {
      const device = findActionDevice(val);
      a[i] = {
        ...a[i],
        targetDeviceId: val,
        targetDevice: device ? (device.title || device.deviceId) : '',
        subDeviceIndex: isTouchPanelDevice(device) ? '' : null,
        command: 'turn_on',
        params: {},
      };
    } else if (field === 'subDeviceIndex') {
      const device = currentDevice;
      const subDevice = findActionSubDevice(device, val);
      a[i] = {
        ...a[i],
        subDeviceIndex: val === '' ? '' : Number(val),
        targetDevice: subDevice ? getActionDisplayName(device, subDevice) : (device?.title || currentAction.targetDevice),
        command: 'turn_on',
        params: {},
      };
    } else if (field === 'fanSpeedPreset') {
      const speed = Number(val) || 1;
      a[i] = {
        ...a[i],
        targetDevice: currentSubDevice ? getActionDisplayName(currentDevice, currentSubDevice, `Level ${speed}`) : currentAction.targetDevice,
        params: { ...a[i].params, speed },
      };
    } else if (field === 'command') {
      a[i] = {
        ...a[i],
        command: val,
        targetDevice: currentSubDevice
          ? getActionDisplayName(
              currentDevice,
              currentSubDevice,
              (val === 'set_speed' || (currentSubDevice?.type === 'fan' && currentAction.params?.speed && val === 'turn_on'))
                ? `Level ${currentAction.params?.speed || 1}`
                : ''
            )
          : currentAction.targetDevice,
        params: val === 'set_speed'
          ? { speed: a[i].params?.speed || 1 }
          : currentSubDevice?.type === 'fan'
            ? { ...a[i].params, speed: a[i].params?.speed || 1 }
          : val === 'set_brightness'
            ? { brightness: clampBrightnessValue(a[i].params?.brightness ?? getDefaultBrightness(currentDevice)) }
            : val === 'set_color'
              ? { color: a[i].params?.color || getDefaultColor(currentDevice) }
            : {},
      };
    } else if (field === 'speed') {
      const speed = Number(val) || 1;
      a[i] = {
        ...a[i],
        targetDevice: currentSubDevice ? getActionDisplayName(currentDevice, currentSubDevice, `Level ${speed}`) : currentAction.targetDevice,
        params: { ...a[i].params, speed },
      };
    } else if (field === 'brightness') {
      a[i] = {
        ...a[i],
        params: { ...a[i].params, brightness: clampBrightnessValue(val) },
      };
    } else if (field === 'colorHue') {
      a[i] = {
        ...a[i],
        params: { ...a[i].params, color: hueToRgb(val) },
      };
    } else if (field === 'media_content') {
      let parsed = null;
      try { parsed = JSON.parse(val); } catch(e) {}
      a[i] = {
        ...a[i],
        params: { ...a[i].params, media_content_type: parsed?.media_content_type, media_content_id: parsed?.media_content_id },
      };
    } else {
      a[i] = { ...a[i], [field]: val };
    }
    setForm({ ...form, actions: a });
  };

  const addAction = () => setForm({ ...form, actions: [...form.actions, { ...EMPTY_ACTION }] });
  const removeAction = (i) => {
    if (form.actions.length > 1) {
      const a = [...form.actions];
      a.splice(i, 1);
      setForm({ ...form, actions: a });
    }
  };

  const fmtCmd = (c, deviceId) => {
    const dev = allDevices?.find(d => d.deviceId === deviceId);
    if (dev?.type === 'curtain') {
      if (c === 'turn_on') return 'Open';
      if (c === 'turn_off') return 'Close';
    }
    if (c === 'play_media') return 'Play Specific Song';
    if (c === 'media_play') return 'Resume Playing';
    if (c === 'media_pause') return 'Pause Music';
    return c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <>
      <div className="scenes-view animate-slide-up">
      <div className="scenes-header">
        <div>
          <h1>{currentRoom ? currentRoom.name : 'Automations'}</h1>
          <p>{currentRoom ? `Rules for ${currentRoom.name}` : 'Select a room to manage rules'}</p>
        </div>
        <div className="header-actions">
          {currentRoom && (
            <button className="action-btn-pill secondary" onClick={closeSceneRoom}>
              <img src="/icons/icons/Left-White.svg" alt="Back" style={{width: 16, height: 16}} /> All Rooms
            </button>
          )}
          {!currentRoom && (
            <button className="action-btn-pill primary" onClick={() => openSceneModal('room')}>
              <img src="/icons/icons/Plus-White.svg" alt="Add" style={{width: 16, height: 16}} /> Add Room
            </button>
          )}
        </div>
      </div>

      {currentRoom && (
        <>
          {(() => {
            const roomSensors = (Array.isArray(sensors) ? sensors : []).filter(s => s.room === currentRoom.name);
            if (roomSensors.length === 0) return null;
            return (
              <div className="sensor-bar" style={{ marginBottom: '24px' }}>
                {roomSensors.map(sensor => {
                  let iconSrc = "/icons/icons/WIFI-White.svg";
                  const n = (sensor.name || '').toLowerCase();
                  if (n.includes('temp')) iconSrc = "/icons/icons/Theme.svg";
                  else if (n.includes('humid')) iconSrc = "/icons/icons/Theme.svg";
                  else if (n.includes('lux') || n.includes('light')) iconSrc = "/icons/icons/Theme.svg";
                  else if (n.includes('motion') || n.includes('pres')) iconSrc = "/icons/icons/Profile-White.svg";
                  else if (n.includes('co2') || n.includes('air')) iconSrc = "/icons/icons/Insight-White.svg";
                  
                  let val = sensor.value;
                  if (typeof val === 'string' && val.startsWith('{')) {
                    try {
                      const parsed = JSON.parse(val);
                      val = parsed;
                    } catch (e) {}
                  }
                  if (typeof val === 'object' && val !== null) {
                    val = val.value !== undefined ? val.value : (val.val !== undefined ? val.val : JSON.stringify(val));
                  }
                  
                  return (
                    <div className="sensor-chip" key={sensor._id}>
                      <span className="icon"><img src={iconSrc} style={{width: 20, height: 20}} /></span>
                      <div className="info">
                        <span className="label">{sensor.name}</span>
                        <span className="val">{val}{sensor.unit ? ` ${sensor.unit}` : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}

      {!currentRoom ? (
        <div className="rooms-grid-scene">
          {(Array.isArray(rooms) ? rooms : []).map(room => {
            const roomRules = (Array.isArray(rules) ? rules : []).filter(r => r.room === room.name);
            const activeRules = roomRules.filter(r => r.enabled).length;
            return (
              <div key={room.name} className="room-card-scene glass" onClick={() => openSceneRoom(room)}>
                <div className="room-card-header-scene">
                  <span className="room-icon-scene"><img src="/icons/icons/Home.svg" alt="Room" style={{width: 24, height: 24}} /></span>
                  <div className={`active-badge-scene ${activeRules > 0 ? 'active' : ''}`}>{activeRules} Active</div>
                </div>
                <div className="room-card-body-scene">
                  <h3>{room.name}</h3>
                  <p>{roomRules.length} Rules</p>
                </div>
              </div>
            );
          })}
          <div className="room-card-scene global glass" onClick={() => openSceneRoom({ name: 'Global', icon: '🌍' })}>
            <div className="room-card-header-scene">
              <span className="room-icon-scene"><img src="/icons/icons/Connect.svg" alt="Globe" style={{width: 24, height: 24}} /></span>
              <div className="active-badge-scene">{(Array.isArray(rules) ? rules : []).filter(r => (r.room === 'Global' || !r.room) && r.enabled).length} Active</div>
            </div>
            <div className="room-card-body-scene">
              <h3>Global System</h3>
              <p>{(Array.isArray(rules) ? rules : []).filter(r => r.room === 'Global' || !r.room).length} Rules</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rules-grid-container">
          <div className="welcome-header">
            <button className="action-btn-pill primary" onClick={openCreate}><img src="/icons/icons/Plus-White.svg" alt="Add" style={{width: 16, height: 16}} /> New Rule</button>
          </div>
          
          {(() => {
            const filteredRules = (Array.isArray(rules) ? rules : []).filter(r => (r.room === 'Global' || (currentRoom && r.room === currentRoom.name)));
            const musicRules = filteredRules.filter(r => r.actions.some(a => a.targetDeviceId?.startsWith('media_player.')));
            const standardRules = filteredRules.filter(r => !r.actions.some(a => a.targetDeviceId?.startsWith('media_player.')));

            const renderRuleCard = (rule) => (
              <div className={`rule-card glass ${rule.enabled ? '' : 'disabled'}`} key={rule._id}>
                <div className="card-top">
                  <div className="card-icon">
                    <img src={rule.actions.some(a => a.targetDeviceId?.startsWith('media_player.')) ? "/icons/icons/Speaker-White.svg" : "/icons/icons/WIFI-White.svg"} alt="Rule" style={{width: 24, height: 24}} />
                  </div>
                  <div className="scene-card-actions">
                    <button className="action-btn-scene" onClick={() => openEdit(rule)}><img src="/icons/icons/Edit.svg" alt="Edit" style={{width: 14, height: 14}} /></button>
                    <button className="action-btn-scene delete" onClick={() => deleteRule(rule._id)}><img src="/icons/icons/Delete.svg" alt="Delete" style={{width: 14, height: 14}} /></button>
                  </div>
                </div>
                <h3>{rule.name}</h3>
                <p className="desc">{rule.description || 'No description provided'}</p>
                <div className="conditions-list">
                  {rule.conditions.map((c, i) => (
                    <span className="cond-pill" key={i}>IF {c.sensor} {OPS[c.operator]} {String(c.value)}</span>
                  ))}
                  {rule.actions.map((a, i) => (
                    <span className="action-pill" key={i}>THEN {fmtCmd(a.command, a.targetDeviceId)} {getActionSummaryLabel(a)}</span>
                  ))}
                </div>
                <div className="card-footer-scene">
                  <span className="trigger-info">{rule.triggerCount || 0} Runs</span>
                  <button className={`toggle-switch ${rule.enabled ? 'on' : ''}`} onClick={() => toggleRule(rule._id)}>
                    <span className="knob"></span>
                  </button>
                </div>
              </div>
            );

            return (
              <>
                {standardRules.length > 0 && (
                  <div className="rules-grid">
                    {standardRules.map(renderRuleCard)}
                  </div>
                )}
                
                <div className="welcome-header" style={{ marginTop: '40px', marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>Music Scenes</h2>
                </div>
                {musicRules.length > 0 ? (
                  <div className="rules-grid">
                    {musicRules.map(renderRuleCard)}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                    <p style={{ margin: 0 }}>No music scenes created yet.</p>
                    <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>Click "New Rule" and select a speaker to build your first music automation!</p>
                  </div>
                )}

                {filteredRules.length === 0 && musicRules.length === 0 && standardRules.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No automations found in this room.
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

    </div>

    {showModal && (
      <div className="scenes-modal-overlay" onClick={() => closeSceneModal('rule')}>
        <div className="scenes-modal-content animate-slide-up" onClick={e => e.stopPropagation()}>
          <div className="modal-premium-header">
            <div className="header-bg-glow"></div>
            <div className="header-content-top">
              <div className="header-icon-circle">
                <img src="/icons/icons/WIFI-White.svg" alt="Rule" style={{width: 20, height: 20}} />
              </div>
              <button className="close-pill-btn" onClick={() => closeSceneModal('rule')}>
                <img src="/icons/icons/Close-White.svg" alt="Close" style={{width: 16, height: 16}} />
              </button>
            </div>
            <div className="header-text-bottom">
              <h2>{editId ? 'Edit Automation' : 'New Automation'}</h2>
              <p>Configure rule conditions and actions</p>
            </div>
          </div>

          <div className="premium-form-body">
            <div className="form-section compact-section scene-rule-section" style={{ gap: '12px' }}>
              <div className="input-field-wrapper" style={{ gap: '6px' }}>
                <label className="scene-step-label" style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <img src="/icons/icons/Settings-White.svg" alt="Settings" style={{width: 11, height: 11}} /> 1. Rule Details
                </label>
                <div className="form-grid-2 scene-rule-grid" style={{ gap: '10px', gridTemplateColumns: '1.8fr 1fr' }}>
                  <div className="input-field-wrapper" style={{ gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Rule Name</span>
                    <input 
                      value={form.name} 
                      onChange={e => setForm({ ...form, name: e.target.value })} 
                      placeholder="e.g. Temp Alert" 
                      style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '13px' }}
                    />
                  </div>
                  <div className="input-field-wrapper" style={{ gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Cooldown (sec)</span>
                    <input 
                      type="number" 
                      value={form.cooldownSeconds} 
                      onChange={e => setForm({ ...form, cooldownSeconds: Number(e.target.value) })} 
                      style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '13px' }}
                    />
                  </div>
                </div>
                <p className="scene-inline-note" style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                  This rule will be created in {selectedRuleRoom}.
                </p>
              </div>
            </div>

            <div className="form-section compact-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', gap: '10px' }}>
              <div className="setup-header scene-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="scene-step-label" style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <img src="/icons/icons/WIFI-White.svg" alt="Conditions" style={{width: 11, height: 11}} /> 2. Conditions
                </label>
                <button type="button" className="action-btn-pill secondary scene-mini-add-btn" style={{ padding: '4px 10px', minHeight: '26px', fontSize: '11px', borderRadius: '8px' }} onClick={addCond}>+ Add</button>
              </div>
              <div className="items-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {form.conditions.map((c, i) => (
                  <div className="item-card scene-item-card" key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-main)', padding: '6px 10px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div className="scene-condition-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                      <div className="item-controls scene-condition-controls">
                          <select className="premium-select" style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '12px', height: '32px' }} value={c.sensor} onChange={e => updateCond(i, 'sensor', e.target.value)}>
                            {filteredSensorNames.length > 0 
                              ? filteredSensorNames.map(s => <option key={s} value={s}>{s}</option>)
                              : <option value="" disabled>No sensors found</option>}
                          </select>
                        <select className="premium-select" style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '12px', height: '32px' }} value={c.operator} onChange={e => updateCond(i, 'operator', e.target.value)}>
                          {Object.entries(OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <input className="premium-input" style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '12px', height: '32px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} type="number" value={c.value} onChange={e => updateCond(i, 'value', e.target.value)} />
                      </div>
                      <div className="item-controls scene-condition-time-controls">
                        <input className="premium-input" type="time" title="Start Time (Optional)" style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '12px', height: '32px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} value={c.startTime || ''} onChange={e => updateCond(i, 'startTime', e.target.value)} />
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px', alignSelf: 'center', textAlign: 'center' }}>to</span>
                        <input className="premium-input" type="time" title="End Time (Optional)" style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '12px', height: '32px', border: '1.5px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} value={c.endTime || ''} onChange={e => updateCond(i, 'endTime', e.target.value)} />
                      </div>
                    </div>
                    {form.conditions.length > 1 && (
                      <button type="button" className="close-pill-btn scene-item-remove" style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', width: '26px', height: '26px', flexShrink: 0 }} onClick={() => removeCond(i)}><img src="/icons/icons/Close-White.svg" alt="Close" style={{width: 12, height: 12}} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="form-section compact-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', gap: '10px' }}>
              <div className="setup-header scene-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="scene-step-label" style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <img src="/icons/icons/Power.svg" alt="Actions" style={{width: 11, height: 11}} /> 3. Actions
                </label>
                <button type="button" className="action-btn-pill secondary scene-mini-add-btn" style={{ padding: '4px 10px', minHeight: '26px', fontSize: '11px', borderRadius: '8px' }} onClick={addAction}>+ Add</button>
              </div>
              <p className="scene-inline-note" style={{ margin: '0 0 6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                {selectedRuleRoom === 'Global'
                  ? 'Showing all actionable devices.'
                  : `Showing actionable devices assigned to ${selectedRuleRoom}.`}
              </p>
              <div className="items-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {form.actions.map((a, i) => {
                  const selectedDevice = findActionDevice(a.targetDeviceId);
                  const selectedSubDevice = findActionSubDevice(selectedDevice, a.subDeviceIndex);
                  const subDeviceOptions = getSubDeviceOptions(selectedDevice);
                  const cmds = DEVICE_COMMANDS[getDeviceCommandType(selectedDevice, selectedSubDevice)] || DEVICE_COMMANDS.default;
                  const showSubDeviceDropdown = isTouchPanelDevice(selectedDevice);
                  const showFanSpeedPresetDropdown = selectedSubDevice?.type === 'fan';
                  const showMediaDropdown = selectedDevice?.type === 'media_player' && a.command === 'play_media';
                  const visibleCmds = showFanSpeedPresetDropdown
                    ? cmds.filter((command) => command !== 'set_speed')
                    : cmds;
                  const commandSelectValue = showFanSpeedPresetDropdown && a.command === 'set_speed'
                    ? 'turn_on'
                    : a.command;
                  const showBrightnessSlider = !showSubDeviceDropdown
                    && Boolean(selectedDevice)
                    && ['light', 'rgbw'].includes(selectedDevice.type)
                    && a.command === 'set_brightness';
                  const showColorPicker = !showSubDeviceDropdown
                    && selectedDevice?.type === 'rgbw'
                    && a.command === 'set_color';
                  const brightnessValue = clampBrightnessValue(a.params?.brightness ?? getDefaultBrightness(selectedDevice));
                  const brightnessPercent = Math.round((brightnessValue / 255) * 100);
                  const selectedColor = rgbToHex(a.params?.color || getDefaultColor(selectedDevice));
                  const selectedHue = rgbToHue(a.params?.color || getDefaultColor(selectedDevice));

                  return (
                    <div className={`item-card scene-item-card action-item-card ${showBrightnessSlider || showColorPicker ? 'has-slider' : ''}`} key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-main)', padding: '6px 10px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div
                        className="action-main scene-action-controls"
                        style={{
                          gridTemplateColumns: showMediaDropdown 
                            ? '1fr 0.8fr 1.2fr'
                            : showSubDeviceDropdown
                              ? (showFanSpeedPresetDropdown ? '1.1fr 1fr 1fr 0.9fr' : '1.2fr 1fr 1fr')
                              : '1fr 1fr'
                        }}
                      >
                        <select
                          className="premium-select"
                          style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '12px', height: '32px' }}
                          value={a.targetDeviceId}
                          onChange={e => updateAction(i, 'targetDeviceId', e.target.value)}
                        >
                          <option value="">
                            {selectedRuleRoom === 'Global' ? 'Select Device' : `Select ${selectedRuleRoom} Device`}
                          </option>
                          {filteredDevicesByRoom.map((device) => (
                            <option key={device.deviceId} value={device.deviceId}>{device.title || device.deviceId}</option>
                          ))}
                        </select>
                        {showSubDeviceDropdown && (
                          <select
                            className="premium-select"
                            style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '12px', height: '32px' }}
                            value={a.subDeviceIndex === null ? '' : a.subDeviceIndex}
                            onChange={e => updateAction(i, 'subDeviceIndex', e.target.value)}
                          >
                            <option value="">Select Switch/Fan</option>
                            {subDeviceOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        )}
                        <select className="premium-select" style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '12px', height: '32px' }} value={commandSelectValue} onChange={e => updateAction(i, 'command', e.target.value)}>
                          {visibleCmds.map(c => <option key={c} value={c}>{fmtCmd(c, a.targetDeviceId)}</option>)}
                        </select>
                        {showFanSpeedPresetDropdown && (
                          <select
                            className="premium-select"
                            style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '12px', height: '32px' }}
                            value={a.params?.speed || 1}
                            onChange={e => updateAction(i, 'fanSpeedPreset', e.target.value)}
                          >
                            {[1, 2, 3, 4, 5].map((speed) => (
                              <option key={speed} value={speed}>Level {speed}</option>
                            ))}
                          </select>
                        )}
                        {showMediaDropdown && (
                          <select
                            className="premium-select"
                            style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '12px', height: '32px' }}
                            value={a.params?.media_content_id ? JSON.stringify({ media_content_type: a.params.media_content_type, media_content_id: a.params.media_content_id }) : ''}
                            onChange={e => updateAction(i, 'media_content', e.target.value)}
                          >
                            <option value="">Select Song/Playlist</option>
                            {mediaList.map((media) => (
                              <option key={media.media_content_id} value={JSON.stringify({ media_content_type: media.media_content_type, media_content_id: media.media_content_id })}>
                                {media.title}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      {showBrightnessSlider && (
                        <div className="scene-slider-block">
                          <div className="scene-slider-meta">
                            <span>Brightness</span>
                            <strong>{brightnessPercent}%</strong>
                          </div>
                          <input
                            className="scene-range-input"
                            type="range"
                            min="1"
                            max="255"
                            step="1"
                            value={brightnessValue}
                            onChange={e => updateAction(i, 'brightness', e.target.value)}
                          />
                        </div>
                      )}
                      {showColorPicker && (
                        <div className="scene-color-block">
                          <div className="scene-slider-meta">
                            <span>Color</span>
                            <strong>{selectedColor.toUpperCase()}</strong>
                          </div>
                          <div className="scene-color-controls">
                            <input
                              className="scene-hue-input"
                              type="range"
                              min="0"
                              max="360"
                              step="1"
                              value={selectedHue}
                              onChange={e => updateAction(i, 'colorHue', e.target.value)}
                            />
                            <div className="scene-color-preview">
                              <span className="scene-color-swatch" style={{ backgroundColor: selectedColor }}></span>
                              <span>{selectedColor.toUpperCase()}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      {form.actions.length > 1 && (
                        <button type="button" className="close-pill-btn scene-item-remove" style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', width: '26px', height: '26px' }} onClick={() => removeAction(i)}><img src="/icons/icons/Close-White.svg" alt="Close" style={{width: 12, height: 12}} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="premium-modal-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <button type="button" className="action-btn-pill secondary" style={{ minHeight: '36px', fontSize: '13px' }} onClick={() => closeSceneModal('rule')}>Cancel</button>
              <button type="button" className="action-btn-pill primary" style={{ flexGrow: 1, minHeight: '36px', fontSize: '13px' }} onClick={saveRule}>Save Automation</button>
            </div>
          </div>
        </div>
      </div>
    )}
    <AddRoomModal isOpen={isRoomModalOpen} onClose={() => closeSceneModal('room')} onAdd={handleAddRoomLocal} />
    {toast && <div className="toast"><span>⚡</span> {toast}</div>}
  </>
  );
};

export default Scenes;

