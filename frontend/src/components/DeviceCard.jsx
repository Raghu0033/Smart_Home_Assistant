import React from 'react';


const DeviceCard = ({ title, status, on, icon, type, value, timerRemaining, onToggle, onAction, deviceId = '' }) => {
  const isPureEnergyMonitor = deviceId.startsWith('B1E') || deviceId.startsWith('B3E');
  return (
    <div 
      className={`device-card glass card-hover ${status ? 'online' : 'offline'}`}
      onClick={(e) => {
        if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
          onAction('navigate');
        }
      }}
    >
      <div className="card-header">
        <div className={`icon-box ${on && !isPureEnergyMonitor ? 'power-on' : (isPureEnergyMonitor ? '' : 'power-off')}`}>{icon}</div>
        <div className="card-actions">
          <button className="action-btn" onClick={(e) => { e.stopPropagation(); onAction('edit'); }} title="Edit">
            <img src="/icons/icons/Settings-White.svg" alt="Edit" style={{width: 14, height: 14}} />
          </button>
          <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove ${title}?`)) onAction('remove'); }} title="Remove">
            <img src="/icons/icons/Delete-White.svg" alt="Remove" style={{width: 14, height: 14}} />
          </button>
        </div>
      </div>

      <div className="card-body">
        <div className="device-info">
          <h3>{title}</h3>
          <div className={`connectivity-status ${status ? 'online' : 'offline'}`}>
            <span className="dot"></span>
            {status ? 'Connected' : 'Offline'}
          </div>
        </div>
        {!isPureEnergyMonitor && (
          <div className="power-indicator">
            <span className={`power-tag ${on ? 'active' : 'inactive'}`}>
              {on ? 'ACTIVE' : 'STANDBY'}
            </span>
          </div>
        )}
      </div>

      {status && type === 'slider' && (
        <div className="card-footer">
          <input 
            type="range" 
            min="0" max="100" 
            value={value} 
            onChange={(e) => onAction(e.target.value)}
          />
          <span className="val-display">{value}%</span>
        </div>
      )}

      {timerRemaining > 0 && (
        <div className="timer-pill animate-pulse-soft">
          ⏱️ {Math.ceil(timerRemaining / 60)}m left
        </div>
      )}
    </div>
  );
};

export default DeviceCard;

