import React from 'react';


const DeviceStatus = ({ status, mqttStatus }) => {
  const isOnline = mqttStatus === 'Connected';
  const data = status || {};

  return (
    <div className="card">
      <h2><img src="/icons/icons/Insight-White.svg" alt="Activity" style={{width: 24, height: 24}} /> Device Status</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Connection</span>
          <div className={`status-badge ${isOnline ? 'status-online' : 'status-offline'}`}>
            <img src="/icons/icons/WIFI-White.svg" alt="Wifi" style={{width: 14, height: 14}} /> {mqttStatus}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                <img src="/icons/icons/Power-White.svg" alt="Zap" style={{width: 14, height: 14, marginRight: '4px'}} /> STATE
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '700', color: data.state === 'ON' ? 'var(--success)' : 'var(--text-secondary)' }}>
                {data.state || 'UNKNOWN'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                <img src="/icons/icons/Theme.svg" alt="Brightness" style={{width: 14, height: 14, marginRight: '4px'}} /> BRIGHTNESS
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '700' }}>
                {data.brightness !== undefined ? `${Math.round((data.brightness / 255) * 100)}%` : '--'}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Lux Level</span>
            <span>{data.lux !== undefined ? `${data.lux} lx` : '--'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Current Effect</span>
            <span style={{ textTransform: 'capitalize' }}>{data.effect || 'None'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Sensor Status</span>
            <span style={{ color: data.sensor === 'online' ? 'var(--success)' : 'var(--danger)' }}>
              {data.sensor || 'Unknown'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceStatus;

