import React, { useState, useEffect } from 'react';


const AddDeviceModal = ({ isOpen, onClose, onAdd }) => {
  const [formData, setFormData] = useState({
    title: '',
    deviceId: '',
    type: 'light',
    icon: '💡',
    room: 'Unassigned'
  });
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/rooms');
        const data = await res.json();
        setRooms(data);
        if (data.length > 0) setFormData(prev => ({ ...prev, room: data[0].name }));
      } catch (err) {
        console.error('Failed to fetch rooms', err);
      }
    };
    fetchRooms();
  }, []);


  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title || !formData.deviceId) return;
    onAdd(formData);
    onClose();
  };

  const icons = ['💡', '🔌', '📊', '🔘', '🌈', '🔆', '🪟', '❄️', '📺', '📹', '🔊', '🌡️', '🔒'];

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up">
        <div className="modal-header">
          <h2>Add New Device</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Device Name</label>
            <input 
              type="text" 
              placeholder="e.g. Kitchen Light"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Device ID (Unique)</label>
            <input 
              type="text" 
              placeholder="e.g. light-kitchen"
              value={formData.deviceId}
              onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Room</label>
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
            <label>Icon</label>

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
          <button type="submit" className="submit-btn">Add Device</button>
        </form>
      </div>

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
          z-index: 1000;
        }
        .modal-content {
          background: var(--bg-card);
          width: 90%;
          max-width: 400px;
          border-radius: var(--radius-lg);
          padding: 24px;
          box-shadow: var(--shadow-deep);
          border: 1px solid var(--border);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .modal-header h2 { font-size: 18px; font-weight: 700; color: var(--text-main); letter-spacing: -0.3px; }
        .close-btn { font-size: 20px; background: none; color: var(--text-muted); cursor: pointer; transition: var(--transition); }
        .close-btn:hover { color: var(--text-main); transform: rotate(90deg); }
        
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        .form-group input { width: 100%; padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); outline: none; transition: var(--transition); background: var(--bg-main); font-size: 14px; font-weight: 500; color: var(--text-main); }
        .form-group input:focus { border-color: var(--primary); background: var(--bg-card); }
        
        .room-select { width: 100%; padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); outline: none; background: var(--bg-main); cursor: pointer; font-size: 14px; font-weight: 500; color: var(--text-main); }
        
        .icon-selector { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }

        .icon-btn { height: 40px; font-size: 18px; background: var(--bg-main); border: 1px solid transparent; border-radius: var(--radius-sm); transition: var(--transition); cursor: pointer; }
        .icon-btn:hover { background: var(--primary-glow); border-color: var(--primary-glow); }
        .icon-btn.active { background: var(--primary); border-color: var(--primary); box-shadow: 0 4px 12px var(--primary-glow); transform: scale(1.05); }
        
        .submit-btn { width: 100%; padding: 12px; background: var(--primary); color: white; border-radius: var(--radius-sm); font-weight: 700; margin-top: 8px; transition: var(--transition); box-shadow: 0 4px 12px var(--primary-glow); font-size: 14px; }
        .submit-btn:hover { transform: translateY(-2px); background: var(--primary-dark); }

        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default AddDeviceModal;
