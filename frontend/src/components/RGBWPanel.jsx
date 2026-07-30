/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react';
import Wheel from '@uiw/react-color-wheel';
import { rgbaToHsva } from '@uiw/color-convert';

const PRESETS = [
  { label: 'Red', r: 255, g: 0, b: 0, w: 0, className: 'red' },
  { label: 'Green', r: 0, g: 255, b: 0, w: 0, className: 'green' },
  { label: 'Blue', r: 0, g: 80, b: 255, w: 0, className: 'blue' },
  { label: 'Warm', r: 255, g: 170, b: 35, w: 0, className: 'warm' },
  { label: 'Cyan', r: 0, g: 210, b: 225, w: 0, className: 'cyan' },
  { label: 'Magenta', r: 210, g: 70, b: 235, w: 0, className: 'magenta' },
  { label: 'White', r: 255, g: 255, b: 255, w: 255, className: 'white' },
  { label: 'Soft', r: 150, g: 105, b: 240, w: 0, className: 'soft' },
];

const ANIMATIONS = [
  ['northern_lights', 'Northern Lights'],
  ['rainbow', 'Rainbow'],
  ['love', 'Love'],
  ['cinematic', 'Cinematic'],
  ['galaxy', 'Galaxy'],
  ['zen', 'Zen'],
  ['party', 'Party'],
  ['candle', 'Candle'],
  ['sunset', 'Sunset'],
  ['ocean', 'Ocean'],
  ['forest', 'Forest'],
  ['ice', 'Ice'],
  ['lava', 'Lava'],
  ['fireplace', 'Fireplace'],
  ['cyberpunk', 'Cyberpunk'],
];

const clamp = (value, min = 0, max = 255) => Math.max(min, Math.min(max, value));

const rgbToHex = (r, g, b) =>
  `#${[r, g, b].map(v => clamp(Math.round(v)).toString(16).padStart(2, '0')).join('')}`;

const getRgbFromDevice = (device) => {
  const rgb = device?.spectrumRgb ?? 0xFF0000;
  return {
    r: (rgb >> 16) & 0xFF,
    g: (rgb >> 8) & 0xFF,
    b: rgb & 0xFF,
  };
};

const rgbToHsva = (r, g, b) => rgbaToHsva({ r, g, b, a: 1 });

const RGBWPanel = ({
  device,
  brightness,
  setBrightness,
  whiteIntensity,
  setWhiteIntensity,
  throttleEmit,
  setLightStatus,
}) => {
  const initialRgb = getRgbFromDevice(device);
  const [draft, setDraft] = useState(() => ({ ...initialRgb, w: whiteIntensity ?? 0 }));
  const [hsva, setHsva] = useState(() => rgbToHsva(initialRgb.r, initialRgb.g, initialRgb.b));
  const [activeAnimation, setActiveAnimation] = useState(device?.effect || 'solid');
  const [brightnessDraft, setBrightnessDraft] = useState(() => Math.round(((brightness ?? 0) / 255) * 100));
  const [brightnessAwaitingStatus, setBrightnessAwaitingStatus] = useState(false);
  const [colourStatus, setColourStatus] = useState('Live');
  const lastBrightnessSent = useRef(brightness ?? 0);
  const brightnessCommandSentAt = useRef(0);
  const brightnessCommandTarget = useRef(null);
  const brightnessAwaitingStatusRef = useRef(false);
  const dialLastPointerAngle = useRef(null);
  const dialAccumulatedAngle = useRef(0);

  const brightnessPercent = Math.round(((brightness ?? 0) / 255) * 100);
  const hex = useMemo(() => rgbToHex(draft.r, draft.g, draft.b), [draft]);
  const wheelColor = useMemo(() => ({ ...hsva, v: 100 }), [hsva]);

  useEffect(() => {
    const nextRgb = getRgbFromDevice(device);
    setDraft(prev => ({ ...prev, ...nextRgb, w: whiteIntensity ?? prev.w }));
    setHsva(rgbToHsva(nextRgb.r, nextRgb.g, nextRgb.b));
    setActiveAnimation(device?.effect || 'solid');
    if (!brightnessAwaitingStatusRef.current) setBrightnessDraft(brightnessPercent);
  }, [device, whiteIntensity, brightness, brightnessPercent, brightnessAwaitingStatus]);

  useEffect(() => {
    if (!brightnessAwaitingStatus) return;
    const mqttStatusAt = new Date(device?.brightnessReportedAt || 0).getTime();
    const reportedBrightness = Number(device?.brightness);
    const targetBrightness = brightnessCommandTarget.current;
    const brightnessMatches =
      Number.isFinite(reportedBrightness) &&
      Number.isFinite(targetBrightness) &&
      Math.abs(reportedBrightness - targetBrightness) <= 2;
    if (
      !Number.isFinite(mqttStatusAt) ||
      mqttStatusAt < brightnessCommandSentAt.current ||
      !brightnessMatches
    ) return;

    setBrightness(reportedBrightness);
    brightnessCommandTarget.current = null;
    brightnessAwaitingStatusRef.current = false;
    setBrightnessAwaitingStatus(false);
  }, [device?.brightness, device?.brightnessReportedAt, brightnessAwaitingStatus, setBrightness]);

  const emitColor = (next = draft, keepWhite = false) => {
    const white = keepWhite ? clamp(next.w) : 0;
    const colourPayload = { ...next, w: white };
    setDraft(colourPayload);
    setWhiteIntensity(white);
    setLightStatus?.(true);
    setColourStatus('Live');
    throttleEmit('color_change', {
      deviceId: device.deviceId,
      r: colourPayload.r,
      g: colourPayload.g,
      b: colourPayload.b,
      w: colourPayload.w,
    });
  };

  const handleWheelChange = (color) => {
    const next = {
      r: Math.round(color.rgb.r),
      g: Math.round(color.rgb.g),
      b: Math.round(color.rgb.b),
    };
    const nextDraft = { ...draft, ...next, w: 0 };
    setDraft(nextDraft);
    setWhiteIntensity(0);
    setHsva({ ...color.hsva, v: 100 });
    setColourStatus('Preview');
  };

  const handleBrightnessDraft = (percent) => {
    const value = Math.round((Number(percent) / 100) * 255);
    setBrightnessDraft(Number(percent));
    setBrightness(value);
  };

  const commitBrightness = (percent = brightnessDraft) => {
    const value = Math.round((Number(percent) / 100) * 255);
    if (lastBrightnessSent.current === value) {
      brightnessAwaitingStatusRef.current = false;
      return;
    }
    lastBrightnessSent.current = value;
    brightnessCommandSentAt.current = Date.now();
    brightnessCommandTarget.current = value;
    brightnessAwaitingStatusRef.current = true;
    setBrightnessAwaitingStatus(true);
    setLightStatus?.(value > 0);
    throttleEmit('brightness_change', { deviceId: device.deviceId, brightness: value });
  };

  const getDialPointerAngle = event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (bounds.left + bounds.width / 2);
    const y = event.clientY - (bounds.top + bounds.height / 2);
    return (Math.atan2(y, x) * 180 / Math.PI + 450) % 360;
  };

  const updateBrightnessFromDial = event => {
    const pointerAngle = getDialPointerAngle(event);
    if (dialLastPointerAngle.current === null) {
      dialLastPointerAngle.current = pointerAngle;
      return brightnessDraft;
    }

    let angleMovement = pointerAngle - dialLastPointerAngle.current;
    if (angleMovement > 180) angleMovement -= 360;
    if (angleMovement < -180) angleMovement += 360;

    dialAccumulatedAngle.current = Math.max(
      0,
      Math.min(360, dialAccumulatedAngle.current + angleMovement)
    );
    dialLastPointerAngle.current = pointerAngle;
    const percent = Math.round(dialAccumulatedAngle.current / 3.6);
    setBrightnessDraft(percent);
    return percent;
  };

  const handleDialPointerDown = event => {
    brightnessAwaitingStatusRef.current = true;
    dialLastPointerAngle.current = getDialPointerAngle(event);
    dialAccumulatedAngle.current = brightnessDraft * 3.6;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDialPointerMove = event => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateBrightnessFromDial(event);
    }
  };

  const handleDialKeyDown = event => {
    if (!['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    const direction = ['ArrowUp', 'ArrowRight'].includes(event.key) ? 1 : -1;
    selectBrightness(Math.max(0, Math.min(100, brightnessDraft + direction * 5)));
  };

  const selectBrightness = (percent) => {
    const value = Math.round((percent / 100) * 255);
    setBrightnessDraft(percent);
    setBrightness(value);
    lastBrightnessSent.current = value;
    setLightStatus?.(percent > 0);
    throttleEmit('brightness_change', { deviceId: device.deviceId, brightness: value });
  };

  const handleWhite = (value) => {
    const white = clamp(Number(value));
    const next = { ...draft, w: white };
    setDraft(next);
    setWhiteIntensity(white);
    setLightStatus?.(white > 0 || draft.r > 0 || draft.g > 0 || draft.b > 0);
    setColourStatus('Live');
    throttleEmit('white_change', { deviceId: device.deviceId, white });
  };

  const handlePreset = (preset) => {
    const next = { r: preset.r, g: preset.g, b: preset.b, w: preset.w };
    setDraft(next);
    setHsva(rgbToHsva(next.r, next.g, next.b));
    setWhiteIntensity(preset.w);
    emitColor(next, true);
  };

  const handleAnimation = (effect) => {
    setActiveAnimation(effect);
    setLightStatus?.(true);
    throttleEmit('set_effect', { deviceId: device.deviceId, effect });
  };

  return (
    <div className="rgbw-theme-dashboard">
      <section className="rgbw-panel-card rgbw-level-card">
        <div>
          <span className="section-kicker">Brightness</span>
          <h3>Light Level</h3>
        </div>
        <span className="level-pill">{brightnessDraft}%</span>
        <button
          className="brightness-mobile-off"
          onClick={() => selectBrightness(0)}
          aria-pressed={brightnessDraft === 0}
        >
          Off
        </button>
        <div
          className="brightness-mobile-dial"
          style={{
            '--brightness-level': `${brightnessDraft}%`,
            '--brightness-angle': `${brightnessDraft * 3.6}deg`
          }}
          role="slider"
          tabIndex={0}
          aria-label="Circular brightness adjustment"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={brightnessDraft}
          aria-busy={brightnessAwaitingStatus}
          onPointerDown={handleDialPointerDown}
          onPointerMove={handleDialPointerMove}
          onPointerUp={(event) => {
            const selectedPercent = updateBrightnessFromDial(event);
            commitBrightness(selectedPercent);
            dialLastPointerAngle.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            brightnessAwaitingStatusRef.current = false;
            dialLastPointerAngle.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onKeyDown={handleDialKeyDown}
        >
          <div className="brightness-mobile-dial-centre">
            <strong>{brightnessDraft}%</strong>
            <span>{brightnessAwaitingStatus ? 'Brightness updating' : 'Brightness'}</span>
          </div>
        </div>
        <div className="brightness-slider-row">
          <button
            className="brightness-step-btn"
            onClick={() => selectBrightness(Math.max(0, brightnessDraft - 10))}
            disabled={brightnessDraft === 0}
            aria-label="Decrease brightness by 10 percent"
          >−</button>
          <input
            className="rgbw-range"
            type="range"
            min="0"
            max="100"
            value={brightnessDraft}
            onChange={(event) => handleBrightnessDraft(event.target.value)}
            onPointerUp={(event) => commitBrightness(event.currentTarget.value)}
            onMouseUp={(event) => commitBrightness(event.currentTarget.value)}
            onTouchEnd={(event) => commitBrightness(event.currentTarget.value)}
            onKeyUp={(event) => commitBrightness(event.currentTarget.value)}
            aria-label="Light brightness"
          />
          <button
            className="brightness-step-btn"
            onClick={() => selectBrightness(Math.min(100, brightnessDraft + 10))}
            disabled={brightnessDraft === 100}
            aria-label="Increase brightness by 10 percent"
          >+</button>
        </div>
        <div className="brightness-shortcuts brightness-shortcuts-desktop" aria-label="Quick brightness selection">
          {Array.from({ length: 11 }, (_, index) => index * 10).map(percent => (
            <button
              key={percent}
              className={brightnessDraft === percent ? 'active' : ''}
              onClick={() => selectBrightness(percent)}
              aria-pressed={brightnessDraft === percent}
            >
              {percent === 0 ? 'Off' : `${percent}%`}
            </button>
          ))}
        </div>
        <div className="brightness-shortcuts brightness-shortcuts-mobile" aria-label="Quick brightness selection">
          {[20, 40, 60, 80, 100].map(percent => (
            <button
              key={percent}
              className={brightnessDraft === percent ? 'active' : ''}
              onClick={() => selectBrightness(percent)}
              aria-pressed={brightnessDraft === percent}
            >
              {percent === 0 ? 'Off' : `${percent}%`}
            </button>
          ))}
        </div>
      </section>

      <div className="rgbw-main-row">
        <section className="rgbw-panel-card rgbw-colour-card">
          <div className="section-title-row">
            <div>
              <span className="section-kicker">Custom Colour</span>
              <h3>Choose Any Shade</h3>
            </div>
            <span className={`status-chip ${colourStatus.toLowerCase()}`}>{colourStatus}</span>
          </div>

          <div className="colour-workbench">
            <div className="theme-colour-wheel" aria-label="Colour wheel">
              <Wheel
                color={wheelColor}
                width={240}
                height={240}
                onChange={handleWheelChange}
              />
            </div>

            <div className="colour-controls">
              <div className="selected-colour-row">
                <div className="colour-preview" style={{ background: hex }} />
                <div className="selected-colour-copy">
                  <span>Selected colour</span>
                  <strong>Custom shade</strong>
                  <small>Ready to apply</small>
                </div>
              </div>

              <label className="white-control">
                <span>White</span>
                <strong>{draft.w}</strong>
                <input
                  className="white-range"
                  type="range"
                  min="0"
                  max="255"
                  value={draft.w}
                  onChange={(event) => handleWhite(event.target.value)}
                />
              </label>

              <button className="apply-colour-btn" onClick={() => emitColor()}>
                Apply Colour
              </button>
            </div>
          </div>
        </section>

        <section className="rgbw-panel-card presets-card">
          <span className="section-kicker">Presets</span>
          <h3>Quick Colours</h3>
          <div className="quick-colours">
            {PRESETS.map(preset => (
              <button
                key={preset.label}
                className={`quick-colour ${preset.className}`}
                onClick={() => handlePreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="rgbw-panel-card animations-card">
        <span className="section-kicker">Scenes</span>
        <h3>Animations</h3>
        <div className="animations-grid">
          {ANIMATIONS.map(([effect, label]) => (
            <button
              key={effect}
              className={`animation-btn ${activeAnimation === effect ? 'active' : ''}`}
              onClick={() => handleAnimation(effect)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <style>{`
        .rgbw-theme-dashboard {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .rgbw-panel-card {
          background: var(--bg-main);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-sm);
          padding: 22px;
        }

        .rgbw-level-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 18px;
        }

        .rgbw-card-heading {
          display: flex;
          align-items: center;
          min-width: 0;
          gap: 12px;
        }

        .rgbw-card-heading > div:last-child {
          min-width: 0;
        }

        .rgbw-heading-icon {
          display: grid;
          place-items: center;
          flex: 0 0 42px;
          width: 42px;
          height: 42px;
          border-radius: 13px;
          color: #f59e0b;
          background: rgba(245, 158, 11, 0.13);
          font-size: 20px;
          font-weight: 900;
        }

        .rgbw-heading-icon.colour {
          color: #8b5cf6;
          background: rgba(139, 92, 246, 0.13);
        }

        .rgbw-heading-icon.preset {
          color: #ec4899;
          background: rgba(236, 72, 153, 0.12);
        }

        .rgbw-heading-icon.effects {
          color: #06b6d4;
          background: rgba(6, 182, 212, 0.12);
        }

        .rgbw-card-heading p {
          margin: 4px 0 0;
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.35;
        }

        .section-kicker {
          display: block;
          margin-bottom: 4px;
          color: var(--primary);
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .rgbw-theme-dashboard h3 {
          margin: 0;
          color: var(--text-main);
          font-size: 20px;
          line-height: 1.15;
          letter-spacing: 0;
        }

        .level-pill {
          min-width: 64px;
          padding: 8px 12px;
          border: 0;
          border-radius: 999px;
          background: var(--primary-tint);
          color: var(--primary);
          font-size: 16px;
          font-weight: 900;
          text-align: center;
        }

        .rgbw-range,
        .white-range {
          appearance: none;
          grid-column: 1 / -1;
          width: 100%;
          height: 7px;
          border-radius: 999px;
          outline: 0;
          background: linear-gradient(
            90deg,
            var(--primary) 0 var(--range-progress),
            var(--border) var(--range-progress) 100%
          );
        }

        .rgbw-range::-webkit-slider-thumb,
        .white-range::-webkit-slider-thumb {
          appearance: none;
          width: 22px;
          height: 22px;
          border: 4px solid var(--bg-card);
          border-radius: 50%;
          background: var(--primary);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
          cursor: pointer;
        }

        .rgbw-range::-moz-range-thumb,
        .white-range::-moz-range-thumb {
          width: 15px;
          height: 15px;
          border: 4px solid var(--bg-card);
          border-radius: 50%;
          background: var(--primary);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
          cursor: pointer;
        }

        .rgbw-main-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(240px, 280px);
          gap: 16px;
        }

        .rgbw-colour-card,
        .presets-card,
        .animations-card {
          min-width: 0;
        }

        .section-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 22px;
        }

        .status-chip {
          padding: 6px 10px;
          border: 0;
          border-radius: 999px;
          background: var(--primary-tint);
          color: var(--primary);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10px;
          font-weight: 900;
        }

        .status-chip.live {
          border-color: rgba(16, 185, 129, 0.28);
          color: #059669;
          background: rgba(16, 185, 129, 0.1);
        }

        .colour-workbench {
          display: grid;
          grid-template-columns: minmax(190px, 0.9fr) minmax(170px, 0.8fr);
          align-items: center;
          gap: 18px;
          min-width: 0;
        }

        .theme-colour-wheel {
          width: min(240px, 100%);
          aspect-ratio: 1;
          border-radius: 50%;
          justify-self: center;
          box-shadow: var(--shadow-soft);
          overflow: hidden;
          touch-action: none;
        }

        .theme-colour-wheel > div {
          width: 100% !important;
          height: 100% !important;
        }

        .colour-controls {
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 0;
        }

        .colour-preview {
          position: relative;
          height: 76px;
          border-radius: var(--radius-sm);
          border: 5px solid var(--bg-card);
          box-shadow: 0 0 0 1px var(--border), inset 0 0 18px rgba(255, 255, 255, 0.14);
          overflow: hidden;
        }

        .colour-preview span {
          position: absolute;
          right: 8px;
          bottom: 7px;
          padding: 4px 7px;
          border-radius: 999px;
          color: #fff;
          background: rgba(0, 0, 0, 0.35);
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
          backdrop-filter: blur(5px);
        }

        .colour-meta {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .colour-meta span {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          min-width: 0;
          padding: 8px 9px;
          border: 0;
          border-radius: var(--radius-sm);
          background: var(--bg-elevated);
          color: var(--text-main);
          font-size: 12px;
          font-weight: 900;
        }

        .colour-meta small {
          color: var(--text-muted);
          font-size: 9px;
          font-weight: 900;
        }

        .white-control {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 9px 14px;
          padding: 12px;
          border-radius: var(--radius-sm);
          background: var(--bg-elevated);
          color: var(--text-main);
          font-size: 12px;
          font-weight: 900;
        }

        .white-range {
          grid-column: 1 / -1;
          width: 100%;
          accent-color: var(--primary);
        }

        .apply-colour-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 50px;
          gap: 8px;
          border-radius: var(--radius-sm);
          background: linear-gradient(135deg, var(--primary), var(--primary-dark));
          color: #fff;
          font-size: 14px;
          font-weight: 900;
          box-shadow: 0 12px 24px var(--primary-glow);
        }

        .apply-colour-btn:hover {
          transform: translateY(-1px);
        }

        .quick-colours {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 18px;
        }

        .quick-colour {
          display: flex;
          align-items: center;
          min-height: 48px;
          padding: 8px 10px;
          gap: 9px;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          color: var(--text-main);
          background: var(--bg-elevated);
          font-size: 12px;
          font-weight: 900;
          text-align: left;
        }

        .quick-colour i {
          flex: 0 0 23px;
          width: 23px;
          height: 23px;
          border: 3px solid rgba(255, 255, 255, 0.75);
          border-radius: 50%;
          box-shadow: 0 0 0 1px var(--border);
        }

        .quick-colour:hover,
        .quick-colour.active {
          border-color: var(--primary);
          background: var(--primary-tint);
          color: var(--primary);
          transform: translateY(-1px);
        }

        .quick-colour.red i { background: #ef333a; }
        .quick-colour.green i { background: #22c55e; }
        .quick-colour.blue i { background: #3b82f6; }
        .quick-colour.warm i { background: #f59e0b; }
        .quick-colour.cyan i { background: #06b6d4; }
        .quick-colour.magenta i { background: #c026d3; }
        .quick-colour.white i { background: #fff; }
        .quick-colour.soft i { background: #7c3aed; }

        .animations-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 11px;
          margin-top: 18px;
        }

        .animation-btn {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          min-height: 46px;
          padding: 8px 10px;
          gap: 8px;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          background: var(--bg-elevated);
          color: var(--text-main);
          font-size: 11px;
          font-weight: 900;
          text-align: left;
        }

        .animation-btn i {
          flex: 0 0 7px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--text-muted);
        }

        .animation-btn:hover,
        .animation-btn.active {
          border-color: var(--primary);
          background: var(--primary-tint);
          color: var(--primary);
        }

        .animation-btn.active i {
          background: var(--primary);
          box-shadow: 0 0 7px var(--primary);
        }

        @media (max-width: 980px) {
          .rgbw-main-row,
          .colour-workbench {
            grid-template-columns: 1fr;
          }

          .animations-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 620px) {
          .rgbw-level-card {
            grid-template-columns: minmax(0, 1fr) auto;
          }

          .level-pill {
            justify-self: end;
          }

          .rgbw-card-heading {
            gap: 9px;
          }

          .rgbw-heading-icon {
            flex-basis: 36px;
            width: 36px;
            height: 36px;
            border-radius: 11px;
            font-size: 17px;
          }

          .rgbw-theme-dashboard h3 {
            font-size: 16px;
          }

          .rgbw-card-heading p {
            font-size: 10px;
          }

          .rgbw-colour-card .section-title-row {
            align-items: flex-start;
            flex-direction: column;
            margin-bottom: 18px;
          }

          .rgbw-colour-card .status-chip {
            margin-left: 45px;
            margin-top: -5px;
          }

          .quick-colours,
          .animations-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        /* Classic RGBW appearance, with only sizing and alignment refined. */
        .rgbw-panel-card {
          padding: 20px;
        }

        .rgbw-level-card {
          gap: 14px 16px;
        }

        .rgbw-range,
        .white-range {
          appearance: auto;
          height: auto;
          border-radius: 0;
          outline: initial;
          background: initial;
          accent-color: var(--primary);
        }

        .rgbw-range {
          height: 8px;
        }

        .brightness-shortcuts {
          display: grid;
          grid-column: 1 / -1;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 8px;
        }

        .brightness-slider-row {
          display: grid;
          grid-column: 1 / -1;
          grid-template-columns: 36px minmax(0, 1fr) 36px;
          align-items: center;
          width: 100%;
          gap: 10px;
        }

        .brightness-slider-row .rgbw-range {
          grid-column: auto;
          width: 100%;
          margin: 0;
        }

        .brightness-step-btn {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 50%;
          color: var(--primary);
          background: var(--bg-card);
          font-size: 21px;
          font-weight: 800;
          line-height: 1;
        }

        .brightness-step-btn:hover:not(:disabled) {
          border-color: var(--primary);
          background: var(--primary-tint);
        }

        .brightness-step-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .brightness-shortcuts button {
          min-height: 38px;
          padding: 7px 4px;
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text-main);
          background: var(--bg-card);
          font-size: 11px;
          font-weight: 900;
        }

        .brightness-shortcuts button:hover,
        .brightness-shortcuts button.active {
          border-color: var(--primary);
          color: var(--primary);
          background: var(--primary-tint);
        }

        .brightness-shortcuts-mobile {
          display: none;
        }

        .brightness-mobile-off {
          display: none;
        }

        .brightness-mobile-dial {
          display: none;
        }

        .brightness-shortcuts-desktop {
          grid-template-columns: repeat(11, minmax(0, 1fr));
        }

        @media (max-width: 980px) {
          .brightness-shortcuts-desktop {
            display: none;
          }

          .brightness-shortcuts-mobile {
            display: grid;
          }
        }

        .rgbw-range::-webkit-slider-thumb,
        .white-range::-webkit-slider-thumb,
        .rgbw-range::-moz-range-thumb,
        .white-range::-moz-range-thumb {
          appearance: auto;
          width: auto;
          height: auto;
          border: initial;
          border-radius: initial;
          background: initial;
          box-shadow: none;
        }

        .level-pill {
          min-width: 0;
          padding: 7px 12px;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-main);
        }

        .section-title-row {
          align-items: flex-start;
          margin-bottom: 18px;
        }

        .status-chip {
          border: 1px solid var(--border);
          font-family: inherit;
          font-size: 11px;
        }

        .colour-preview {
          position: static;
          border: 1px solid var(--border-strong);
          box-shadow: inset 0 0 18px rgba(255, 255, 255, 0.1);
        }

        .colour-meta span {
          display: block;
          overflow: hidden;
          padding: 8px 9px;
          border: 1px solid var(--border);
          background: var(--bg-card);
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .white-control {
          padding: 0;
          background: transparent;
          font-size: inherit;
        }

        .apply-colour-btn {
          display: block;
          height: 54px;
          font-size: 15px;
        }

        .quick-colours {
          margin-top: 22px;
        }

        .quick-colour {
          display: block;
          min-height: 52px;
          padding: 0;
          border: 0;
          color: #fff;
          font-size: 13px;
          text-align: center;
        }

        .quick-colour.red { background: linear-gradient(135deg, #fb6168, #ef333a); }
        .quick-colour.green { background: linear-gradient(135deg, #4ade80, #22c55e); }
        .quick-colour.blue { background: linear-gradient(135deg, #60a5fa, #3b82f6); }
        .quick-colour.warm { background: linear-gradient(135deg, #fbbf24, #f59e0b); }
        .quick-colour.cyan { background: linear-gradient(135deg, #38d7e6, #06b6d4); }
        .quick-colour.magenta { background: linear-gradient(135deg, #e879f9, #c026d3); }
        .quick-colour.white {
          border: 1px solid var(--border);
          background: var(--bg-elevated);
          color: var(--text-main);
        }
        .quick-colour.soft { background: linear-gradient(135deg, #a78bfa, #7c3aed); }

        .animation-btn {
          display: block;
          min-height: 46px;
          padding: 0;
          border: 1px solid var(--border);
          background: var(--bg-card);
          font-size: 12px;
          text-align: center;
        }

        @media (max-width: 620px) {
          .rgbw-level-card {
            grid-template-columns: minmax(0, 1fr) auto auto;
          }

          .level-pill {
            justify-self: end;
          }

          .brightness-mobile-off {
            display: block;
            min-height: 36px;
            padding: 7px 13px;
            border: 1px solid var(--border);
            border-radius: 10px;
            color: var(--text-main);
            background: var(--bg-card);
            font-size: 11px;
            font-weight: 900;
          }

          .brightness-mobile-off[aria-pressed="true"] {
            border-color: var(--primary);
            color: var(--primary);
            background: var(--primary-tint);
          }

          .brightness-slider-row {
            display: none;
          }

          .brightness-mobile-dial {
            --brightness-level: 0%;
            --brightness-angle: 0deg;
            position: relative;
            display: grid;
            grid-column: 1 / -1;
            place-items: center;
            justify-self: center;
            width: 148px;
            height: 148px;
            margin: 2px 0 4px;
            border-radius: 50%;
            background: conic-gradient(
              var(--primary) var(--brightness-level),
              var(--bg-secondary) 0
            );
            box-shadow: 0 8px 24px var(--primary-glow);
            cursor: grab;
            touch-action: none;
            user-select: none;
          }

          .brightness-mobile-dial:active {
            cursor: grabbing;
          }

          .brightness-mobile-dial::before {
            content: '';
            position: absolute;
            inset: 13px;
            border: 1px solid var(--border);
            border-radius: 50%;
            background: var(--bg-card);
            box-shadow: inset 0 3px 12px rgba(0, 0, 0, 0.06);
          }

          .brightness-mobile-dial::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 10px;
            height: 10px;
            border: 2px solid var(--bg-card);
            border-radius: 50%;
            background: var(--primary);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
            transform: translate(-50%, -50%) rotate(var(--brightness-angle)) translateY(-68px);
          }

          .brightness-mobile-dial-centre {
            position: relative;
            z-index: 1;
            display: flex;
            align-items: center;
            flex-direction: column;
            line-height: 1.1;
          }

          .brightness-mobile-dial-centre strong {
            color: var(--text-main);
            font-size: 25px;
          }

          .brightness-mobile-dial-centre span {
            margin-top: 5px;
            color: var(--text-muted);
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
          }

          .brightness-shortcuts-mobile {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }

          .rgbw-colour-card .section-title-row {
            align-items: flex-start;
            flex-direction: row;
            margin-bottom: 18px;
          }

          .rgbw-colour-card .status-chip {
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default RGBWPanel;
