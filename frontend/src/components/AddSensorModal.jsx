import React, { useState } from 'react';



const AddSensorModal = ({ isOpen, onClose, onAdd, rooms }) => {
  const [formData, setFormData] = useState({
    name: '',
    topic: '',
    room: 'Unassigned',
    unit: ''
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd(formData);
    setFormData({ name: '', topic: '', room: 'Unassigned', unit: '' });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up premium-sensor-modal">
        <div className="modal-premium-header">
          <div className="header-bg-glow"></div>
          <div className="header-content-top">
            <div className="header-icon-circle">
              <img src="/icons/icons/Insight-White.svg" alt="Activity" style={{width: 20, height: 20}} />
            </div>
            <button className="close-pill-btn" onClick={onClose}>
              <img src="/icons/icons/Close-White.svg" alt="Close" style={{width: 16, height: 16}} />
            </button>
          </div>
          <div className="header-text-bottom">
            <h2>Add Custom Sensor</h2>
            <p>Register a new telemetry source</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="premium-form-body">
          <div className="form-section">
            <div className="input-field-wrapper">
              <label><img src="/icons/icons/Edit.svg" alt="Tag" style={{width: 12, height: 12}} /> Sensor Name</label>
              <input 
                type="text" 
                required
                placeholder="e.g. Living Room Pressure"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="input-field-wrapper">
              <label><img src="/icons/icons/Connect.svg" alt="Link" style={{width: 12, height: 12}} /> MQTT Topic</label>
              <input 
                type="text" 
                required
                placeholder="smart_home/sensors/topic"
                value={formData.topic}
                onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
              />
            </div>

            <div className="form-grid-2">
              <div className="input-field-wrapper">
                <label><img src="/icons/icons/Notification.svg" alt="Info" style={{width: 12, height: 12}} /> Unit</label>
                <input 
                  type="text" 
                  placeholder="kg, °C, %"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                />
              </div>
              <div className="input-field-wrapper">
                <label><img src="/icons/icons/Home.svg" alt="Room" style={{width: 12, height: 12}} /> Room</label>
                <select 
                  className="premium-select"
                  value={formData.room}
                  onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                >
                  <option value="Unassigned">Unassigned</option>
                  {(Array.isArray(rooms) ? rooms : []).map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="premium-modal-footer">
            <button type="button" className="action-btn-pill secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="action-btn-pill primary flex-grow">
              Register Sensor
            </button>
          </div>
        </form>

        <style>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(64, 52, 42, 0.2);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1200;
          }
          .modal-content {
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-deep);
            border: 1px solid var(--border);
          }
          .modal-premium-header {
            position: relative;
            padding: 24px;
            background: var(--bg-sidebar);
            color: white;
            overflow: hidden;
          }
          .header-bg-glow {
            position: absolute;
            top: -30px;
            right: -30px;
            width: 120px;
            height: 120px;
            background: rgba(255, 255, 255, 0.08);
            filter: blur(30px);
            border-radius: 50%;
          }
          .header-content-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 16px;
            position: relative;
            z-index: 1;
          }
          .header-icon-circle {
            width: 44px;
            height: 44px;
            background: rgba(255, 255, 255, 0.12);
            border-radius: var(--radius-md);
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
          }
          .close-pill-btn {
            background: rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.6);
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: var(--transition);
          }
          .close-pill-btn:hover {
            background: rgba(255, 255, 255, 0.14);
            color: white;
            transform: rotate(90deg);
          }
          .header-text-bottom h2 {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 2px;
            letter-spacing: -0.3px;
          }
          .header-text-bottom p {
            font-size: 11px;
            opacity: 0.7;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .premium-form-body {
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          .form-section {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .input-field-wrapper {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .input-field-wrapper label {
            font-size: 10px;
            font-weight: 800;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .input-field-wrapper input, .premium-select {
            width: 100%;
            padding: 10px 14px;
            border-radius: var(--radius-sm);
            border: 1px solid var(--border);
            background: var(--bg-main);
            color: var(--text-main);
            font-size: 14px;
            font-weight: 500;
            transition: var(--transition);
            outline: none;
          }
          .input-field-wrapper input:focus, .premium-select:focus {
            border-color: var(--primary);
            background: var(--bg-card);
          }
          .form-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1.5fr;
            gap: 12px;
          }
          .premium-modal-footer {
            display: flex;
            gap: 12px;
            margin-top: 4px;
          }
          .flex-grow { flex: 1; }
          .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
          @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

          .premium-sensor-modal {
            max-width: 420px;
            padding: 0 !important;
            overflow: hidden;
            width: 100%;
          }

          @media (max-width: 768px) {
            .premium-sensor-modal {
              width: 90% !important;
              max-width: 440px !important;
              border-radius: var(--radius-lg) !important;
              margin: auto;
              max-height: 90dvh;
              overflow-y: auto;
            }
            .form-grid-2 {
              grid-template-columns: 1fr;
            }
            .premium-modal-footer {
              flex-direction: column-reverse;
              gap: 8px;
            }
            .action-btn-pill {
              width: 100%;
              justify-content: center;
              padding: 14px;
            }
            .premium-form-body {
              padding-bottom: max(24px, env(safe-area-inset-bottom));
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export default AddSensorModal;

