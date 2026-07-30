import React from 'react';


const SensorCard = ({ sensor, onRemove, onEdit, approvalStatus = null, onApprove = null, onReject = null }) => {
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
    <div className={`glass sensor-widget-card animate-fade-in ${approvalStatus ? 'approval-pending-card' : ''}`} id={sensor.approvalRequestId ? `approval-card-${sensor.approvalRequestId}` : undefined}>
      <div className="widget-header">
        <div className="sensor-brand">
          <div className={`status-indicator ${isLive ? 'online' : 'stale'}`}></div>
          <span className="room-label">{sensor.room}</span>
        </div>
        <div className="sensor-card-actions">
          {approvalStatus && <span className={`approval-card-badge ${approvalStatus}`}>{approvalStatus === 'pending' ? 'Waiting for approval' : 'Approved'}</span>}
          {!approvalStatus && <>
          <button className="widget-edit" onClick={() => onEdit(sensor)} title="Sensor settings">
            <img src="/icons/icons/Settings-White.svg" alt="Settings" style={{width: 14, height: 14}} />
          </button>
          <button className="widget-delete" onClick={() => onRemove(sensor._id)}>
            <img src="/icons/icons/Delete-White.svg" alt="Delete" style={{width: 14, height: 14}} />
          </button>
          </>}
        </div>
      </div>

      <div className="widget-main">
        {approvalStatus && sensor.requestedByName && <div className="approval-requester">Requested by {sensor.requestedByName}</div>}
        <div className="sensor-title-group">
          <h3><span className="sensor-custom-icon">{sensor.icon || '📡'}</span>{sensor.name}</h3>
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
          <span>{approvalStatus ? 'Not added yet' : getTimeAgo(sensor.lastUpdated)}</span>
        </div>
        <div className="sensor-type-icon">
          <img src="/icons/icons/WIFI-White.svg" alt="Radio" style={{width: 16, height: 16}} />
        </div>
      </div>
      {approvalStatus === 'pending' && onApprove && onReject && (
        <div className="inline-approval-actions">
          <button className="reject" onClick={() => onReject()}>Reject</button>
          <button className="approve" onClick={() => onApprove()}>Approve</button>
        </div>
      )}
    </div>
  );
};

export default SensorCard;
