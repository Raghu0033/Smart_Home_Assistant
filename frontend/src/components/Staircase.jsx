import React, { useEffect, useState, useRef } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import './Staircase.css';

const CHANNELS_PER_NODE = 4;

const Staircase = ({ socket, mqttStatus }) => {
  const [currentState, setCurrentState] = useState('IDLE');
  const [settings, setSettings] = useState({
    maxBrightness: 255,
    fadeTime: 850,
    fadeStep: (255 * 5) / 850,
    nodeCount: 1,
    topSensorDeviceId: '',
    bottomSensorDeviceId: ''
  });
  const [visData, setVisData] = useState({});
  const [feedbackNotice, setFeedbackNotice] = useState(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('staircase_state_update', (data) => setCurrentState(data.state));
    socket.on('staircase_settings_sync', (data) => setSettings(data));
    socket.on('staircase_vis_update', (data) => setVisData(data));
    socket.on('staircase_feedback_error', (data) => {
      setFeedbackNotice({ ...data, id: Date.now() });
      window.setTimeout(() => setFeedbackNotice(null), 8000);
    });

    return () => {
      socket.off('staircase_state_update');
      socket.off('staircase_settings_sync');
      socket.off('staircase_vis_update');
      socket.off('staircase_feedback_error');
    };
  }, [socket]);

  const trigger = (cmd) => {
    if (socket) {
      socket.emit('staircase_trigger', { cmd });
    }
  };

  const handleSettingChange = (e) => {
    const { name, value } = e.target;
    const val = name.includes('Sensor') ? value : parseFloat(value);
    
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
      {feedbackNotice && <div className="staircase-feedback-error" role="alert">
        <strong>Staircase feedback error</strong>
        <span>{feedbackNotice.message}{feedbackNotice.node ? ` (${feedbackNotice.node})` : ''}</span>
        <button type="button" onClick={() => setFeedbackNotice(null)} aria-label="Dismiss notification">×</button>
      </div>}
      <div className="staircase-grid">
        {/* LEFT: CONTROLS */}
        <div className="staircase-panel controls-panel">

          <h3>Tuning <SettingsIcon size={16} style={{marginLeft: '8px', verticalAlign: 'middle'}}/></h3>

          <div className="staircase-direction-controls" aria-label="Staircase direction controls">
            <button type="button" className="staircase-direction-button staircase-up" onClick={() => trigger('UP')}>
              UP
            </button>
            <button type="button" className="staircase-direction-button staircase-down" onClick={() => trigger('DOWN')}>
              DOWN
            </button>
            <button type="button" className="staircase-direction-button staircase-emergency" onClick={() => trigger('EMERGENCY_OFF')}>
              EMERGENCY OFF
            </button>
          </div>

          <div className="slider-group">
            <label>Max Brightness <span>{settings.maxBrightness}</span></label>
            <input type="range" name="maxBrightness" min="10" max="255" value={settings.maxBrightness} onChange={handleSettingChange} />
          </div>
          <div className="staircase-field"><label>Fade time (ms)</label><input type="number" name="fadeTime" min="50" max="10000" value={settings.fadeTime} onChange={handleSettingChange} /></div>
          <div className="staircase-hint">Firmware fadeStep: {Number(settings.fadeStep || 0).toFixed(2)}</div>
          <div className="staircase-field"><label>Controller nodes / steps</label><input type="number" name="nodeCount" min="1" max="16" value={settings.nodeCount} onChange={handleSettingChange} /></div>
          <div className="staircase-field"><label>Top sensor device ID</label><input name="topSensorDeviceId" placeholder="staircase_top" value={settings.topSensorDeviceId} onChange={handleSettingChange} /></div>
          <div className="staircase-field"><label>Bottom sensor device ID</label><input name="bottomSensorDeviceId" placeholder="e.g. sensor_bottom" value={settings.bottomSensorDeviceId} onChange={handleSettingChange} /></div>

        </div>

        {/* RIGHT: VISUALIZER */}
        <div className="staircase-panel">
          <h3>Steps Visualizer</h3>
          <div className="staircase-bars">
            {Array.from({ length: settings.nodeCount * CHANNELS_PER_NODE }, (_, i) => settings.nodeCount * CHANNELS_PER_NODE - i).map((step) => {
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
