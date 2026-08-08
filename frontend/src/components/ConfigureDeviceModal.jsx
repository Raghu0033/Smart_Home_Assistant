import { useState, useEffect } from 'react';
import { getRoomOptionLabel } from '../roomUtils';
import TouchPanelBacklight from './TouchPanelBacklight';

const ConfigureDeviceModal = ({ isOpen, onClose, onConfigure, device, socket }) => {
  const API_BASE = `http://${window.location.hostname}:3000`;
  const isIRBlaster = device?.type === 'ir-blaster';
  const [formData, setFormData] = useState({
    deviceId: '',
    title: '',
    type: 'light',
    icon: '💡',
    room: 'Unassigned',
    roomId: '',
    companyName: 'DAIKIN',
    model: 'CASSETTE',
    modelNo: 'BRC91A157',
    subDevices: []
  });
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    if (device) {
      setFormData({
        deviceId: device.deviceId || '',
        title: device.title || '',
        type: device.type || 'light',
        icon: device.icon || '💡',
        room: device.room || 'Unassigned',
        roomId: device.roomId || '',
        companyName: device.companyName || 'DAIKIN',
        model: device.model || 'CASSETTE',
        modelNo: device.modelNo || 'BRC91A157',
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
  const isTouchPanel = device.type === 'touch-panel' || device.type === 'retro-fit' || (Array.isArray(device.subDevices) && device.subDevices.length > 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfigure(device.deviceId, formData);
    onClose();
  };

  const icons = ['💡', '🔌', '📊', '📡', '🔘', '🌈', '🔆', '🪟', '❄️', '📺', '📹', '🔊', '🌡️', '🔒'];

  return (
    <div className="modal-overlay">
      <div className={`modal-content device-config-modal animate-slide-up ${isTouchPanel ? 'touch-panel-device-config' : ''}`}>
        <div className="modal-header">
          <div className="device-config-heading">
            <span className="device-config-kicker">DEVICE SETTINGS</span>
            <h2>Edit Device</h2>
            <p className="subtitle">{isTouchPanel ? 'Manage panel identity and hardware backlight' : 'Update identity, room, and appearance'}</p>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form className="device-config-form" onSubmit={handleSubmit}>
          <section className="device-config-section">
            <div className="device-config-section-heading">
              <span>01</span>
              <div><strong>Device details</strong><small>Name, room and panel identity</small></div>
            </div>
          <div className="device-identity-grid">
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
              value={formData.roomId || formData.room}
              onChange={(e) => {
                const selectedRoom = rooms.find(room => room._id === e.target.value);
                setFormData({ ...formData, roomId: selectedRoom?._id || '', room: selectedRoom?.name || e.target.value });
              }}
              className="room-select"
            >
              <option value="Unassigned">Unassigned</option>
              {rooms.map(room => (
                <option key={room._id || `${room.name}-${room.icon}`} value={room._id}>{getRoomOptionLabel(room)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Device ID</label>
            <input
              type="text"
              placeholder="Enter the device ID"
              value={formData.deviceId}
              onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
              required
            />
            <small className="field-hint">This must match the ID used by the physical device.</small>
          </div>
          {isIRBlaster && (
            <>
              <div className="form-group">
                <label>Company Name</label>
                <select
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                >
                  <option value="DAIKIN">DAIKIN</option>
                </select>
              </div>
              <div className="form-group">
                <label>Model</label>
                <select
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                >
                  <option value="CASSETTE">CASSETTE</option>
                  <option value="SPLIT">SPLIT</option>
                </select>
              </div>
              <div className="form-group">
                <label>Model No</label>
                <select
                  value={formData.modelNo}
                  onChange={(e) => setFormData({ ...formData, modelNo: e.target.value })}
                >
                  <option value="BRC91A157">BRC91A157</option>
                  <option value="ARC484B32">ARC484B32</option>
                </select>
              </div>
            </>
          )}
          {!isTouchPanel && <div className="form-group">
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
          </div>}
            </div>
          </section>

          {isTouchPanel && socket && (
            <section className="device-config-section backlight-config-section">
              <div className="device-config-section-heading">
                <span>02</span>
                <div><strong>Backlight settings</strong><small>Configure the physical panel illumination</small></div>
              </div>
              <TouchPanelBacklight device={device} socket={socket} />
            </section>
          )}

          <div className="device-config-save-area">
            <button type="submit" className="submit-btn">Save Changes</button>
          </div>
        </form>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .modal-content {
          background: var(--bg-card); width: 95%; max-width: 560px; border-radius: 28px; padding: 32px;
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
        .field-hint { display: block; margin-top: 6px; color: var(--text-muted); font-size: 11px; }
        .sub-devices-edit-list { display: grid; gap: 12px; }
        .sub-device-edit-row { padding: 12px; border: 1px solid var(--border); border-radius: 14px; background: var(--bg-secondary); }
        .sub-device-name-row { display: flex; align-items: center; gap: 10px; }
        .sub-device-current-icon { width: 38px; height: 38px; display: grid; place-items: center; flex: 0 0 38px; border-radius: 10px; background: var(--bg-card); font-size: 20px; }
        .sub-device-icon-picker { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; margin-top: 9px; }
        .sub-device-icon-picker button { min-height: 32px; border: 1px solid transparent; border-radius: 8px; background: var(--bg-card); font-size: 16px; }
        .sub-device-icon-picker button.active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, var(--bg-card)); }
        
        .icon-selector { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
        .icon-btn { height: 48px; font-size: 20px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; transition: var(--transition); }
        .icon-btn:hover { background: var(--border); }
        .icon-btn.active { background: var(--primary); color: white; border-color: var(--primary); }

        .touch-panel-device-config{max-width:525px}.touch-panel-device-config .modal-header{padding-top:18px;padding-bottom:16px}.touch-panel-device-config .device-config-kicker{display:block;margin-bottom:5px;color:var(--primary);font-size:9px;font-weight:800;letter-spacing:1px}.touch-panel-device-config .modal-header h2{margin:0 0 3px;font-size:21px}.touch-panel-device-config .subtitle{margin:0;font-family:inherit;font-size:11px;line-height:1.4}.touch-panel-device-config .close-btn{top:17px;width:36px;height:36px;border:1px solid var(--border);border-radius:10px;background:var(--bg-main)}.device-config-section{padding:18px;border:1px solid var(--border);border-radius:18px;background:var(--bg-main)}.device-config-section+.device-config-section{margin-top:16px}.device-config-section-heading{display:flex;align-items:center;gap:10px;margin-bottom:18px}.device-config-section-heading>span{width:34px;height:34px;display:grid;place-items:center;flex:0 0 34px;border-radius:10px;color:#fff;background:var(--primary);font-size:11px;font-weight:700}.device-config-section-heading strong,.device-config-section-heading small{display:block}.device-config-section-heading strong{color:var(--text-main);font-size:14px}.device-config-section-heading small{margin-top:2px;color:var(--text-muted);font-size:10px}.device-identity-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.device-identity-grid .form-group{margin-bottom:16px}.device-identity-grid .form-group:last-child{grid-column:1/-1}.backlight-config-section{position:relative}.backlight-config-section .device-config-section-heading{padding-right:82px}.backlight-config-section .touch-backlight{margin:0;padding:0;border:0;background:transparent;box-shadow:none}.backlight-config-section .touch-backlight-title{position:absolute;top:18px;right:18px;display:block;padding:0;border:0;background:transparent}.backlight-config-section .touch-backlight-title>div{display:none}.backlight-config-section .touch-backlight-title button{height:36px;padding:0 15px;border-radius:10px;font-size:11px}.backlight-config-section .touch-backlight-preview{grid-template-columns:repeat(2,125px);justify-content:center;gap:12px;margin-top:4px}.backlight-config-section .touch-backlight-preview div{min-height:56px;padding:10px;border-radius:11px}.backlight-config-section .touch-backlight-preview span{font-size:8px}.backlight-config-section .touch-backlight-preview strong{font-size:11px}.backlight-config-section .touch-backlight-grid label:last-child{grid-column:1/-1}
        
        .submit-btn { width: 100%; padding: 16px; background: var(--primary); color: white; border-radius: 16px; font-weight: 800; font-size: 15px; margin-top: 10px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); transition: var(--transition); }
        .submit-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4); }
        .submit-btn:active { transform: translateY(0); }

        .sub-devices-edit-list { display: flex; flex-direction: column; gap: 8px; background: var(--bg-secondary); padding: 12px; border-radius: 18px; border: 1px solid var(--border); }
        .sub-device-edit-row { display: flex; align-items: center; gap: 10px; }
        .index-badge { width: 28px; height: 28px; background: var(--primary); color: white; border-radius: 80%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; }
        .sub-device-edit-row input { flex: 1; padding: 10px 14px; border-radius: 10px; font-size: 14px; background: var(--bg-card); }

        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @media(max-width:640px){.device-identity-grid{grid-template-columns:1fr}.device-identity-grid .form-group:last-child{grid-column:auto}.touch-panel-device-config{padding:22px}.touch-panel-device-config .modal-header{top:-22px;margin-left:-22px;margin-right:-22px;padding-left:22px;padding-right:22px}}
      `}</style>
    </div>
  );
};

export default ConfigureDeviceModal;
