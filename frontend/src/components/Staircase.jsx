import React, { useEffect, useState, useRef } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import './Staircase.css';

const TOTAL_STEPS = 24;

const Staircase = ({ socket, mqttStatus }) => {
  const [currentState, setCurrentState] = useState('IDLE');
  const [settings, setSettings] = useState({
    maxBrightness: 255,
    fadeTime: 0.8,
    stepGap: 0.25,
    fps: 30,
    autoOffTimeout: 20
  });
  const [visData, setVisData] = useState({});

  useEffect(() => {
    if (!socket) return;

    socket.on('staircase_state_update', (data) => setCurrentState(data.state));
    socket.on('staircase_settings_sync', (data) => setSettings(data));
    socket.on('staircase_vis_update', (data) => setVisData(data));

    return () => {
      socket.off('staircase_state_update');
      socket.off('staircase_settings_sync');
      socket.off('staircase_vis_update');
    };
  }, [socket]);

  const trigger = (cmd) => {
    if (socket) {
      socket.emit('staircase_trigger', { cmd });
    }
  };

  const handleSettingChange = (e) => {
    const { name, value } = e.target;
    const val = parseFloat(value);
    
    // Optimistic UI update
    setSettings(prev => ({ ...prev, [name]: val }));

    if (socket) {
      socket.emit('staircase_update_settings', { [name]: val });
    }
  };

  const getStateClass = () => {
    if (currentState === 'IDLE') return 'badge-idle';
    if (currentState === 'ON') return 'badge-ok';
    return 'badge-anim';
  };

  return (
    <div className="staircase-view">
      <div className="staircase-grid">
        {/* LEFT: CONTROLS */}
        <div className="staircase-panel controls-panel">

          <h3>Tuning <SettingsIcon size={16} style={{marginLeft: '8px', verticalAlign: 'middle'}}/></h3>
          <div className="slider-group">
            <label>Max Brightness <span>{settings.maxBrightness}</span></label>
            <input type="range" name="maxBrightness" min="10" max="255" value={settings.maxBrightness} onChange={handleSettingChange} />
          </div>
          <div className="slider-group">
            <label>Fade Time (s) <span>{settings.fadeTime}</span></label>
            <input type="range" name="fadeTime" min="0.1" max="5.0" step="0.1" value={settings.fadeTime} onChange={handleSettingChange} />
          </div>
          <div className="slider-group">
            <label>Step Gap (s) <span>{settings.stepGap}</span></label>
            <input type="range" name="stepGap" min="0.05" max="3.0" step="0.05" value={settings.stepGap} onChange={handleSettingChange} />
          </div>
          <div className="slider-group">
            <label>FPS <span>{settings.fps}</span></label>
            <input type="range" name="fps" min="5" max="60" value={settings.fps} onChange={handleSettingChange} />
          </div>
          <div className="slider-group">
            <label>Auto-Off (s) <span>{settings.autoOffTimeout}</span></label>
            <input type="range" name="autoOffTimeout" min="5" max="120" value={settings.autoOffTimeout} onChange={handleSettingChange} />
          </div>

        </div>

        {/* RIGHT: VISUALIZER */}
        <div className="staircase-panel">
          <h3>Steps Visualizer</h3>
          <div className="staircase-bars">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => TOTAL_STEPS - i).map((step) => {
              const brightness = visData[step] || 0;
              const percent = brightness / 255;
              const width = Math.max(1, percent * 100);
              
              return (
                <div key={step} className="step-row">
                  <div className="step-label">{step}</div>
                  <div className="step-bar-wrap">
                    <div 
                      className="step-bar"
                      style={{
                        width: `${width}%`,
                        background: `rgba(0, 255, 204, ${Math.max(0.08, percent)})`,
                        boxShadow: percent > 0.1 ? `0 0 ${percent * 12}px rgba(0, 255, 204, ${percent * 0.5})` : 'none'
                      }}
                    ></div>
                    <div className="step-pct">{Math.round(percent * 100)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Staircase;
