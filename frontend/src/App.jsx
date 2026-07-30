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
  if (response.status === 202) {
    const approval = await response.clone().json().catch(() => ({}));
    window.dispatchEvent(new CustomEvent('adult-approval-required', { detail: approval }));
    return new Response(JSON.stringify(approval), {
      status: 409,
      headers: { 'Content-Type': 'application/json' }
    });
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
import RGBWScheduler from './components/RGBWScheduler';
import TunableBrightnessControl from './components/TunableBrightnessControl';
import Scenes from './components/Scenes';
import ConfigureDeviceModal from './components/ConfigureDeviceModal';
import TouchSwitchSettingsModal from './components/TouchSwitchSettingsModal';
import CustomOffModal from './components/CustomOffModal';
import ProvisioningModal from './components/ProvisioningModal';
import AddRoomModal from './components/AddRoomModal';
import SensorCard from './components/SensorCard';
import AddSensorModal from './components/AddSensorModal';
import MusicDeck from './components/MusicDeck';
import Staircase from './components/Staircase';
import MusicHome from './components/MusicHome';
import AudioDevicesTab from './components/AudioDevicesTab';
import { getDefaultDeviceIconSrc, getDeviceIconLabel, getDeviceIconSrc, getDeviceIconText } from './deviceIcons';
import Surveillance from './components/Surveillance';
import WaterTanksPage from './components/WaterTanksPage';
import { deviceBelongsToRoom, getRoomOptionLabel, getRoomType } from './roomUtils';
import ProfilePage, { Avatar } from './components/ProfilePage';

// Dynamic API Base URL for network access
const API_BASE = `http://${window.location.hostname}:3000`;
const HEARTBEAT_WAIT_MS = 30 * 1000;
const HEARTBEAT_STALE_MS = 30 * 1000;
const getConnectivityLabel = (device, labels = {}) => {
  if (device?.connectivityStatus === 'waiting') return labels.waiting || 'Waiting for WiFi status';
  if (device?.connectivityStatus === 'connected' || device?.isOnline) return labels.connected || 'Connected';
  return labels.disconnected || 'Check WiFi Connection';
};

const formatAutomationRunTime = value => {
  if (!value) return 'Not run yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not run yet';
  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatAutomationType = preset => {
  if (preset?.executionMode === 'timer') return `Timer · ${preset.timerMinutes || 0} min ${preset.timerSeconds || 0} sec`;
  if (preset?.executionMode === 'schedule') return `Schedule · ${preset.scheduleTime || '--:--'}`;
  return 'Manual';
};

const formatTimerRemaining = (preset, now = Date.now()) => {
  if (preset?.executionMode !== 'timer' || !preset.enabled || !preset.nextRunAt) return null;
  const targetTime = new Date(preset.nextRunAt).getTime();
  if (Number.isNaN(targetTime)) return null;
  const totalSeconds = Math.max(0, Math.ceil((targetTime - now) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const isTouchPanelDevice = device => Boolean(device) && (
  device.type === 'touch-panel'
  || device.type === 'retro-fit'
  || (Array.isArray(device.subDevices) && device.subDevices.length > 0)
  || /^BS(?:Q|4)/i.test(String(device.deviceId || ''))
);

const buildRoomSwitchCollection = (room, sourceDevices = [], panelType = 'touch-panel') => {
  const panels = sourceDevices.filter(device =>
    deviceBelongsToRoom(device, room) && device.isConfigured && device.type === panelType
  );
  if (panels.length === 0) return null;
  const isRetroFit = panelType === 'retro-fit';
  const subDevices = panels.flatMap(panel => (panel.subDevices || []).map(channel => ({
    ...channel,
    panelDeviceId: panel.deviceId,
    panelTitle: panel.title || panel.deviceId,
    panelOnline: Boolean(panel.isOnline),
    panelConnectivityStatus: panel.connectivityStatus || (panel.isOnline ? 'connected' : 'disconnected'),
    key: `${panel.deviceId}:${channel.index}`
  })));

  return {
    deviceId: `room-switches:${panelType}:${room.name}`,
    title: `${room.name} ${isRetroFit ? 'Retro Fit' : 'Touch Switches'}`,
    type: 'room-switches',
    icon: isRetroFit ? '/icons/icons/switch.png' : '/icons/devices/touch_panel.png',
    room: room.name,
    roomId: room._id,
    panelType,
    isConfigured: true,
    isOnline: panels.length > 0 && panels.some(panel => panel.isOnline),
    connectivityStatus: panels.length === 0
      ? 'waiting'
      : panels.some(panel => panel.isOnline) ? 'connected' : 'disconnected',
    on: subDevices.some(channel => channel.on),
    panels,
    subDevices
  };
};

const DASHBOARD_TABS = new Set([
  'dashboard', 'devices', 'sensors', 'scenes', 'audio-devices',
  'staircase', 'water-level', 'surveillance', 'profile', 'settings'
]);

const readDashboardRoute = () => {
  const parts = window.location.pathname.split('/').filter(Boolean).map(part => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });

  if (parts[0] !== 'dashboard') return { tab: 'dashboard' };
  if (parts[1] === 'room' && parts[2]) {
    return { tab: 'dashboard', panel: 'room', roomName: parts.slice(2).join('/') };
  }
  if (parts[1] === 'device' && parts[2]) {
    return { tab: 'devices', panel: 'device', detailDeviceId: parts.slice(2).join('/') };
  }
  if (parts[1] === 'water-tank' && parts[2]) {
    return { tab: 'water-level', panel: 'water-tank', waterTankId: parts.slice(2).join('/') };
  }
  return { tab: DASHBOARD_TABS.has(parts[1]) ? parts[1] : 'dashboard' };
};

const getDashboardUrl = (state = {}) => {
  if (state.detailDeviceId) return `/dashboard/device/${encodeURIComponent(state.detailDeviceId)}`;
  if (state.roomName) return `/dashboard/room/${encodeURIComponent(state.roomName)}`;
  if (state.waterTankId) return `/dashboard/water-tank/${encodeURIComponent(state.waterTankId)}`;
  return state.tab && state.tab !== 'dashboard'
    ? `/dashboard/${encodeURIComponent(state.tab)}`
    : '/dashboard';
};

// Socket connection
export const socket = io(API_BASE, {
  path: '/socket.io/',
  autoConnect: false,
  auth: callback => callback({ token: localStorage.getItem('smarthome_token') })
});

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState(() => window.history.state?.tab || readDashboardRoute().tab);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [selectedWaterTankId, setSelectedWaterTankId] = useState(null);
  const [lightStatus, setLightStatus] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [whiteIntensity, setWhiteIntensity] = useState(0);
  const [autoMode, setAutoMode] = useState(false);
  const [currentLux, setCurrentLux] = useState(0);
  const [mqttStatus, setMqttStatus] = useState('Syncing...');
  const [devices, setDevices] = useState([]);
  const [pendingDevices, setPendingDevices] = useState([]);
  const [pendingSensors, setPendingSensors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isSensorModalOpen, setIsSensorModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [editingSensor, setEditingSensor] = useState(null);
  const [configuringDevice, setConfiguringDevice] = useState(null);
  const [editingRoomSwitch, setEditingRoomSwitch] = useState(null);
  const [isCustomOffOpen, setIsCustomOffOpen] = useState(false);
  const [editingCustomOff, setEditingCustomOff] = useState(null);
  const [customOffPresets, setCustomOffPresets] = useState([]);
  const [runningAutomationId, setRunningAutomationId] = useState(null);
  const [stoppingAutomationId, setStoppingAutomationId] = useState(null);
  const [automationDeviceLocks, setAutomationDeviceLocks] = useState({});
  const [automationClock, setAutomationClock] = useState(Date.now());
  const [provisioningInitialType, setProvisioningInitialType] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [sensors, setSensors] = useState([]);
  const [timerInfo, setTimerInfo] = useState({ remaining: 0, action: null });
  const [timerTargetAction, setTimerTargetAction] = useState('OFF');
  const [customMins, setCustomMins] = useState('');
  const [customSeconds, setCustomSeconds] = useState('');
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState({
    startTime: '08:00',
    endTime: '18:00',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    startAction: 'ON',
    endAction: 'OFF'
  });
  const [metrics, setMetrics] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [curtainMoving, setCurtainMoving] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef(null);
  const searchInputRef = useRef(null);
  const lastHeaderScrollYRef = useRef(0);
  const headerScrollFrameRef = useRef(null);
  const headerTouchYRef = useRef(null);
  const headerRevealLockRef = useRef(0);
  const lastNonProfileTabRef = useRef('dashboard');
  const timerDeadlineRef = useRef(null);
  const timerDeviceIdRef = useRef(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [profile, setProfile] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    const hasActiveTimer = customOffPresets.some(preset =>
      preset.executionMode === 'timer' && preset.enabled && preset.nextRunAt
    );
    if (!hasActiveTimer) return undefined;
    setAutomationClock(Date.now());
    const intervalId = window.setInterval(() => setAutomationClock(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [customOffPresets]);

  useEffect(() => {
    lastHeaderScrollYRef.current = Math.max(
      document.scrollingElement?.scrollTop ?? window.scrollY,
      0
    );

    const handleScroll = () => {
      if (headerScrollFrameRef.current !== null) return;

      headerScrollFrameRef.current = window.requestAnimationFrame(() => {
        const currentScrollY = Math.max(
          document.scrollingElement?.scrollTop ?? window.scrollY,
          0
        );
        const previousScrollY = lastHeaderScrollYRef.current;
        const movement = currentScrollY - previousScrollY;

        if (currentScrollY <= 24) {
          setIsHeaderHidden(false);
        } else if (movement < 0) {
          headerRevealLockRef.current = performance.now() + 280;
          setIsHeaderHidden(false);
        } else if (movement > 2 && performance.now() >= headerRevealLockRef.current) {
          setIsHeaderHidden(true);
        }

        lastHeaderScrollYRef.current = currentScrollY;
        headerScrollFrameRef.current = null;
      });
    };

    const handleWheel = event => {
      if (event.deltaY < 0) {
        headerRevealLockRef.current = performance.now() + 280;
        setIsHeaderHidden(false);
      }
      const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY;
      if (event.deltaY > 2 && scrollTop > 24 && performance.now() >= headerRevealLockRef.current) {
        setIsHeaderHidden(true);
      }
    };

    const handleTouchStart = event => {
      headerTouchYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = event => {
      const currentTouchY = event.touches[0]?.clientY;
      const previousTouchY = headerTouchYRef.current;
      if (currentTouchY == null || previousTouchY == null) return;

      const movement = currentTouchY - previousTouchY;
      if (movement > 0.5) {
        headerRevealLockRef.current = performance.now() + 280;
        setIsHeaderHidden(false);
      }
      const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY;
      if (movement < -2 && scrollTop > 24 && performance.now() >= headerRevealLockRef.current) {
        setIsHeaderHidden(true);
      }
      headerTouchYRef.current = currentTouchY;
    };

    const handleTouchEnd = () => {
      headerTouchYRef.current = null;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('wheel', handleWheel, { passive: true });
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('wheel', handleWheel);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      if (headerScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(headerScrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!profile || profile.role === 'admin' || activeTab === 'profile') return;
    if (activeTab !== 'dashboard' && !(profile.permissions || []).includes(activeTab)) {
      setActiveTab((profile.permissions || [])[0] || 'profile');
    }
  }, [profile, activeTab]);

  useEffect(() => {
    if (profile?.role !== 'admin' && profile?.accountType !== 'adult') return undefined;
    let active = true;
    const loadApprovalNotifications = async () => {
      try {
        const response = await fetchWithAuth(`${API_BASE}/api/auth/change-requests`);
        const requests = await response.json();
        if (!active || !Array.isArray(requests)) return;
        const approvalNotifications = requests.map(request => ({
          id: `approval-${request._id}`,
          requestId: request._id,
          title: `${request.requestedBy?.name || request.requestedBy?.username || 'Kid'} needs approval`,
          message: `${request.method === 'POST' ? 'Add' : request.method === 'PUT' ? 'Edit' : 'Remove'} ${request.resource}`,
          roomName: request.body?.room || null,
          resource: request.resource,
          type: 'approval'
        }));
        setNotifications(previous => [
          ...approvalNotifications,
          ...previous.filter(item => item.type !== 'approval')
        ].slice(0, 20));
      } catch {
        // Approval alerts will refresh on the next interval.
      }
    };
    loadApprovalNotifications();
    const intervalId = window.setInterval(loadApprovalNotifications, 15000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [profile?.role, profile?.accountType]);

  useEffect(() => {
    if (!isModalOpen) setProvisioningInitialType(null);
  }, [isModalOpen]);

  useEffect(() => {
    if (!profile) {
      setPendingDevices([]);
      setPendingSensors([]);
      return undefined;
    }
    let active = true;
    const loadPendingItems = async () => {
      try {
        const endpoint = profile.accountType === 'child' ? 'my-change-requests' : 'change-requests';
        const response = await fetchWithAuth(`${API_BASE}/api/auth/${endpoint}`);
        const requests = await response.json();
        if (!active || !Array.isArray(requests)) return;
        setPendingDevices(requests
          .filter(request => request.resource === 'devices' && request.method === 'POST' && ['pending', 'approved'].includes(request.status))
          .map(request => ({
            ...request.body,
            deviceId: request.body?.deviceId || `pending-${request._id}`,
            title: request.body?.title || 'New device',
            room: request.body?.room || 'Unassigned',
            isConfigured: true,
            isOnline: false,
            approvalStatus: request.status,
            approvalRequestId: request._id,
            requestedByName: request.requestedBy?.name || request.requestedBy?.username || null
          })));
        setPendingSensors(requests
          .filter(request => request.resource === 'sensors' && request.method === 'POST' && ['pending', 'approved'].includes(request.status))
          .map(request => ({
            ...request.body,
            _id: `pending-${request._id}`,
            approvalStatus: request.status,
            approvalRequestId: request._id,
            requestedByName: request.requestedBy?.name || request.requestedBy?.username || null
          })));
        if (requests.some(request => request.resource === 'devices' && request.status === 'executed')) {
          fetchDevices();
        }
        if (requests.some(request => request.resource === 'sensors' && request.status === 'executed')) {
          fetchSensors();
        }
      } catch {
        // Pending cards refresh on the next interval.
      }
    };
    loadPendingItems();
    const intervalId = window.setInterval(loadPendingItems, 10000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [profile?.role, profile?.accountType]);

  useEffect(() => {
    if (!isNotificationsOpen) return undefined;
    const closeOnOutsidePress = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (selectedDevice) {
      if (selectedDevice.type === 'room-switches') {
        const room = rooms.find(item => item.name === selectedDevice.room) || { name: selectedDevice.room };
        setSelectedDevice(buildRoomSwitchCollection(
          room,
          devices,
          selectedDevice.panelType || 'touch-panel'
        ));
        return;
      }
      const updated = devices.find(d => d.deviceId === selectedDevice.deviceId);
      if (updated) {
        if (updated.type === 'rgbw' && !isInteracting.current) setWhiteIntensity(0);
        setSelectedDevice(updated);
      }
    }
  }, [devices]);

  useEffect(() => {
    if (selectedDevice?.type !== 'room-switches') {
      setCustomOffPresets([]);
      return;
    }
    let active = true;
    fetchWithAuth(`${API_BASE}/api/switch-off-presets?room=${encodeURIComponent(selectedDevice.room)}`)
      .then(response => response.ok ? response.json() : [])
      .then(data => { if (active) setCustomOffPresets(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setCustomOffPresets([]); });
    return () => { active = false; };
  }, [selectedDevice?.room, selectedDevice?.type]);

  const visibleDevices = [
    ...devices,
    ...pendingDevices.filter(pending => !devices.some(device => device.deviceId === pending.deviceId))
  ];
  const filteredDevices = visibleDevices.filter(d =>
    d.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.deviceId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.room?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const reviewApprovalRequest = async (requestId, decision) => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/api/auth/change-requests/${requestId}/${decision}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) return showToast(data.message || 'Could not review request');
      setPendingDevices(previous => previous.filter(device => device.approvalRequestId !== requestId));
      setPendingSensors(previous => previous.filter(sensor => sensor.approvalRequestId !== requestId));
      setNotifications(previous => previous.filter(item => item.requestId !== requestId));
      await Promise.all([fetchDevices(), fetchSensors(), fetchRooms()]);
      showToast(decision === 'approve' ? 'Request approved' : 'Request rejected');
    } catch (err) {
      showToast(err.message || 'Could not review request');
    }
  };

  const openApprovalCard = (request) => {
    const requestId = request.requestId || request._id;
    const resource = request.resource;
    const roomName = request.roomName || request.body?.room || null;
    const focusCard = () => {
      const card = document.getElementById(`approval-card-${requestId}`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.classList.remove('approval-card-focus');
      window.requestAnimationFrame(() => card?.classList.add('approval-card-focus'));
    };
    if (resource === 'sensors') {
      handleTabChange('sensors');
      window.setTimeout(focusCard, 200);
      return;
    }
    const targetRoom = (Array.isArray(rooms) ? rooms : []).find(room => room.name === roomName);
    if (targetRoom) {
      handleTabChange('dashboard');
      window.setTimeout(() => {
        setRoomWithHistory(targetRoom);
        window.setTimeout(focusCard, 200);
      }, 50);
      return;
    }
    if (resource === 'devices') {
      handleTabChange('devices');
      window.setTimeout(focusCard, 200);
      return;
    }
    handleTabChange('profile');
  };

  useEffect(() => {
    const showApprovalNotice = event => showToast(event.detail?.message || 'An adult must approve this change');
    window.addEventListener('adult-approval-required', showApprovalNotice);
    return () => window.removeEventListener('adult-approval-required', showApprovalNotice);
  }, []);

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
  const currentRoomRef = useRef(currentRoom);

  useEffect(() => {
    sensorsRef.current = sensors;
  }, [sensors]);

  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  useEffect(() => {
    devicesRef.current = devices;
    const activeDeviceIds = new Set((Array.isArray(devices) ? devices : []).map(device => device.deviceId));
    setNotifications(previous => previous.filter(notification => !notification.deviceId || activeDeviceIds.has(notification.deviceId)));
  }, [devices]);

  useEffect(() => {
    (Array.isArray(devices) ? devices : [])
      .filter(device => device.type === 'water-tank')
      .forEach(device => socket.emit('wli_subscribe', { deviceId: device.deviceId }));
  }, [devices]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    if (!socket.connected) socket.connect();
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
          const lastSeenAt = dbDev.lastSeen ? new Date(dbDev.lastSeen).getTime() : 0;
          const databaseHeartbeatIsFresh =
            Number.isFinite(lastSeenAt) &&
            lastSeenAt > 0 &&
            Date.now() - lastSeenAt < HEARTBEAT_STALE_MS;
          const databaseState = dbDev.isHomeAssistant || dbDev.type === 'water-tank'
            ? dbDev
            : {
                ...dbDev,
                isOnline: databaseHeartbeatIsFresh,
                connectivityStatus: databaseHeartbeatIsFresh ? 'connected' : 'disconnected',
                heartbeatReceivedAt: databaseHeartbeatIsFresh ? lastSeenAt : 0,
                connectivityCheckedAt: Date.now()
              };

          if (liveState) {
            const liveHeartbeatAt = liveState.heartbeatReceivedAt || 0;
            const preserveLiveHeartbeat =
              liveState.connectivityStatus === 'connected' &&
              liveHeartbeatAt > lastSeenAt &&
              Date.now() - liveHeartbeatAt < HEARTBEAT_STALE_MS;
            return {
              ...databaseState,
              ...liveState,
              title: dbDev.title, // Keep custom DB title
              room: dbDev.room,   // Keep custom DB room
              icon: dbDev.icon,   // Keep custom DB icon
              isOnline: preserveLiveHeartbeat ? true : databaseState.isOnline,
              connectivityStatus: preserveLiveHeartbeat
                ? 'connected'
                : databaseState.connectivityStatus,
              heartbeatReceivedAt: preserveLiveHeartbeat
                ? liveHeartbeatAt
                : databaseState.heartbeatReceivedAt
            };
          }
          return databaseState;
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

  const fetchProfile = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/auth/me`);
      if (!res.ok) return;
      setProfile(await res.json());
    } catch (err) {
      console.error('Failed to fetch profile', err);
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
      else {
        const data = await res.json();
        if (data.approvalRequired) {
          setPendingSensors(previous => [
            { ...sensorData, _id: `pending-${data.requestId}`, approvalStatus: 'pending', approvalRequestId: data.requestId },
            ...previous.filter(sensor => sensor.topic !== sensorData.topic)
          ]);
          showToast('Sensor is waiting for parent approval');
        } else showToast(data.message || 'Could not submit the sensor');
      }
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

  const handleUpdateSensor = async (id, sensorData) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/sensors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sensorData)
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Could not update sensor');
      setEditingSensor(null);
      fetchSensors();
      showToast('Sensor settings saved');
    } catch (err) {
      showToast(err.message);
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

  const handleUpdateRoom = async (id, roomData) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/rooms/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roomData)
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Could not update room');
      setEditingRoom(null);
      await Promise.all([fetchRooms(), fetchDevices()]);
      showToast('Room settings saved');
    } catch (err) {
      showToast(err.message);
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
        const updatedDevice = await res.json();
        setDevices(previous => (Array.isArray(previous) ? previous : []).map(device =>
          device.deviceId === deviceId ? updatedDevice : device
        ));
        if (selectedDevice?.deviceId === deviceId) {
          setSelectedDevice(updatedDevice);
          const nextState = {
            ...(window.history.state || {}),
            detailDeviceId: updatedDevice.deviceId
          };
          window.history.replaceState(nextState, '', getDashboardUrl(nextState));
        }
        fetchDevices();
        setConfiguringDevice(null);
        showToast('Device settings saved');
      } else {
        const error = await res.json().catch(() => ({}));
        showToast(error.message || 'Could not update device');
      }
    } catch (err) {
      console.error('Failed to configure device', err);
    }
  };

  const handleRoomSwitchSettingsSave = async changes => {
    const channel = editingRoomSwitch;
    const panel = devices.find(device => device.deviceId === channel?.panelDeviceId);
    if (!panel || !channel) return;
    const subDevices = (panel.subDevices || []).map(item =>
      Number(item.index) === Number(channel.index) ? { ...item, ...changes } : item
    );
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/devices/${panel.deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...panel, subDevices })
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        showToast(error.message || 'Could not update switch');
        return;
      }
      const updatedPanel = await res.json();
      setDevices(previous => previous.map(device =>
        device.deviceId === panel.deviceId ? { ...device, ...updatedPanel } : device
      ));
      setEditingRoomSwitch(null);
      showToast('Switch settings saved');
    } catch (error) {
      showToast(error.message || 'Could not update switch');
    }
  };

  const handleCustomOffSave = async preset => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/api/switch-off-presets${preset._id ? `/${preset._id}` : ''}`, {
        method: preset._id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preset)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        showToast(error.message || 'Could not save automation');
        return;
      }
      const created = await response.json();
      setCustomOffPresets(current => preset._id
        ? current.map(item => item._id === created._id ? created : item)
        : [created, ...current]
      );
      setIsCustomOffOpen(false);
      setEditingCustomOff(null);
      showToast(preset._id ? 'Automation updated' : 'Automation created');
    } catch (error) {
      showToast(error.message || 'Could not save automation');
    }
  };

  const handleCustomOffDelete = async preset => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/api/switch-off-presets/${preset._id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        showToast(error.message || 'Could not delete automation');
        return;
      }
      setCustomOffPresets(current => current.filter(item => item._id !== preset._id));
      setIsCustomOffOpen(false);
      setEditingCustomOff(null);
      showToast('Automation deleted');
    } catch (error) {
      showToast(error.message || 'Could not delete automation');
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

  const handleRemoveRoom = async (room) => {
    if (!window.confirm(`Are you sure you want to remove "${getRoomOptionLabel(room)}"? Devices in this room will become Unassigned.`)) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/rooms/${room._id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchRooms();
        fetchDevices();
        if (currentRoom?._id === room._id) setCurrentRoom(null);
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
      } else {
        const data = await res.json();
        if (data.approvalRequired) {
          setPendingDevices(previous => [
            {
              ...deviceData,
              isConfigured: true,
              isOnline: false,
              approvalStatus: 'pending',
              approvalRequestId: data.requestId
            },
            ...previous.filter(device => device.deviceId !== deviceData.deviceId)
          ]);
          showToast('Device is waiting for parent approval');
        } else showToast(data.message || 'Could not submit the device');
      }
    } catch (err) {
      console.error('Failed to provision device', err);
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchRooms();
    fetchSensors();
    fetchProfile();

    // REMOVED 5-second polling loop which caused massive UI lag and slider jumping.
    // We now rely entirely on the fast WebSocket events for real-time updates!
    
    const handleMqttStatus = (data) => setMqttStatus(data.status);
    const syncMqttStatus = () => {
      socket.emit('request_mqtt_status', (data) => {
        if (data?.status) setMqttStatus(data.status);
      });
    };
    const handleSocketDisconnect = () => setMqttStatus('Offline');

    socket.on('mqtt_status', handleMqttStatus);
    socket.on('connect', syncMqttStatus);
    socket.on('disconnect', handleSocketDisconnect);
    if (socket.connected) syncMqttStatus();
    
    socket.on('device_state_update', (updatedDevice) => {
      const receivedHeartbeat = updatedDevice.connectivityStatus === 'connected';
      setDevices(prev => (Array.isArray(prev) ? prev : []).map(d => {
        if (d.deviceId !== updatedDevice.deviceId) return d;
        return {
          ...d,
          ...updatedDevice,
          isOnline: receivedHeartbeat ? true : d.isOnline,
          connectivityStatus: receivedHeartbeat ? 'connected' : d.connectivityStatus,
          heartbeatReceivedAt: receivedHeartbeat ? Date.now() : d.heartbeatReceivedAt
        };
      }));
      setSelectedDevice(current => {
        if (current?.deviceId !== updatedDevice.deviceId) return current;
        if (isInteracting.current) {
          return {
            ...current,
            ...(receivedHeartbeat ? {
              isOnline: true,
              connectivityStatus: 'connected',
              heartbeatReceivedAt: Date.now()
            } : {}),
            ...(updatedDevice.brightnessReportedAt ? {
              brightness: updatedDevice.brightness,
              brightnessReportedAt: updatedDevice.brightnessReportedAt
            } : {})
          };
        }
          const next = {
            ...current,
            ...updatedDevice,
            isOnline: receivedHeartbeat ? true : current.isOnline,
            connectivityStatus: receivedHeartbeat ? 'connected' : current.connectivityStatus,
            heartbeatReceivedAt: receivedHeartbeat ? Date.now() : current.heartbeatReceivedAt
          };
          if (next.type === 'rgbw') setWhiteIntensity(0);
          return next;
      });
    });

    socket.on('custom_sensor_update', (updatedSensor) => {
      setSensors(prev => (Array.isArray(prev) ? prev : []).map(s => s._id === updatedSensor._id ? updatedSensor : s));
    });

    socket.on('toast_message', (msg) => {
      showToast(msg);
    });

    const automationCommandLabel = command => ({
      turn_on: 'Turned ON',
      turn_off: 'Turned OFF',
      set_brightness: 'Brightness changed',
      set_color: 'Colour applied',
      set_effect: 'Animation started',
      set_speed: 'Speed changed',
      relay_toggle: 'Relay toggled'
    })[command] || 'Automation action completed';

    const addAutomationNotification = notification => {
      const isError = notification.type === 'automation-error';
      const notificationDeviceId = notification.deviceId || notification.actions?.[0]?.deviceId;
      const matchedDevice = devicesRef.current.find(device => device.deviceId === notificationDeviceId);
      const title = notification.deviceName || notification.ruleName || 'Automation';
      const message = notification.message || (
        Array.isArray(notification.actions) && notification.actions.length
          ? notification.actions
            .map(action => `${action.deviceName || action.deviceId}: ${automationCommandLabel(action.command)}`)
            .join(' · ')
          : 'Automation completed'
      );
      const item = {
        id: notification.id || `automation-${notification.ruleId || 'action'}-${Date.now()}`,
        deviceId: notificationDeviceId,
        title,
        message,
        deviceType: notification.deviceType || matchedDevice?.type || 'Device',
        room: notification.room || matchedDevice?.room || 'Unassigned',
        type: notification.type || 'automation',
        triggeredAt: notification.triggeredAt || new Date().toISOString()
      };
      setNotifications(previous => [item, ...previous].slice(0, 20));
      if (notification.presetId) {
        setCustomOffPresets(current => current.map(preset =>
          String(preset._id) === String(notification.presetId)
            ? { ...preset, enabled: false, nextRunAt: null, lastRunAt: item.triggeredAt }
            : preset
        ));
      }
      showToast(`${isError ? '⚠️' : '⚡'} ${title}: ${message}`);
    };

    socket.on('automation_notification', addAutomationNotification);
    socket.on('automation_triggered', addAutomationNotification);
    socket.on('switch_preset_state', update => {
      setCustomOffPresets(current => current.map(preset =>
        String(preset._id) === String(update.presetId)
          ? {
              ...preset,
              enabled: Boolean(update.enabled),
              nextRunAt: update.nextRunAt || null,
              ...(update.lastRunAt ? { lastRunAt: update.lastRunAt } : {})
            }
          : preset
      ));
    });
    socket.on('switch_preset_changed', update => {
      if (update.action === 'delete') {
        setCustomOffPresets(current => current.filter(preset => String(preset._id) !== String(update.presetId)));
        return;
      }
      if (!update.preset) return;
      setCustomOffPresets(current => {
        const exists = current.some(preset => String(preset._id) === String(update.preset._id));
        if (exists) {
          return current.map(preset => String(preset._id) === String(update.preset._id) ? update.preset : preset);
        }
        const visibleRoom = currentRoomRef.current?.name || currentRoomRef.current?.title;
        if (!visibleRoom || String(update.preset.room) !== String(visibleRoom)) return current;
        return [update.preset, ...current];
      });
    });
    socket.on('automation_device_lock', ({ deviceIds = [], lockId }) => {
      setAutomationDeviceLocks(current => {
        const next = { ...current };
        deviceIds.forEach(deviceId => {
          next[deviceId] = [...new Set([...(next[deviceId] || []), String(lockId)])];
        });
        return next;
      });
    });
    socket.on('automation_device_unlock', ({ deviceIds = [], lockId }) => {
      setAutomationDeviceLocks(current => {
        const next = { ...current };
        deviceIds.forEach(deviceId => {
          const remaining = (next[deviceId] || []).filter(id => id !== String(lockId));
          if (remaining.length) next[deviceId] = remaining;
          else delete next[deviceId];
        });
        return next;
      });
    });

    const handleWaterAlert = ({ deviceId, metric, value }) => {
      if (!['alert', 'battery'].includes(metric)) return;
      setNotifications(previous => {
        const tank = devicesRef.current.find(device => device.deviceId === deviceId);
        if (!tank || tank.type !== 'water-tank') {
          return previous.filter(item => item.deviceId !== deviceId);
        }
        const tankName = tank.title || 'Water Tank';
        if (metric === 'alert') {
          const withoutPreviousAlert = previous.filter(item => item.id !== `wli-alert-${deviceId}`);
          if (!value) return withoutPreviousAlert;
          return [{
            id: `wli-alert-${deviceId}`,
            deviceId,
            tankName,
            message: value,
            type: 'communication'
          }, ...withoutPreviousAlert].slice(0, 20);
        }

        const batteryPercentage = Number(value);
        const withoutBatteryAlert = previous.filter(item => item.id !== `wli-battery-${deviceId}`);
        if (!Number.isFinite(batteryPercentage) || batteryPercentage > 15) return withoutBatteryAlert;
        const isCriticalBattery = batteryPercentage < 5;
        const notification = {
          id: `wli-battery-${deviceId}`,
          deviceId,
          tankName,
          message: `${isCriticalBattery ? 'Critical battery alert' : 'Low battery warning'} — ${Math.round(batteryPercentage)}%`,
          type: isCriticalBattery ? 'battery-critical' : 'battery'
        };
        return [notification, ...withoutBatteryAlert].slice(0, 20);
      });
    };
    socket.on('water_level_update', handleWaterAlert);

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
      socket.off('mqtt_status', handleMqttStatus);
      socket.off('connect', syncMqttStatus);
      socket.off('disconnect', handleSocketDisconnect);
      socket.off('device_state_update');
      socket.off('custom_sensor_update');
      socket.off('toast_message');
      socket.off('automation_notification', addAutomationNotification);
      socket.off('automation_triggered', addAutomationNotification);
      socket.off('switch_preset_state');
      socket.off('switch_preset_changed');
      socket.off('automation_device_lock');
      socket.off('automation_device_unlock');
      socket.off('water_level_update', handleWaterAlert);
      socket.off('ha_entity_state_change');
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const expireMissingHeartbeats = () => {
      const now = Date.now();
      const expire = device => {
        if (device.isHomeAssistant || device.type === 'water-tank') return device;
        const timedOutWaiting = device.connectivityStatus === 'waiting'
          && now - (device.connectivityCheckedAt || now) >= HEARTBEAT_WAIT_MS;
        const timedOutConnected = device.connectivityStatus === 'connected'
          && now - (device.heartbeatReceivedAt || 0) >= HEARTBEAT_STALE_MS;
        if (!timedOutWaiting && !timedOutConnected) return device;
        return { ...device, isOnline: false, connectivityStatus: 'disconnected' };
      };
      setDevices(previous => (Array.isArray(previous) ? previous : []).map(expire));
      setSelectedDevice(previous => previous ? expire(previous) : previous);
    };
    const intervalId = window.setInterval(expireMissingHeartbeats, 1000);
    return () => window.clearInterval(intervalId);
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
        if (timerDeviceIdRef.current !== updated.deviceId) {
          const remaining = Math.max(0, Math.round(Number(updated.timerRemaining) || 0));
          timerDeviceIdRef.current = updated.deviceId;
          timerDeadlineRef.current = remaining > 0 ? Date.now() + (remaining * 1000) : null;
          setTimerInfo({ remaining, action: updated.timerAction });
        }
        setMetrics({
          voltage: updated.voltage,
          current: updated.current,
          power: updated.power,
          energy: updated.energy,
          pf: updated.pf,
          temp: updated.temperature
        });
      }
    } else {
      timerDeviceIdRef.current = null;
      timerDeadlineRef.current = null;
    }
  }, [devices, selectedDevice]);

  // Anchor the countdown to a deadline so routine device updates cannot reset it.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!timerDeadlineRef.current) return;
      const remaining = Math.max(0, Math.ceil((timerDeadlineRef.current - Date.now()) / 1000));
      setTimerInfo(prev => prev.remaining === remaining ? prev : { ...prev, remaining });
      if (remaining === 0) {
        const completedDeviceId = timerDeviceIdRef.current;
        timerDeadlineRef.current = null;
        setDevices(previous => (Array.isArray(previous) ? previous : []).map(device =>
          device.deviceId === completedDeviceId
            ? { ...device, timerRemaining: 0, timerAction: null }
            : device
        ));
      }
    }, 250);
    return () => clearInterval(interval);
  }, []);

  const toggleLight = (val) => {
    isInteracting.current = true;
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    interactionTimeout.current = setTimeout(() => {
      isInteracting.current = false;
      const latestDevice = devicesRef.current.find(device => device.deviceId === selectedDevice?.deviceId);
      if (latestDevice) {
        setSelectedDevice(latestDevice);
        setLightStatus(Boolean(latestDevice.on));
      }
    }, 2000); // 2s lock to allow smooth transition

    setLightStatus(val);
    const isRgbw = selectedDevice?.type === 'rgbw';
    const isTunable = selectedDevice && (selectedDevice.type === 'tunable-light' || selectedDevice.type === 'tune light');
    if (isRgbw || isTunable) {
      const nextBrightness = val ? 128 : 0;
      const optimisticDevice = { ...selectedDevice, on: val, brightness: nextBrightness };
      setBrightness(nextBrightness);
      setSelectedDevice(optimisticDevice);
      setDevices(prev => (Array.isArray(prev) ? prev : []).map(device =>
        device.deviceId === selectedDevice.deviceId ? optimisticDevice : device
      ));
    }
    // For tunable lights: turning off resets brightness to 0, turning on defaults the slider to 50%.
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

  const handleSetTimer = (value, action, unit = 'minutes') => {
    if (selectedDevice) {
      const numericValue = Number(value) || 0;
      const totalSeconds = Math.max(0, Math.round(unit === 'seconds' ? numericValue : numericValue * 60));
      if (totalSeconds === 0) {
        showToast("🚫 Timer disabled");
        timerDeadlineRef.current = null;
        timerDeviceIdRef.current = selectedDevice.deviceId;
        setTimerInfo({ remaining: 0, action: null });
      } else {
        const minutesPart = Math.floor(totalSeconds / 60);
        const secondsPart = totalSeconds % 60;
        const durationLabel = [
          minutesPart > 0 ? `${minutesPart}m` : '',
          secondsPart > 0 ? `${secondsPart}s` : ''
        ].filter(Boolean).join(' ');
        showToast(`⏱️ Timer started: ${durationLabel}`);
        timerDeviceIdRef.current = selectedDevice.deviceId;
        timerDeadlineRef.current = Date.now() + (totalSeconds * 1000);
        setTimerInfo({ remaining: totalSeconds, action });
      }
      socket.emit('set_offline_timer', {
        deviceId: selectedDevice.deviceId,
        timer: totalSeconds / 60,
        timerSeconds: totalSeconds,
        action
      });
    }
  };

  const handleAddSchedule = (startTime, endTime, days, startAction = 'ON', endAction = 'OFF') => {
    if (!selectedDevice || !startTime || !endTime || days.length === 0) {
      showToast('Choose a start time, end time, and at least one day');
      return;
    }
    socket.emit('add_schedule', { deviceId: selectedDevice.deviceId, startTime, endTime, days, startAction, endAction });
    setIsScheduleFormOpen(false);
    showToast('📅 Schedule added');
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
    // Button-driven RGBW commands must never be swallowed by the slider throttle.
    // Only high-frequency controls (brightness/white while dragging) need limiting.
    const isDiscreteRgbwCommand = ['color_change', 'set_effect', 'force_white_mode', 'rgbw_power_off'].includes(event);

    if (selectedDevice?.type === 'rgbw' && ['color_change', 'white_change', 'set_effect'].includes(event)) {
      const nextEffect = event === 'set_effect' ? data.effect : 'solid';
      setSelectedDevice(previous => previous ? { ...previous, effect: nextEffect, on: true } : previous);
      setDevices(previous => (Array.isArray(previous) ? previous : []).map(device =>
        device.deviceId === selectedDevice.deviceId
          ? { ...device, effect: nextEffect, on: true }
          : device
      ));
    }

    // Set interacting flag to prevent inbound state from overriding UI
    isInteracting.current = true;
    
    // Clear existing timeout and set a new one to reset interaction flag
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    interactionTimeout.current = setTimeout(() => {
      isInteracting.current = false;
    }, 1500); // Wait 1.5s after last move before syncing back from server

    const now = Date.now();
    if (isDiscreteRgbwCommand || now - lastEmitTime.current > 100) {
      socket.emit(event, data);
      if (!isDiscreteRgbwCommand) lastEmitTime.current = now;
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
    const isTunableLight = selectedDevice.type === 'tunable-light' || selectedDevice.type === 'tune light';
    const isRoomSwitchCollection = selectedDevice.type === 'room-switches';
    const isTouchPanel = isRoomSwitchCollection || isTouchPanelDevice(selectedDevice);
    const runningPreset = customOffPresets.find(preset => String(preset._id) === String(runningAutomationId));
    const runningDeviceIds = new Set(
      runningPreset?.executionMode === 'manual'
        ? (runningPreset.targets || []).map(target => target.panelDeviceId)
        : []
    );
    const isPanelDeviceLocked = deviceId =>
      runningDeviceIds.has(deviceId)
      || Boolean(automationDeviceLocks[deviceId]?.length);
    const updateTouchPanelLocally = (panelDeviceId, subDeviceIndex, changes) => {
      const updateDevice = device => device.deviceId !== panelDeviceId ? device : {
        ...device,
        subDevices: (device.subDevices || []).map(subDevice =>
          Number(subDevice.index) === Number(subDeviceIndex) ? { ...subDevice, ...changes } : subDevice
        )
      };
      setDevices(previous => previous.map(updateDevice));
      setSelectedDevice(previous => previous ? {
        ...previous,
        on: changes.on !== undefined
          ? previous.subDevices.some(channel =>
              channel.panelDeviceId === panelDeviceId && Number(channel.index) === Number(subDeviceIndex)
                ? changes.on
                : channel.on
            )
          : previous.on,
        subDevices: (previous.subDevices || []).map(channel =>
          (channel.panelDeviceId || previous.deviceId) === panelDeviceId
            && Number(channel.index) === Number(subDeviceIndex)
            ? { ...channel, ...changes }
            : channel
        )
      } : previous);
    };
    const toggleTouchPanelSwitch = subDevice => {
      const nextState = !subDevice.on;
      const panelDeviceId = subDevice.panelDeviceId || selectedDevice.deviceId;
      if (isPanelDeviceLocked(panelDeviceId)) {
        showToast('Please wait until this device automation completes');
        return;
      }
      updateTouchPanelLocally(panelDeviceId, subDevice.index, { on: nextState });
      socket.emit('touch_panel_action', {
        deviceId: panelDeviceId,
        subDeviceIndex: subDevice.index,
        type: 'switch',
        value: nextState
      });
    };
    const setTouchPanelFanSpeed = (subDevice, speed) => {
      if (!subDevice.on) return;
      const panelDeviceId = subDevice.panelDeviceId || selectedDevice.deviceId;
      if (isPanelDeviceLocked(panelDeviceId)) {
        showToast('Please wait until this device automation completes');
        return;
      }
      updateTouchPanelLocally(panelDeviceId, subDevice.index, { speed });
      socket.emit('touch_panel_action', {
        deviceId: panelDeviceId,
        subDeviceIndex: subDevice.index,
        type: 'fan',
        value: speed
      });
    };
    const turnOffAllTouchPanelChannels = () => {
      const panelIds = isRoomSwitchCollection
        ? [...new Set((selectedDevice.panels || []).map(panel => panel.deviceId))]
        : [selectedDevice.deviceId];
      const unlockedPanelIds = panelIds.filter(deviceId => !isPanelDeviceLocked(deviceId));
      if (unlockedPanelIds.length !== panelIds.length) {
        showToast('Locked devices will remain unchanged until their automation completes');
      }
      if (unlockedPanelIds.length === 0) return;
      unlockedPanelIds.forEach(deviceId => socket.emit('touch_panel_all_off', { deviceId }));
      setDevices(previous => previous.map(device =>
        unlockedPanelIds.includes(device.deviceId)
          ? { ...device, subDevices: (device.subDevices || []).map(channel => ({ ...channel, on: false })) }
          : device
      ));
      setSelectedDevice(previous => previous ? {
        ...previous,
        on: false,
        subDevices: (previous.subDevices || []).map(channel =>
          unlockedPanelIds.includes(channel.panelDeviceId || previous.deviceId)
            ? { ...channel, on: false }
            : channel
        )
      } : previous);
    };
    const runCustomOffPreset = async preset => {
      if (runningAutomationId) {
        showToast('Please wait for the current automation to finish');
        return;
      }
      const nextState = preset.action === 'on';
      const targetsByKey = new Map((preset.targets || []).map(target => [
        `${target.panelDeviceId}:${target.subDeviceIndex}`,
        target
      ]));
      setRunningAutomationId(preset._id);
      try {
        const response = await fetchWithAuth(`${API_BASE}/api/switch-off-presets/${preset._id}/run`, {
          method: 'POST'
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          if (!error.notificationSent) showToast(error.message || 'Could not run automation');
          return;
        }
        const result = await response.json();
        if (result.armed) {
          setCustomOffPresets(current => current.map(item =>
            item._id === preset._id ? { ...item, enabled: true, nextRunAt: result.nextRunAt } : item
          ));
          showToast(result.message || `${preset.name} timer started`);
          return;
        }
        setCustomOffPresets(current => current.map(item =>
          item._id === preset._id ? { ...item, lastRunAt: result.lastRunAt || new Date().toISOString() } : item
        ));
        setDevices(previous => previous.map(device => ({
          ...device,
          subDevices: (device.subDevices || []).map(channel => {
            const target = targetsByKey.get(`${device.deviceId}:${channel.index}`);
            return target
              ? { ...channel, on: nextState, ...(target.type === 'fan' ? { speed: nextState ? (target.fanSpeed || 1) : 0 } : {}) }
              : channel;
          })
        })));
        setSelectedDevice(previous => previous ? {
          ...previous,
          subDevices: (previous.subDevices || []).map(channel => {
            const target = targetsByKey.get(`${channel.panelDeviceId}:${channel.index}`);
            return target
              ? { ...channel, on: nextState, ...(target.type === 'fan' ? { speed: nextState ? (target.fanSpeed || 1) : 0 } : {}) }
              : channel;
          })
        } : previous);
        showToast(`${preset.name}: automation completed`);
      } catch (error) {
        showToast(error.message || 'Could not run automation');
      } finally {
        setRunningAutomationId(null);
      }
    };
    const stopAutomationTimer = async preset => {
      if (stoppingAutomationId) return false;
      setStoppingAutomationId(preset._id);
      try {
        const response = await fetchWithAuth(`${API_BASE}/api/switch-off-presets/${preset._id}/stop`, {
          method: 'POST'
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          showToast(result.message || 'Could not stop timer');
          return false;
        }
        setCustomOffPresets(current => current.map(item =>
          item._id === preset._id ? { ...item, enabled: false, nextRunAt: null } : item
        ));
        showToast(result.message || `${preset.name} timer stopped`);
        return true;
      } catch (error) {
        showToast(error.message || 'Could not stop timer');
        return false;
      } finally {
        setStoppingAutomationId(null);
      }
    };
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
          <div className="card-header-row">
            <h3>Energy Monitoring</h3>
            <span className={`plug-section-status ${selectedDevice.isOnline ? 'live' : 'wifi-disconnected'}`}>
              {getConnectivityLabel(selectedDevice, {
                waiting: 'WAITING FOR WIFI',
                connected: 'LIVE',
                disconnected: 'DISCONNECTED'
              })}
            </span>
          </div>
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
    const usesPlugMobileLayout = isPlug || selectedDevice.type === 'rgbw';
    const rgbwEffect = String(selectedDevice.effect || 'solid');
    const rgbwActivityLabel = rgbwEffect !== 'solid'
      ? `${rgbwEffect.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())} animation is playing`
      : 'Colour is playing';
    const deviceDisplayName = selectedDevice.title || selectedDevice.name || selectedDevice.deviceId || 'Unnamed Device';
    const deviceNameLength = String(deviceDisplayName).trim().length;
    const renderTouchChannel = sd => (
      <div key={sd.key || sd.index} className={`touch-detail-item room-switch-plug-card power-control-card ${sd.on ? 'active' : ''} ${isPanelDeviceLocked(sd.panelDeviceId || selectedDevice.deviceId) ? 'automation-locked' : ''}`}>
        <div className="item-head">
          <div className="touch-channel-icon" aria-hidden="true">
            {sd.icon || (sd.type === 'fan' ? '🌀' : '💡')}
          </div>
          <div className="touch-channel-heading">
            <strong>{sd.label || `${sd.type === 'fan' ? 'Fan' : 'Switch'} ${sd.index}`}</strong>
            <small>{sd.type === 'fan' ? `Speed ${sd.on ? sd.speed : 0}` : (sd.on ? 'Powered on' : 'Powered off')}</small>
            {isRoomSwitchCollection && <small className="touch-panel-source">{sd.panelTitle}</small>}
          </div>
          <span className={`touch-state-badge ${sd.on ? 'active' : ''}`}>{sd.on ? 'ON' : 'OFF'}</span>
        </div>
        <div className="room-switch-control-body">
          <button
            className={`master-power-btn room-switch-master-power ${sd.on ? 'active' : ''}`}
            disabled={isPanelDeviceLocked(sd.panelDeviceId || selectedDevice.deviceId)}
            onClick={() => toggleTouchPanelSwitch(sd)}
            aria-label={`${sd.on ? 'Turn off' : 'Turn on'} ${sd.label || `channel ${sd.index}`}`}
          >
            <img src="/icons/icons/Power-White.svg" alt="" />
            <span>{sd.on ? 'TAP TO TURN OFF' : 'TAP TO TURN ON'}</span>
          </button>
          {sd.type === 'fan' && (
            <div className="fan-speed-control">
              {[1, 2, 3, 4, 5].map(speed => (
                <button key={speed} className={sd.on && sd.speed === speed ? 'active' : ''} disabled={!sd.on || isPanelDeviceLocked(sd.panelDeviceId || selectedDevice.deviceId)}
                  onClick={() => setTouchPanelFanSpeed(sd, speed)}>
                  {speed}
                </button>
              ))}
              {!sd.on && <small>Turn the fan on to set speed</small>}
            </div>
          )}
        </div>
        {isTouchPanel && (
          <div className="room-switch-card-tools">
            <span className={`switch-wifi-status ${(sd.panelOnline ?? selectedDevice.isOnline) ? 'connected' : 'disconnected'}`}>
              <i />
              {(sd.panelOnline ?? selectedDevice.isOnline) ? 'WiFi connected' : 'WiFi disconnected'}
            </span>
            <button type="button" className="switch-settings-btn" disabled={isPanelDeviceLocked(sd.panelDeviceId || selectedDevice.deviceId)} onClick={() => setEditingRoomSwitch({
              ...sd,
              panelDeviceId: sd.panelDeviceId || selectedDevice.deviceId,
              panelTitle: sd.panelTitle || selectedDevice.title
            })} aria-label={`Settings for ${sd.label}`}>
              <img src="/icons/icons/Settings-White.svg" alt="" />
            </button>
          </div>
        )}
      </div>
    );

    return (
      <div className={`detail-view animate-slide-up ${usesPlugMobileLayout ? 'plug-detail-view' : ''} ${selectedDevice.type === 'rgbw' || isTunableLight ? 'rgbw-detail-view' : ''} ${isTunableLight ? 'tunable-light-detail-view' : ''} ${isRoomSwitchCollection ? 'room-switches-detail' : ''} ${isTouchPanel && !isRoomSwitchCollection ? 'individual-touch-panel-detail' : ''}`}>
        <header className="detail-header" style={{ marginBottom: '16px' }}>
          <div className="title-row">
            <div className={`title-left ${deviceNameLength > 14 ? 'device-title-layout-long' : ''}`}>
              <button className="icon-back-btn" onClick={closeDeviceWithHistory} style={{ margin: 0 }}>
                <img src="/icons/icons/Arrow-White.svg" style={{width: 20, height: 20, transform: 'scaleX(-1)'}} />
              </button>
              {!isTouchPanel && <span className="device-application-icon" aria-label="Selected appliance icon">
                {getDeviceIconText(selectedDevice) || (
                  <img src={getDeviceIconSrc(selectedDevice)} alt="" />
                )}
              </span>}
              <span className="device-icon-large">
                <img
                  src={getDefaultDeviceIconSrc(selectedDevice)}
                  alt={getDeviceIconLabel(selectedDevice)}
                  className={`device-visual-icon large ${selectedDevice.type === 'retro-fit' || selectedDevice.panelType === 'retro-fit' ? 'retro-fit-icon' : ''}`}
                />
              </span>
              <div className="device-meta">
                <h1
                  className={`device-name ${
                    deviceNameLength > 34
                      ? 'device-name-extra-long'
                      : deviceNameLength > 24
                        ? 'device-name-very-long'
                      : deviceNameLength > 14
                        ? 'device-name-long'
                        : ''
                  }`}
                  title={deviceDisplayName}
                  style={{
                    '--mobile-device-name-size': `${Math.max(10, Math.min(17, 390 / Math.max(deviceNameLength, 1))).toFixed(1)}px`
                  }}
                >
                  {deviceDisplayName}
                </h1>
                <span className="device-id">
                  {isRoomSwitchCollection
                    ? `${selectedDevice.panels.length} ${selectedDevice.panelType === 'retro-fit' ? 'retro fit device' : 'touch panel'}${selectedDevice.panels.length === 1 ? '' : 's'}`
                    : selectedDevice.deviceId}
                </span>
                <span className="device-room-type">{selectedDevice.room || 'Unassigned'}</span>
              </div>
              {!isTouchPanel && <button className="edit-settings-btn" onClick={() => openModalWithHistory(setConfiguringDevice, 'config', selectedDevice)}>
                <img src="/icons/icons/Settings-White.svg" style={{width: 18, height: 18}} />
              </button>}
            </div>
            {isRoomSwitchCollection ? (
              <div className="header-touch-summary">
                <div className="room-switches-overview-stats">
                  <div className="room-switch-type-stat">
                    <span>Switches</span>
                    <div>
                      <em><strong>{selectedDevice.subDevices.filter(sd => sd.type !== 'fan').length}</strong><small>Total</small></em>
                      <em className="active"><strong>{selectedDevice.subDevices.filter(sd => sd.type !== 'fan' && sd.on).length}</strong><small>Active</small></em>
                    </div>
                  </div>
                  <div className="room-switch-type-stat">
                    <span>Fans</span>
                    <div>
                      <em><strong>{selectedDevice.subDevices.filter(sd => sd.type === 'fan').length}</strong><small>Total</small></em>
                      <em className="active"><strong>{selectedDevice.subDevices.filter(sd => sd.type === 'fan' && sd.on).length}</strong><small>Active</small></em>
                    </div>
                  </div>
                </div>
              </div>
            ) : isTouchPanel ? (
              <div className="physical-panel-header-tools">
                <div className="physical-panel-header-actions">
                  <button className="master-off-btn" onClick={turnOffAllTouchPanelChannels}>
                    <img src="/icons/icons/Power-White.svg" alt="" />
                    All OFF
                  </button>
                  <button className="edit-settings-btn" onClick={() => openModalWithHistory(setConfiguringDevice, 'config', selectedDevice)} aria-label="Touch panel settings">
                    <img src="/icons/icons/Settings-White.svg" style={{width: 18, height: 18}} />
                  </button>
                  <button
                    className="physical-panel-delete-btn"
                    onClick={async () => {
                      if (!window.confirm(`Remove ${deviceDisplayName}? This touch panel will be deleted.`)) return;
                      await handleRemoveDevice(selectedDevice.deviceId);
                      closeDeviceWithHistory();
                    }}
                    aria-label="Delete touch panel"
                  >
                    <img src="/icons/icons/Delete-White.svg" alt="" />
                  </button>
                </div>
              </div>
            ) : (
              <div className={`status-pill ${selectedDevice.isOnline ? 'active' : 'wifi-disconnected'}`}>
                {getConnectivityLabel(selectedDevice)}
              </div>
            )}
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
                      <p className="status-subtext">
                        {lightStatus
                          ? selectedDevice.type === 'rgbw' ? rgbwActivityLabel : 'Device is active'
                          : 'Device is standby'}
                      </p>
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
                    {selectedDevice.type !== 'rgbw' && !isTunableLight && (
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

                    {isTunableLight && (
                      <TunableBrightnessControl
                        brightness={brightness}
                        disabled={autoMode}
                        onChange={handleBrightness}
                      />
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
                        setLightStatus={setLightStatus}
                        socket={socket}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Keep large power button ONLY for Plugs/Switches */}
              {isPlug && (
                <div className="control-card glass power-control-card">
                  <div className="card-header-row">
                    <h3>Power Control</h3>
                    <span className={`plug-section-status ${lightStatus ? 'active' : ''}`}>
                      {lightStatus ? 'POWERED ON' : 'POWERED OFF'}
                    </span>
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
                <div className={isRoomSwitchCollection ? 'room-switches-flat-container' : 'full-width individual-touch-panel-modern'}>
                  <div className="touch-panel-heading">
                    {isRoomSwitchCollection ? (
                      <div className="room-automation-copy">
                        <span className="touch-panel-kicker">ROOM AUTOMATIONS</span>
                        <p>Create one-tap actions for selected switches and fans.</p>
                        {runningAutomationId && <span className="automation-progress-pill">Automation running · Please wait</span>}
                      </div>
                    ) : (
                      <div>
                        <span className="touch-panel-kicker">
                          {selectedDevice.type === 'retro-fit' ? 'PHYSICAL RETRO FIT' : 'PHYSICAL TOUCH PANEL'}
                        </span>
                        <h3>Switchboard Controls</h3>
                        <p>{(selectedDevice.subDevices || []).filter(sd => sd.on).length} of {(selectedDevice.subDevices || []).length} channels active</p>
                      </div>
                    )}
                    {!isRoomSwitchCollection && (
                      <div className="header-touch-summary physical-panel-channel-summary">
                        <div className="room-switches-overview-stats">
                          <div className="room-switch-type-stat">
                            <span>Switches</span>
                            <div>
                              <em><strong>{selectedDevice.subDevices.filter(sd => sd.type !== 'fan').length}</strong><small>Total</small></em>
                              <em className="active"><strong>{selectedDevice.subDevices.filter(sd => sd.type !== 'fan' && sd.on).length}</strong><small>Active</small></em>
                            </div>
                          </div>
                          <div className="room-switch-type-stat">
                            <span>Fans</span>
                            <div>
                              <em><strong>{selectedDevice.subDevices.filter(sd => sd.type === 'fan').length}</strong><small>Total</small></em>
                              <em className="active"><strong>{selectedDevice.subDevices.filter(sd => sd.type === 'fan' && sd.on).length}</strong><small>Active</small></em>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {isRoomSwitchCollection && customOffPresets.length > 0 && (
                      <div className="custom-off-presets">
                        <div>
                          {customOffPresets.map(preset => {
                            const timerRemaining = formatTimerRemaining(preset, automationClock);
                            const timerActive = timerRemaining !== null;
                            const presetHasLockedDevice = (preset.targets || []).some(target =>
                              isPanelDeviceLocked(target.panelDeviceId)
                            );
                            return (
                            <div className={`custom-off-preset-item ${preset.action === 'on' ? 'turn-on' : 'turn-off'} ${timerActive ? 'timer-active' : ''}`} key={preset._id}>
                              <button
                                className="run-custom-off-btn"
                                disabled={Boolean(runningAutomationId) || preset.executionMode === 'schedule' || timerActive || presetHasLockedDevice}
                                title={preset.executionMode === 'schedule' ? 'Runs automatically at the configured time' : timerActive ? 'Timer is running' : presetHasLockedDevice ? 'A target device is locked by another automation' : preset.executionMode === 'timer' ? 'Start timer' : 'Run automation'}
                                onClick={() => runCustomOffPreset(preset)}
                              >
                                <span className="preset-power-icon"><img src="/icons/icons/Power-White.svg" alt="" /></span>
                                <span className="preset-copy">
                                  <strong>{runningAutomationId === preset._id ? 'Running…' : preset.name}</strong>
                                  {timerActive
                                    ? <small className="preset-countdown"><span>{timerRemaining}</span> remaining</small>
                                    : <small className="preset-type">{formatAutomationType(preset)}</small>}
                                  <small>Last run: {formatAutomationRunTime(preset.lastRunAt)}</small>
                                </span>
                                <span className="preset-meta">
                                  <em>{preset.action.toUpperCase()}</em>
                                  <small>{preset.targets.length}</small>
                                </span>
                              </button>
                              <div className="preset-card-actions">
                                {timerActive && (
                                  <button
                                    className="custom-timer-stop-btn"
                                    disabled={stoppingAutomationId === preset._id}
                                    onClick={() => stopAutomationTimer(preset)}
                                    aria-label={`Stop ${preset.name} timer`}
                                  >
                                    <span>■</span> Stop
                                  </button>
                                )}
                                <button className="custom-off-settings-btn" disabled={Boolean(runningAutomationId)} onClick={async () => {
                                  if (timerActive && !await stopAutomationTimer(preset)) return;
                                  setEditingCustomOff({ ...preset, enabled: false, nextRunAt: null });
                                  setIsCustomOffOpen(true);
                                }} aria-label={`Settings for ${preset.name}`}>
                                  <img src="/icons/icons/Settings-White.svg" alt="" />
                                </button>
                                <button className="custom-off-delete-btn" disabled={Boolean(runningAutomationId)} onClick={() => {
                                  if (window.confirm(`Delete "${preset.name}" automation?`)) handleCustomOffDelete(preset);
                                }} aria-label={`Delete ${preset.name}`}>
                                  <img src="/icons/icons/Delete-White.svg" alt="" />
                                </button>
                              </div>
                            </div>
                          )})}
                        </div>
                      </div>
                    )}
                    {isRoomSwitchCollection && <div className="room-switch-master-actions">
                    {isRoomSwitchCollection && <button className="custom-off-btn" disabled={Boolean(runningAutomationId)} onClick={() => { setEditingCustomOff(null); setIsCustomOffOpen(true); }}>
                      <span>＋</span>
                      Custom Automation
                    </button>}
                    </div>}
                  </div>
                  <div className="room-channel-groups">
                    {isRoomSwitchCollection && selectedDevice.subDevices.length === 0 && (
                      <div className="room-switches-empty">
                        <img src="/icons/devices/touch_panel.png" alt="" />
                        <strong>No touch switches yet</strong>
                        <span>Add a Touch Panel to {selectedDevice.room}; its controls will appear here automatically.</span>
                      </div>
                    )}
                    {(selectedDevice.subDevices || []).some(sd => sd.type !== 'fan') && (
                      <section className="room-channel-section">
                        <div className="room-channel-section-title"><div><h4>Power switches</h4></div><strong>{selectedDevice.subDevices.filter(sd => sd.type !== 'fan').length}</strong></div>
                        <div className="touch-grid-detail room-switches-plug-grid">
                          {selectedDevice.subDevices.filter(sd => sd.type !== 'fan').map(renderTouchChannel)}
                        </div>
                      </section>
                    )}
                    {(selectedDevice.subDevices || []).some(sd => sd.type === 'fan') && (
                      <section className="room-channel-section fan-channel-section">
                        <div className="room-channel-section-title"><div><h4>Fan controls</h4></div><strong>{selectedDevice.subDevices.filter(sd => sd.type === 'fan').length}</strong></div>
                        <div className="touch-grid-detail room-switches-plug-grid">
                          {selectedDevice.subDevices.filter(sd => sd.type === 'fan').map(renderTouchChannel)}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              )}
              {(selectedDevice.type === 'rgbw' || isTunableLight) && <RGBWScheduler device={selectedDevice} socket={socket} />}
            </div>

            {/* Timer and schedule controls are also available for tunable lights. */}
            {(isPlug || isTunableLight) && (
              <div className="detail-side-column">
                {isPlug && renderEnergyMetrics()}

                <div className="control-card glass timer-card">
                  <div className="card-header-row">
                    <div className="timer-title-row">
                      <h3>Timer</h3>
                      {timerInfo.remaining > 0 ? (
                        <span className="plug-section-status active">
                          <span className="pulse-dot"></span>
                          ACTIVE
                        </span>
                      ) : (
                        <span className="plug-section-status">INACTIVE</span>
                      )}
                    </div>
                    <div className="timer-mode-row">
                      <select 
                        className="timer-action-select"
                        value={timerTargetAction}
                        onChange={e => setTimerTargetAction(e.target.value)}
                      >
                        <option value="ON">Turn ON</option>
                        <option value="OFF">Turn OFF</option>
                      </select>
                      <button
                        type="button"
                        className={`timer-mode-off ${timerInfo.remaining > 0 ? 'cancel' : ''}`}
                        onClick={() => handleSetTimer(0, timerTargetAction)}
                      >
                        OFF
                      </button>
                    </div>
                  </div>
                  <div className="timer-options">
                    {[5, 15, 30, 60].map(mins => (
                      <button
                        key={mins}
                        className="timer-btn"
                        onClick={() => handleSetTimer(mins, timerTargetAction)}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                  <div className="timer-custom-row">
                    <div className="timer-duration-inputs">
                      <label>
                        <input
                          className="timer-custom-input"
                          type="number"
                          placeholder="0"
                          aria-label="Custom timer minutes"
                          value={customMins}
                          onChange={(e) => setCustomMins(e.target.value)}
                          min="0"
                        />
                        <span>MIN</span>
                      </label>
                      <label>
                        <input
                          className="timer-custom-input"
                          type="number"
                          placeholder="0"
                          aria-label="Custom timer seconds"
                          value={customSeconds}
                          onChange={(e) => setCustomSeconds(e.target.value)}
                          min="0"
                          max="59"
                        />
                        <span>SEC</span>
                      </label>
                    </div>
                    <button
                      className="timer-custom-set"
                      onClick={() => {
                        const totalSeconds = (Math.max(0, Number(customMins) || 0) * 60)
                          + Math.min(59, Math.max(0, Number(customSeconds) || 0));
                        if (totalSeconds > 0) {
                          handleSetTimer(totalSeconds, timerTargetAction, 'seconds');
                          setCustomMins('');
                          setCustomSeconds('');
                        }
                      }}
                    >
                      SET
                    </button>
                  </div>
                  {timerInfo.remaining > 0 ? (
                    <div className="timer-status-active">
                      <span className="pulse-dot"></span>
                      <div className="timer-countdown-copy">
                        <strong>
                          {String(Math.floor(timerInfo.remaining / 60)).padStart(2, '0')}:
                          {String(timerInfo.remaining % 60).padStart(2, '0')}
                        </strong>
                        <span>minutes : seconds remaining</span>
                        <small>Will turn {timerInfo.action || timerTargetAction}</small>
                      </div>
                    </div>
                  ) : (
                    <div className="timer-empty-state">
                      No timer is currently set.
                    </div>
                  )}
                </div>

                {isPlug && <div className="control-card glass schedule-card">
                  <div className="card-header-row">
                    <h3>Schedules</h3>
                    <span className={`plug-section-status ${(selectedDevice.schedules || []).length > 0 ? 'active' : ''}`}>
                      {(selectedDevice.schedules || []).length > 0
                        ? `${selectedDevice.schedules.length} ACTIVE`
                        : 'INACTIVE'}
                    </span>
                  </div>
                  <div className="schedules-list">
                    {(selectedDevice.schedules || []).length === 0 ? (
                      <p className="empty-text">No active schedules</p>
                    ) : (
                      selectedDevice.schedules.map(sch => (
                        <div key={sch._id || sch.id} className="schedule-item-mini">
                          <div className="sch-info">
                            <span className="time">{sch.startTime} - {sch.endTime}</span>
                            <span className="days">{(sch.days || []).join(', ')}</span>
                            <span className="schedule-action-status">{sch.startAction || 'ON'} → {sch.endAction || 'OFF'}</span>
                          </div>
                          <button className="del-sch" aria-label="Remove schedule" onClick={() => handleRemoveSchedule(sch._id || sch.id)}>✕</button>
                        </div>
                      ))
                    )}
                  </div>
                  {isScheduleFormOpen && (
                    <div className="schedule-form-mini">
                      <div className="schedule-time-row">
                        <label>Start<input type="time" value={scheduleDraft.startTime} onChange={event => setScheduleDraft({ ...scheduleDraft, startTime: event.target.value })} /></label>
                        <label>End<input type="time" value={scheduleDraft.endTime} onChange={event => setScheduleDraft({ ...scheduleDraft, endTime: event.target.value })} /></label>
                      </div>
                      <div className="schedule-days" aria-label="Schedule days">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                          <button
                            type="button"
                            key={day}
                            className={scheduleDraft.days.includes(day) ? 'active' : ''}
                            onClick={() => setScheduleDraft(previous => ({
                              ...previous,
                              days: previous.days.includes(day)
                                ? previous.days.filter(item => item !== day)
                                : [...previous.days, day]
                            }))}
                          >{day.slice(0, 1)}</button>
                        ))}
                      </div>
                      <div className="schedule-action-row">
                        <label>At start<select value={scheduleDraft.startAction} onChange={event => setScheduleDraft({ ...scheduleDraft, startAction: event.target.value })}><option value="ON">Turn ON</option><option value="OFF">Turn OFF</option></select></label>
                        <label>At end<select value={scheduleDraft.endAction} onChange={event => setScheduleDraft({ ...scheduleDraft, endAction: event.target.value })}><option value="OFF">Turn OFF</option><option value="ON">Turn ON</option></select></label>
                      </div>
                      <div className="schedule-form-actions">
                        <button type="button" onClick={() => setIsScheduleFormOpen(false)}>Cancel</button>
                        <button type="button" className="primary" onClick={() => handleAddSchedule(scheduleDraft.startTime, scheduleDraft.endTime, scheduleDraft.days, scheduleDraft.startAction, scheduleDraft.endAction)}>Save schedule</button>
                      </div>
                    </div>
                  )}
                  {!isScheduleFormOpen && <button className="add-schedule-btn-mini" onClick={() => setIsScheduleFormOpen(true)}>+ Add Schedule</button>}
                </div>}
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
        {sensors.length === 0 && pendingSensors.length === 0 ? (
          <div className="empty-state">
            <img src="/icons/icons/WIFI-White.svg" style={{width: 48, height: 48}} className="empty-icon" />
            <p>No sensors added yet</p>
            <button onClick={() => openModalWithHistory(setIsSensorModalOpen, 'sensor')}>Configure first sensor</button>
          </div>
        ) : (
          [...sensors, ...pendingSensors.filter(pending => !sensors.some(sensor => sensor.topic === pending.topic))].map(sensor => (
            <SensorCard 
              key={sensor._id} 
              sensor={sensor} 
              approvalStatus={sensor.approvalStatus}
              onApprove={profile?.accountType !== 'child' && sensor.approvalRequestId ? () => reviewApprovalRequest(sensor.approvalRequestId, 'approve') : null}
              onReject={profile?.accountType !== 'child' && sensor.approvalRequestId ? () => reviewApprovalRequest(sensor.approvalRequestId, 'reject') : null}
              onRemove={handleRemoveSensor}
              onEdit={(item) => {
                setEditingSensor(item);
                openModalWithHistory(setIsSensorModalOpen, 'sensor');
              }}
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
            <p>{currentRoom ? `${getRoomType(currentRoom).label} · Managing ${devices.filter(d => deviceBelongsToRoom(d, currentRoom) && d.type !== 'water-tank').length} devices` : 'Everything is under control.'}</p>
          </div>
        </div>
        <div className="header-actions-group">
          {currentRoom ? (
            <>
              <button className="action-btn-pill secondary" onClick={() => {
                setEditingSensor(null);
                openModalWithHistory(setIsSensorModalOpen, 'sensor');
              }}>
                <img src="/icons/icons/Plus-White.svg" style={{width: 18, height: 18}} /> Add Sensor
              </button>
              <button className="action-btn-pill primary" onClick={() => openModalWithHistory(setIsModalOpen, 'device')}>
                <img src="/icons/icons/Plus-White.svg" style={{width: 18, height: 18}} /> Add Device
              </button>
            </>
          ) : (
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
              const roomDevices = devList.filter(d => deviceBelongsToRoom(d, room) && d.isConfigured && d.type !== 'water-tank');
              const activeCount = roomDevices.filter(d => d.on).length;
              return (
              <div key={room._id || `${room.name}-${room.icon}`} className="room-card-wrapper">
                <div className="room-card glass card-hover" onClick={() => setRoomWithHistory(room)}>
                  <div className="room-card-header">
                    <span className="room-card-icon"><img src={getRoomType(room).src} alt={getRoomType(room).label} className="room-svg-icon" style={{ width: 28, height: 28 }} /></span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className={`status-pill ${activeCount > 0 ? 'active' : ''}`}>
                        {activeCount > 0 && <span className="pulse-dot"></span>}
                        {activeCount} Active
                      </div>
                      {room._id && <button
                        className="room-delete-btn"
                        title="Delete Room"
                        onClick={(e) => { e.stopPropagation(); handleRemoveRoom(room); }}
                      >
                        <img src="/icons/icons/Delete-White.svg" style={{width: 14, height: 14}} />
                      </button>}
                    </div>
                  </div>
                  <div className="room-card-body">
                    <h3>{room.name}</h3>
                    <span className="room-type-label">{getRoomType(room).label}</span>
                    <p>{roomDevices.length} Devices Registered</p>
                  </div>
                  <div className="room-card-footer">
                    <div className="view-link"><span>View Details</span><img src="/icons/icons/Insight-White.svg" style={{width: 14, height: 14}} /></div>
                    {room._id && <button
                      className="room-settings-footer-btn"
                      title="Room Settings"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingRoom(room);
                        openModalWithHistory(setIsRoomModalOpen, 'room');
                      }}
                    >
                      <img src="/icons/icons/Settings-White.svg" alt="Room settings" />
                    </button>}
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
                  {(() => {
                    const switchCollections = [
                      buildRoomSwitchCollection(currentRoom, devices, 'touch-panel'),
                      buildRoomSwitchCollection(currentRoom, devices, 'retro-fit')
                    ].filter(Boolean);
                    const roomDevices = visibleDevices.filter(device =>
                      deviceBelongsToRoom(device, currentRoom)
                      && device.isConfigured
                      && device.type !== 'media_player'
                      && device.type !== 'water-tank'
                      && !isTouchPanelDevice(device)
                    );
                    return [...switchCollections, ...roomDevices].map(device => (
                    <DeviceCard
                      key={device.deviceId}
                      deviceId={device.deviceId}
                      title={device.title}
                      status={device.isOnline}
                      connectivityStatus={device.connectivityStatus}
                      on={device.on}
                      icon={
                        <img
                          src={getDeviceIconSrc(device)}
                          alt={getDeviceIconLabel(device)}
                          className={`device-visual-icon ${device.type === 'retro-fit' || device.panelType === 'retro-fit' ? 'retro-fit-icon' : ''}`}
                        />
                      }
                      type={device.type}
                      room={device.room}
                      roomType={getRoomType(rooms.find(room => deviceBelongsToRoom(device, room)) || { name: device.room }).label}
                      automationEnabled={device.automationEnabled}
                      hideManagement={device.type === 'room-switches'}
                      hideStatus={device.type === 'room-switches'}
                      statusSummary={device.type === 'room-switches'
                        ? `${device.subDevices.filter(channel => channel.type !== 'fan').length} switches · ${device.subDevices.filter(channel => channel.type === 'fan').length} fans`
                        : null}
                      metaLabel={device.type === 'room-switches'
                        ? `${device.subDevices.filter(channel => channel.type !== 'fan' && channel.on).length} switches active`
                        : null}
                      metaRightLabel={device.type === 'room-switches'
                        ? `${device.subDevices.filter(channel => channel.type === 'fan' && channel.on).length} fans active`
                        : null}
                      approvalStatus={device.approvalStatus}
                      requestedByName={device.requestedByName}
                      approvalRequestId={device.approvalRequestId}
                      onApprove={profile?.accountType !== 'child' && device.approvalRequestId ? () => reviewApprovalRequest(device.approvalRequestId, 'approve') : null}
                      onReject={profile?.accountType !== 'child' && device.approvalRequestId ? () => reviewApprovalRequest(device.approvalRequestId, 'reject') : null}
                      onToggle={() => toggleLight(!device.on)}
                      onAction={(action) => {
                        if (action === 'navigate') openDeviceWithHistory(device);
                        else if (action === 'edit') openModalWithHistory(setConfiguringDevice, 'config', device);
                        else if (action === 'remove') handleRemoveDevice(device.deviceId);
                      }}
                    />
                  ));
                  })()}
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
          <p>Managing {visibleDevices.length} appliances across your home</p>
        </div>
        <div className="header-actions-group">
          <button className="action-btn-pill primary" onClick={() => openModalWithHistory(setIsModalOpen, 'device')}>
            <img src="/icons/icons/Plus-White.svg" style={{width: 18, height: 18}} /> Add Device
          </button>
        </div>
      </div>

      <div className="devices-grid">
        {visibleDevices.map(device => (
          <DeviceCard
            key={device.deviceId}
            deviceId={device.deviceId}
            title={device.title}
            status={device.isOnline}
            connectivityStatus={device.connectivityStatus}
            on={device.on}
            icon={
              <img
                src={getDeviceIconSrc(device)}
                alt={getDeviceIconLabel(device)}
                className={`device-visual-icon ${device.type === 'retro-fit' || device.panelType === 'retro-fit' ? 'retro-fit-icon' : ''}`}
              />
            }
            type={device.type}
            room={device.room}
            roomType={getRoomType(rooms.find(room => deviceBelongsToRoom(device, room)) || { name: device.room }).label}
            channelSummary={isTouchPanelDevice(device)
              ? `${(device.subDevices || []).filter(channel => channel.type !== 'fan').length} switches · ${(device.subDevices || []).filter(channel => channel.type === 'fan').length} fans`
              : null}
            automationEnabled={device.automationEnabled}
            approvalStatus={device.approvalStatus}
            requestedByName={device.requestedByName}
            approvalRequestId={device.approvalRequestId}
            onApprove={profile?.accountType !== 'child' && device.approvalRequestId ? () => reviewApprovalRequest(device.approvalRequestId, 'approve') : null}
            onReject={profile?.accountType !== 'child' && device.approvalRequestId ? () => reviewApprovalRequest(device.approvalRequestId, 'reject') : null}
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
              <div key={room._id || `${room.name}-${room.icon}`} className="room-item-mini">
                <span><img src={getRoomType(room).src} alt="" style={{width: 30, height: 30}} /> {getRoomOptionLabel(room)}</span>
                <span className="room-settings-actions">
                  <button className="edit-btn-mini" onClick={() => {
                    setEditingRoom(room);
                    openModalWithHistory(setIsRoomModalOpen, 'room');
                  }}>Settings</button>
                  <button className="delete-btn-mini" onClick={() => handleRemoveRoom(room)}>Remove</button>
                </span>
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
    const state = { ...(window.history.state || {}), ...nextState };
    window.history.pushState(state, '', getDashboardUrl(state));
  };

  const replaceDashboardHistory = (nextState) => {
    const state = { ...(window.history.state || {}), ...nextState };
    window.history.replaceState(state, '', getDashboardUrl(state));
  };

  const resolveHistoryRoom = (roomName) => {
    if (!roomName) return null;
    const storedRoom = (Array.isArray(roomsRef.current) ? roomsRef.current : []).find((room) => room.name === roomName);
    if (storedRoom) return storedRoom;
    return { name: roomName, icon: '🏠' };
  };

  const resolveHistoryDevice = (deviceId) => {
    if (!deviceId) return null;
    if (deviceId.startsWith('room-switches:')) {
      const collectionId = deviceId.slice('room-switches:'.length);
      const hasTypedCollection = collectionId.startsWith('touch-panel:')
        || collectionId.startsWith('retro-fit:');
      const separatorIndex = collectionId.indexOf(':');
      const panelType = hasTypedCollection
        ? collectionId.slice(0, separatorIndex)
        : 'touch-panel';
      const roomName = hasTypedCollection
        ? collectionId.slice(separatorIndex + 1)
        : collectionId;
      const room = resolveHistoryRoom(roomName);
      return room ? buildRoomSwitchCollection(room, devicesRef.current, panelType) : null;
    }
    return (Array.isArray(devicesRef.current) ? devicesRef.current : []).find((device) => device.deviceId === deviceId) || null;
  };

  // History and Back Button Management
  useEffect(() => {
    if (!window.history.state?.tab) {
      const route = readDashboardRoute();
      replaceDashboardHistory({
        tab: route.tab,
        panel: route.panel || null,
        roomName: route.roomName || null,
        detailDeviceId: route.detailDeviceId || null,
        waterTankId: route.waterTankId || null,
        modal: null,
      });
    }

    const handlePopState = (e) => {
      const state = e.state?.tab ? e.state : readDashboardRoute();
      
      if (!state.modal) {
        setIsModalOpen(false);
        setIsRoomModalOpen(false);
        setIsSensorModalOpen(false);
        setConfiguringDevice(null);
        setEditingRoom(null);
        setEditingSensor(null);
      }
      
      setCurrentRoom(resolveHistoryRoom(state.roomName));
      setSelectedDevice(resolveHistoryDevice(state.detailDeviceId));
      setSelectedWaterTankId(state.waterTankId || null);
      
      if (state.tab) {
        setActiveTab(state.tab);
      } else {
        setActiveTab('dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Restore a directly loaded room/device URL once its API data is available.
  useEffect(() => {
    const route = readDashboardRoute();

    if (route.detailDeviceId) {
      const device = resolveHistoryDevice(route.detailDeviceId);
      if (device) {
        setActiveTab(route.tab);
        setCurrentRoom(null);
        setSelectedDevice(device);
        if (device.type === 'rgbw') setWhiteIntensity(0);
      }
      return;
    }

    if (route.roomName) {
      const room = resolveHistoryRoom(route.roomName);
      if (room) {
        setActiveTab('dashboard');
        setSelectedDevice(null);
        setCurrentRoom(room);
      }
      return;
    }

    if (route.waterTankId) {
      const tank = resolveHistoryDevice(route.waterTankId);
      if (tank) {
        setActiveTab('water-level');
        setSelectedDevice(null);
        setCurrentRoom(null);
        setSelectedWaterTankId(route.waterTankId);
      }
    }
  }, [devices, rooms]);

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
    if (profile?.role !== 'admin' && tabId !== 'profile' && !(profile?.permissions || []).includes(tabId)) {
      showToast('This profile does not have access to that area');
      return;
    }
    if (tabId === 'profile' && activeTab !== 'profile') {
      lastNonProfileTabRef.current = activeTab || 'dashboard';
    } else if (tabId !== 'profile') {
      lastNonProfileTabRef.current = tabId;
    }
    const nextHistoryState = {
      tab: tabId,
      panel: null,
      roomName: null,
      detailDeviceId: null,
      waterTankId: null,
      modal: null,
      scenesRoom: null,
      scenesModal: null,
    };

    if (tabId !== activeTab) pushDashboardHistory(nextHistoryState);
    else replaceDashboardHistory(nextHistoryState);

    setActiveTab(tabId);
    setSelectedDevice(null);
    setSelectedWaterTankId(null);
    setCurrentRoom(null);
    setSearchQuery('');
    setConfiguringDevice(null);
    setIsModalOpen(false);
    setIsRoomModalOpen(false);
    setIsSensorModalOpen(false);
  };

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to log out?')) return;
    const token = localStorage.getItem('smarthome_token');
    if (token) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch {
        // Local logout must still complete if the server is unavailable.
      }
    }
    localStorage.removeItem('smarthome_token');
    window.location.replace('/login');
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
    if (device.type === 'water-tank') {
      pushDashboardHistory({
        tab: 'water-level',
        panel: 'water-tank',
        roomName: null,
        detailDeviceId: null,
        waterTankId: device.deviceId,
        modal: null,
        scenesRoom: null,
        scenesModal: null,
      });
      setActiveTab('water-level');
      setCurrentRoom(null);
      setSelectedDevice(null);
      setSelectedWaterTankId(device.deviceId);
      return;
    }
    pushDashboardHistory({
      tab: activeTab,
      panel: 'device',
      roomName: currentRoom?.name || null,
      detailDeviceId: device.deviceId,
      waterTankId: null,
      modal: null,
      scenesRoom: null,
      scenesModal: null,
    });
    if (device.type === 'rgbw') setWhiteIntensity(0);
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
      <Sidebar activeTab={activeTab} setActiveTab={handleTabChange} isMobileOpen={isMobileSidebarOpen} onMobileClose={() => setIsMobileSidebarOpen(false)} profile={profile} />
      <main className="content">
        <div className="top-bar-spacer" aria-hidden="true" />
        <header className={`top-bar glass ${isHeaderHidden ? 'top-bar-hidden' : ''}`}>
          <div className="top-bar-left">
            <button className="mobile-menu-toggle" onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <div
              className={`search-bar ${isMobileSearchOpen ? 'mobile-search-open' : ''}`}
              onClick={() => {
                setIsMobileSearchOpen(true);
                window.requestAnimationFrame(() => searchInputRef.current?.focus());
              }}
            >
              <img className="search-control-icon" src="/icons/icons/search.png" alt="Search" style={{width: 18, height: 18}} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search devices, rooms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsMobileSearchOpen(true)}
                onBlur={() => {
                  if (!searchQuery) setIsMobileSearchOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setIsMobileSearchOpen(false);
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>
          </div>
          <div className="status-chips">
            <button className="theme-toggle-btn" onClick={() => setIsDarkMode(!isDarkMode)}>
              <img src="/icons/icons/Theme.svg" style={{width: 20, height: 20}} />
            </button>
            <div className="notification-wrap" ref={notificationRef}>
              <button
                className={`notification-button ${
                  notifications.some(item => item.type === 'automation-error' || item.type === 'battery-critical')
                    ? 'has-alert'
                    : notifications.some(item => item.type === 'automation')
                      ? 'has-success'
                      : notifications.length ? 'has-notification' : ''
                }`}
                onClick={() => setIsNotificationsOpen(value => !value)}
                aria-label="Notifications"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
                {notifications.length > 0 && <span className="notification-count">{notifications.length}</span>}
              </button>
              {isNotificationsOpen && (
                <div className="notification-panel glass">
                  <div className="notification-heading">
                    <div><strong>Notifications</strong><small>Device activity, automation, and system alerts</small></div>
                    {notifications.length > 0 && <button onClick={() => setNotifications([])}>Clear</button>}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="notification-empty">No new alerts</div>
                  ) : notifications.map(item => (
                    <div className={`notification-item ${
                      item.type === 'automation'
                        ? 'notification-success'
                        : item.type === 'automation-error' || item.type === 'battery-critical'
                          ? 'notification-alert'
                          : ''
                    }`} key={item.id}>
                      <button
                        className="notification-item-main"
                        onClick={() => {
                          if (item.type === 'approval') {
                            openApprovalCard(item);
                            setIsNotificationsOpen(false);
                            return;
                          }
                          const targetDevice = devicesRef.current.find(device => device.deviceId === item.deviceId);
                          if (targetDevice) openDeviceWithHistory(targetDevice);
                          else handleTabChange(item.type?.startsWith('automation') ? 'scenes' : 'water-level');
                          setIsNotificationsOpen(false);
                        }}
                      >
                        <span className={item.type === 'battery' ? 'battery-warning' : item.type === 'battery-critical' ? 'battery-critical' : item.type === 'approval' ? 'approval-request' : item.type === 'automation' ? 'automation-complete' : item.type === 'automation-error' ? 'automation-error' : ''}>{item.type === 'approval' ? '✓' : item.type === 'automation' ? '⚡' : '!'}</span>
                        <div>
                          <strong>{['approval', 'automation', 'automation-error'].includes(item.type) ? item.title : `${item.tankName} · ${item.deviceId}`}</strong>
                          {item.type?.startsWith('automation') && (
                            <small className="notification-device-meta">
                              {item.deviceType} · {item.room}
                            </small>
                          )}
                          <p>{item.message}</p>
                        </div>
                      </button>
                      <button
                        className="notification-dismiss"
                        aria-label={`Clear ${item.title || item.tankName || 'notification'}`}
                        onClick={() => setNotifications(previous => previous.filter(notification => notification.id !== item.id))}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={`status-badge ${mqttStatus === 'Connected' ? 'success' : mqttStatus === 'Offline' || mqttStatus === 'Error' ? 'danger' : 'warning'}`}>
              <span className="dot"></span>
              {mqttStatus === 'Connected' ? 'Live' : mqttStatus === 'Offline' || mqttStatus === 'Error' ? 'Offline' : 'Connecting'}
            </div>
            <button
              className="profile-chip"
              onClick={() => handleTabChange(activeTab === 'profile' ? lastNonProfileTabRef.current || 'dashboard' : 'profile')}
              title={activeTab === 'profile' ? 'Return to previous page' : 'Open profile'}
              aria-label={activeTab === 'profile' ? 'Return to previous page' : 'Open profile'}
            >
              <span className="profile-chip-avatar"><Avatar value={profile?.avatar} /></span>
              <div className="profile-info">
                <span className="name">{profile?.name || 'Profile'}</span>
              </div>
            </button>
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
                    connectivityStatus={device.connectivityStatus}
                    on={device.on}
                    icon={
                      <img
                        src={getDeviceIconSrc(device)}
                        alt={getDeviceIconLabel(device)}
                        className={`device-visual-icon ${device.type === 'retro-fit' || device.panelType === 'retro-fit' ? 'retro-fit-icon' : ''}`}
                      />
                    }
                    type={device.type}
                    room={device.room}
                    roomType={getRoomType(rooms.find(room => deviceBelongsToRoom(device, room)) || { name: device.room }).label}
                    automationEnabled={device.automationEnabled}
                    approvalStatus={device.approvalStatus}
                    requestedByName={device.requestedByName}
                    approvalRequestId={device.approvalRequestId}
                    onApprove={profile?.accountType !== 'child' && device.approvalRequestId ? () => reviewApprovalRequest(device.approvalRequestId, 'approve') : null}
                    onReject={profile?.accountType !== 'child' && device.approvalRequestId ? () => reviewApprovalRequest(device.approvalRequestId, 'reject') : null}
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
              {activeTab === 'water-level' && (
                <WaterTanksPage
                  socket={socket}
                  mqttStatus={mqttStatus}
                  onNotify={showToast}
                  tanks={(Array.isArray(devices) ? devices : []).filter(device => device.type === 'water-tank')}
                  selectedTankId={selectedWaterTankId}
                  onOpenTank={(deviceId) => {
                    pushDashboardHistory({
                      tab: 'water-level',
                      panel: 'water-tank',
                      roomName: null,
                      detailDeviceId: null,
                      waterTankId: deviceId,
                      modal: null,
                    });
                    setSelectedWaterTankId(deviceId);
                  }}
                  onCloseTank={() => {
                    setSelectedWaterTankId(null);
                    if (window.history.state?.waterTankId) window.history.back();
                  }}
                  onAddTank={() => {
                    setProvisioningInitialType('Water Tank');
                    openModalWithHistory(setIsModalOpen, 'device');
                  }}
                />
              )}
              {activeTab === 'devices' && renderDevicesView()}
              {activeTab === 'audio-devices' && <AudioDevicesTab socket={socket} allMediaPlayers={(Array.isArray(devices) ? devices : []).filter(d => d.type === 'media_player')} />}
              {activeTab === 'staircase' && <Staircase socket={socket} mqttStatus={mqttStatus} />}
              {activeTab === 'surveillance' && <Surveillance />}
              {activeTab === 'profile' && <ProfilePage profile={profile} onProfileChange={setProfile} notify={showToast} onOpenApproval={openApprovalCard} onLogout={handleLogout} />}
              {activeTab === 'settings' && renderSettingsView()}
            </>
          )}
        </div>
      </main>
      <AddSensorModal 
        isOpen={isSensorModalOpen} 
        onClose={() => {
          setEditingSensor(null);
          closeModalWithHistory(setIsSensorModalOpen, 'sensor');
        }}
        onAdd={handleAddSensor}
        onSave={handleUpdateSensor}
        sensor={editingSensor}
        initialRoom={editingSensor ? null : currentRoom}
        rooms={rooms}
      />
      <ProvisioningModal
        isOpen={isModalOpen}
        initialType={provisioningInitialType}
        initialRoom={currentRoom}
        onClose={() => {
          setProvisioningInitialType(null);
          closeModalWithHistory(setIsModalOpen, 'device');
        }}
        onFinish={handleAddDevice}
      />
      <AddRoomModal
        isOpen={isRoomModalOpen}
        room={editingRoom}
        onClose={() => {
          setEditingRoom(null);
          closeModalWithHistory(setIsRoomModalOpen, 'room');
        }}
        onAdd={handleAddRoom}
        onSave={handleUpdateRoom}
      />
      <ConfigureDeviceModal isOpen={!!configuringDevice} device={configuringDevice} socket={socket} onClose={() => closeModalWithHistory(setConfiguringDevice, 'config', null)} onConfigure={handleConfigureDevice} />
      {editingRoomSwitch && <TouchSwitchSettingsModal
        key={editingRoomSwitch.key}
        channel={editingRoomSwitch}
        onClose={() => setEditingRoomSwitch(null)}
        onSave={handleRoomSwitchSettingsSave}
      />}
      {isCustomOffOpen && selectedDevice?.type === 'room-switches' && <CustomOffModal
        key={editingCustomOff?._id || 'new-custom-off'}
        room={selectedDevice.room}
        channels={selectedDevice.subDevices}
        initialPreset={editingCustomOff}
        onClose={() => { setIsCustomOffOpen(false); setEditingCustomOff(null); }}
        onSave={handleCustomOffSave}
        onDelete={handleCustomOffDelete}
      />}
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
          path="/dashboard/*"
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
