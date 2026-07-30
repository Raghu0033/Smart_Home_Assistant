import { useState } from 'react';
import Wheel from '@uiw/react-color-wheel';
import { rgbaToHsva } from '@uiw/color-convert';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EFFECTS = ['rainbow', 'northern_lights', 'love', 'cinematic', 'galaxy', 'zen', 'party', 'candle', 'sunset', 'ocean', 'forest', 'ice', 'lava', 'fireplace', 'cyberpunk'];

const actionLabel = schedule => {
  if (schedule.actionType === 'BRIGHTNESS') return `Brightness ${schedule.scheduledBrightness || 50}%`;
  if (schedule.actionType === 'COLOR') return 'Custom colour';
  if (schedule.actionType === 'ANIMATION') {
    return (schedule.animationEffect || 'Animation').replaceAll('_', ' ');
  }
  return `Turn ${schedule.actionType}`;
};

const RGBWScheduler = ({ device, socket }) => {
  const isTunable = device.type === 'tunable-light' || device.type === 'tune light';
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    actionTime: '18:00',
    endTime: '19:00',
    restoreAfterEnd: false,
    endEnabled: false,
    endActionType: 'OFF',
    actionType: 'ON',
    scheduledBrightness: 50,
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    color: { r: 255, g: 102, b: 0, w: 0 },
    colorHsva: rgbaToHsva({ r: 255, g: 102, b: 0, a: 1 }),
    animationEffect: 'rainbow'
  });
  const schedules = (device.schedules || []).filter(schedule => schedule.actionType);
  const effectiveActionType = isTunable && !['ON', 'OFF', 'BRIGHTNESS'].includes(draft.actionType) ? 'ON' : draft.actionType;
  const supportsRestore = !isTunable && ['COLOR', 'ANIMATION'].includes(effectiveActionType);

  const toggleDay = day => setDraft(previous => ({
    ...previous,
    days: previous.days.includes(day)
      ? previous.days.filter(value => value !== day)
      : [...previous.days, day]
  }));

  const save = () => {
    if (!draft.actionTime || draft.days.length === 0 || saving) return;
    setSaving(true);
    socket.emit('add_rgbw_schedule', {
      deviceId: device.deviceId,
      actionTime: draft.actionTime,
      actionType: effectiveActionType,
      days: draft.days,
      rgbwColor: draft.color,
      animationEffect: draft.animationEffect,
      scheduledBrightness: draft.scheduledBrightness,
      restoreAfterEnd: supportsRestore && draft.restoreAfterEnd,
      endEnabled: draft.endEnabled,
      endActionType: draft.endActionType,
      endTime: draft.endTime
    }, response => {
      setSaving(false);
      if (response?.ok) setOpen(false);
    });
  };

  return (
    <section className="rgbw-automation-card">
      <div className="rgbw-automation-heading">
        <div>
          <span className="section-kicker">Automation</span>
          <h3>{isTunable ? 'Tunable Light Scheduler' : 'RGBW Scheduler'}</h3>
          <p>{isTunable ? 'Turn the light on or off automatically at a chosen time.' : 'Play a colour or animation automatically at a chosen time.'}</p>
          <small className="rgbw-scheduler-requirement">
            Requires the device to stay connected to WiFi/internet when an action or restoration runs.
          </small>
        </div>
        <button className="rgbw-add-automation" onClick={() => setOpen(value => !value)}>
          {open ? 'Close' : '+ Add automation'}
        </button>
      </div>

      {schedules.length > 0 && (
        <div className="rgbw-schedule-list">
          {schedules.map(schedule => (
            <div className="rgbw-schedule-item" key={schedule._id}>
              <strong>{schedule.actionTime}</strong>
              <div>
                <span>{actionLabel(schedule)}</span>
                <small>
                  {(schedule.days || []).join(' · ')}
                  {schedule.restoreAfterEnd && schedule.endTime ? ` · restore at ${schedule.endTime}` : ''}
                  {schedule.endEnabled && schedule.endTime ? ` · ${schedule.endActionType || 'OFF'} at ${schedule.endTime}` : ''}
                </small>
              </div>
              <button
                aria-label="Remove automation"
                onClick={() => socket.emit('remove_schedule', { deviceId: device.deviceId, scheduleId: schedule._id })}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {schedules.length === 0 && !open && (
        <div className="rgbw-schedule-empty">No {isTunable ? 'light' : 'RGBW'} automations yet</div>
      )}

      {open && (
        <div className="rgbw-schedule-form">
          <div className="rgbw-schedule-primary-row">
            <label>
              Time
              <input type="time" value={draft.actionTime} onChange={event => setDraft({ ...draft, actionTime: event.target.value })} />
            </label>
            <label>
              Action
              <select value={effectiveActionType} onChange={event => setDraft({ ...draft, actionType: event.target.value })}>
                <option value="ON">Turn ON</option>
                <option value="OFF">Turn OFF</option>
                <option value="BRIGHTNESS">Set brightness</option>
                {!isTunable && <option value="COLOR">Custom colour</option>}
                {!isTunable && <option value="ANIMATION">Play animation</option>}
              </select>
            </label>
            <div className="rgbw-days-field">
              <span>Days</span>
              <div className="rgbw-schedule-days">
                {DAYS.map(day => (
                  <button key={day} className={draft.days.includes(day) ? 'active' : ''} onClick={() => toggleDay(day)}>
                    {day.slice(0, 1)}
                  </button>
                ))}
              </div>
            </div>
            <button className="rgbw-save-automation rgbw-save-automation-desktop" disabled={saving || draft.days.length === 0} onClick={save}>
              {saving ? 'Saving…' : 'Save automation'}
            </button>
          </div>
          <div className={`rgbw-schedule-secondary-row ${draft.actionType === 'COLOR' ? 'colour-row' : 'animation-row'}`}>
              {effectiveActionType === 'BRIGHTNESS' && (
                <label>
                  Brightness
                  <select value={draft.scheduledBrightness} onChange={event => setDraft({ ...draft, scheduledBrightness: Number(event.target.value) })}>
                    {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(value => <option value={value} key={value}>{value}%</option>)}
                  </select>
                </label>
              )}
              {draft.actionType === 'COLOR' && (
                <div className="rgbw-schedule-colour-picker">
                  <span>Choose colour</span>
                  <Wheel
                    color={{ ...draft.colorHsva, v: 100 }}
                    width={180}
                    height={180}
                    onChange={value => setDraft(previous => ({
                      ...previous,
                      colorHsva: { ...value.hsva, v: 100 },
                      color: {
                        r: Math.round(value.rgb.r),
                        g: Math.round(value.rgb.g),
                        b: Math.round(value.rgb.b),
                        w: 0
                      }
                    }))}
                  />
                  <div
                    className="rgbw-schedule-colour-preview"
                    style={{ background: `rgb(${draft.color.r}, ${draft.color.g}, ${draft.color.b})` }}
                  >
                    Selected colour
                  </div>
                </div>
              )}
              {draft.actionType === 'ANIMATION' && (
                <label>
                  Animation
                  <select value={draft.animationEffect} onChange={event => setDraft({ ...draft, animationEffect: event.target.value })}>
                    {EFFECTS.map(effect => <option value={effect} key={effect}>{effect.replaceAll('_', ' ')}</option>)}
                  </select>
                </label>
              )}
              {supportsRestore && <label className="rgbw-restore-toggle">
                <input
                  type="checkbox"
                  checked={draft.restoreAfterEnd}
                  onChange={event => setDraft({ ...draft, restoreAfterEnd: event.target.checked, endEnabled: event.target.checked ? false : draft.endEnabled })}
                />
                <span>Set an end time and restore the previous light state</span>
              </label>}
              {draft.restoreAfterEnd && (
                <label>
                  End time
                  <input type="time" value={draft.endTime} onChange={event => setDraft({ ...draft, endTime: event.target.value })} />
                </label>
              )}
              <label className="rgbw-restore-toggle">
                <input
                  type="checkbox"
                  checked={draft.endEnabled}
                  onChange={event => setDraft({ ...draft, endEnabled: event.target.checked, restoreAfterEnd: event.target.checked ? false : draft.restoreAfterEnd })}
                />
                <span>Enable an end action</span>
              </label>
              {draft.endEnabled && (
                <>
                  <label>
                    End time
                    <input type="time" value={draft.endTime} onChange={event => setDraft({ ...draft, endTime: event.target.value })} />
                  </label>
                  <label>
                    End action
                    <select value={draft.endActionType} onChange={event => setDraft({ ...draft, endActionType: event.target.value })}>
                      <option value="OFF">Turn OFF</option>
                      <option value="ON">Turn ON</option>
                    </select>
                  </label>
                </>
              )}
          </div>
          <button
            className="rgbw-save-automation rgbw-save-automation-mobile"
            disabled={saving || draft.days.length === 0}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save automation'}
          </button>
        </div>
      )}
    </section>
  );
};

export default RGBWScheduler;
