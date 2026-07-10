import React, { useState } from 'react';


const roomIcons = [
  { id: 'Home', name: 'Other', src: '/icons/icons/rooms_icons/Other.svg' },
  { id: 'Sofa', name: 'Living Room', src: '/icons/icons/rooms_icons/LivingRoom.svg' },
  { id: 'Bed', name: 'Bedroom', src: '/icons/icons/rooms_icons/MasterBedRoom.svg' },
  { id: 'ChefHat', name: 'Kitchen', src: '/icons/icons/rooms_icons/Kitchen.svg' },
  { id: 'Bath', name: 'Bathroom', src: '/icons/icons/rooms_icons/BathRoom.svg' },
  { id: 'Building', name: 'Hall', src: '/icons/icons/rooms_icons/Hall.svg' },
  { id: 'Trees', name: 'Balcony', src: '/icons/icons/rooms_icons/Balcony.svg' },
  { id: 'Car', name: 'Garage', src: '/icons/icons/rooms_icons/Other.svg' },
  { id: 'Gamepad', name: 'Theatre', src: '/icons/icons/rooms_icons/HomeTheatre.svg' },
  { id: 'Lightbulb', name: 'Study', src: '/icons/icons/rooms_icons/StudyRoom.svg' },
];

const AddRoomModal = ({ isOpen, onClose, onAdd }) => {
  const [formData, setFormData] = useState({
    name: '',
    icon: 'Home'
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name) return;
    onAdd(formData);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up">
        <div className="modal-header">
          <h2>Create New Room</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Room Name</label>
            <input 
              type="text" 
              placeholder="e.g. Balcony, Study Room"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Room Icon</label>
            <div className="icon-selector">
              {roomIcons.map(({ id, name, src }) => (
                <button
                  key={id}
                  type="button"
                  className={`icon-btn ${formData.icon === id ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, icon: id })}
                >
                  <img src={src} alt={name} style={{ width: 36, height: 36, filter: formData.icon === id ? 'brightness(10)' : 'none' }} />
                  <span className="icon-label">{name}</span>
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="submit-btn">Create Room</button>
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
        
        .icon-selector { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .icon-btn { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 8px; font-size: 20px; background: var(--bg-main); border: 1px solid transparent; border-radius: var(--radius-sm); transition: var(--transition); cursor: pointer; }
        .icon-btn:hover { background: var(--primary-glow); border-color: var(--primary-glow); }
        .icon-btn.active { background: var(--primary); border-color: var(--primary); box-shadow: 0 4px 12px var(--primary-glow); transform: scale(1.05); }
        .icon-label { font-size: 10px; font-weight: 600; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; }
        .icon-btn.active .icon-label { color: white; }
        
        .submit-btn { width: 100%; padding: 12px; background: var(--primary); color: white; border-radius: var(--radius-sm); font-weight: 700; margin-top: 8px; transition: var(--transition); box-shadow: 0 4px 12px var(--primary-glow); font-size: 14px; }
        .submit-btn:hover { transform: translateY(-2px); background: var(--primary-dark); }

        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        @media (max-width: 768px) {
          .modal-content { 
            width: 90%; 
            max-width: 400px; 
            padding: 24px; 
          }
        }
      `}</style>
    </div>
  );
};

export default AddRoomModal;
