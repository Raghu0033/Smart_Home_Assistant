import React, { useEffect, useState } from 'react';


const Sidebar = ({ activeTab, setActiveTab, isMobileOpen, onMobileClose, profile }) => {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!isMobileOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onMobileClose?.();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isMobileOpen, onMobileClose]);

  const menuItems = [
    { id: 'dashboard', icon: <img src="/icons/icons/Home-White.svg" alt="Dashboard" style={{width: 20, height: 20}} />, label: 'Dashboard' },
    { id: 'devices', icon: <img src="/icons/icons/Plug-White.svg" alt="Devices" style={{width: 20, height: 20}} />, label: 'Devices' },
    { id: 'sensors', icon: <img className="sensor-nav-icon" src="/icons/devices/sensor.svg" alt="Sensors" style={{width: 22, height: 22, objectFit: 'contain'}} />, label: 'Sensors' },
    { id: 'scenes', icon: <img className="scenes-nav-icon" src="/icons/devices/scenes.svg" alt="Scenes" style={{width: 22, height: 22, objectFit: 'contain'}} />, label: 'Scenes' },
    { id: 'audio-devices', icon: <img src="/icons/devices/audio.png" alt="Audio" style={{width: 20, height: 20, objectFit: 'contain', filter: 'invert(1) brightness(2)'}} />, label: 'Audio' },
    { id: 'staircase', icon: <img src="/icons/devices/staircase.png" alt="Staircase" style={{width: 20, height: 20, objectFit: 'contain', filter: 'invert(1) brightness(2)'}} />, label: 'Staircase' },
    { id: 'water-level', icon: <img className="water-tank-nav-icon" src="/icons/devices/water_tank.svg" alt="Water tanks" />, label: 'Water Tanks' },
    { id: 'surveillance', icon: <img className="cctv-nav-icon" src="/icons/icons/cctv.png" alt="Surveillance" />, label: 'Surveillance' },
    { id: 'profile', icon: <img src="/icons/icons/Profile-White.svg" alt="Profiles" style={{width: 20, height: 20}} />, label: 'Profiles' },
    { id: 'settings', icon: <img src="/icons/icons/Settings-White.svg" alt="Settings" style={{width: 20, height: 20}} />, label: 'Settings' },
  ];
  const visibleMenuItems = menuItems.filter(item =>
    !profile ||
    profile.role === 'admin' ||
    item.id === 'dashboard' ||
    item.id === 'profile' ||
    (profile.permissions || []).includes(item.id)
  );

  return (
    <>
      {isMobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={onMobileClose}
          aria-label="Close navigation"
        />
      )}
      <div className={`sidebar ${collapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-mobile-header">
        <div>
          <strong>Menu</strong>
          <small>{profile?.name || 'Smart Home'}</small>
        </div>
        <button type="button" className="sidebar-close-btn" onClick={onMobileClose} aria-label="Close menu">×</button>
      </div>
      <div className="sidebar-header">
        <button
          type="button"
          className="logo"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="logo-icon">
            <img className="company-logo company-logo-light" src="/icons/icons/company-logo-light.png" alt="Bharat Smart Services" />
            <img className="company-logo company-logo-dark" src="/icons/icons/company-logo-dark.png" alt="Bharat Smart Services" />
          </span>
          <span className="logo-text">SmartHome</span>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto">
        {visibleMenuItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(item.id); if (onMobileClose) onMobileClose(); }}
            title={collapsed ? item.label : ''}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button
          className="nav-item logout-nav-item"
          onClick={async () => {
            if (!window.confirm('Are you sure you want to log out?')) return;
            const token = localStorage.getItem('smarthome_token');
            if (token) {
              try {
                await fetch(`http://${window.location.hostname}:3000/api/auth/logout`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` }
                });
              } catch {
                // Local logout must still complete if the server is unavailable.
              }
            }
            localStorage.removeItem('smarthome_token');
            window.location.replace('/login');
          }}
          title={collapsed ? 'Logout' : ''}
        >
          <span className="nav-icon"><img src="/icons/icons/Logout-White.svg" alt="Logout" style={{width: 20, height: 20}} /></span>
          <span className="nav-label">Logout</span>
        </button>
      </div>
      </div>
    </>
  );
};

export default Sidebar;
