/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import Wheel from '@uiw/react-color-wheel';
import { rgbaToHsva } from '@uiw/color-convert';

const PRESETS = [
  { label: 'Red', r: 255, g: 0, b: 0, w: 0, className: 'red' },
  { label: 'Green', r: 0, g: 255, b: 0, w: 0, className: 'green' },
  { label: 'Blue', r: 0, g: 80, b: 255, w: 0, className: 'blue' },
  { label: 'Warm', r: 255, g: 170, b: 35, w: 130, className: 'warm' },
  { label: 'Cyan', r: 0, g: 210, b: 225, w: 0, className: 'cyan' },
  { label: 'Magenta', r: 210, g: 70, b: 235, w: 0, className: 'magenta' },
  { label: 'White', r: 255, g: 255, b: 255, w: 255, className: 'white' },
  { label: 'Soft', r: 150, g: 105, b: 240, w: 80, className: 'soft' },
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
}) => {
  const initialRgb = getRgbFromDevice(device);
  const [draft, setDraft] = useState(() => ({ ...initialRgb, w: whiteIntensity ?? 0 }));
  const [hsva, setHsva] = useState(() => rgbToHsva(initialRgb.r, initialRgb.g, initialRgb.b));
  const [activeAnimation, setActiveAnimation] = useState(device?.effect || 'solid');

  const brightnessPercent = Math.round(((brightness ?? 0) / 255) * 100);
  const hex = useMemo(() => rgbToHex(draft.r, draft.g, draft.b), [draft]);
  const wheelColor = useMemo(() => ({ ...hsva, v: 100 }), [hsva]);

  useEffect(() => {
    const nextRgb = getRgbFromDevice(device);
    setDraft(prev => ({ ...prev, ...nextRgb, w: whiteIntensity ?? prev.w }));
    setHsva(rgbToHsva(nextRgb.r, nextRgb.g, nextRgb.b));
    setActiveAnimation(device?.effect || 'solid');
  }, [device, whiteIntensity]);

  const emitColor = (next = draft) => {
    throttleEmit('color_change', {
      deviceId: device.deviceId,
      r: next.r,
      g: next.g,
      b: next.b,
      w: next.w,
    });
  };

  const handleWheelChange = (color) => {
    const next = {
      r: Math.round(color.rgb.r),
      g: Math.round(color.rgb.g),
      b: Math.round(color.rgb.b),
    };
    const nextDraft = { ...draft, ...next };
    setDraft(nextDraft);
    setHsva({ ...color.hsva, v: 100 });
  };

  const handleBrightness = (percent) => {
    const value = Math.round((Number(percent) / 100) * 255);
    setBrightness(value);
    throttleEmit('brightness_change', { deviceId: device.deviceId, brightness: value });
  };

  const handleWhite = (value) => {
    const white = clamp(Number(value));
    const next = { ...draft, w: white };
    setDraft(next);
    setWhiteIntensity(white);
    throttleEmit('white_change', { deviceId: device.deviceId, white });
  };

  const handlePreset = (preset) => {
    const next = { r: preset.r, g: preset.g, b: preset.b, w: preset.w };
    setDraft(next);
    setHsva(rgbToHsva(next.r, next.g, next.b));
    setWhiteIntensity(preset.w);
    emitColor(next);
  };

  const handleAnimation = (effect) => {
    setActiveAnimation(effect);
    throttleEmit('set_effect', { deviceId: device.deviceId, effect });
  };

  return (
    <div className="rgbw-theme-dashboard">
      <section className="rgbw-panel-card rgbw-level-card">
        <div>
          <span className="section-kicker">Brightness</span>
          <h3>Light Level</h3>
        </div>
        <span className="level-pill">{brightnessPercent}%</span>
        <input
          className="rgbw-range"
          type="range"
          min="0"
          max="100"
          value={brightnessPercent}
          onChange={(event) => handleBrightness(event.target.value)}
          aria-label="Light brightness"
        />
      </section>

      <div className="rgbw-main-row">
        <section className="rgbw-panel-card rgbw-colour-card">
          <div className="section-title-row">
            <div>
              <span className="section-kicker">Custom Colour</span>
              <h3>Choose Any Shade</h3>
            </div>
            <span className="drag-hint">Drag the circle</span>
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
              <div className="colour-preview" style={{ background: hex }} />
              <div className="rgbw-readout">RGBW: {draft.r}, {draft.g}, {draft.b}, {draft.w}</div>
              <div className="apply-hint">Preview only. Tap Apply Colour to send.</div>

              <label className="white-control">
                <span>White channel</span>
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
          padding: 20px;
        }

        .rgbw-level-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px 16px;
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
          padding: 7px 12px;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: var(--bg-card);
          color: var(--text-main);
          font-size: 16px;
          font-weight: 900;
        }

        .rgbw-range {
          grid-column: 1 / -1;
          width: 100%;
          height: 8px;
          accent-color: var(--primary);
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
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 18px;
        }

        .drag-hint {
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 800;
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
          height: 76px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-strong);
          box-shadow: inset 0 0 18px rgba(255, 255, 255, 0.1);
        }

        .rgbw-readout {
          color: var(--text-main);
          font-weight: 900;
        }

        .apply-hint {
          margin-top: -8px;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 800;
        }

        .white-control {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 9px 14px;
          color: var(--text-main);
          font-weight: 900;
        }

        .white-range {
          grid-column: 1 / -1;
          width: 100%;
          accent-color: var(--primary);
        }

        .apply-colour-btn {
          height: 54px;
          border-radius: var(--radius-sm);
          background: var(--primary);
          color: #fff;
          font-size: 15px;
          font-weight: 900;
          box-shadow: 0 8px 18px var(--primary-glow);
        }

        .quick-colours {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 22px;
        }

        .quick-colour {
          min-height: 52px;
          border-radius: var(--radius-sm);
          color: #fff;
          font-size: 13px;
          font-weight: 900;
        }

        .quick-colour.red { background: linear-gradient(135deg, #fb6168, #ef333a); }
        .quick-colour.green { background: linear-gradient(135deg, #4ade80, #22c55e); }
        .quick-colour.blue { background: linear-gradient(135deg, #60a5fa, #3b82f6); }
        .quick-colour.warm { background: linear-gradient(135deg, #fbbf24, #f59e0b); }
        .quick-colour.cyan { background: linear-gradient(135deg, #38d7e6, #06b6d4); }
        .quick-colour.magenta { background: linear-gradient(135deg, #e879f9, #c026d3); }
        .quick-colour.white {
          background: var(--bg-elevated);
          color: var(--text-main);
          border: 1px solid var(--border);
        }
        .quick-colour.soft { background: linear-gradient(135deg, #a78bfa, #7c3aed); }

        .animations-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 11px;
          margin-top: 18px;
        }

        .animation-btn {
          min-height: 46px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          color: var(--text-main);
          font-size: 12px;
          font-weight: 900;
        }

        .animation-btn:hover,
        .animation-btn.active {
          border-color: var(--primary);
          background: var(--primary-tint);
          color: var(--primary);
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
            grid-template-columns: 1fr;
          }

          .level-pill {
            justify-self: start;
          }

          .quick-colours,
          .animations-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
};

export default RGBWPanel;
