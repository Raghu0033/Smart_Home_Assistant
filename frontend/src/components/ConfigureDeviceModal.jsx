import React, { useState, useEffect } from 'react';

const ConfigureDeviceModal = ({ isOpen, onClose, onConfigure, device }) => {
  const API_BASE = `http://${window.location.hostname}:3000`;
  const [formData, setFormData] = useState({
    title: '',
    type: 'light',
    icon: '💡',
    room: 'Unassigned',
    subDevices: []
  });
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    if (device) {
      setFormData({
        title: device.title || '',
        type: device.type || 'light',
        icon: device.icon || '💡',
        room: device.room || 'Unassigned',
        subDevices: device.subDevices || []
      });
    }
  }, [device]);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const token = localStorage.getItem('smarthome_token');
        const res = await fetch(`${API_BASE}/api/rooms`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const data = await res.json();
        setRooms(data);
      } catch (err) {
        console.error('Failed to fetch rooms', err);
      }
    };
    fetchRooms();
  }, []);

  if (!isOpen || !device) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfigure(device.deviceId, formData);
    onClose();
  };

  const icons = ['💡', '🔌', '📊', '🔘', '🌈', '🔆', '🪟', '❄️', '📺', '📹', '🔊', '🌡️', '🔒'];

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up">
        <div className="modal-header">
          <h2>Configure Device</h2>
          <p className="subtitle">ID: {device.deviceId}</p>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Appliance Name</label>
            <input 
              type="text" 
              placeholder="e.g. Master Bedroom Fan"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Assign to Room</label>
            <select 
              value={formData.room}
              onChange={(e) => setFormData({ ...formData, room: e.target.value })}
              className="room-select"
            >
              <option value="Unassigned">Unassigned</option>
              {rooms.map(room => (
                <option key={room.name} value={room.name}>{room.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Select Appliance Type Icon</label>
            <div className="icon-selector">
              {icons.map(icon => (
                <button
                  key={icon}
                  type="button"
                  className={`icon-btn ${formData.icon === icon ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, icon })}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {device.type === 'touch-panel' && formData.subDevices.length > 0 && (
            <div className="form-group">
              <label>Switch & Fan Labels</label>
              <div className="sub-devices-edit-list">
                {formData.subDevices.map((sd, i) => (
                  <div key={i} className="sub-device-edit-row">
                    <span className="index-badge">{sd.index}</span>
                    <input 
                      type="text" 
                      value={sd.label}
                      placeholder={`${sd.type === 'fan' ? 'Fan' : 'Switch'} Name`}
                      onChange={(e) => {
                        const newSD = [...formData.subDevices];
                        newSD[i].label = e.target.value;
                        setFormData({ ...formData, subDevices: newSD });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="submit" className="submit-btn">Complete Setup</button>
        </form>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .modal-content {
          background: var(--bg-card); width: 95%; max-width: 480px; border-radius: 28px; padding: 32px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
          max-height: 90vh; overflow-y: auto;
          position: relative;
        }
        /* Custom Scrollbar for the modal */
        .modal-content::-webkit-scrollbar { width: 6px; }
        .modal-content::-webkit-scrollbar-track { background: transparent; }
        .modal-content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }

        .modal-header { margin-bottom: 24px; position: sticky; top: -32px; background: var(--bg-card); z-index: 10; padding-bottom: 12px; border-bottom: 1px solid var(--border); margin-left: -32px; margin-right: -32px; padding-left: 32px; padding-right: 32px; }
        .modal-header h2 { font-size: 20px; font-weight: 700; }
        .subtitle { font-size: 12px; color: var(--text-muted); font-family: monospace; }
        .close-btn { position: absolute; top: 20px; right: 24px; font-size: 24px; background: none; color: var(--text-muted); }
        
        .form-group { margin-bottom: 24px; }
        .form-group label { display: block; font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
        .form-group input, .room-select { width: 100%; padding: 14px 18px; border-radius: 14px; border: 1px solid var(--border); outline: none; background: var(--bg-secondary); transition: var(--transition); }
        .form-group input:focus { border-color: var(--primary); box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1); }
        
        .icon-selector { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
        .icon-btn { height: 48px; font-size: 20px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; transition: var(--transition); }
        .icon-btn:hover { background: var(--border); }
        .icon-btn.active { background: var(--primary); color: white; border-color: var(--primary); }
        
        .submit-btn { width: 100%; padding: 16px; background: var(--primary); color: white; border-radius: 16px; font-weight: 800; font-size: 15px; margin-top: 10px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); transition: var(--transition); }
        .submit-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4); }
        .submit-btn:active { transform: translateY(0); }

        .sub-devices-edit-list { display: flex; flex-direction: column; gap: 8px; background: var(--bg-secondary); padding: 12px; border-radius: 18px; border: 1px solid var(--border); }
        .sub-device-edit-row { display: flex; align-items: center; gap: 10px; }
        .index-badge { width: 28px; height: 28px; background: var(--primary); color: white; border-radius: 80%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; }
        .sub-device-edit-row input { flex: 1; padding: 10px 14px; border-radius: 10px; font-size: 14px; background: var(--bg-card); }

        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default ConfigureDeviceModal;
