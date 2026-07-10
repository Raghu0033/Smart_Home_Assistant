import React, { useState, useEffect } from 'react';

const ProvisioningModal = ({ isOpen, onClose, onFinish }) => {
  const API_BASE = `http://${window.location.hostname}:3000`;
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    icon: null,
    label: '',
    ssid: '',
    password: '',
    room: 'Unassigned',
    deviceId: '',
    numSwitches: 1,
    numFans: 0
  });
  const [subDevices, setSubDevices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);

  const DEVICE_TYPE_MAP = {
    'Tune Light': 'tunable-light',
    'RGBW Light': 'rgbw',
    'Smart Plug': 'plug',
    'Curtain': 'curtain',
    '3-Phase Auditor': 'three-phase',
    'Single Phase Auditor': 'single-phase',
    'Touch Panel': 'touch-panel'
  };

  const getDefaultTopic = (type, deviceId) => {
    if (type === 'touch-panel') return `touch-panel/${deviceId}/switch/status`;
    if (type === 'rgbw') return `rgbw-light/${deviceId}/light/command`;
    if (type === 'tunable-light') return `tunable-light/${deviceId}/light/command`;
    if (type === 'light') return `smart_home/rgbw/${deviceId}/command`;
    return `smarthome/${type}/${deviceId}`;
  };

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setFormData({
        title: '',
        icon: null,
        label: '',
        ssid: '',
        password: '',
        room: 'Unassigned',
        deviceId: '',
        numSwitches: 1,
        numFans: 0
      });
      fetchRooms();
    }
  }, [isOpen]);

  const fetchRooms = async () => {
    try {
      const token = localStorage.getItem('smarthome_token');
      const res = await fetch(`${API_BASE}/api/rooms`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch rooms', err);
      setRooms([]);
    }
  };

  if (!isOpen) return null;

  const icons = [
    { label: 'Tune Light', icon: <img src="/icons/devices/light.png" alt="Light" style={{width: 32, height: 32, objectFit: 'contain'}} /> },
    { label: 'Smart Plug', icon: <img src="/icons/devices/plug.png" alt="Plug" style={{width: 32, height: 32, objectFit: 'contain'}} /> },
    { label: 'RGBW Light', icon: <img src="/icons/devices/rgbw.png" alt="RGBW" style={{width: 32, height: 32, objectFit: 'contain'}} /> },
    { label: 'Curtain', icon: <img src="/icons/devices/curtain.png" alt="Curtain" style={{width: 32, height: 32, objectFit: 'contain'}} /> },
    { label: '3-Phase Auditor', icon: <img src="/icons/devices/auditor.png" alt="3-Phase Auditor" style={{width: 32, height: 32, objectFit: 'contain'}} /> },
    { label: 'Single Phase Auditor', icon: <img src="/icons/devices/auditor.png" alt="Single Phase Auditor" style={{width: 32, height: 32, objectFit: 'contain'}} /> },
    { label: 'Touch Panel', icon: <img src="/icons/devices/touch_panel.png" alt="Touch Panel" style={{width: 32, height: 32, objectFit: 'contain'}} /> }
  ];

  const handleNext = () => setStep(step + 1);
  const handleBack = () => setStep(step - 1);

  const updateSubDevices = (switches, fans) => {
    const list = [];
    for (let i = 1; i <= switches; i++) {
      list.push({ index: i, type: 'switch', label: `Switch ${i}`, on: false });
    }
    for (let i = 1; i <= fans; i++) {
      list.push({ index: switches + i, type: 'fan', label: `Fan ${i}`, on: false, speed: 1 });
    }
    setSubDevices(list);
  };

  const startProvisioning = () => {
    setIsConnecting(true);
    // Simulate IoT connection delay
    setTimeout(() => {
      setIsConnecting(false);
      const deviceId = formData.deviceId || `esp-${Math.random().toString(16).slice(2, 6)}`;
      const type = DEVICE_TYPE_MAP[formData.label] || 'tunable-light';
      
      onFinish({
        deviceId: deviceId.trim(),
        title: formData.title || `My ${formData.label || 'Device'}`,
        type,
        room: formData.room,
        isConfigured: true,
        topic: getDefaultTopic(type, deviceId.trim()),
        subDevices: type === 'touch-panel' ? subDevices : []
      });
      setStep(1);
      setFormData({ ...formData, title: '', ssid: '', password: '', room: 'Unassigned', numSwitches: 1, numFans: 0 });
      setSubDevices([]);
      onClose();
    }, 3000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up provisioning-modal">
        <div className="modal-header">
          <h2>{step === 1 ? 'Select Device Type' : 'Configure & Connect'}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {step === 1 && (
          <div className="step-content scrollable animate-slide-up">
            <div className="step-intro selection-mode">
              <div className="intro-text">
                <h3>What are we adding?</h3>
                <p>Choose an appliance type to get started.</p>
              </div>
            </div>

            <div className="icon-selection-grid">
              {icons.map(item => (
                <button 
                  key={item.label}
                  className={`device-type-card ${formData.label === item.label ? 'active' : ''}`}
                  onClick={() => {
                    setFormData({ ...formData, icon: item.icon, label: item.label });
                    if (item.label === 'Touch Panel') {
                      updateSubDevices(1, 0);
                    }
                  }}
                >
                  <div className="type-icon-wrapper">
                    <span className="type-icon">{item.icon}</span>
                  </div>
                  <span className="type-label">{item.label}</span>
                  <div className="selection-indicator"></div>
                </button>
              ))}
            </div>
            <div className="modal-footer-btns single">
              <button className="primary-setup-btn" onClick={handleNext} disabled={!formData.label}>
                Next Step
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="step-content scrollable">
            <div className="step-intro">
              <span className="selected-icon-preview">{formData.icon}</span>
              <div className="intro-text">
                <h3>{formData.label || 'New Device'}</h3>
                <p>Finalize the details to add this to your home.</p>
              </div>
            </div>
            
            <div className="setup-form-grid">
              <div className="form-card">
                <div className="card-tag">DEVICE INFO</div>
                <div className="form-group">
                  <label>Display Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Master Bedroom Fan"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Device ID</label>
                    <input 
                      type="text" 
                      placeholder="BSP..."
                      value={formData.deviceId}
                      onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Room</label>
                    <select 
                      value={formData.room}
                      className="room-select-input"
                      onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                    >
                      <option value="Unassigned">Unassigned</option>
                      {(Array.isArray(rooms) ? rooms : []).map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {formData.label === 'Touch Panel' && (
                <div className="form-card specialized">
                  <div className="card-tag">PANEL CONFIG</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Switches</label>
                      <input 
                        type="number" min="1" max="12"
                        value={formData.numSwitches}
                        onChange={(e) => {
                          const count = parseInt(e.target.value) || 0;
                          setFormData({ ...formData, numSwitches: count });
                          updateSubDevices(count, formData.numFans);
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label>Fans</label>
                      <input 
                        type="number" min="0" max="4"
                        value={formData.numFans}
                        onChange={(e) => {
                          const count = parseInt(e.target.value) || 0;
                          setFormData({ ...formData, numFans: count });
                          updateSubDevices(formData.numSwitches, count);
                        }}
                      />
                    </div>
                  </div>

                  <div className="sub-devices-list">
                    {subDevices.map((sd, i) => (
                      <div key={i} className="mini-sub-input">
                        <span className="type-badge">{sd.type === 'fan' ? <img src="/icons/icons/Power.svg" alt="Fan" style={{width:16, height:16}}/> : <img src="/icons/icons/Theme.svg" alt="Tune light" style={{width:16, height:16}}/>}</span>
                        <input 
                          type="text" 
                          placeholder={`Button ${sd.index}`}
                          value={sd.label}
                          onChange={(e) => {
                            const newSD = [...subDevices];
                            newSD[i].label = e.target.value;
                            setSubDevices(newSD);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            <div className="modal-footer-btns">
              <button className="secondary-btn" onClick={handleBack}>Change Type</button>
              <button className="primary-setup-btn" onClick={startProvisioning}>
                Complete Setup
              </button>
            </div>
          </div>
        )}

        {isConnecting && (
          <div className="loading-overlay">
            <div className="loader"></div>
            <p>Connecting to {formData.ssid}...</p>
            <span>Assigning to {formData.room === 'Unassigned' ? 'Unassigned' : formData.room} room</span>
          </div>
        )}
      </div>

      <style>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(64, 52, 42, 0.2); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center; z-index: 1100;
        }
        .provisioning-modal {
          background: var(--bg-card); width: 90%; max-width: 440px; border-radius: var(--radius-lg); padding: 28px;
          box-shadow: var(--shadow-deep); position: relative; overflow: hidden; border: 1px solid var(--border);
        }
        .modal-header { margin-bottom: 24px; }
        .modal-header h2 { font-size: 18px; font-weight: 800; color: var(--text-main); letter-spacing: -0.5px; }
        .close-btn { position: absolute; top: 20px; right: 20px; font-size: 20px; background: none; color: var(--text-muted); cursor: pointer; transition: var(--transition); }
        .close-btn:hover { color: var(--text-main); transform: rotate(90deg); }
        
        .step-intro { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding: 16px; background: var(--bg-main); border-radius: var(--radius-md); }
        .selected-icon-preview { font-size: 24px; background: var(--bg-card); width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-md); box-shadow: var(--shadow-soft); }
        .intro-text h3 { font-size: 15px; font-weight: 800; margin: 0; color: var(--text-main); }
        .intro-text p { font-size: 11px; color: var(--text-muted); margin: 2px 0 0; }

        .setup-form-grid { display: flex; flex-direction: column; gap: 20px; }
        .form-card { background: var(--bg-card); padding: 20px; border-radius: var(--radius-md); border: 1px solid var(--border); position: relative; }
        .form-card.specialized { background: var(--bg-main); border-style: dashed; }
        .card-tag { position: absolute; top: -10px; left: 16px; background: var(--primary); color: white; font-size: 9px; font-weight: 900; padding: 4px 10px; border-radius: 100px; letter-spacing: 0.5px; }

        .form-group { margin-bottom: 16px; }
        .form-group:last-child { margin-bottom: 0; }
        .form-group label { display: block; font-size: 10px; font-weight: 800; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        .form-group input, .room-select-input { 
          width: 100%; padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); 
          outline: none; background: var(--bg-main); font-size: 14px; transition: var(--transition); font-weight: 500;
        }
        .form-group input:focus { border-color: var(--primary); background: var(--bg-card); }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .sub-devices-list { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
        .mini-sub-input { display: flex; align-items: center; gap: 8px; }
        .type-badge { font-size: 11px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: var(--bg-card); border-radius: 10px; border: 1px solid var(--border); flex-shrink: 0; }
        .mini-sub-input input { padding: 8px 12px; font-size: 12px; }

        .modal-footer-btns { display: flex; gap: 12px; margin-top: 24px; }
        .primary-setup-btn { flex: 2; padding: 14px; background: var(--primary); color: white; border-radius: var(--radius-sm); font-weight: 800; font-size: 14px; box-shadow: 0 4px 12px var(--primary-glow); transition: var(--transition); cursor: pointer; }
        .primary-setup-btn:hover { background: var(--primary-dark); transform: translateY(-2px); }
        .secondary-btn { flex: 1; padding: 14px; background: var(--bg-main); color: var(--text-muted); border-radius: var(--radius-sm); font-weight: 700; font-size: 13px; cursor: pointer; }

        /* Step 1 Selection Grid */
        .icon-selection-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
        .device-type-card {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 16px 12px; border-radius: var(--radius-md); background: var(--bg-main); border: 2px solid transparent;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); position: relative; cursor: pointer;
        }
        .device-type-card:hover { transform: translateY(-3px); background: rgba(249,115,22,0.08); border-color: rgba(249,115,22,0.3); }
        .device-type-card.active {
          background: rgba(249,115,22,0.12);
          border-color: #f97316;
          transform: translateY(-2px);
          box-shadow: 0 0 0 3px rgba(249,115,22,0.2), 0 6px 20px rgba(249,115,22,0.25);
        }
        
        .type-icon-wrapper { 
          width: 48px; height: 48px; background: var(--bg-card); border-radius: 12px;
          display: flex; align-items: center; justify-content: center; font-size: 22px;
          box-shadow: var(--shadow-soft); transition: all 0.25s;
        }
        .active .type-icon-wrapper { background: #f97316; transform: scale(1.08); box-shadow: 0 4px 14px rgba(249,115,22,0.5); }
        .type-label { font-size: 11px; font-weight: 800; color: var(--text-muted); text-align: center; line-height: 1.2; }
        .active .type-label { color: #f97316; font-weight: 900; }

        .selection-indicator { 
          position: absolute; top: 8px; right: 8px; width: 8px; height: 8px; 
          border-radius: 50%; background: #f97316; opacity: 0; transform: scale(0); transition: all 0.25s;
        }
        .active .selection-indicator { opacity: 1; transform: scale(1); box-shadow: 0 0 6px rgba(249,115,22,0.8); }

        .modal-footer-btns.single { margin-top: 8px; }
        
        .scrollable { max-height: 400px; overflow-y: auto; padding-right: 8px; margin-right: -8px; }
        .scrollable::-webkit-scrollbar { width: 4px; }
        .scrollable::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }

        .loading-overlay {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: var(--bg-card); display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 40px; z-index: 10; color: var(--text-main);
        }
        .loader {
          width: 40px; height: 40px; border: 4px solid var(--bg-main); border-top-color: var(--primary);
          border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }

        @media (max-width: 768px) {
          .provisioning-modal {
            width: 90% !important;
            max-width: 440px !important;
            border-radius: var(--radius-lg) !important;
            max-height: 90dvh;
            overflow-y: auto;
            padding: 24px !important;
          }
          .form-row {
            grid-template-columns: 1fr;
          }
          .icon-selection-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .modal-footer-btns {
            flex-direction: column-reverse;
          }
          .primary-setup-btn, .secondary-btn {
            width: 100%;
          }
          .sub-devices-list {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default ProvisioningModal;

