import React from 'react';


const SensorCard = ({ sensor, onRemove }) => {
  const formatValue = (val) => {
    if (val === null || val === undefined) return '--';
    
    if (typeof val === 'boolean') {
      return val ? 'Detected' : 'Clear';
    }

    if (val === 1 || val === '1' || val === 'ON' || val === 'on') {
      return 'Detected';
    }
    
    if (val === 0 || val === '0' || val === 'OFF' || val === 'off') {
      return 'Clear';
    }

    // If it's an object, try to extract 'value', 'data', or the first numeric key
    if (typeof val === 'object') {
      if (val.value !== undefined) return val.value;
      if (val.data !== undefined) return val.data;
      if (val.val !== undefined) return val.val;
      
      // Fallback: look for any number
      const firstNum = Object.values(val).find(v => typeof v === 'number');
      if (firstNum !== undefined) return firstNum;
      
      return JSON.stringify(val);
    }
    
    return val;
  };

  const getTimeAgo = (date) => {
    if (!date) return 'Waiting for data...';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'Live now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  const isLive = sensor.lastUpdated && (new Date() - new Date(sensor.lastUpdated)) < 60000;

  return (
    <div className="glass sensor-widget-card animate-fade-in">
      <div className="widget-header">
        <div className="sensor-brand">
          <div className={`status-indicator ${isLive ? 'online' : 'stale'}`}></div>
          <span className="room-label">{sensor.room}</span>
        </div>
        <button className="widget-delete" onClick={() => onRemove(sensor._id)}>
          <img src="/icons/icons/Delete-White.svg" alt="Delete" style={{width: 14, height: 14}} />
        </button>
      </div>

      <div className="widget-main">
        <div className="sensor-title-group">
          <h3>{sensor.name}</h3>
          <div className="topic-pill">
            <img src="/icons/icons/More-White.svg" alt="#" style={{width: 10, height: 10}} />
            <code>{sensor.topic.split('/').pop()}</code>
          </div>
        </div>

        <div className="telemetry-display">
          <div className="value-container">
            <span className="main-value">{formatValue(sensor.value)}</span>
            <span className="unit-label">{sensor.unit || ''}</span>
          </div>
          <div className="visual-indicator">
            <img src="/icons/icons/Insight-White.svg" alt="Activity" className={isLive ? 'pulse-icon' : ''} style={{width: 24, height: 24}} />
          </div>
        </div>
      </div>

      <div className="widget-footer">
        <div className="update-status">
          <img src="/icons/icons/Timer-White.svg" alt="Clock" style={{width: 12, height: 12}} />
          <span>{getTimeAgo(sensor.lastUpdated)}</span>
        </div>
        <div className="sensor-type-icon">
          <img src="/icons/icons/WIFI-White.svg" alt="Radio" style={{width: 16, height: 16}} />
        </div>
      </div>
    </div>
  );
};

export default SensorCard;

