import { useState } from 'react';

const ICONS = ['💡', '🌀', '🔌', '📺', '❄️', '🔊', '🪟', '🌙', '☀️', '🚿', '🔒', '⚡'];
const APPLIANCE_TYPES = [
  { value: 'switch', label: 'Switch', icon: '⚡' },
  { value: 'plug', label: 'Plug', icon: '🔌' },
  { value: 'light', label: 'Light', icon: '💡' },
  { value: 'fan', label: 'Fan', icon: '🌀' },
  { value: 'fridge', label: 'Fridge', icon: '❄️' },
  { value: 'ac', label: 'AC', icon: '🌬️' },
  { value: 'geyser', label: 'Geyser', icon: '🚿' },
  { value: 'tv', label: 'TV', icon: '📺' },
  { value: 'projector', label: 'Projector', icon: '📽️' },
  { value: 'socket', label: 'Socket', icon: '🔋' },
  { value: 'other', label: 'Other', icon: '◉' }
];

const TouchSwitchSettingsModal = ({ channel, onClose, onSave }) => {
  const [name, setName] = useState(() => channel?.label || '');
  const [icon, setIcon] = useState(() => channel?.icon || (channel?.type === 'fan' ? '🌀' : '💡'));
  const [applianceType, setApplianceType] = useState(() => channel?.applianceType || (channel?.type === 'fan' ? 'fan' : 'switch'));
  const [saving, setSaving] = useState(false);

  if (!channel) return null;

  const submit = async event => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    await onSave({ label: name.trim(), icon, applianceType });
    setSaving(false);
  };

  return (
    <div className="switch-settings-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="switch-settings-dialog" onSubmit={submit}>
        <header>
          <div>
            <span>SWITCH SETTINGS</span>
            <h2>Edit {channel.type === 'fan' ? 'fan' : 'switch'}</h2>
            <p>{channel.panelTitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <label className="switch-name-field">
          <span>Name</span>
          <input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Switch name" />
        </label>
        <div className="switch-type-field">
          <span>Appliance type</span>
          <div>
            {APPLIANCE_TYPES.map(item => (
              <button
                type="button"
                key={item.value}
                className={applianceType === item.value ? 'active' : ''}
                onClick={() => {
                  setApplianceType(item.value);
                  setIcon(item.icon);
                }}
              >
                <i>{item.icon}</i>
                <small>{item.label}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="switch-icon-field">
          <span>Icon</span>
          <div>
            {ICONS.map(item => (
              <button type="button" key={item} className={icon === item ? 'active' : ''} onClick={() => setIcon(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
        <footer>
          <button type="button" className="cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="save" disabled={!name.trim() || saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </footer>
      </form>
      <style>{`
        .switch-settings-overlay { position: fixed; inset: 0; z-index: 1300; display: grid; place-items: center; padding: 20px; background: rgba(8,13,23,.62); backdrop-filter: blur(8px); }
        .switch-settings-dialog { width: min(420px,100%); padding: 24px; border: 1px solid var(--border); border-radius: 22px; color: var(--text-main); background: var(--bg-card); box-shadow: 0 28px 70px rgba(0,0,0,.32); }
        .switch-settings-dialog header { display: flex; justify-content: space-between; gap: 18px; margin-bottom: 22px; }
        .switch-settings-dialog header span, .switch-name-field > span, .switch-type-field > span, .switch-icon-field > span { display: block; color: var(--primary); font-size: 9px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
        .switch-settings-dialog h2 { margin: 4px 0 2px; font-size: 21px; }
        .switch-settings-dialog header p { margin: 0; color: var(--text-muted); font-size: 11px; }
        .switch-settings-dialog header button { width: 36px; height: 36px; border: 1px solid var(--border); border-radius: 11px; color: var(--text-muted); background: var(--bg-main); font-size: 22px; }
        .switch-name-field input { width: 100%; height: 46px; margin-top: 7px; padding: 0 13px; outline: none; border: 1px solid var(--border); border-radius: 12px; color: var(--text-main); background: var(--bg-main); }
        .switch-name-field input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb,var(--primary) 12%,transparent); }
        .switch-type-field { margin-top: 18px; }
        .switch-type-field > div { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 7px; margin-top: 8px; }
        .switch-type-field button { min-width: 0; height: 54px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 7px; border: 1px solid var(--border); border-radius: 11px; color: var(--text-main); background: var(--bg-main); }
        .switch-type-field button i { font-size: 16px; font-style: normal; }
        .switch-type-field button small { overflow: hidden; text-overflow: ellipsis; color: var(--text-muted); font-size: 9px; white-space: nowrap; }
        .switch-type-field button.active { border-color: var(--primary); background: color-mix(in srgb,var(--primary) 14%,var(--bg-card)); box-shadow: 0 0 0 2px color-mix(in srgb,var(--primary) 12%,transparent); }
        .switch-type-field button.active small { color: var(--primary); }
        .switch-icon-field { margin-top: 18px; }
        .switch-icon-field > div { display: grid; grid-template-columns: repeat(6,1fr); gap: 7px; margin-top: 8px; }
        .switch-icon-field button { height: 42px; border: 1px solid var(--border); border-radius: 11px; background: var(--bg-main); font-size: 18px; }
        .switch-icon-field button.active { border-color: var(--primary); background: color-mix(in srgb,var(--primary) 14%,var(--bg-card)); box-shadow: 0 0 0 2px color-mix(in srgb,var(--primary) 12%,transparent); }
        .switch-settings-dialog footer { display: flex; justify-content: flex-end; gap: 9px; margin-top: 22px; }
        .switch-settings-dialog footer button { min-height: 42px; padding: 0 16px; border-radius: 11px; font-size: 11px; font-weight: 850; }
        .switch-settings-dialog footer .cancel { border: 1px solid var(--border); color: var(--text-main); background: var(--bg-main); }
        .switch-settings-dialog footer .save { color: #fff; background: var(--primary); }
        .switch-settings-dialog footer .save:disabled { opacity: .45; }
        @media(max-width:480px){.switch-settings-dialog{max-height:90dvh;overflow-y:auto;padding:19px}.switch-type-field>div{grid-template-columns:repeat(3,minmax(0,1fr))}}
      `}</style>
    </div>
  );
};

export default TouchSwitchSettingsModal;
