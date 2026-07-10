import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';

// Custom fetch wrapper
export const fetchWithAuth = async (url, options = {}) => {
  const token = localStorage.getItem('smarthome_token');
  const headers = {
    ...options.headers,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    localStorage.removeItem('smarthome_token');
    window.location.replace('/login');
  }
  return response;
};

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('smarthome_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

import io from 'socket.io-client';

import Sidebar from './components/Sidebar';

const getRoomIcon = (roomName) => {
  const name = (roomName || '').toLowerCase();
  if (name.includes('living')) return <img src="/icons/icons/rooms_icons/LivingRoom.svg" className="room-svg-icon" style={{ width: 28, height: 28 }} />;
  if (name.includes('bed')) return <img src="/icons/icons/rooms_icons/MasterBedRoom.svg" className="room-svg-icon" style={{ width: 28, height: 28 }} />;
  if (name.includes('kitchen')) return <img src="/icons/icons/rooms_icons/Kitchen.svg" className="room-svg-icon" style={{ width: 28, height: 28 }} />;
  if (name.includes('office') || name.includes('work')) return <img src="/icons/icons/rooms_icons/StudyRoom.svg" className="room-svg-icon" style={{ width: 28, height: 28 }} />;
  if (name.includes('bath')) return <img src="/icons/icons/rooms_icons/BathRoom.svg" className="room-svg-icon" style={{ width: 28, height: 28 }} />;
  if (name.includes('garage')) return <img src="/icons/icons/rooms_icons/Other.svg" className="room-svg-icon" style={{ width: 28, height: 28 }} />;
  if (name.includes('garden') || name.includes('yard') || name.includes('balcony')) return <img src="/icons/icons/rooms_icons/Balcony.svg" className="room-svg-icon" style={{ width: 28, height: 28 }} />;
  if (name.includes('dining')) return <img src="/icons/icons/rooms_icons/Dining.svg" className="room-svg-icon" style={{ width: 28, height: 28 }} />;
  return <img src="/icons/icons/Home.svg" className="room-svg-icon" style={{ width: 28, height: 28 }} />;
};
import DeviceCard from './components/DeviceCard';
import ColorControl from './components/ColorControl';
import RGBWPanel from './components/RGBWPanel';
import Scenes from './components/Scenes';
import ConfigureDeviceModal from './components/ConfigureDeviceModal';
import ProvisioningModal from './components/ProvisioningModal';
import AddRoomModal from './components/AddRoomModal';
import SensorCard from './components/SensorCard';
import AddSensorModal from './components/AddSensorModal';
import MusicDeck from './components/MusicDeck';
import Staircase from './components/Staircase';
import MusicHome from './components/MusicHome';
import AudioDevicesTab from './components/AudioDevicesTab';
import { getDeviceIconLabel, getDeviceIconSrc } from './deviceIcons';
import Surveillance from './components/Surveillance';

// Dynamic API Base URL for network access
const API_BASE = `http://${window.location.hostname}:3000`;

// Socket connection
export const socket = io(API_BASE, {
  path: '/socket.io/'
});

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState(() => window.history.state?.tab || 'dashboard');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [lightStatus, setLightStatus] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [whiteIntensity, setWhiteIntensity] = useState(255);
  const [autoMode, setAutoMode] = useState(false);
  const [currentLux, setCurrentLux] = useState(0);
  const [mqttStatus, setMqttStatus] = useState('Syncing...');
  const [devices, setDevices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isSensorModalOpen, setIsSensorModalOpen] = useState(false);
  const [configuringDevice, setConfiguringDevice] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [sensors, setSensors] = useState([]);
  const [timerInfo, setTimerInfo] = useState({ remaining: 0, action: null });
  const [timerTargetAction, setTimerTargetAction] = useState('TOGGLE');
  const [customMins, setCustomMins] = useState('');
  const [metrics, setMetrics] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [curtainMoving, setCurtainMoving] = useState(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    if (selectedDevice) {
      const updated = devices.find(d => d.deviceId === selectedDevice.deviceId);
      if (updated) setSelectedDevice(updated);
    }
  }, [devices]);

  const filteredDevices = devices.filter(d =>
    d.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.deviceId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.room?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleMediaCommand = (entityId, service, serviceData = {}) => {
    socket.emit('ha_command', {
      domain: 'media_player',
      service: service,
      entityId: entityId,
      serviceData: serviceData
    });
  };

  const isInteracting = useRef(false);
  const sensorsRef = useRef(sensors);
  const devicesRef = useRef(devices);
  const roomsRef = useRef(rooms);

  useEffect(() => {
    sensorsRef.current = sensors;
  }, [sensors]);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    fetchDevices();
    fetchRooms();
    fetchSensors();
  }, []);

  const fetchDevices = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/devices`);
      const data = await res.json();
      // Preserve live Home Assistant state and merge cleanly without duplicates
      setDevices(prev => {
        const dbDevices = Array.isArray(data) ? data : [];
        const prevArray = Array.isArray(prev) ? prev : [];
        
        // Start with DB devices, taking live state if available
        const merged = dbDevices.map(dbDev => {
          const liveState = prevArray.find(p => p.deviceId === dbDev.deviceId);
          if (liveState) {
            return {
              ...dbDev,
              ...liveState,
              title: dbDev.title, // Keep custom DB title
              room: dbDev.room,   // Keep custom DB room
              icon: dbDev.icon    // Keep custom DB icon
            };
          }
          return dbDev;
        });

        // Append HA devices that are NOT in DB
        const haOnlyDevices = prevArray.filter(d => d.isHomeAssistant && !dbDevices.some(db => db.deviceId === d.deviceId));
        return [...merged, ...haOnlyDevices];
      });
    } catch (err) {
      console.error('Failed to fetch devices', err);
    }
  };

  const fetchRooms = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/rooms`);
      const data = await res.json();
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch rooms', err);
      setRooms([]);
    }
  };

  const fetchSensors = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/sensors`);
      const data = await res.json();
      setSensors(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch sensors', err);
      setSensors([]);
    }
  };

  const handleAddSensor = async (sensorData) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/sensors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sensorData)
      });
      if (res.ok) fetchSensors();
    } catch (err) {
      console.error('Failed to add sensor', err);
    }
  };

  const handleRemoveSensor = async (id) => {
    if (!window.confirm('Remove this sensor?')) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/sensors/${id}`, { method: 'DELETE' });
      if (res.ok) fetchSensors();
    } catch (err) {
      console.error('Failed to remove sensor', err);
    }
  };

  const handleAddRoom = async (roomData) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roomData)
      });
      if (res.ok) {
        fetchRooms();
      }
    } catch (err) {
      console.error('Failed to add room', err);
    }
  };

  const handleConfigureDevice = async (deviceId, configData) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/devices/${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      });
      if (res.ok) {
        fetchDevices();
        setConfiguringDevice(null);
      }
    } catch (err) {
      console.error('Failed to configure device', err);
    }
  };

  const handleRemoveDevice = async (deviceId) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/devices/${deviceId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchDevices();
      }
    } catch (err) {
      console.error('Failed to remove device', err);
    }
  };

  const handleRemoveRoom = async (roomName) => {
    if (!window.confirm(`Are you sure you want to remove the room "${roomName}"? Devices in this room will become Unassigned.`)) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/rooms/${roomName}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchRooms();
        fetchDevices();
        if (currentRoom?.name === roomName) setCurrentRoom(null);
      }
    } catch (err) {
      console.error('Failed to remove room', err);
    }
  };

  const handleAddDevice = async (deviceData) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceData)
      });
      if (res.ok) {
        fetchDevices();
      }
    } catch (err) {
      console.error('Failed to provision device', err);
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchRooms();
    fetchSensors();

    // REMOVED 5-second polling loop which caused massive UI lag and slider jumping.
    // We now rely entirely on the fast WebSocket events for real-time updates!
    
    socket.on('mqtt_status', (data) => setMqttStatus(data.status));
    
    socket.on('device_state_update', (updatedDevice) => {
      setDevices(prev => (Array.isArray(prev) ? prev : []).map(d => d.deviceId === updatedDevice.deviceId ? { ...updatedDevice, isOnline: true } : d));
    });

    socket.on('custom_sensor_update', (updatedSensor) => {
      setSensors(prev => (Array.isArray(prev) ? prev : []).map(s => s._id === updatedSensor._id ? updatedSensor : s));
    });

    socket.on('toast_message', (msg) => {
      showToast(msg);
    });

    // Handle incoming Home Assistant normalized entities
    socket.on('ha_entity_state_change', (haDevice) => {
      setDevices(prev => {
        const list = Array.isArray(prev) ? prev : [];
        
        const haName = (haDevice.name || '').toLowerCase();
        const isLocalDevice = list.some(d => !d.isHomeAssistant && (d.title || '').toLowerCase() === haName);
        const isLocalSensor = sensorsRef.current.some(s => (s.name || '').toLowerCase() === haName);
        const isSelfPublished = haDevice.entity_id.includes('ha_switch') || haDevice.entity_id.includes('ha_light') || haDevice.entity_id.includes('ha_sensor') || haDevice.entity_id.includes('ha_fan') || haDevice.entity_id.includes('ha_rgbw');

        if (isLocalDevice || isLocalSensor || isSelfPublished) {
          return list;
        }

        const existingIndex = list.findIndex(d => d.deviceId === haDevice.entity_id);
        
        // Map HA entity to standard device format expected by UI
        const mappedDevice = {
          deviceId: haDevice.entity_id,
          title: haDevice.name,
          type: haDevice.type === 'switch' ? 'plug' : haDevice.type, // UI expects plug/light/rgbw/curtain
          room: haDevice.room || 'Unassigned', // Dynamically map HA Room
          isOnline: haDevice.state !== 'unavailable' && haDevice.state !== 'unknown',
          on: haDevice.on,
          // HA mapper provides brightness 0-100, UI internal state expects 0-255
          brightness: haDevice.brightness !== undefined ? Math.round((haDevice.brightness / 100) * 255) : 255,
          icon: haDevice.type === 'light' ? '💡' : (haDevice.type === 'media_player' ? '🎵' : '🔌'),
          isConfigured: true,
          isHomeAssistant: true,
          mediaState: haDevice.state,
          mediaTitle: haDevice.mediaTitle,
          mediaArtist: haDevice.mediaArtist,
          mediaAlbum: haDevice.mediaAlbum,
          albumArt: haDevice.albumArt,
          volume: haDevice.volume,
          deviceClass: haDevice.deviceClass,
          isMusicAssistant: haDevice.isMusicAssistant,
          mediaPosition: haDevice.mediaPosition,
          mediaDuration: haDevice.mediaDuration,
          mediaPositionUpdatedAt: haDevice.mediaPositionUpdatedAt,
          groupMembers: haDevice.raw?.attributes?.group_members || [],
          raw: haDevice.raw
        };

        if (existingIndex >= 0) {
          // If the device is purely from HA and hasn't been custom-edited in our DB, we should let HA dictate the room and title.
          // We can check if it's missing from our 'devices' DB array to know if it's purely HA.
          // For now, if it's an HA device, just prefer the HA mapped properties over the old ones if the old ones were "Unassigned".
          const updated = [...list];
          const preferHA = mappedDevice.isHomeAssistant;
          updated[existingIndex] = { 
            ...updated[existingIndex], 
            ...mappedDevice,
            title: preferHA ? mappedDevice.title : (updated[existingIndex].isConfigured ? updated[existingIndex].title : mappedDevice.title),
            room: preferHA ? mappedDevice.room : (updated[existingIndex].isConfigured ? updated[existingIndex].room : mappedDevice.room),
            icon: preferHA ? mappedDevice.icon : (updated[existingIndex].isConfigured ? updated[existingIndex].icon : mappedDevice.icon),
            isConfigured: updated[existingIndex].isConfigured 
          };
          return updated;
        } else {
          // Add new HA device to the dashboard
          return [...list, mappedDevice];
        }
      });
    });

    socket.emit('request_initial_states');

    return () => {
      socket.off('mqtt_status');
      socket.off('device_state_update');
      socket.off('custom_sensor_update');
      socket.off('toast_message');
      socket.off('ha_entity_state_change');
    };
  }, []);

  // Update selected device info when devices list changes
  useEffect(() => {
    if (selectedDevice) {
      const updated = devices.find(d => d.deviceId === selectedDevice.deviceId);
      if (updated && !isInteracting.current) {
        setLightStatus(updated.on);
        setBrightness(updated.brightness);
        setAutoMode(updated.effect === 'auto');
        setCurrentLux(updated.lastLux || 0);
        setTimerInfo({
          remaining: updated.timerRemaining || 0,
          action: updated.timerAction
        });
        setMetrics({
          voltage: updated.voltage,
          current: updated.current,
          power: updated.power,
          energy: updated.energy,
          pf: updated.pf,
          temp: updated.temperature
        });
      }
    }
  }, [devices, selectedDevice]);

  // Local frontend countdown for smoother UI experience
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerInfo(prev => {
        if (prev.remaining > 0) {
          return { ...prev, remaining: prev.remaining - 1 };
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleLight = (val) => {
    isInteracting.current = true;
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    interactionTimeout.current = setTimeout(() => {
      isInteracting.current = false;
    }, 2000); // 2s lock to allow smooth transition

    setLightStatus(val);
    // For tunable lights: turning off resets brightness to 0, turning on defaults the slider to 50%.
    const isTunable = selectedDevice && (selectedDevice.type === 'tunable-light' || selectedDevice.type === 'tune light');
    if (isTunable) {
      if (!val) {
        setBrightness(0);
      } else {
        setBrightness(128);
      }
    }
    if (selectedDevice) {
      if (selectedDevice.isHomeAssistant) {
        socket.emit('ha_command', {
          domain: selectedDevice.type === 'plug' ? 'switch' : selectedDevice.type,
          service: val ? 'turn_on' : 'turn_off',
          entityId: selectedDevice.deviceId
        });
        return;
      }
      const isPlug = selectedDevice.type === 'plug' || selectedDevice.type === 'switch';
      const payload = isPlug
        ? { entityId: selectedDevice.deviceId, relayStatus: val ? 'ON' : 'OFF' }
        : { deviceId: selectedDevice.deviceId, state: val ? 'ON' : 'OFF' };
      socket.emit('power_toggle', payload);
    }
  };

  const handleSetTimer = (minutes, action) => {
    if (selectedDevice) {
      const parsedMins = parseInt(minutes, 10) || 0;
      if (parsedMins === 0) {
        showToast("🚫 Timer disabled");
        setTimerInfo({ remaining: 0, action: null });
      } else {
        showToast(`⏱️ Timer started: ${parsedMins} min countdown`);
        setTimerInfo({ remaining: parsedMins * 60, action: action });
      }
      socket.emit('set_offline_timer', {
        deviceId: selectedDevice.deviceId,
        timer: parsedMins,
        action: action
      });
    }
  };

  const handleAddSchedule = (startTime, endTime, days, startAction = 'ON', endAction = 'OFF') => {
    if (selectedDevice) {
      socket.emit('add_schedule', { deviceId: selectedDevice.deviceId, startTime, endTime, days, startAction, endAction });
      showToast(`📅 Schedule added`);
    }
  };

  const handleRemoveSchedule = (scheduleId) => {
    if (selectedDevice) {
      socket.emit('remove_schedule', { deviceId: selectedDevice.deviceId, scheduleId });
      showToast("🗑️ Schedule removed");
    }
  };

  const handleCurtainAction = (action) => {
    if (selectedDevice) {
      socket.emit('curtain_action', { deviceId: selectedDevice.deviceId, action });
    }
  };

  const lastEmitTime = useRef(0);
  const interactionTimeout = useRef(null);

  const throttleEmit = (event, data) => {
    // Set interacting flag to prevent inbound state from overriding UI
    isInteracting.current = true;
    
    // Clear existing timeout and set a new one to reset interaction flag
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    interactionTimeout.current = setTimeout(() => {
      isInteracting.current = false;
    }, 1500); // Wait 1.5s after last move before syncing back from server

    const now = Date.now();
    if (now - lastEmitTime.current > 100) {
      socket.emit(event, data);
      lastEmitTime.current = now;
    }
  };

  const handleBrightness = (val) => {
    const value = parseInt(val);
    setBrightness(value);
    // Dragging brightness above 0 turns light on; dragging to 0 turns it off
    const isOn = value > 0;
    setLightStatus(isOn);
    if (selectedDevice) {
      if (selectedDevice.isHomeAssistant && selectedDevice.type === 'light') {
        throttleEmit('ha_command', {
          domain: 'light',
          service: 'turn_on',
          entityId: selectedDevice.deviceId,
          serviceData: { brightness: Math.round((value / 255) * 100) } // HA brightness pct
        });
        return;
      }
      throttleEmit('brightness_change', { deviceId: selectedDevice.deviceId, brightness: value });
    }
  };

  const handleColorChange = (color) => {
    if (selectedDevice) {
      if (selectedDevice.isHomeAssistant && selectedDevice.type === 'light') {
        throttleEmit('ha_command', {
          domain: 'light',
          service: 'turn_on',
          entityId: selectedDevice.deviceId,
          serviceData: { rgb_color: [color.r, color.g, color.b] }
        });
        return;
      }
      throttleEmit('color_change', { deviceId: selectedDevice.deviceId, ...color, w: whiteIntensity });
    }
  };

  const handleWhiteIntensity = (val) => {
    const value = parseInt(val);
    setWhiteIntensity(value);
    if (selectedDevice) {
      if (selectedDevice.isHomeAssistant && selectedDevice.type === 'light') {
        throttleEmit('ha_command', {
          domain: 'light',
          service: 'turn_on',
          entityId: selectedDevice.deviceId,
          serviceData: { color_temp_kelvin: value * 20 } // Rough mapping
        });
        return;
      }
      throttleEmit('white_change', { deviceId: selectedDevice.deviceId, white: value });
    }
  };

  const toggleAutoMode = () => {
    const newMode = !autoMode;
    setAutoMode(newMode);
    if (selectedDevice) {
      socket.emit('toggle_auto_mode', { deviceId: selectedDevice.deviceId, enabled: newMode });
    }
  };

  const handlePureWhite = () => {
    if (selectedDevice) {
      socket.emit('force_white_mode', { deviceId: selectedDevice.deviceId });
    }
  };

  const renderDetailView = () => {
    if (!selectedDevice) return null;

    const isLight = selectedDevice.type === 'light' || selectedDevice.type === 'rgbw' || selectedDevice.type === 'tunable-light' || selectedDevice.type === 'tune light';
    const isTouchPanel = selectedDevice.type === 'touch-panel' || selectedDevice.deviceId.startsWith('BSQ');
    const isPlug = selectedDevice.type === 'plug' || selectedDevice.type === 'switch' || selectedDevice.deviceId.startsWith('BSP');
    const isEnergyMonitor = selectedDevice.deviceId.startsWith('B1E') || selectedDevice.deviceId.startsWith('B3E') || selectedDevice.deviceId.startsWith('BSP');
    const isThreePhase = selectedDevice.deviceId.startsWith('B3E');
    const isSinglePhase = selectedDevice.deviceId.startsWith('B1E');

    const renderEnergyMetrics = () => {
      if (isThreePhase) {
        return (
          <div className="control-card glass three-phase-card">
            <h3>Three-Phase Monitoring (R-Y-B)</h3>
            <div className="phase-grid">
              {['R', 'Y', 'B'].map(phase => (
                <div key={phase} className={`phase-column ${phase.toLowerCase()}`}>
                  <div className="phase-label">{phase} Phase</div>
                  <div className="phase-stat">
                    <label>Voltage</label>
                    <span>{selectedDevice[`voltage${phase}`] || 0}V</span>
                  </div>
                  <div className="phase-stat">
                    <label>Current</label>
                    <span>{selectedDevice[`current${phase}`] || 0}A</span>
                  </div>
                  <div className="phase-stat">
                    <label>Power</label>
                    <span>{selectedDevice[`power${phase}`] || 0}W</span>
                  </div>
                  <div className="phase-stat">
                    <label>PF</label>
                    <span>{selectedDevice[`pf${phase}`] || 0}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="energy-total-row">
              <div className="total-item single">
                <label>Total Active Energy Consumption</label>
                <span>{selectedDevice.energy || 0} kWh</span>
              </div>
            </div>
          </div>
        );
      }

      if (isSinglePhase) {
        return (
          <div className="control-card glass bijli-auditor-card">
            <h3>Bijli Auditor (Single Phase)</h3>
            <div className="auditor-hero">
              <div className="hero-metric">
                <span className="val">{selectedDevice.power || 0}</span>
                <label>Active Power (W)</label>
              </div>
              <div className="hero-divider"></div>
              <div className="hero-metric">
                <span className="val">{selectedDevice.energy || 0}</span>
                <label>Total kWh</label>
              </div>
            </div>
            <div className="auditor-grid">
              <div className="audit-stat"><span>{selectedDevice.voltage || 0}V</span><label>Voltage</label></div>
              <div className="audit-stat"><span>{selectedDevice.current || 0}A</span><label>Current</label></div>
              <div className="audit-stat"><span>{selectedDevice.pf || 0}</span><label>Power Factor</label></div>
              <div className="audit-stat"><span>{selectedDevice.phaseAngle || 0}°</span><label>Phase Angle</label></div>
              <div className="audit-stat"><span>{selectedDevice.apparentPowerR || 0}VA</span><label>Apparent</label></div>
              <div className="audit-stat"><span>{selectedDevice.reactivePowerR || 0}VAr</span><label>Reactive</label></div>
            </div>
          </div>
        );
      }

      // Default Plug/Switch Energy Monitor
      return (
        <div className="control-card glass energy-card">
          <h3>Energy Monitoring</h3>
          <div className="energy-main-val">
            <img src="/icons/icons/Insight-White.svg" alt="Activity" style={{width: 20, height: 20}} />
            <span>{selectedDevice.power || 0} W</span>
          </div>
          <div className="energy-grid-mini">
            <div className="e-stat"><span>{selectedDevice.voltage || 0}V</span><label>Voltage</label></div>
            <div className="e-stat"><span>{selectedDevice.current || 0}A</span><label>Current</label></div>
            <div className="e-stat"><span>{selectedDevice.energy || 0}</span><label>kWh</label></div>
            {selectedDevice.temperature !== undefined && (
              <div className="e-stat"><span>{selectedDevice.temperature}°C</span><label>Internal Temp</label></div>
            )}
          </div>
        </div>
      );
    };

    const isCurtain = selectedDevice.type === 'curtain';

    return (
      <div className="detail-view animate-slide-up">
        <header className="detail-header" style={{ marginBottom: '16px' }}>
          <div className="title-row">
            <div className="title-left">
              <button className="icon-back-btn" onClick={closeDeviceWithHistory} style={{ margin: 0 }}>
                <img src="/icons/icons/Arrow-White.svg" style={{width: 20, height: 20, transform: 'scaleX(-1)'}} />
              </button>
              <span className="device-icon-large">
                <img
                  src={getDeviceIconSrc(selectedDevice)}
                  alt={getDeviceIconLabel(selectedDevice)}
                  className="device-visual-icon large"
                />
              </span>
              <div className="device-meta">
                <h1>{selectedDevice.title}</h1>
                <span className="device-id">{selectedDevice.deviceId} • {selectedDevice.room}</span>
              </div>
              <button className="edit-settings-btn" onClick={() => openModalWithHistory(setConfiguringDevice, 'config', selectedDevice)}>
                <img src="/icons/icons/Settings-White.svg" style={{width: 18, height: 18}} />
              </button>
            </div>
            <div className={`status-pill ${selectedDevice.isOnline ? 'active' : ''}`}>
              {selectedDevice.isOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </header>

        <div className="detail-content">
          {/* Only Plugs (BSP) get the side panel for Timer/Schedule. Monitors use full width for their grids. */}
          <div className={`detail-main-grid ${isPlug ? 'has-side' : ''}`}>
            {/* Primary Controls */}
            <div className="control-section-group">
              {/* If it's a pure monitor, show metrics in the main column */}
              {(isThreePhase || isSinglePhase) && renderEnergyMetrics()}

              {/* Specialized Header for Lights with Power/Auto toggle */}
              {isLight && (
                <div className="control-card glass light-main-controls">
                  <div className="compact-power-header">
                    <div className="power-label-group">
                      <h3>Main Controls</h3>
                      <p className="status-subtext">{lightStatus ? 'Device is active' : 'Device is standby'}</p>
                    </div>
                    <div className="header-actions">
                      {selectedDevice.type === 'light' && (
                        <div className="auto-pill">
                          <img src="/icons/icons/Theme.svg" style={{width: 14, height: 14}} />
                          <span>{currentLux} lx</span>
                          <button
                            className={`mini-toggle ${autoMode ? 'active' : ''}`}
                            onClick={toggleAutoMode}
                          >
                            {autoMode ? 'Auto' : 'Manual'}
                          </button>
                        </div>
                      )}
                      <button
                        className={`power-pill-btn ${lightStatus ? 'active' : ''}`}
                        onClick={() => toggleLight(!lightStatus)}
                      >
                        <img src="/icons/icons/Power-White.svg" style={{width: 18, height: 18}} />
                        {lightStatus ? 'OFF' : 'ON'}
                      </button>
                    </div>
                  </div>

                  <div className={`light-adjustments ${autoMode ? 'disabled' : ''}`}>
                    {selectedDevice.type !== 'rgbw' && (
                      <div className="adjustment-row">
                        <div className="row-head">
                          <label>Brightness</label>
                          <span className="percent">{Math.round((brightness / 255) * 100)}%</span>
                        </div>
                        <div className="slider-wrapper">
                          <input
                            type="range" min="0" max="255" value={brightness}
                            disabled={autoMode}
                            onChange={(e) => handleBrightness(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {selectedDevice.type === 'rgbw' && (
                      <RGBWPanel
                        device={selectedDevice}
                        brightness={brightness}
                        setBrightness={setBrightness}
                        whiteIntensity={whiteIntensity}
                        setWhiteIntensity={setWhiteIntensity}
                        autoMode={autoMode}
                        toggleAutoMode={toggleAutoMode}
                        throttleEmit={throttleEmit}
                        socket={socket}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Keep large power button ONLY for Plugs/Switches */}
              {isPlug && (
                <div className="control-card glass">
                  <div className="card-header-row">
                    <h3>Power Control</h3>
                    <div className={`status-dot ${lightStatus ? 'active' : ''}`}></div>
                  </div>
                  <div className="power-interface">
                    <button
                      className={`master-power-btn ${lightStatus ? 'active' : ''}`}
                      onClick={() => toggleLight(!lightStatus)}
                    >
                      <img src="/icons/icons/Power-White.svg" style={{width: 48, height: 48}} />
                      <span>{lightStatus ? 'TAP TO TURN OFF' : 'TAP TO TURN ON'}</span>
                    </button>
                  </div>
                </div>
              )}

              {isCurtain && (
                <div className="control-card glass">
                  <h3>Curtain Controls</h3>
                  <div className="curtain-actions press-hold-mode">
                    <div className="curtain-action-pair">
                      <label>Manual Operation</label>
                      <button
                        className={`curtain-btn ${curtainMoving === 'opening' ? 'active' : ''}`}
                        onMouseDown={() => { handleCurtainAction(11); setCurtainMoving('opening'); }}
                        onMouseUp={() => { handleCurtainAction(10); setCurtainMoving(null); }}
                        onTouchStart={() => { handleCurtainAction(11); setCurtainMoving('opening'); }}
                        onTouchEnd={() => { handleCurtainAction(10); setCurtainMoving(null); }}
                      >
                        {curtainMoving === 'opening' ? 'OPENING...' : 'OPEN'}
                      </button>
                    </div>
                    <div className="curtain-action-pair">
                      <button
                        className={`curtain-btn ${curtainMoving === 'closing' ? 'active' : ''}`}
                        onMouseDown={() => { handleCurtainAction(21); setCurtainMoving('closing'); }}
                        onMouseUp={() => { handleCurtainAction(20); setCurtainMoving(null); }}
                        onTouchStart={() => { handleCurtainAction(21); setCurtainMoving('closing'); }}
                        onTouchEnd={() => { handleCurtainAction(20); setCurtainMoving(null); }}
                      >
                        {curtainMoving === 'closing' ? 'CLOSING...' : 'CLOSE'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isTouchPanel && (
                <div className="control-card glass full-width">
                  <div className="card-header-row">
                    <h3>Multi-Switch Panel</h3>
                    <button className="master-off-btn" onClick={() => socket.emit('touch_panel_all_off', { deviceId: selectedDevice.deviceId })}>All OFF</button>
                  </div>
                  <div className="touch-grid-detail">
                    {(selectedDevice.subDevices || []).map((sd) => (
                      <div key={sd.index} className={`touch-detail-item ${sd.on ? 'active' : ''}`}>
                        <div className="item-head">
                          <span className="icon">{sd.type === 'fan' ? '🌀' : '💡'}</span>
                          <button
                            className={`mini-power ${sd.on ? 'active' : ''}`}
                            onClick={() => socket.emit('touch_panel_action', {
                              deviceId: selectedDevice.deviceId,
                              subDeviceIndex: sd.index,
                              type: 'switch',
                              value: !sd.on
                            })}
                          >
                            <img src="/icons/icons/Power-White.svg" style={{width: 16, height: 16}} />
                          </button>
                        </div>
                        <span className="label">{sd.label}</span>
                        {sd.type === 'fan' && sd.on && (
                          <div className="fan-speed-control">
                            {[1, 2, 3, 4, 5].map(speed => (
                              <button
                                key={speed}
                                className={sd.speed === speed ? 'active' : ''}
                                onClick={() => socket.emit('touch_panel_action', {
                                  deviceId: selectedDevice.deviceId,
                                  subDeviceIndex: sd.index,
                                  type: 'fan',
                                  value: speed
                                })}
                              >
                                {speed}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Side Panels: Energy, Timer, Schedule - ONLY FOR PLUGS */}
            {isPlug && (
              <div className="detail-side-column">
                {renderEnergyMetrics()}

                <div className="control-card glass timer-card">
                  <div className="card-header-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3>Offline Timer</h3>
                      {timerInfo.remaining > 0 ? (
                        <span style={{ fontSize: '10px', padding: '2px 8px', background: 'var(--primary)', color: '#fff', borderRadius: '10px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span className="pulse-dot" style={{ width: '6px', height: '6px', background: '#fff', margin: 0 }}></span>
                          ACTIVE
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', padding: '2px 8px', background: 'var(--bg-main)', color: 'var(--text-muted)', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: '800' }}>
                          INACTIVE
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <select 
                        style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', background: 'var(--bg-main)', border: '1px solid var(--border)', color: 'var(--text-main)', outline: 'none' }}
                        value={timerTargetAction}
                        onChange={e => setTimerTargetAction(e.target.value)}
                      >
                        <option value="TOGGLE">Auto-Toggle</option>
                        <option value="ON">Turn ON</option>
                        <option value="OFF">Turn OFF</option>
                      </select>
                      <img src="/icons/icons/Theme.svg" style={{width: 18, height: 18}} />
                    </div>
                  </div>
                  <div className="timer-options">
                    {[5, 15, 30, 60, 0].map(mins => (
                      <button
                        key={mins}
                        className={`timer-btn ${timerInfo.remaining > 0 && mins === 0 ? 'cancel' : ''}`}
                        onClick={() => handleSetTimer(mins, timerTargetAction === 'TOGGLE' ? (lightStatus ? 'OFF' : 'ON') : timerTargetAction)}
                      >
                        {mins === 0 ? 'OFF' : `${mins}m`}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input
                      type="number"
                      placeholder="Custom Mins"
                      value={customMins}
                      onChange={(e) => setCustomMins(e.target.value)}
                      style={{ flex: 1, padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '14px', outline: 'none' }}
                      min="1"
                    />
                    <button
                      onClick={() => {
                        if (customMins && !isNaN(customMins)) {
                          handleSetTimer(customMins, timerTargetAction === 'TOGGLE' ? (lightStatus ? 'OFF' : 'ON') : timerTargetAction);
                          setCustomMins('');
                        }
                      }}
                      style={{ padding: '10px 20px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      SET
                    </button>
                  </div>
                  {timerInfo.remaining > 0 ? (
                    <div className="timer-status-active">
                      <span className="pulse-dot"></span>
                      Running: {Math.ceil(timerInfo.remaining / 60)} mins left (Will Turn {timerInfo.action || 'Toggle'})
                    </div>
                  ) : (
                    <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)', fontWeight: '600' }}>
                      No offline timer is currently set.
                    </div>
                  )}
                </div>

                <div className="control-card glass schedule-card">
                  <div className="card-header-row">
                    <h3>Schedules</h3>
                    <img src="/icons/icons/Insight-White.svg" style={{width: 18, height: 18}} />
                  </div>
                  <div className="schedules-list">
                    {(selectedDevice.schedules || []).length === 0 ? (
                      <p className="empty-text">No active schedules</p>
                    ) : (
                      selectedDevice.schedules.map(sch => (
                        <div key={sch.id} className="schedule-item-mini">
                          <div className="sch-info">
                            <span className="time">{sch.startTime} - {sch.endTime}</span>
                            <span className="days">{sch.days.join(', ')}</span>
                          </div>
                          <button className="del-sch" onClick={() => handleRemoveSchedule(sch.id)}>✕</button>
                        </div>
                      ))
                    )}
                  </div>
                  <button className="add-schedule-btn-mini" onClick={() => showToast('Scheduling tool coming soon...')}>+ Add Schedule</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSensorsSection = () => (
    <div className="dashboard-section animate-fade-in">
      <div className="section-header">
        <div>
          <h2>Custom Sensors</h2>
          <p>Real-time telemetry from custom MQTT topics</p>
        </div>
        <button className="primary-btn" onClick={() => openModalWithHistory(setIsSensorModalOpen, 'sensor')}>
          <img src="/icons/icons/Plus-White.svg" style={{width: 20, height: 20}} />
          Add Sensor
        </button>
      </div>
      
      <div className="devices-grid">
        {sensors.length === 0 ? (
          <div className="empty-state">
            <img src="/icons/icons/WIFI-White.svg" style={{width: 48, height: 48}} className="empty-icon" />
            <p>No sensors added yet</p>
            <button onClick={() => openModalWithHistory(setIsSensorModalOpen, 'sensor')}>Configure first sensor</button>
          </div>
        ) : (
          sensors.map(sensor => (
            <SensorCard 
              key={sensor._id} 
              sensor={sensor} 
              onRemove={handleRemoveSensor}
            />
          ))
        )}
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="dashboard-view animate-slide-up">
      <div className="welcome-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {currentRoom && (
            <button className="icon-back-btn" onClick={handleBackNavigation}>
              <img src="/icons/icons/Arrow-White.svg" style={{width: 20, height: 20, transform: 'scaleX(-1)'}} />
            </button>
          )}
          <div className="header-text">
            <h1>{currentRoom ? currentRoom.name : 'Welcome Home'}</h1>
            <p>{currentRoom ? `Managing ${devices.filter(d => d.room === (currentRoom ? currentRoom.name : d.room)).length} devices` : 'Everything is under control.'}</p>
          </div>
        </div>
        <div className="header-actions-group">
          {!currentRoom && (
            <>
              <button className="action-btn-pill secondary" onClick={() => openModalWithHistory(setIsRoomModalOpen, 'room')}>
                <img src="/icons/icons/Plus-White.svg" style={{width: 18, height: 18}} /> Add Room
              </button>
              <button className="action-btn-pill primary" onClick={() => openModalWithHistory(setIsModalOpen, 'device')}>
                <img src="/icons/icons/Plus-White.svg" style={{width: 18, height: 18}} /> Add Device
              </button>
            </>
          )}
        </div>
      </div>

      {!currentRoom ? (
        <div className="rooms-grid">
          {(() => {
            const dbRooms = Array.isArray(rooms) ? rooms : [];
            const devList = Array.isArray(devices) ? devices : [];
            const dynamicRooms = Array.from(new Set(devList.filter(d => d.isHomeAssistant && d.room).map(d => d.room)))
              .filter(roomName => roomName !== 'Unassigned' && roomName !== 'Home Assistant' && !dbRooms.find(r => r.name === roomName))
              .map(roomName => ({ name: roomName, icon: '🏠' }));
            
            return [...dbRooms, ...dynamicRooms].map(room => {
              const roomDevices = devList.filter(d => d.room === room.name && d.isConfigured);
              const activeCount = roomDevices.filter(d => d.on).length;
              return (
              <div key={room.name} className="room-card-wrapper">
                <div className="room-card glass card-hover" onClick={() => setRoomWithHistory(room)}>
                  <div className="room-card-header">
                    <span className="room-card-icon">{getRoomIcon(room.name)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className={`status-pill ${activeCount > 0 ? 'active' : ''}`}>
                        {activeCount > 0 && <span className="pulse-dot"></span>}
                        {activeCount} Active
                      </div>
                      <button
                        className="room-delete-btn"
                        title="Delete Room"
                        onClick={(e) => { e.stopPropagation(); handleRemoveRoom(room.name); }}
                      >
                        <img src="/icons/icons/Delete-White.svg" style={{width: 14, height: 14}} />
                      </button>
                    </div>
                  </div>
                  <div className="room-card-body">
                    <h3>{room.name}</h3>
                    <p>{roomDevices.length} Devices Registered</p>
                  </div>
                  <div className="room-card-footer">
                    <div className="view-link"><span>View Details</span><img src="/icons/icons/Insight-White.svg" style={{width: 14, height: 14}} /></div>
                  </div>
                </div>
              </div>
            );
          })})()}
        </div>
      ) : (
        <div className="devices-view-content animate-slide-up">
          {(() => {
            const roomSensors = (Array.isArray(sensors) ? sensors : []).filter(s => s.room === currentRoom.name);
            return (
              <>
                {roomSensors.length > 0 && (
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
                )}
                
                {(() => {
                  const roomPlayers = (Array.isArray(devices) ? devices : []).filter(d => d.room === currentRoom.name && d.type === 'media_player' && d.deviceClass !== 'tv');
                  const allMediaPlayers = (Array.isArray(devices) ? devices : []).filter(d => d.type === 'media_player');
                  
                  const normalizeEntityBase = (id) => (id || '').replace('media_player.', '').replace(/^mass_/, '').toLowerCase().trim();
                  const uniquePlayersMap = new Map();
                  
                  roomPlayers.forEach(p => {
                    const normTitle = (p.title || '').toLowerCase().trim();
                    const normBase = normalizeEntityBase(p.deviceId);
                    const titleLooksLikeEntityId = normTitle.includes('media_player.') || (normTitle.includes('_') && !normTitle.includes(' '));
                    
                    const existingByTitle = !titleLooksLikeEntityId && uniquePlayersMap.get('title:' + normTitle);
                    const existingByBase = uniquePlayersMap.get('base:' + normBase);
                    
                    if (existingByTitle) {
                      if (p.isMusicAssistant && !existingByTitle.isMusicAssistant) {
                        uniquePlayersMap.set('title:' + normTitle, p);
                        uniquePlayersMap.set('base:' + normalizeEntityBase(existingByTitle.deviceId), p);
                        uniquePlayersMap.set('base:' + normBase, p);
                      }
                    } else if (existingByBase) {
                      const existingTitleLooksRaw = (existingByBase.title || '').includes('_') && !(existingByBase.title || '').includes(' ');
                      if (p.isMusicAssistant && !existingByBase.isMusicAssistant) {
                        uniquePlayersMap.set('base:' + normBase, p);
                        if (!titleLooksLikeEntityId) uniquePlayersMap.set('title:' + normTitle, p);
                      } else if (!titleLooksLikeEntityId && existingTitleLooksRaw) {
                        uniquePlayersMap.set('base:' + normBase, p);
                        uniquePlayersMap.set('title:' + normTitle, p);
                      }
                    } else {
                      uniquePlayersMap.set('base:' + normBase, p);
                      if (!titleLooksLikeEntityId) uniquePlayersMap.set('title:' + normTitle, p);
                    }
                  });
                  
                  const seen = new Set();
                  const uniquePlayers = [];
                  for (const [key, p] of uniquePlayersMap) {
                    if (key.startsWith('base:') && !seen.has(p.deviceId)) {
                      seen.add(p.deviceId);
                      uniquePlayers.push(p);
                    }
                  }

                  return (
                    <div className="room-music-decks" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {uniquePlayers.map(player => (
                        <MusicDeck 
                          key={player.deviceId}
                          forcedPlayerId={player.deviceId}
                          socket={socket}
                          players={roomPlayers} 
                          allMediaPlayers={allMediaPlayers}
                          onCommand={handleMediaCommand} 
                        />
                      ))}
                    </div>
                  );
                })()}

                <div className="devices-grid">
                  {(Array.isArray(devices) ? devices : []).filter(d => d.room === currentRoom.name && d.isConfigured && d.type !== 'media_player').map(device => (
                    <DeviceCard
                      key={device.deviceId}
                      deviceId={device.deviceId}
                      title={device.title}
                      status={device.isOnline}
                      on={device.on}
                      icon={
                        <img
                          src={getDeviceIconSrc(device)}
                          alt={getDeviceIconLabel(device)}
                          className="device-visual-icon"
                        />
                      }
                      type={device.type}
                      onToggle={() => toggleLight(!device.on)}
                      onAction={(action) => {
                        if (action === 'navigate') openDeviceWithHistory(device);
                        else if (action === 'edit') openModalWithHistory(setConfiguringDevice, 'config', device);
                        else if (action === 'remove') handleRemoveDevice(device.deviceId);
                      }}
                    />
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );

  const renderDevicesView = () => (
    <div className="devices-view animate-slide-up">
      <div className="welcome-header">
        <div className="header-text">
          <h1>All Devices</h1>
          <p>Managing {devices.length} appliances across your home</p>
        </div>
        <div className="header-actions-group">
          <button className="action-btn-pill primary" onClick={() => openModalWithHistory(setIsModalOpen, 'device')}>
            <img src="/icons/icons/Plus-White.svg" style={{width: 18, height: 18}} /> Add Device
          </button>
        </div>
      </div>

      <div className="devices-grid">
        {devices.map(device => (
          <DeviceCard
            key={device.deviceId}
            deviceId={device.deviceId}
            title={device.title}
            status={device.isOnline}
            on={device.on}
            icon={
              <img
                src={getDeviceIconSrc(device)}
                alt={getDeviceIconLabel(device)}
                className="device-visual-icon"
              />
            }
            type={device.type}
            onToggle={() => toggleLight(!device.on)}
            onAction={(action) => {
              if (action === 'navigate') {
                openDeviceWithHistory(device);
              } else if (action === 'edit') {
                openModalWithHistory(setConfiguringDevice, 'config', device);
              } else if (action === 'remove') {
                handleRemoveDevice(device.deviceId);
              }
            }}
          />
        ))}
      </div>
    </div>
  );

  const renderSettingsView = () => (
    <div className="settings-view animate-slide-up">
      <div className="welcome-header">
        <div className="header-text">
          <h1>System Settings</h1>
          <p>Configure your smart home preferences</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="settings-card glass">
          <h3>🎨 Appearance</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="label">Dark Mode</span>
              <span className="desc">Switch between light and dark themes</span>
            </div>
            <button className={`toggle-switch ${isDarkMode ? 'on' : ''}`} onClick={() => setIsDarkMode(!isDarkMode)}>
              <span className="knob"></span>
            </button>
          </div>
        </div>

        <div className="settings-card glass">
          <h3>📡 System Status</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="label">MQTT Broker</span>
              <span className="desc">Real-time communication status</span>
            </div>
            <div className={`status-pill ${mqttStatus === 'Connected' ? 'active' : ''}`}>
              {mqttStatus}
            </div>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <span className="label">API Endpoint</span>
              <span className="desc">{API_BASE}</span>
            </div>
          </div>
        </div>

        <div className="settings-card glass">
          <h3>🏠 Room Management</h3>
          <div className="rooms-list-mini">
            {(Array.isArray(rooms) ? rooms : []).map(room => (
              <div key={room.name} className="room-item-mini">
                <span>{room.icon} {room.name}</span>
                <button className="delete-btn-mini" onClick={() => handleRemoveRoom(room.name)}>Remove</button>
              </div>
            ))}
          </div>
          <button className="add-room-btn glass" style={{ width: '100%', marginTop: '16px' }} onClick={() => openModalWithHistory(setIsRoomModalOpen, 'room')}>
            + Add New Room
          </button>
        </div>

        <div className="settings-card glass">
          <h3>ℹ️ About</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="label">Smart Home OS</span>
              <span className="desc">Version 2.4.0 (Stable Build)</span>
            </div>
          </div>
          <div className="setting-item">
            <p className="about-text">A professional-grade smart home management system designed for speed, security, and elegance.</p>
          </div>
        </div>
      </div>
    </div>
  );

  const pushDashboardHistory = (nextState) => {
    window.history.pushState({ ...(window.history.state || {}), ...nextState }, '');
  };

  const replaceDashboardHistory = (nextState) => {
    window.history.replaceState({ ...(window.history.state || {}), ...nextState }, '');
  };

  const resolveHistoryRoom = (roomName) => {
    if (!roomName) return null;
    const storedRoom = (Array.isArray(roomsRef.current) ? roomsRef.current : []).find((room) => room.name === roomName);
    if (storedRoom) return storedRoom;
    return { name: roomName, icon: '🏠' };
  };

  const resolveHistoryDevice = (deviceId) => {
    if (!deviceId) return null;
    return (Array.isArray(devicesRef.current) ? devicesRef.current : []).find((device) => device.deviceId === deviceId) || null;
  };

  // History and Back Button Management
  useEffect(() => {
    if (!window.history.state?.tab) {
      replaceDashboardHistory({
        tab: activeTab,
        panel: null,
        roomName: null,
        detailDeviceId: null,
        modal: null,
      });
    }

    const handlePopState = (e) => {
      const state = e.state || {};
      
      if (!state.modal) {
        setIsModalOpen(false);
        setIsRoomModalOpen(false);
        setIsSensorModalOpen(false);
        setConfiguringDevice(null);
      }
      
      setCurrentRoom(resolveHistoryRoom(state.roomName));
      setSelectedDevice(resolveHistoryDevice(state.detailDeviceId));
      
      if (state.tab) {
        setActiveTab(state.tab);
      } else {
        setActiveTab('dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab]);

  const openModalWithHistory = (setter, modalName, value = true) => {
    pushDashboardHistory({
      modal: modalName,
      scenesRoom: null,
      scenesModal: null,
    });
    setter(value);
  };

  const closeModalWithHistory = (setter, modalName, nullValue = false) => {
    setter(nullValue);
    if (window.history.state?.modal === modalName) {
      window.history.back();
    }
  };

  // Unified navigation handler
  const handleTabChange = (tabId) => {
    if (tabId === activeTab) return;

    const nextHistoryState = {
      tab: tabId,
      panel: null,
      roomName: null,
      detailDeviceId: null,
      modal: null,
      scenesRoom: null,
      scenesModal: null,
    };

    pushDashboardHistory(nextHistoryState);

    setActiveTab(tabId);
    setSelectedDevice(null);
    setCurrentRoom(null);
    setSearchQuery('');
    setConfiguringDevice(null);
    setIsModalOpen(false);
    setIsRoomModalOpen(false);
    setIsSensorModalOpen(false);
  };

  const setRoomWithHistory = (room) => {
    pushDashboardHistory({
      tab: activeTab,
      panel: 'room',
      roomName: room.name,
      detailDeviceId: null,
      modal: null,
      scenesRoom: null,
      scenesModal: null,
    });
    setCurrentRoom(room);
    setSelectedDevice(null);
  };

  const openDeviceWithHistory = (device) => {
    pushDashboardHistory({
      tab: activeTab,
      panel: 'device',
      roomName: currentRoom?.name || null,
      detailDeviceId: device.deviceId,
      modal: null,
      scenesRoom: null,
      scenesModal: null,
    });
    setSelectedDevice(device);
  };

  const closeDeviceWithHistory = () => {
    setSelectedDevice(null);
    if (window.history.state?.detailDeviceId) {
      window.history.back();
    }
  };

  const handleBackNavigation = () => {
    if (window.history.state?.roomName || window.history.state?.detailDeviceId) {
      window.history.back();
      return;
    }
    if (currentRoom) setCurrentRoom(null);
  };

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={handleTabChange} isMobileOpen={isMobileSidebarOpen} onMobileClose={() => setIsMobileSidebarOpen(false)} />
      <main className="content">
        <header className="top-bar glass">
          <div className="top-bar-left">
            <button className="mobile-menu-toggle" onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}>
              <img src={isDarkMode ? "/icons/icons/Menu-White.svg" : "/icons/icons/Menu.svg"} style={{width: 24, height: 24}} />
            </button>
            <div className="search-bar">
              <img src={isDarkMode ? "/icons/icons/Insight-White.svg" : "/icons/icons/Insight.svg"} style={{width: 18, height: 18}} />
              <input
                type="text"
                placeholder="Search devices, rooms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="status-chips">
            <button className="theme-toggle-btn" onClick={() => setIsDarkMode(!isDarkMode)}>
              <img src="/icons/icons/Theme.svg" style={{width: 20, height: 20}} />
            </button>
            <div className={`status-badge ${mqttStatus === 'Connected' ? 'success' : 'warning'}`}>
              <span className="dot"></span>
              {mqttStatus === 'Connected' ? 'Live' : 'Connecting'}
            </div>
            <div className="profile-chip">
              <img src="https://api.dicebear.com/9.x/thumbs/svg?seed=Luna" alt="Avatar" />
              <div className="profile-info">
                <span className="name">Admin</span>
              </div>
            </div>
          </div>
        </header>
        <div className="view-container">
          {searchQuery ? (
            <div className="search-results animate-slide-up">
              <div className="welcome-header">
                <div className="header-text">
                  <h1>Search Results</h1>
                  <p>Found {filteredDevices.length} devices matching "{searchQuery}"</p>
                </div>
                <button className="action-btn-pill secondary" onClick={() => setSearchQuery('')}>Clear Search</button>
              </div>
              <div className="devices-grid">
                {(Array.isArray(filteredDevices) ? filteredDevices : []).map(device => (
                  <DeviceCard
                    key={device.deviceId}
                    deviceId={device.deviceId}
                    title={device.title}
                    status={device.isOnline}
                    on={device.on}
                    icon={
                      <img
                        src={getDeviceIconSrc(device)}
                        alt={getDeviceIconLabel(device)}
                        className="device-visual-icon"
                      />
                    }
                    type={device.type}
                    onToggle={() => toggleLight(!device.on)}
                    onAction={(action) => {
                      if (action === 'navigate') openDeviceWithHistory(device);
                      else if (action === 'edit') openModalWithHistory(setConfiguringDevice, 'config', device);
                      else if (action === 'remove') handleRemoveDevice(device.deviceId);
                    }}
                  />
                ))}
              </div>
            </div>
          ) : selectedDevice ? (
            renderDetailView()
          ) : (
            <>
              {activeTab === 'dashboard' && renderDashboard()}
              {activeTab === 'scenes' && <Scenes socket={socket} rooms={rooms} allDevices={devices} sensors={sensors} onAddRoom={handleAddRoom} />}
              {activeTab === 'sensors' && renderSensorsSection()}
              {activeTab === 'devices' && renderDevicesView()}
              {activeTab === 'audio-devices' && <AudioDevicesTab socket={socket} allMediaPlayers={(Array.isArray(devices) ? devices : []).filter(d => d.type === 'media_player')} />}
              {activeTab === 'staircase' && <Staircase socket={socket} mqttStatus={mqttStatus} />}
              {activeTab === 'surveillance' && <Surveillance />}
              {activeTab === 'settings' && renderSettingsView()}
            </>
          )}
        </div>
      </main>
      <AddSensorModal 
        isOpen={isSensorModalOpen} 
        onClose={() => closeModalWithHistory(setIsSensorModalOpen, 'sensor')}
        onAdd={handleAddSensor}
        rooms={rooms}
      />
      <ProvisioningModal isOpen={isModalOpen} onClose={() => closeModalWithHistory(setIsModalOpen, 'device')} onFinish={handleAddDevice} />
      <AddRoomModal isOpen={isRoomModalOpen} onClose={() => closeModalWithHistory(setIsRoomModalOpen, 'room')} onAdd={handleAddRoom} />
      <ConfigureDeviceModal isOpen={!!configuringDevice} device={configuringDevice} onClose={() => closeModalWithHistory(setConfiguringDevice, 'config', null)} onConfigure={handleConfigureDevice} />
      {toast && <div className="toast"><span>💡</span> {toast}</div>}
    </div>
  );
};


const AppRouter = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route path="/music" element={
            <ProtectedRoute>
              <MusicHome />
            </ProtectedRoute>
          } />
      </Routes>
    </BrowserRouter>
  );
};

export default AppRouter;

