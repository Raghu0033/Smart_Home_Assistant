import React, { useState } from 'react';
import { HexColorPicker } from 'react-colorful';

const ColorControl = ({ onColorChange }) => {
  const [color, setColor] = useState('#2563eb');

  // Convert HEX to RGB
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b, w: 0 };
  };

  const handleChange = (newHex) => {
    setColor(newHex);
    const rgb = hexToRgb(newHex);
    onColorChange(rgb);
  };

  return (
    <div className="color-control-wrapper">
      <div className="wheel-container">
        <HexColorPicker color={color} onChange={handleChange} />
      </div>
      
      <div className="selected-color-info">
        <div 
          className="color-preview" 
          style={{ backgroundColor: color }}
        ></div>
        <div className="color-details">
          <p className="hex-value">{color.toUpperCase()}</p>
          <p className="label">Active Color</p>
        </div>
      </div>

      <style>{`
        .color-control-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 30px;
          padding: 10px;
        }
        
        .wheel-container {
          position: relative;
          padding: 10px;
          background: var(--bg-card);
          border-radius: 50%;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
        }

        /* Customize react-colorful wheel */
        .react-colorful {
          width: 240px !important;
          height: 240px !important;
        }
        .react-colorful__saturation {
          border-radius: 50% !important;
          margin-bottom: 0 !important;
          border-bottom: none !important;
        }
        .react-colorful__hue {
          height: 24px !important;
          border-radius: 12px !important;
          margin-top: 20px !important;
        }
        .react-colorful__pointer {
          width: 24px !important;
          height: 24px !important;
        }

        .selected-color-info {
          display: flex;
          align-items: center;
          gap: 16px;
          width: 100%;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 16px;
          border: 1px solid var(--border);
        }

        .color-preview {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          border: 3px solid white;
          box-shadow: var(--shadow-sm);
        }

        .hex-value {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-main);
          letter-spacing: 0.5px;
        }

        .label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
};

export default ColorControl;
