import React from 'react';


const DeviceCard = ({ title, status, connectivityStatus, on, icon, type, value, timerRemaining, onToggle, onAction, deviceId = '', room = 'Unassigned', roomType = 'Other', automationEnabled = false, approvalStatus = null, requestedByName = null, approvalRequestId = null, onApprove = null, onReject = null, hideManagement = false, hideStatus = false, statusSummary = null, channelSummary = null, metaLabel = null, metaRightLabel = null }) => {
  const isPureEnergyMonitor = deviceId.startsWith('B1E') || deviceId.startsWith('B3E');
  const waitingForApproval = approvalStatus === 'pending';
  const connectionState = connectivityStatus || (status ? 'connected' : 'disconnected');
  const connectionLabel = connectionState === 'waiting'
    ? 'Waiting for WiFi status'
    : connectionState === 'connected'
      ? 'Connected'
      : 'Check WiFi Connection';
  return (
    <div 
      className={`device-card glass card-hover ${connectionState === 'connected' ? 'online' : 'offline'} ${approvalStatus ? 'approval-pending-card' : ''}`}
      id={approvalRequestId ? `approval-card-${approvalRequestId}` : undefined}
      role={approvalStatus ? undefined : 'button'}
      tabIndex={approvalStatus ? -1 : 0}
      onClick={(e) => {
        if (!approvalStatus && e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
          onAction('navigate');
        }
      }}
      onKeyDown={(e) => {
        if (!approvalStatus && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onAction('navigate');
        }
      }}
    >
      <div className="card-header">
        <div className={`icon-box ${on && !isPureEnergyMonitor ? 'power-on' : (isPureEnergyMonitor ? '' : 'power-off')}`}>{icon}</div>
        <div className="device-card-top-actions">
          {!isPureEnergyMonitor && !hideStatus && !channelSummary && (
            <span className={`power-tag device-header-power ${on ? 'active' : 'inactive'}`}>
              {on ? 'ACTIVE' : 'STANDBY'}
            </span>
          )}
          {channelSummary && <span className="channel-count-tag device-header-power">{channelSummary}</span>}
          {!approvalStatus && !hideManagement && <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove ${title}?`)) onAction('remove'); }} title="Remove">
            <img src="/icons/icons/Delete-White.svg" alt="Remove" style={{width: 14, height: 14}} />
          </button>}
          {approvalStatus && <span className={`approval-card-badge ${approvalStatus}`}>{waitingForApproval ? 'Waiting for approval' : 'Approved'}</span>}
        </div>
      </div>

      <div className="card-body">
        <div className="device-info">
          <div className="device-title-row">
            <h3>{title}</h3>
            {!isPureEnergyMonitor && !hideStatus && !channelSummary && (
              <span className={`power-tag device-body-power ${on ? 'active' : 'inactive'}`}>
                {on ? 'ACTIVE' : 'STANDBY'}
              </span>
            )}
            {channelSummary && <span className="channel-count-tag device-body-power">{channelSummary}</span>}
          </div>
          {!hideStatus && <div className={`connectivity-status ${connectionState === 'connected' ? 'online' : 'offline'}`}>
            <span className="dot"></span>
            {approvalStatus ? 'Not added yet' : connectionLabel}
          </div>}
          {hideStatus && statusSummary && (
            <div className="device-count-summary">{statusSummary}</div>
          )}
          {approvalStatus && requestedByName && <div className="approval-requester">Requested by {requestedByName}</div>}
          <div className="device-room-context">
            <img src="/icons/icons/Home.svg" alt="" />
            <span>{room || 'Unassigned'}</span>
            <i>·</i>
            <small>{roomType}</small>
          </div>
        </div>
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
          ⏱️ {String(Math.floor(timerRemaining / 60)).padStart(2, '0')}:
          {String(timerRemaining % 60).padStart(2, '0')} left
        </div>
      )}

      {!approvalStatus && <div className="device-card-settings-row">
        <div className={`device-card-meta ${metaRightLabel ? 'split' : ''}`}>
          <span className={`device-automation-state ${automationEnabled || metaLabel ? 'enabled' : ''}`}>
            <i />
            {metaLabel || (automationEnabled ? 'Automation On' : 'Automation Off')}
          </span>
          {metaRightLabel && (
            <span className="device-automation-state enabled">
              <i />
              {metaRightLabel}
            </span>
          )}
        </div>
        {!hideManagement && <button
          className="room-settings-footer-btn"
          onClick={(e) => { e.stopPropagation(); onAction('edit'); }}
          title="Device Settings"
        >
          <img src="/icons/icons/Settings-White.svg" alt="Device settings" />
        </button>}
      </div>}
      {approvalStatus === 'pending' && onApprove && onReject && (
        <div className="inline-approval-actions">
          <button className="reject" onClick={event => { event.stopPropagation(); onReject(); }}>Reject</button>
          <button className="approve" onClick={event => { event.stopPropagation(); onApprove(); }}>Approve</button>
        </div>
      )}
    </div>
  );
};

export default DeviceCard;
