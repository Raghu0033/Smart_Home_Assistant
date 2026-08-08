import { useEffect, useState } from 'react';

const DEFAULT_STATE = {
  power: false,
  mode: 'cool',
  temp: 24,
  fan: 'auto',
  companyName: 'DAIKIN',
  model: 'CASSETTE',
  modelNo: 'BRC91A157',
  deviceId: 'BSI00000015',
  lastAction: 'System Ready'
};

const MODE_OPTIONS = [
  { id: 'cool', label: 'Cool', icon: '❄️' },
  { id: 'heat', label: 'Heat', icon: '☀️' },
  { id: 'fan', label: 'Fan', icon: '🌬️' }
];

const FAN_SPEEDS = [
  { id: 'auto', label: 'Auto' },
  { id: 'low', label: 'Low' },
  { id: 'med', label: 'Med' },
  { id: 'high', label: 'High' }
];

const getTempRangeForMode = mode => {
  if (mode === 'heat') return { min: 24, max: 26 };
  if (mode === 'fan') return { min: 24, max: 24 };
  return { min: 18, max: 32 };
};

const clampTempForMode = (value, mode) => {
  const { min, max } = getTempRangeForMode(mode);
  return Math.min(max, Math.max(min, Number(value) || min));
};

const deriveState = device => {
  const mode = String(device?.irMode || device?.mode || DEFAULT_STATE.mode);
  return {
    power: Boolean(device?.on ?? device?.power ?? false),
    mode,
    temp: clampTempForMode(device?.targetTemp ?? device?.temp ?? DEFAULT_STATE.temp, mode),
    fan: String(device?.fanSpeed || device?.fan || DEFAULT_STATE.fan),
    companyName: String(device?.companyName || DEFAULT_STATE.companyName),
    model: String(device?.model || DEFAULT_STATE.model),
    modelNo: String(device?.modelNo || DEFAULT_STATE.modelNo),
    deviceId: String(device?.receiverDeviceId || device?.deviceId || DEFAULT_STATE.deviceId),
    lastAction: String(device?.lastIrAction || DEFAULT_STATE.lastAction)
  };
};

const toCommandType = ({ power, mode, temp, fan }) => {
  if (!power) return 'ac_power_off';
  if (mode === 'fan') return `fan_${fan}`;
  return `${mode}${clampTempForMode(temp, mode)}_${fan}`;
};

const getActionLabel = nextState => {
  if (!nextState.power) return 'Power off signal sent';
  if (nextState.mode === 'fan') return `Fan mode ${nextState.fan} sent`;
  return `${nextState.mode[0].toUpperCase()}${nextState.mode.slice(1)} ${nextState.temp}°C ${nextState.fan} sent`;
};

const IRBlasterPanel = ({ device, onCommand }) => {
  const [panelState, setPanelState] = useState(() => deriveState(device));

  useEffect(() => {
    setPanelState(deriveState(device));
  }, [device]);

  const commit = (patch, event, actionLabel) => {
    const draftState = {
      ...panelState,
      ...patch
    };
    const nextState = {
      ...draftState,
      temp: clampTempForMode(draftState.temp, draftState.mode),
      lastAction: actionLabel || getActionLabel(draftState)
    };
    setPanelState(nextState);
    onCommand?.(nextState, {
      event,
      actionLabel: nextState.lastAction,
      cmdType: event === 'power_on'
        ? 'ac_power_on'
        : event === 'power_off'
          ? 'ac_power_off'
          : toCommandType(nextState)
    });
  };

  const handlePower = power => {
    commit({ power }, power ? 'power_on' : 'power_off', power ? 'Power on signal sent' : 'Power off signal sent');
  };

  const adjustTemp = delta => {
    const nextTemp = clampTempForMode(panelState.temp + delta, panelState.mode);
    if (nextTemp === panelState.temp || panelState.mode === 'fan') return;
    commit({ power: true, temp: nextTemp }, delta > 0 ? 'temp_up' : 'temp_down', `Temperature set to ${nextTemp}°C`);
  };

  const isOff = !panelState.power;
  const showTemperatureControl = panelState.mode !== 'fan';
  const tempRange = getTempRangeForMode(panelState.mode);

  return (
    <section className="ir-layout">
      <div className="ir-container">
        <div className="ir-header">
          <h3>AC Climate Control</h3>
          <div className="ir-header-status-row">
            <span className={`ir-header-status ${panelState.power ? 'on' : 'off'}`}>
              <i />
              {panelState.lastAction}
            </span>
          </div>
        </div>

        <div className="ir-control-group">
          <span className="ir-section-label">Power Control</span>
          <div className="ir-power-grid">
            <button
              className={`ir-button ir-power-button pwr-on ${panelState.power ? 'active' : ''}`}
              onClick={() => handlePower(true)}
            >
              🟢 Power On
            </button>
            <button
              className={`ir-button ir-power-button pwr-off ${!panelState.power ? 'active' : ''}`}
              onClick={() => handlePower(false)}
            >
              🔴 Power Off
            </button>
          </div>
        </div>

        <div className="ir-control-group">
          <span className="ir-section-label">Operation Mode</span>
          <div className="ir-mode-grid">
            {MODE_OPTIONS.map(mode => (
              <button
                key={mode.id}
                className={`ir-button ir-mode-button ${panelState.mode === mode.id ? 'active' : ''}`}
                data-mode={mode.id}
                disabled={isOff}
                onClick={() => commit({ power: true, mode: mode.id }, 'set_mode', `${mode.label} mode selected`)}
              >
                {mode.icon} {mode.label}
              </button>
            ))}
          </div>
        </div>

        {showTemperatureControl && (
          <div className="ir-control-group">
            <span className="ir-section-label">Target Temperature</span>
            <div className={`ir-temp-display-container ${isOff ? 'disabled' : ''}`}>
              <div className="ir-temp-readout">
                <span className="ir-temp-value">{panelState.temp}</span>
                <span className="ir-temp-unit">°C</span>
              </div>
              <div className="ir-temp-meta">{tempRange.min}° to {tempRange.max}°</div>
              <div className="ir-temp-actions">
                <button className="ir-button ir-round-btn" disabled={isOff} onClick={() => adjustTemp(-1)}>−</button>
                <button className="ir-button ir-round-btn" disabled={isOff} onClick={() => adjustTemp(1)}>+</button>
              </div>
            </div>
          </div>
        )}

        <div className="ir-control-group">
          <span className="ir-section-label">Fan Speed</span>
          <div className="ir-fan-grid">
            {FAN_SPEEDS.map(speed => (
              <button
                key={speed.id}
                className={`ir-button ir-fan-button ${panelState.fan === speed.id ? 'active' : ''}`}
                data-fan={speed.id}
                disabled={isOff}
                onClick={() => commit({ power: true, fan: speed.id }, 'set_fan', `${speed.label} fan selected`)}
              >
                {speed.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ir-device-tag">CMD: {toCommandType(panelState)}</div>
      </div>

      <style>{`
        .ir-layout {
          width: 100%;
          display: flex;
          justify-content: center;
        }
        .ir-container {
          --card-bg: var(--bg-card);
          --card-border: var(--border);
          --surface: var(--primary-tint);
          --surface-hover: var(--primary-glow);
          --green: var(--success);
          --red: var(--danger);
          --text: var(--text-main);
          --muted: var(--text-muted);
          width: 100%;
          max-width: 420px;
          padding: 28px 24px 22px;
          border-radius: 28px;
          color: var(--text);
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--shadow-card), inset 0 0 0 1px var(--primary-tint);
          backdrop-filter: blur(34px);
          -webkit-backdrop-filter: blur(34px);
        }
        .ir-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin-bottom: 26px;
        }
        .ir-header-status-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ir-header h3 {
          margin: 0;
          font-size: 21px;
          text-align: center;
          font-weight: 700;
          letter-spacing: -0.3px;
          background: linear-gradient(135deg, var(--text-main) 30%, var(--primary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .ir-header-status {
          min-height: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          color: var(--muted);
          font-size: 12px;
          letter-spacing: 0.3px;
          text-align: center;
          padding: 0 8px;
        }
        .ir-header-status i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--green);
          display: inline-block;
          flex: 0 0 6px;
        }
        .ir-header-status.off i {
          background: var(--red);
        }
        .ir-control-group {
          margin-bottom: 22px;
          transition: opacity 0.4s ease;
        }
        .ir-section-label {
          color: var(--muted);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1.8px;
          margin-bottom: 10px;
          display: block;
          font-weight: 600;
        }
        .ir-select-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .ir-field {
          display: grid;
          gap: 6px;
        }
        .ir-field span {
          font-size: 12px;
          color: var(--muted);
          font-weight: 600;
        }
        .ir-select {
          width: 100%;
          min-width: 0;
          appearance: none;
          background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 80%, var(--bg-card)), var(--surface));
          border: 1px solid var(--border);
          color: var(--text-main);
          padding: 12px 14px;
          border-radius: 14px;
          font-size: 13px;
          font-weight: 600;
          outline: none;
          box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent);
        }
        .ir-select:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 16%, transparent);
        }
        .ir-power-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .ir-mode-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .ir-fan-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .ir-button {
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 14px 6px;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .ir-button:hover:not(:disabled) {
          background: var(--surface-hover);
          transform: translateY(-2px);
          box-shadow: var(--shadow-soft);
        }
        .ir-button:active:not(:disabled) {
          transform: scale(0.96) translateY(0);
        }
        .ir-button:disabled {
          opacity: 0.2;
          cursor: not-allowed;
        }
        .ir-mode-button.active[data-mode="cool"] {
          background: color-mix(in srgb, var(--accent) 18%, transparent);
          border-color: color-mix(in srgb, var(--accent) 42%, transparent);
          color: var(--accent);
          box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 20%, transparent);
        }
        .ir-mode-button.active[data-mode="heat"] {
          background: color-mix(in srgb, var(--warning) 18%, transparent);
          border-color: color-mix(in srgb, var(--warning) 42%, transparent);
          color: var(--warning);
          box-shadow: 0 0 24px color-mix(in srgb, var(--warning) 20%, transparent);
        }
        .ir-mode-button.active[data-mode="fan"] {
          background: color-mix(in srgb, var(--success) 18%, transparent);
          border-color: color-mix(in srgb, var(--success) 42%, transparent);
          color: var(--success);
          box-shadow: 0 0 24px color-mix(in srgb, var(--success) 20%, transparent);
        }
        .ir-power-button.active.pwr-on {
          background: color-mix(in srgb, var(--success) 16%, transparent);
          border-color: color-mix(in srgb, var(--success) 38%, transparent);
          color: var(--success);
          box-shadow: 0 0 22px color-mix(in srgb, var(--success) 18%, transparent);
        }
        .ir-power-button.active.pwr-off {
          background: color-mix(in srgb, var(--danger) 16%, transparent);
          border-color: color-mix(in srgb, var(--danger) 38%, transparent);
          color: var(--danger);
          box-shadow: 0 0 22px color-mix(in srgb, var(--danger) 18%, transparent);
        }
        .ir-fan-button.active {
          background: color-mix(in srgb, var(--primary) 18%, var(--bg-card));
          border-color: color-mix(in srgb, var(--primary) 58%, var(--border-strong));
          color: var(--text-main);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 28%, transparent), 0 10px 24px color-mix(in srgb, var(--primary) 16%, transparent);
          position: relative;
          font-weight: 700;
        }
        .ir-fan-button.active::after {
          content: '';
          position: absolute;
          top: 8px;
          right: 8px;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--primary);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent);
        }
        .ir-temp-display-container {
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          gap: 18px;
          background: linear-gradient(140deg, var(--primary-tint), transparent);
          border: 1px solid var(--card-border);
          padding: 20px 24px;
          border-radius: 20px;
          transition: opacity 0.3s ease;
        }
        .ir-temp-display-container.disabled {
          opacity: 0.55;
        }
        .ir-temp-readout {
          display: flex;
          align-items: baseline;
          gap: 6px;
          min-width: 0;
        }
        .ir-temp-value {
          font-size: 46px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          letter-spacing: -2.5px;
          line-height: 1;
        }
        .ir-temp-unit,
        .ir-temp-meta {
          font-size: 20px;
          color: var(--muted);
        }
        .ir-temp-meta {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.4px;
        }
        .ir-temp-actions {
          display: flex;
          gap: 12px;
        }
        .ir-round-btn {
          width: 50px;
          height: 50px;
          padding: 0;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          font-weight: 700;
          background: var(--surface);
          border: 1px solid var(--border);
        }
        .ir-device-tag {
          margin-top: 6px;
          text-align: center;
          font-size: 10px;
          color: var(--muted);
          background: var(--primary-tint);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          padding: 6px 14px;
          border-radius: 20px;
          border: 1px solid var(--border);
          font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace;
          letter-spacing: 0.8px;
          box-shadow: var(--shadow-sm);
        }
        @media (min-width: 900px) {
          .ir-container {
            max-width: 440px;
          }
        }
        @media (max-width: 520px) {
          .ir-container {
            padding: 24px 18px 18px;
            border-radius: 24px;
          }
          .ir-header {
            margin-bottom: 22px;
          }
          .ir-header h3 {
            font-size: 20px;
          }
          .ir-select-grid {
            grid-template-columns: 1fr;
          }
          .ir-mode-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .ir-fan-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
          .ir-button {
            font-size: 13px;
            padding: 13px 5px;
          }
          .ir-temp-display-container {
            grid-template-columns: 1fr;
            justify-items: start;
            padding: 18px 18px;
          }
          .ir-temp-value {
            font-size: 42px;
          }
          .ir-temp-actions {
            gap: 10px;
          }
          .ir-round-btn {
            width: 46px;
            height: 46px;
          }
        }
      `}</style>
    </section>
  );
};

export default IRBlasterPanel;
