import { useState } from 'react';

const DEFAULTS = {
  onColor: [102, 204, 0],
  offColor: [0, 102, 255],
  onBrightness: 100,
  transitionSeconds: 10,
  offBrightness: 100
};

const toHex = color => `#${color.map(value =>
  Math.min(255, Math.max(0, Number(value) || 0)).toString(16).padStart(2, '0')
).join('')}`;

const fromHex = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));

const TouchPanelBacklight = ({ device, socket }) => {
  const [settings, setSettings] = useState(() => ({
    ...DEFAULTS,
    ...(device.touchPanelBacklight || {})
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const updateNumber = (field, value) => {
    setSettings(previous => ({ ...previous, [field]: Number(value) }));
  };

  const apply = () => {
    setSaving(true);
    setMessage('');
    const timeout = window.setTimeout(() => {
      setSaving(false);
      setMessage('No response from the server. Check the MQTT connection.');
    }, 6000);
    socket.emit('touch_panel_backlight', { deviceId: device.deviceId, ...settings }, response => {
      window.clearTimeout(timeout);
      setSaving(false);
      setMessage(response?.ok ? 'Backlight updated' : (response?.error || 'Update failed'));
    });
  };

  return (
    <div className="touch-backlight">
      <div className="touch-backlight-title">
        <div>
          <span className="touch-panel-kicker">PANEL APPEARANCE</span>
          <h4>Panel Backlight</h4>
          <p>Set how the hardware looks when a channel is on or off.</p>
        </div>
        <button type="button" onClick={apply} disabled={saving}>
          {saving ? 'Applying…' : 'Apply'}
        </button>
      </div>
      <div className="touch-backlight-preview">
        <div style={{ backgroundColor: toHex(settings.onColor), opacity: Math.max(.15, settings.onBrightness / 100) }}>
          <span>ON</span>
          <strong>{toHex(settings.onColor).toUpperCase()}</strong>
        </div>
        <div style={{ backgroundColor: toHex(settings.offColor), opacity: Math.max(.15, settings.offBrightness / 100) }}>
          <span>OFF</span>
          <strong>{toHex(settings.offColor).toUpperCase()}</strong>
        </div>
      </div>
      <div className="touch-backlight-grid">
        <label>
          ON color
          <input type="color" value={toHex(settings.onColor)} onChange={event =>
            setSettings(previous => ({ ...previous, onColor: fromHex(event.target.value) }))
          } />
        </label>
        <label>
          OFF color
          <input type="color" value={toHex(settings.offColor)} onChange={event =>
            setSettings(previous => ({ ...previous, offColor: fromHex(event.target.value) }))
          } />
        </label>
        <label>
          ON brightness <span>{settings.onBrightness}%</span>
          <input type="range" min="0" max="100" value={settings.onBrightness}
            onChange={event => updateNumber('onBrightness', event.target.value)} />
        </label>
        <label>
          OFF brightness <span>{settings.offBrightness}%</span>
          <input type="range" min="0" max="100" value={settings.offBrightness}
            onChange={event => updateNumber('offBrightness', event.target.value)} />
        </label>
        <label>
          Transition interval <span>{settings.transitionSeconds}s</span>
          <input type="range" min="0" max="255" value={settings.transitionSeconds}
            onChange={event => updateNumber('transitionSeconds', event.target.value)} />
        </label>
      </div>
      {message && (
        <small className={`touch-backlight-message ${message === 'Backlight updated' ? 'success' : 'error'}`}>
          {message}
        </small>
      )}
    </div>
  );
};

export default TouchPanelBacklight;
