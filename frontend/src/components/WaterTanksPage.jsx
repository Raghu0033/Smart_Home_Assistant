import React from 'react';
import WaterLevelPanel from './WaterLevelPanel';

const WaterTanksPage = ({ socket, mqttStatus, onNotify, tanks, onAddTank, selectedTankId, onOpenTank, onCloseTank }) => {
  const selectedTank = tanks.find(tank => tank.deviceId === selectedTankId);

  if (selectedTank) {
    return (
      <div className="water-tanks-page animate-slide-up">
        <button className="water-tank-back" type="button" onClick={onCloseTank}>
          <span aria-hidden="true">←</span> Back to Water Tanks
        </button>
        <WaterLevelPanel tank={selectedTank} socket={socket} mqttStatus={mqttStatus} onNotify={onNotify} />
      </div>
    );
  }

  return (
  <div className="water-tanks-page animate-slide-up">
    <div className="welcome-header">
      <div className="header-text">
        <h1>Water Tanks</h1>
        <p>{tanks.length} registered tank{tanks.length === 1 ? '' : 's'} with live MQTT status</p>
      </div>
      <button className="action-btn-pill primary" onClick={onAddTank}>+ Add Water Tank</button>
    </div>
    {tanks.length === 0 ? (
      <div className="empty-state glass">
        <div style={{fontSize: 48}}>💧</div>
        <p>No water tanks registered yet</p>
        <button onClick={onAddTank}>Add your first tank</button>
      </div>
    ) : (
      <div className="water-tanks-overview-grid">
        {tanks.map(tank => (
          <button className="water-tank-card glass card-hover" key={tank.deviceId} onClick={() => onOpenTank(tank.deviceId)}>
            <span className="water-tank-card-icon"><img src="/icons/devices/water_tank.svg" alt="" /></span>
            <span className="water-tank-card-copy">
              <strong>{tank.title || 'Water Tank'}</strong>
              <small>{tank.deviceId}</small>
              <small className={tank.isOnline ? 'online' : 'offline'}>{tank.isOnline ? 'Connected' : 'Waiting for communication'}</small>
            </span>
            <span className="water-tank-card-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    )}
  </div>
  );
};

export default WaterTanksPage;
