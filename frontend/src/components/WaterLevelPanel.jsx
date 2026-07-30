import React, { useEffect, useMemo, useState } from 'react';
import './WaterLevelPanel.css';

const STORAGE_KEY = 'smarthome_wli_config';

const clampPercent = (value) => Math.min(100, Math.max(0, Number(value) || 0));

const loadConfig = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      deviceId: saved?.deviceId || 'BS000TANK',
      capacity: saved?.capacity || ''
    };
  } catch {
    return { deviceId: 'BS000TANK', capacity: '' };
  }
};

const WaterLevelPanel = ({ socket, mqttStatus, onNotify, tank = null, compact = false }) => {
  const managedConfig = tank ? { deviceId: tank.deviceId, capacity: tank.tankCapacity || 1 } : null;
  const [config, setConfig] = useState(() => managedConfig || loadConfig());
  const [draft, setDraft] = useState(() => managedConfig || loadConfig());
  const [telemetry, setTelemetry] = useState({
    tank: null, battery: null, motor: null, alert: null, lastPacketAt: null,
    tankUpdatedAt: null, batteryUpdatedAt: null, motorUpdatedAt: null
  });
  const [statusClock, setStatusClock] = useState(Date.now());
  const [isEditing, setIsEditing] = useState(() => !tank && !loadConfig().capacity);
  const [isSending, setIsSending] = useState(false);
  const [automation, setAutomation] = useState({ enabled: false, onLevel: 25, offLevel: 90 });
  const [isSavingAutomation, setIsSavingAutomation] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setStatusClock(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!tank) return;
    const next = { deviceId: tank.deviceId, capacity: tank.tankCapacity || 1 };
    setConfig(next);
    setDraft(next);
    setIsEditing(false);
  }, [tank]);

  useEffect(() => {
    if (!config.deviceId) return undefined;

    const handleUpdate = ({ deviceId, metric, value }) => {
      if (String(deviceId).toUpperCase() !== config.deviceId.toUpperCase()) return;
      if (!['tank', 'battery', 'motor', 'alert', 'lastPacketAt', 'tankUpdatedAt', 'batteryUpdatedAt', 'motorUpdatedAt'].includes(metric)) return;
      setTelemetry(previous => ({ ...previous, [metric]: value }));
    };

    socket.on('water_level_update', handleUpdate);
    socket.emit('wli_subscribe', { deviceId: config.deviceId });
    socket.emit('wli_get_automation', { deviceId: config.deviceId }, result => {
      if (result?.ok && result.config) {
        setAutomation({
          enabled: Boolean(result.config.enabled),
          onLevel: Number(result.config.onLevel),
          offLevel: Number(result.config.offLevel)
        });
      }
    });
    return () => socket.off('water_level_update', handleUpdate);
  }, [socket, config.deviceId]);

  const waterPercent = telemetry.tank === null ? null : clampPercent(telemetry.tank);
  const batteryPercent = telemetry.battery === null ? null : clampPercent(telemetry.battery);
  const isMetricLive = timestamp => Boolean(
    timestamp && statusClock - new Date(timestamp).getTime() < 5 * 60 * 1000
  );
  const isTankLive = isMetricLive(telemetry.tankUpdatedAt);
  const isBatteryLive = isMetricLive(telemetry.batteryUpdatedAt);
  const litres = useMemo(() => {
    if (waterPercent === null || !Number(config.capacity)) return null;
    return Math.round((Number(config.capacity) * waterPercent) / 100);
  }, [config.capacity, waterPercent]);

  const saveConfig = (event) => {
    event.preventDefault();
    const deviceId = draft.deviceId.trim().toUpperCase();
    const capacity = Number(draft.capacity);
    if (!/^[A-Z0-9_-]+$/.test(deviceId) || capacity <= 0) {
      onNotify?.('Enter a valid device ID and tank capacity');
      return;
    }
    const next = { deviceId, capacity };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setConfig(next);
    setTelemetry({
      tank: null, battery: null, motor: null, alert: null, lastPacketAt: null,
      tankUpdatedAt: null, batteryUpdatedAt: null, motorUpdatedAt: null
    });
    setIsEditing(false);
    onNotify?.('Water tank settings saved');
  };

  const toggleMotor = () => {
    const state = telemetry.motor === 'ON' ? 'OFF' : 'ON';
    setIsSending(true);
    socket.emit('wli_motor_command', { deviceId: config.deviceId, state }, (result) => {
      setIsSending(false);
      if (!result?.ok) onNotify?.(result?.error || 'Motor command failed');
      else onNotify?.(`Motor ${state} command sent`);
    });
  };

  const saveAutomation = () => {
    if (Number(automation.onLevel) >= Number(automation.offLevel)) {
      onNotify?.('Motor ON level must be lower than motor OFF level');
      return;
    }
    setIsSavingAutomation(true);
    socket.emit('wli_save_automation', { deviceId: config.deviceId, ...automation }, result => {
      setIsSavingAutomation(false);
      if (!result?.ok) onNotify?.(result?.error || 'Could not save automation');
      else onNotify?.('Automatic motor levels saved');
    });
  };

  return (
    <div className={`wli-page animate-slide-up ${compact ? 'wli-compact' : ''}`}>
      {!compact && <div className="wli-page-title">
        <div>
          <h1>Water Tank</h1>
          <p>Live tank level, battery health and pump control</p>
        </div>
      </div>}
    <section className="wli-panel glass">
      <div className="wli-heading">
        <div>
          <span className="wli-eyebrow">Water management</span>
          <h2>{tank?.title || 'Tank Level'}</h2>
          <p className={isTankLive ? 'wli-live-status' : 'wli-offline-status'}>
            <i /> {config.deviceId} · Tank MQTT {isTankLive ? 'Live' : telemetry.tankUpdatedAt ? 'Offline' : 'Waiting'}
          </p>
        </div>
        {!tank && <button className="wli-settings-button" onClick={() => setIsEditing(value => !value)}>
          {isEditing ? 'Cancel' : 'Settings'}
        </button>}
      </div>

      {telemetry.alert && (
        <div className="wli-alert-box" role="alert">
          <div className="wli-alert-symbol">!</div>
          <div>
            <strong>Tank communication lost</strong>
            <p>{telemetry.alert}</p>
            <small>{tank?.title || 'Water Tank'} · Device ID: {config.deviceId}</small>
          </div>
        </div>
      )}

      {batteryPercent !== null && batteryPercent <= 15 && (
        <div className={`wli-alert-box wli-battery-alert ${batteryPercent < 5 ? 'critical' : ''}`} role="alert">
          <div className="wli-alert-symbol">!</div>
          <div>
            <strong>{batteryPercent < 5 ? 'Critical battery alert' : 'Low battery warning'} — {Math.round(batteryPercent)}%</strong>
            <p>{batteryPercent < 5 ? 'Replace or charge the transmitter battery immediately.' : 'The water-level transmitter battery needs attention.'}</p>
            <small>{tank?.title || 'Water Tank'} · Device ID: {config.deviceId}</small>
          </div>
        </div>
      )}

      {isEditing ? (
        <form className="wli-config" onSubmit={saveConfig}>
          <label>
            Device ID
            <input
              value={draft.deviceId}
              onChange={event => setDraft({ ...draft, deviceId: event.target.value })}
              placeholder="BS000TANK"
              autoComplete="off"
            />
          </label>
          <label>
            Tank capacity (litres)
            <input
              type="number"
              min="1"
              step="1"
              value={draft.capacity}
              onChange={event => setDraft({ ...draft, capacity: event.target.value })}
              placeholder="1000"
            />
          </label>
          <button className="wli-save-button" type="submit">Save tank</button>
        </form>
      ) : (
        <div className="wli-content">
          <div className="wli-tank-visual" aria-label={`Water tank ${waterPercent ?? 0}% full`}>
            <div className="wli-inlet-pipe" />
            <div className="wli-tank-lid" />
            <div className="wli-tank-top" />
            <div className="wli-glass-shine" />
            <div className="wli-tank-marks" aria-hidden="true">
              <i>100</i><i>75</i><i>50</i><i>25</i><i>0</i>
            </div>
            <div className="wli-liquid-clip">
              <div className="wli-water" style={{ height: `${waterPercent ?? 0}%` }}>
                <span className="wli-water-surface" />
                <span className="wli-wave wli-wave-one" />
                <span className="wli-wave wli-wave-two" />
                <span className="wli-bubble bubble-one" />
                <span className="wli-bubble bubble-two" />
                <span className="wli-bubble bubble-three" />
              </div>
            </div>
            <div className="wli-outlet-pipe"><span /></div>
            <div className="wli-level-copy">
              <strong>{waterPercent === null ? '—' : `${Math.round(waterPercent)}%`}</strong>
              <span>{litres === null ? 'Waiting for level' : `${litres.toLocaleString()} / ${Number(config.capacity).toLocaleString()} L`}</span>
            </div>
          </div>

          <div className="wli-stats">
            <div className="wli-stat">
              <span>Battery</span>
              <small className={isBatteryLive ? 'wli-metric-live' : 'wli-metric-offline'}>
                <i /> MQTT {isBatteryLive ? 'Live' : telemetry.batteryUpdatedAt ? 'Offline' : 'Waiting'}
              </small>
              <div className="wli-mobile-battery">
                <div
                  className={`wli-battery-shell ${(batteryPercent ?? 0) <= 15 ? 'low' : ''} ${(batteryPercent ?? 100) < 5 ? 'critical' : ''}`}
                  aria-label={`Battery ${batteryPercent ?? 0}%`}
                >
                  <i style={{ height: `${batteryPercent ?? 0}%` }} />
                </div>
                <strong>{batteryPercent === null ? '—' : `${Math.round(batteryPercent)}%`}</strong>
              </div>
              <small>{batteryPercent === null ? 'Waiting for battery status' : batteryPercent < 5 ? 'Critical battery' : batteryPercent <= 15 ? 'Low battery' : 'Battery healthy'}</small>
            </div>
            <div className="wli-stat">
              <span>Motor relay</span>
              <strong className={telemetry.motor === 'ON' ? 'is-on' : ''}>{telemetry.motor || 'Unknown'}</strong>
              <small>{telemetry.motor === 'ON' ? 'Pump is running' : 'Pump is stopped'}</small>
              <small className="wli-topic-label">…/{config.deviceId}/MOTOR</small>
            </div>
            <div className={`wli-motor-control ${telemetry.motor === 'ON' ? 'running' : ''}`}>
              <div>
                <strong>{isSending ? 'Sending command…' : telemetry.motor === 'ON' ? 'Motor running' : 'Motor stopped'}</strong>
                <span>Relay control</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={telemetry.motor === 'ON'}
                aria-label="Toggle water motor"
                className="wli-toggle"
                onClick={toggleMotor}
                disabled={isSending || mqttStatus !== 'Connected'}
              >
                <span />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
    {!isEditing && (
      <section className="wli-automation glass">
        <div className="wli-auto-header">
          <div className="wli-auto-icon">A</div>
          <div>
            <h3>Automatic Motor Control</h3>
            <p>The controller keeps working in the background using MQTT tank readings.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={automation.enabled}
            className="wli-toggle"
            onClick={() => setAutomation(previous => ({ ...previous, enabled: !previous.enabled }))}
          ><span /></button>
        </div>
        <div className="wli-auto-levels">
          <label className="wli-auto-level on">
            <span>Turn motor ON when water reaches</span>
            <div><input type="number" min="0" max="99" value={automation.onLevel} onChange={event => setAutomation({ ...automation, onLevel: Number(event.target.value) })} /><strong>%</strong></div>
          </label>
          <div className="wli-auto-flow"><i>ON</i><span /><i>OFF</i></div>
          <label className="wli-auto-level off">
            <span>Turn motor OFF when water reaches</span>
            <div><input type="number" min="1" max="100" value={automation.offLevel} onChange={event => setAutomation({ ...automation, offLevel: Number(event.target.value) })} /><strong>%</strong></div>
          </label>
          <button className="wli-auto-save" onClick={saveAutomation} disabled={isSavingAutomation}>
            {isSavingAutomation ? 'Saving…' : 'Save automation'}
          </button>
        </div>
      </section>
    )}
    </div>
  );
};

export default WaterLevelPanel;
