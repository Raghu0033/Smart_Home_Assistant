const clampPercent = value => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));

const TunableBrightnessControl = ({ brightness, onChange, disabled = false }) => {
  const percent = clampPercent((Number(brightness) / 255) * 100);

  const selectPercent = value => {
    if (disabled) return;
    onChange(Math.round((clampPercent(value) / 100) * 255));
  };

  const updateFromPointer = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    const angle = (Math.atan2(y, x) * 180 / Math.PI + 450) % 360;
    selectPercent((angle / 360) * 100);
  };

  return (
    <section className={`tunable-brightness-control ${disabled ? 'disabled' : ''}`}>
      <div className="tunable-brightness-head">
        <div><span>Brightness</span><h3>Light Level</h3></div>
        <strong>{percent}%</strong>
      </div>
      <div
        className="tunable-mobile-dial"
        style={{ '--brightness-level': `${percent}%`, '--brightness-angle': `${percent * 3.6}deg` }}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Tunable light circular brightness"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={percent}
        onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
        }}
        onKeyDown={event => {
          if (['ArrowUp', 'ArrowRight'].includes(event.key)) selectPercent(percent + 5);
          if (['ArrowDown', 'ArrowLeft'].includes(event.key)) selectPercent(percent - 5);
        }}
      >
        <div><strong>{percent}%</strong><span>Brightness</span></div>
      </div>
      <input
        className="tunable-brightness-range"
        type="range"
        min="0"
        max="100"
        value={percent}
        disabled={disabled}
        onChange={event => selectPercent(event.target.value)}
      />
      <div className="tunable-brightness-presets tunable-presets-desktop">
        {Array.from({ length: 11 }, (_, index) => index * 10).map(value => (
          <button type="button" key={value} className={percent === value ? 'active' : ''} onClick={() => selectPercent(value)}>
            {value === 0 ? 'Off' : `${value}%`}
          </button>
        ))}
      </div>
      <div className="tunable-brightness-presets tunable-presets-mobile">
        {[20, 40, 60, 80, 100].map(value => (
          <button type="button" key={value} className={percent === value ? 'active' : ''} onClick={() => selectPercent(value)}>
            {value}%
          </button>
        ))}
      </div>
    </section>
  );
};

export default TunableBrightnessControl;
