import { useEffect, useMemo, useState } from 'react';
import { getRoomOptionLabel } from '../roomUtils';

const DEVICE_TYPES = [
  { label: 'Tune Light', type: 'tunable-light', iconSrc: '/icons/devices/light.png', description: 'Dimmable white light' },
  { label: 'Smart Plug', type: 'plug', iconSrc: '/icons/devices/plug.png', description: 'Connected power outlet' },
  { label: 'RGBW Light', type: 'rgbw', iconSrc: '/icons/devices/rgbw.png', description: 'Colour and white light' },
  { label: 'Curtain', type: 'curtain', iconSrc: '/icons/devices/curtain.png', description: 'Motorised curtain' },
  { label: 'IR Blaster', type: 'ir-blaster', iconSrc: '/icons/devices/ir_blaster.svg', description: 'Infrared remote hub for AC and appliances' },
  { label: '3-Phase Auditor', type: 'three-phase', iconSrc: '/icons/devices/auditor.png', description: 'Three-phase energy meter' },
  { label: 'Single Phase Auditor', type: 'single-phase', iconSrc: '/icons/devices/auditor.png', description: 'Single-phase energy meter' },
  { label: 'Touch Panel', type: 'touch-panel', iconSrc: '/icons/devices/touch_panel.png', description: 'Multi-channel wall panel' },
  { label: 'Retro Fit', type: 'retro-fit', iconSrc: '/icons/icons/switch.png', description: 'Multi-channel retrofit switch' },
  { label: 'Water Tank', type: 'water-tank', icon: '💧', description: 'Water level monitor' }
];

const MAX_PANEL_CHANNELS = 20;
const MAX_FANS = 4;
const IR_COMPANY_OPTIONS = ['DAIKIN'];
const IR_MODEL_OPTIONS = ['CASSETTE', 'SPLIT'];
const IR_MODEL_NO_OPTIONS = ['BRC91A157', 'ARC484B32'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

const makeSubDevices = (switches, fans, current = []) => {
  const next = [];
  const switchCount = clamp(switches, 1, MAX_PANEL_CHANNELS);
  const fanCount = clamp(fans, 0, Math.min(MAX_FANS, MAX_PANEL_CHANNELS - switchCount));

  for (let i = 0; i < switchCount; i += 1) {
    const existing = current[i]?.type === 'switch' ? current[i] : null;
    next.push({
      index: i + 1,
      type: 'switch',
      applianceType: existing?.applianceType || 'switch',
      label: existing?.label || `Switch ${i + 1}`,
      icon: existing?.icon || '💡',
      on: existing?.on || false
    });
  }
  for (let i = 0; i < fanCount; i += 1) {
    const index = switchCount + i;
    const existing = current[index]?.type === 'fan' ? current[index] : null;
    next.push({
      index: index + 1,
      type: 'fan',
      applianceType: existing?.applianceType || 'fan',
      label: existing?.label || `Fan ${i + 1}`,
      icon: existing?.icon || '🌀',
      on: existing?.on || false,
      speed: existing?.speed || 1
    });
  }
  return next;
};

const initialForm = (initialRoom, initialType) => ({
  title: '',
  icon: initialType === 'Water Tank' ? '💧' : null,
  label: initialType === 'Water Tank' ? 'Water Tank' : '',
  room: initialRoom?.name || 'Unassigned',
  roomId: initialRoom?._id || '',
  deviceId: '',
  companyName: 'DAIKIN',
  model: 'CASSETTE',
  modelNo: 'BRC91A157',
  numSwitches: 4,
  numFans: 0,
  tankCapacity: ''
});

const ProvisioningModal = ({ isOpen, onClose, onFinish, initialType = null, initialRoom = null }) => {
  const API_BASE = `http://${window.location.hostname}:3000`;
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(() => initialForm(initialRoom, initialType));
  const [subDevices, setSubDevices] = useState(() => makeSubDevices(4, 0));
  const [rooms, setRooms] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Opening the reusable dialog starts a fresh provisioning session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(initialType === 'Water Tank' ? 2 : 1);
    setFormData(initialForm(initialRoom, initialType));
    setSubDevices(makeSubDevices(4, 0));

    const fetchRooms = async () => {
      try {
        const token = localStorage.getItem('smarthome_token');
        const res = await fetch(`${API_BASE}/api/rooms`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        setRooms(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to fetch rooms', err);
        setRooms([]);
      }
    };
    fetchRooms();
  }, [API_BASE, initialRoom, initialType, isOpen]);

  const selectedType = useMemo(
    () => DEVICE_TYPES.find(item => item.label === formData.label),
    [formData.label]
  );
  const isTouchPanel = ['touch-panel', 'retro-fit'].includes(selectedType?.type);
  const isIRBlaster = selectedType?.type === 'ir-blaster';
  const isWaterTank = selectedType?.type === 'water-tank';
  const identityIsValid = Boolean(
    formData.title.trim()
    && formData.deviceId.trim()
    && (!isWaterTank || Number(formData.tankCapacity) > 0)
  );
  const isValid = formData.title.trim()
    && formData.deviceId.trim()
    && (!isWaterTank || Number(formData.tankCapacity) > 0)
    && (!isTouchPanel || subDevices.every(channel => channel.label.trim()));

  if (!isOpen) return null;

  const getDefaultTopic = (type, deviceId) => {
    if (type === 'touch-panel') return `touch-panel/${deviceId}/switch/status`;
    if (type === 'retro-fit') return `node-switch/${deviceId}/switch/status`;
    if (type === 'rgbw') return `rgbw-light/${deviceId}/light/command`;
    if (type === 'tunable-light') return `tunable-light/${deviceId}/light/command`;
    if (type === 'ir-blaster') return `ir-blaster/${deviceId}/command`;
    if (type === 'water-tank') return `SMARTHOME/WLI/${deviceId}/TANK`;
    return `smarthome/${type}/${deviceId}`;
  };

  const selectType = item => {
    setFormData(current => ({
      ...current,
      label: item.label,
      icon: item.iconSrc || item.icon
    }));
    if (['touch-panel', 'retro-fit'].includes(item.type)) setSubDevices(makeSubDevices(4, 0));
  };

  const updatePanelCounts = (switches, fans) => {
    const safeSwitches = clamp(switches, 1, MAX_PANEL_CHANNELS);
    const safeFans = clamp(fans, 0, Math.min(MAX_FANS, MAX_PANEL_CHANNELS - safeSwitches));
    setFormData(current => ({ ...current, numSwitches: safeSwitches, numFans: safeFans }));
    setSubDevices(current => makeSubDevices(safeSwitches, safeFans, current));
  };

  const updateChannel = (channelIndex, changes) => {
    setSubDevices(current => current.map((channel, index) => (
      index === channelIndex ? { ...channel, ...changes } : channel
    )));
  };

  const startProvisioning = () => {
    if (!isValid || !selectedType) return;
    setIsConnecting(true);
    window.setTimeout(() => {
      const deviceId = formData.deviceId.trim();
      onFinish({
        deviceId,
        title: formData.title.trim(),
        type: selectedType.type,
        icon: formData.icon,
        room: formData.room,
        roomId: formData.roomId || undefined,
        isConfigured: true,
        topic: getDefaultTopic(selectedType.type, deviceId),
        ...(isIRBlaster ? {
          companyName: formData.companyName,
          model: formData.model,
          modelNo: formData.modelNo,
          receiverDeviceId: deviceId
        } : {}),
        tankCapacity: isWaterTank ? Number(formData.tankCapacity) : undefined,
        subDevices: isTouchPanel ? subDevices : []
      });
      setIsConnecting(false);
      onClose();
    }, 900);
  };

  return (
    <div className="provisioning-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !isConnecting) onClose();
    }}>
      <section
        className={`provisioning-dialog step-${step} ${isTouchPanel ? 'touch-panel-flow' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="provisioning-title"
      >
        <header className="provisioning-header">
          <div>
            <span className="provisioning-eyebrow">ADD DEVICE · STEP {step} OF {isTouchPanel ? 3 : 2}</span>
            <h2 id="provisioning-title">
              {step === 1 ? 'Choose a device' : step === 3 ? 'Name panel controls' : `Set up ${formData.label}`}
            </h2>
            <p>
              {step === 1
                ? 'Select the device you want to connect.'
                : step === 3
                  ? 'Give every switch and fan a clear dashboard name.'
                  : isTouchPanel
                    ? 'Enter the panel identity and choose its controls.'
                    : 'Enter only the details required for this device.'}
            </p>
          </div>
          <button className="provisioning-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        {step === 1 && (
          <>
            <div className="device-picker">
              {DEVICE_TYPES.map(item => (
                <button
                  key={item.label}
                  type="button"
                  className={`device-choice ${formData.label === item.label ? 'active' : ''}`}
                  onClick={() => selectType(item)}
                >
                  <span className="device-choice-icon">
                    {item.iconSrc ? <img src={item.iconSrc} alt="" /> : item.icon}
                  </span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span className="device-check" aria-hidden="true">✓</span>
                </button>
              ))}
            </div>
            <footer className="provisioning-footer">
              <span className="footer-help">You can change these settings later.</span>
              <button className="primary-setup-btn" type="button" onClick={() => setStep(2)} disabled={!selectedType}>
                Continue <span aria-hidden="true">→</span>
              </button>
            </footer>
          </>
        )}

        {step === 2 && (
          <>
            <div className="provisioning-body">
              <div className="setup-layout">
                <section className="setup-section device-info-section">
                  <div className="section-heading">
                    <span>01</span>
                    <div><h3>Device details</h3><p>Identify the device on your dashboard.</p></div>
                    <span className="details-device-icon" title={formData.label}>
                      {String(formData.icon).startsWith('/')
                        ? <img src={formData.icon} alt="" />
                        : formData.icon}
                    </span>
                  </div>
                  <div className="field-grid">
                    <label className="field full">
                      <span>Display name</span>
                      <input
                        autoFocus
                        type="text"
                        placeholder={isTouchPanel ? 'e.g. Kitchen Touch Panel' : 'e.g. Kitchen Light'}
                        value={formData.title}
                        onChange={event => setFormData({ ...formData, title: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Device ID</span>
                      <input
                        type="text"
                        placeholder={isWaterTank ? 'e.g. BS000TANK' : 'e.g. BSQ000001'}
                        value={formData.deviceId}
                        onChange={event => setFormData({ ...formData, deviceId: event.target.value })}
                      />
                    </label>
                    {isIRBlaster && (
                      <>
                        <label className="field">
                          <span>Company Name</span>
                          <select
                            value={formData.companyName}
                            onChange={event => setFormData({ ...formData, companyName: event.target.value })}
                          >
                            {IR_COMPANY_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </label>
                        <label className="field">
                          <span>Model</span>
                          <select
                            value={formData.model}
                            onChange={event => setFormData({ ...formData, model: event.target.value })}
                          >
                            {IR_MODEL_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </label>
                        <label className="field">
                          <span>Model No</span>
                          <select
                            value={formData.modelNo}
                            onChange={event => setFormData({ ...formData, modelNo: event.target.value })}
                          >
                            {IR_MODEL_NO_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </label>
                      </>
                    )}
                    {!isWaterTank && (
                      <label className="field">
                        <span>Room</span>
                        <select
                          value={formData.roomId || formData.room}
                          onChange={event => {
                            const room = rooms.find(item => item._id === event.target.value);
                            setFormData({ ...formData, roomId: room?._id || '', room: room?.name || event.target.value });
                          }}
                        >
                          <option value="Unassigned">Unassigned</option>
                          {['3-Phase Auditor', 'Single Phase Auditor'].includes(formData.label) && <option value="Entire Home">Entire Home</option>}
                          {rooms.map(room => <option key={room._id || room.name} value={room._id}>{getRoomOptionLabel(room)}</option>)}
                        </select>
                      </label>
                    )}
                    {isWaterTank && (
                      <label className="field">
                        <span>Capacity (litres)</span>
                        <input type="number" min="1" placeholder="e.g. 1000" value={formData.tankCapacity}
                          onChange={event => setFormData({ ...formData, tankCapacity: event.target.value })} />
                      </label>
                    )}
                  </div>
                </section>

                {isTouchPanel && (
                  <section className="setup-section channel-section">
                    <div className="section-heading channel-heading">
                      <span>02</span>
                      <div><h3>Panel layout</h3><p>Choose how many switches and fans are on this panel.</p></div>
                      <strong className="channel-count">{subDevices.length} / {MAX_PANEL_CHANNELS} channels</strong>
                    </div>
                    <div className="channel-controls">
                      <label>
                        <span>Light / switch buttons</span>
                        <div className="stepper">
                          <button type="button" onClick={() => updatePanelCounts(formData.numSwitches - 1, formData.numFans)} disabled={formData.numSwitches <= 1}>−</button>
                          <input type="number" min="1" max={MAX_PANEL_CHANNELS - formData.numFans} value={formData.numSwitches}
                            onChange={event => updatePanelCounts(event.target.value, formData.numFans)} />
                          <button type="button" onClick={() => updatePanelCounts(formData.numSwitches + 1, formData.numFans)} disabled={subDevices.length >= MAX_PANEL_CHANNELS}>+</button>
                        </div>
                      </label>
                      <label>
                        <span>Fan controls</span>
                        <div className="stepper">
                          <button type="button" onClick={() => updatePanelCounts(formData.numSwitches, formData.numFans - 1)} disabled={formData.numFans <= 0}>−</button>
                          <input type="number" min="0" max={Math.min(MAX_FANS, MAX_PANEL_CHANNELS - formData.numSwitches)} value={formData.numFans}
                            onChange={event => updatePanelCounts(formData.numSwitches, event.target.value)} />
                          <button type="button" onClick={() => updatePanelCounts(formData.numSwitches, formData.numFans + 1)}
                            disabled={formData.numFans >= MAX_FANS || subDevices.length >= MAX_PANEL_CHANNELS}>+</button>
                        </div>
                      </label>
                    </div>
                  </section>
                )}
              </div>
            </div>
            <footer className="provisioning-footer">
              {!isWaterTank && <button className="secondary-setup-btn" type="button" onClick={() => setStep(1)}>← Change type</button>}
              <span className="footer-help">{isTouchPanel ? `${subDevices.length} controls selected.` : 'Ready to add this device.'}</span>
              <button
                className="primary-setup-btn"
                type="button"
                onClick={isTouchPanel ? () => setStep(3) : startProvisioning}
                disabled={isTouchPanel ? !identityIsValid : !isValid}
              >
                {isTouchPanel ? 'Name controls →' : 'Add device'}
              </button>
            </footer>
          </>
        )}

        {step === 3 && isTouchPanel && (
          <>
            <div className="provisioning-body channel-naming-body">
              <div className="panel-config-summary">
                <div>
                  <span className="summary-icon"><img src="/icons/devices/touch_panel.png" alt="" /></span>
                  <div><strong>{formData.title}</strong><small>{formData.deviceId}</small></div>
                </div>
                <span>{formData.numSwitches} switches · {formData.numFans} fans</span>
              </div>
              <section className="setup-section channel-section">
                <div className="section-heading channel-heading">
                  <span>03</span>
                  <div><h3>Control names</h3><p>These names will appear on the dashboard.</p></div>
                  <strong className="channel-count">{subDevices.length} controls</strong>
                </div>
                <div className="channel-list naming-list">
                  {subDevices.map((channel, index) => (
                    <label className="channel-row" key={`${channel.type}-${channel.index}`}>
                      <span className={`channel-number ${channel.type}`}>{String(channel.index).padStart(2, '0')}</span>
                      <span className="channel-kind">
                        <span>{channel.type === 'fan' ? '🌀' : '💡'}</span>
                        <small>{channel.type === 'fan' ? 'Fan' : 'Switch'}</small>
                      </span>
                      <input
                        autoFocus={index === 0}
                        type="text"
                        aria-label={`Channel ${channel.index} name`}
                        value={channel.label}
                        placeholder={`Name ${channel.type} ${channel.index}`}
                        onChange={event => updateChannel(index, { label: event.target.value })}
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>
            <footer className="provisioning-footer">
              <button className="secondary-setup-btn" type="button" onClick={() => setStep(2)}>← Panel details</button>
              <span className="footer-help">All control names are required.</span>
              <button className="primary-setup-btn" type="button" onClick={startProvisioning} disabled={!isValid}>
                Add {selectedType?.type === 'retro-fit' ? 'retro fit' : 'touch panel'}
              </button>
            </footer>
          </>
        )}

        {isConnecting && (
          <div className="connecting-overlay">
            <div className="loader" />
            <h3>Adding {formData.title.trim()}…</h3>
            <p>Saving the device and its configuration.</p>
          </div>
        )}
      </section>

      <style>{`
        .provisioning-overlay { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center; padding: 24px; background: rgba(24,18,13,.48); backdrop-filter: blur(10px); }
        .provisioning-dialog { width: min(520px, 100%); max-height: min(88dvh, 820px); display: flex; flex-direction: column; overflow: hidden; color: var(--text-main); background: var(--bg-card); border: 1px solid var(--border); border-radius: 24px; box-shadow: 0 28px 80px rgba(38,25,14,.28); animation: provisionIn .28s cubic-bezier(.16,1,.3,1); transition: width .24s ease; }
        .provisioning-dialog.step-1 { width: min(720px, 100%); }
        .provisioning-dialog.touch-panel-flow.step-2 { width: min(560px, 100%); }
        .provisioning-dialog.touch-panel-flow.step-3 { width: min(700px, 100%); }
        .provisioning-header { flex: 0 0 auto; display: flex; justify-content: space-between; gap: 24px; padding: 26px 30px 22px; border-bottom: 1px solid var(--border); }
        .provisioning-eyebrow { display: block; margin-bottom: 5px; color: var(--primary); font-size: 10px; font-weight: 900; letter-spacing: 1.25px; }
        .provisioning-header h2 { margin: 0; font-size: 24px; line-height: 1.2; letter-spacing: -.6px; }
        .provisioning-header p { margin: 6px 0 0; color: var(--text-muted); font-size: 13px; }
        .provisioning-close { width: 38px; height: 38px; flex: 0 0 38px; border: 1px solid var(--border); border-radius: 12px; color: var(--text-muted); background: var(--bg-main); font-size: 24px; cursor: pointer; }
        .provisioning-close:hover { color: var(--text-main); border-color: var(--primary); }
        .device-picker { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; padding: 24px 30px; overflow-y: auto; }
        .device-choice { position: relative; min-width: 0; display: flex; align-items: center; gap: 13px; padding: 14px; border: 1px solid var(--border); border-radius: 16px; color: var(--text-main); background: var(--bg-main); text-align: left; cursor: pointer; transition: .18s ease; }
        .device-choice:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--primary) 50%, var(--border)); background: color-mix(in srgb, var(--primary) 5%, var(--bg-main)); }
        .device-choice.active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 9%, var(--bg-card)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent); }
        .device-choice-icon, .summary-icon { width: 48px; height: 48px; flex: 0 0 48px; display: grid; place-items: center; border-radius: 13px; background: var(--bg-card); border: 1px solid var(--border); font-size: 25px; }
        .device-choice-icon img, .summary-icon img { width: 30px; height: 30px; object-fit: contain; }
        .device-choice strong, .device-choice small { display: block; }
        .device-choice strong { font-size: 13px; }
        .device-choice small { margin-top: 4px; color: var(--text-muted); font-size: 11px; }
        .device-check { position: absolute; top: 10px; right: 10px; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; color: white; background: var(--primary); font-size: 11px; font-weight: 900; opacity: 0; transform: scale(.6); transition: .18s ease; }
        .device-choice.active .device-check { opacity: 1; transform: scale(1); }
        .provisioning-body { min-height: 0; overflow-y: auto; padding: 22px 30px 28px; }
        .setup-layout { display: grid; gap: 16px; }
        .setup-section { padding: 20px; border: 1px solid var(--border); border-radius: 18px; background: var(--bg-main); }
        .section-heading { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 18px; }
        .section-heading > span { width: 28px; height: 28px; display: grid; place-items: center; flex: 0 0 28px; border-radius: 9px; color: white; background: var(--primary); font-size: 10px; font-weight: 900; }
        .section-heading h3 { margin: 0; font-size: 14px; }
        .section-heading p { margin: 3px 0 0; color: var(--text-muted); font-size: 10px; line-height: 1.35; }
        .section-heading > .details-device-icon { width: 38px; height: 38px; display: grid; place-items: center; flex: 0 0 38px; margin-left: auto; border: 1px solid var(--border); border-radius: 11px; color: var(--text-main); background: var(--bg-card); font-size: 20px; }
        .details-device-icon img { width: 25px; height: 25px; object-fit: contain; }
        .channel-heading { align-items: center; }
        .channel-count { margin-left: auto; white-space: nowrap; color: var(--primary); font-size: 10px; }
        .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; }
        .field.full { grid-column: 1 / -1; }
        .field > span, .channel-controls label > span { display: block; margin-bottom: 6px; color: var(--text-muted); font-size: 10px; font-weight: 800; letter-spacing: .35px; text-transform: uppercase; }
        .field input, .field select, .channel-row input { width: 100%; height: 42px; padding: 0 12px; outline: none; border: 1px solid var(--border); border-radius: 11px; color: var(--text-main); background: var(--bg-card); font: inherit; font-size: 12px; }
        .field input:focus, .field select:focus, .channel-row input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent); }
        .channel-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .channel-controls:last-child { margin-bottom: 0; }
        .stepper { height: 40px; display: grid; grid-template-columns: 38px 1fr 38px; overflow: hidden; border: 1px solid var(--border); border-radius: 11px; background: var(--bg-card); }
        .stepper button { border: 0; color: var(--text-main); background: transparent; font-size: 18px; cursor: pointer; }
        .stepper button:hover:not(:disabled) { color: white; background: var(--primary); }
        .stepper button:disabled { opacity: .3; cursor: not-allowed; }
        .stepper input { min-width: 0; width: 100%; border: 0; border-left: 1px solid var(--border); border-right: 1px solid var(--border); outline: none; color: var(--text-main); background: transparent; text-align: center; font-weight: 800; appearance: textfield; }
        .stepper input::-webkit-inner-spin-button { appearance: none; }
        .channel-list { max-height: 286px; display: grid; gap: 8px; padding-right: 5px; overflow-y: auto; scrollbar-width: thin; }
        .channel-row { display: grid; grid-template-columns: 34px 70px 1fr; align-items: center; gap: 9px; padding: 7px; border: 1px solid var(--border); border-radius: 13px; background: var(--bg-card); }
        .channel-number { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; color: #fff; background: #f97316; font-size: 10px; font-weight: 900; }
        .channel-number.fan { background: #0ea5e9; }
        .channel-kind { display: flex; align-items: center; gap: 5px; color: var(--text-muted); }
        .channel-kind > span { font-size: 16px; }
        .channel-kind small { font-size: 10px; font-weight: 800; }
        .channel-row input { height: 36px; }
        .channel-naming-body { padding-top: 18px; }
        .panel-config-summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; padding: 12px 15px; border: 1px solid var(--border); border-radius: 16px; background: var(--bg-main); }
        .panel-config-summary > div { min-width: 0; display: flex; align-items: center; gap: 11px; }
        .panel-config-summary .summary-icon { width: 40px; height: 40px; flex-basis: 40px; }
        .panel-config-summary .summary-icon img { width: 25px; height: 25px; object-fit: contain; }
        .panel-config-summary strong, .panel-config-summary small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .panel-config-summary strong { font-size: 13px; }
        .panel-config-summary small { margin-top: 2px; color: var(--text-muted); font-size: 10px; }
        .panel-config-summary > span { flex: 0 0 auto; padding: 7px 10px; border-radius: 999px; color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, var(--bg-card)); font-size: 10px; font-weight: 850; }
        .naming-list { max-height: min(42dvh, 360px); grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
        .naming-list .channel-row { grid-template-columns: 34px 60px minmax(0,1fr); }
        .provisioning-footer { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 16px 30px; border-top: 1px solid var(--border); background: var(--bg-card); }
        .footer-help { margin-right: auto; color: var(--text-muted); font-size: 11px; }
        .primary-setup-btn, .secondary-setup-btn { min-height: 43px; padding: 0 20px; border-radius: 12px; font-size: 12px; font-weight: 850; cursor: pointer; }
        .primary-setup-btn { border: 0; color: #fff; background: var(--primary); box-shadow: 0 8px 20px var(--primary-glow); }
        .primary-setup-btn:hover:not(:disabled) { transform: translateY(-1px); background: var(--primary-dark); }
        .primary-setup-btn:disabled { opacity: .45; box-shadow: none; cursor: not-allowed; }
        .secondary-setup-btn { border: 1px solid var(--border); color: var(--text-main); background: var(--bg-main); }
        .connecting-overlay { position: absolute; inset: 0; z-index: 4; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px; color: var(--text-main); background: color-mix(in srgb, var(--bg-card) 94%, transparent); backdrop-filter: blur(8px); text-align: center; }
        .connecting-overlay h3 { margin: 16px 0 4px; }
        .connecting-overlay p { margin: 0; color: var(--text-muted); font-size: 12px; }
        .loader { width: 42px; height: 42px; border: 4px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: provisionSpin .8s linear infinite; }
        @keyframes provisionSpin { to { transform: rotate(360deg); } }
        @keyframes provisionIn { from { opacity: 0; transform: translateY(18px) scale(.985); } }
        @media (max-width: 760px) {
          .provisioning-overlay { align-items: end; padding: 0; }
          .provisioning-dialog, .provisioning-dialog.step-1, .provisioning-dialog.touch-panel-flow.step-2, .provisioning-dialog.touch-panel-flow.step-3 { width: 100%; max-height: 94dvh; border-radius: 24px 24px 0 0; }
          .provisioning-header { padding: 22px 20px 18px; }
          .provisioning-header h2 { font-size: 21px; }
          .device-picker { grid-template-columns: 1fr; padding: 18px 20px; }
          .provisioning-body { padding: 18px 20px 22px; }
          .field-grid, .channel-controls { grid-template-columns: 1fr; }
          .field.full { grid-column: auto; }
          .channel-list { max-height: none; }
          .naming-list { grid-template-columns: 1fr; }
          .provisioning-footer { padding: 14px 20px; flex-wrap: wrap; }
          .footer-help { display: none; }
          .primary-setup-btn { margin-left: auto; }
        }
        @media (max-width: 420px) {
          .panel-config-summary { align-items: flex-start; }
          .panel-config-summary > span { display: none; }
          .channel-row { grid-template-columns: 34px 1fr; }
          .channel-kind { grid-column: 2; grid-row: 1; }
          .channel-row input { grid-column: 1 / -1; }
          .provisioning-footer button { flex: 1; padding: 0 12px; }
        }
      `}</style>
    </div>
  );
};

export default ProvisioningModal;
