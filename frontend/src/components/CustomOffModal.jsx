import { useEffect, useState } from 'react';

const CustomOffModal = ({ room, channels, initialPreset = null, onClose, onSave, onDelete }) => {
  const [name, setName] = useState(() => initialPreset?.name || '');
  const [action, setAction] = useState(() => initialPreset?.action || 'off');
  const [executionMode, setExecutionMode] = useState(() => initialPreset?.executionMode || 'manual');
  const [timerMinutes, setTimerMinutes] = useState(() => initialPreset?.timerMinutes ?? 10);
  const [timerSeconds, setTimerSeconds] = useState(() => initialPreset?.timerSeconds ?? 0);
  const [scheduleTime, setScheduleTime] = useState(() => initialPreset?.scheduleTime || '18:00');
  const [scheduleDays, setScheduleDays] = useState(() => initialPreset?.scheduleDays || []);
  const [fanSpeeds, setFanSpeeds] = useState(() => Object.fromEntries(
    (initialPreset?.targets || [])
      .filter(target => target.type === 'fan')
      .map(target => [`${target.panelDeviceId}:${target.subDeviceIndex}`, target.fanSpeed || 1])
  ));
  const [selected, setSelected] = useState(() => (initialPreset?.targets || []).map(target =>
    `${target.panelDeviceId}:${target.subDeviceIndex}`
  ));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const toggle = key => setSelected(current =>
    current.includes(key) ? current.filter(item => item !== key) : [...current, key]
  );

  const submit = async event => {
    event.preventDefault();
    if (!name.trim() || selected.length === 0 || saving) return;
    const timerDurationSeconds = (Number(timerMinutes) * 60) + Number(timerSeconds);
    if (executionMode === 'timer' && (
      !Number.isInteger(Number(timerMinutes))
      || !Number.isInteger(Number(timerSeconds))
      || Number(timerMinutes) < 0
      || Number(timerSeconds) < 0
      || Number(timerSeconds) > 59
      || timerDurationSeconds < 1
    )) return;
    if (executionMode === 'schedule' && (!scheduleTime || scheduleDays.length === 0)) return;
    setSaving(true);
    await onSave({
      _id: initialPreset?._id,
      name: name.trim(),
      room,
      action,
      executionMode,
      timerMinutes: executionMode === 'timer' ? Number(timerMinutes) : undefined,
      timerSeconds: executionMode === 'timer' ? Number(timerSeconds) : undefined,
      scheduleTime: executionMode === 'schedule' ? scheduleTime : undefined,
      scheduleDays: executionMode === 'schedule' ? scheduleDays : [],
      targets: channels.filter(channel => selected.includes(channel.key)).map(channel => ({
        panelDeviceId: channel.panelDeviceId,
        subDeviceIndex: channel.index,
        label: channel.label,
        type: channel.type,
        applianceType: channel.applianceType || (channel.type === 'fan' ? 'fan' : 'switch'),
        ...(channel.type === 'fan' ? { fanSpeed: Number(fanSpeeds[channel.key] || channel.speed || 1) } : {})
      }))
    });
    setSaving(false);
  };

  const remove = async () => {
    if (!initialPreset?._id || deleting || !window.confirm(`Delete "${initialPreset.name}" automation?`)) return;
    setDeleting(true);
    await onDelete(initialPreset);
    setDeleting(false);
  };

  return (
    <div className="custom-off-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="custom-off-dialog" onSubmit={submit}>
        <header><div><span>CUSTOM AUTOMATION</span><h2>{initialPreset ? 'Edit switch automation' : 'Create switch automation'}</h2><p>Choose an action and the controls it should apply to.</p></div><button type="button" onClick={onClose}>×</button></header>
        <div className="custom-config-row">
          <label className="custom-off-name"><span>Automation name</span><input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Leaving home" /></label>
          <div className="custom-action-field">
            <span>Action</span>
            <div>
              <button type="button" className={action === 'on' ? 'active on' : ''} onClick={() => setAction('on')}>
                <i><img src="/icons/icons/Power-White.svg" alt="" /></i><span>Turn ON</span>
              </button>
              <button type="button" className={action === 'off' ? 'active off' : ''} onClick={() => setAction('off')}>
                <i><img src="/icons/icons/Power-White.svg" alt="" /></i><span>Turn OFF</span>
              </button>
            </div>
          </div>
        </div>
        <div className="custom-timing">
          <div className="custom-timing-modes">
            <span>When to run</span>
            <div>
              {[['manual', 'Manual'], ['timer', 'Timer'], ['schedule', 'Schedule']].map(([mode, label]) => (
                <button type="button" key={mode} className={executionMode === mode ? 'active' : ''} onClick={() => setExecutionMode(mode)}>{label}</button>
              ))}
            </div>
          </div>
          {executionMode === 'timer' && (
            <div className="custom-timer-input">
              <span>Timer duration</span>
              <div className="custom-duration-fields">
                <label><input type="number" min="0" max="10080" value={timerMinutes} onChange={event => setTimerMinutes(event.target.value)} /><small>min</small></label>
                <label><input type="number" min="0" max="59" value={timerSeconds} onChange={event => setTimerSeconds(event.target.value)} /><small>sec</small></label>
              </div>
            </div>
          )}
          {executionMode === 'schedule' && (
            <div className="custom-schedule-input">
              <label><span>Time</span><input type="time" value={scheduleTime} onChange={event => setScheduleTime(event.target.value)} /></label>
              <div><span>Days</span><div>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <button type="button" key={day} className={scheduleDays.includes(day) ? 'active' : ''} onClick={() => setScheduleDays(current => current.includes(day) ? current.filter(item => item !== day) : [...current, day])}>{day.slice(0, 1)}</button>)}</div></div>
            </div>
          )}
        </div>
        <div className="custom-off-selection">
          <div className="custom-off-selection-head"><span>Choose controls</span><button type="button" onClick={() => setSelected(selected.length === channels.length ? [] : channels.map(channel => channel.key))}>{selected.length === channels.length ? 'Clear all' : 'Select all'}</button></div>
          <div className="custom-off-channel-list">
            {channels.map(channel => (
              <label key={channel.key} className={selected.includes(channel.key) ? 'selected' : ''}>
                <input type="checkbox" checked={selected.includes(channel.key)} onChange={() => toggle(channel.key)} />
                <span className="icon">{channel.icon || (channel.type === 'fan' ? '🌀' : '💡')}</span>
                <span><span className="channel-name">{channel.label}</span><small>{channel.type === 'fan' ? 'Fan' : 'Switch'} · {channel.panelTitle}</small></span>
                {channel.type === 'fan' && action === 'on' && selected.includes(channel.key) && (
                  <span className="fan-level-picker" onClick={event => event.preventDefault()}>
                    <small>Fan level</small>
                    <span>
                      {[1, 2, 3, 4, 5].map(level => (
                        <button type="button" key={level} className={Number(fanSpeeds[channel.key] || channel.speed || 1) === level ? 'active' : ''} onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          setFanSpeeds(current => ({ ...current, [channel.key]: level }));
                        }}>{level}</button>
                      ))}
                    </span>
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
        <footer>
          <div className="footer-left">
            <div className="selection-summary"><span>{selected.length}</span><small>devices selected</small></div>
            {initialPreset && <button type="button" className="delete-automation" onClick={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>}
          </div>
          <div className="footer-actions">
            <button type="button" className="cancel" onClick={onClose}>Cancel</button>
            <button className="save" disabled={!name.trim() || !selected.length || saving || (executionMode === 'timer' && ((Number(timerMinutes) * 60) + Number(timerSeconds) < 1 || Number(timerSeconds) > 59)) || (executionMode === 'schedule' && (!scheduleTime || !scheduleDays.length))}>{saving ? 'Saving…' : initialPreset ? 'Update automation' : 'Save automation'}</button>
          </div>
        </footer>
      </form>
      <style>{`
        .custom-off-overlay{position:fixed;inset:0;z-index:1300;display:grid;place-items:center;overflow:hidden;overscroll-behavior:contain;padding:20px;background:rgba(8,13,23,.64);backdrop-filter:blur(8px)}
        .custom-off-dialog{width:min(900px,100%);height:auto;max-height:88dvh;display:flex;flex-direction:column;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;padding:28px;border:1px solid var(--border);border-radius:24px;color:var(--text-main);background:var(--bg-card);box-shadow:0 28px 70px rgba(0,0,0,.34);scrollbar-width:thin;scrollbar-color:var(--primary) transparent}
        .custom-off-dialog::-webkit-scrollbar{width:7px}.custom-off-dialog::-webkit-scrollbar-track{background:transparent}.custom-off-dialog::-webkit-scrollbar-thumb{border-radius:10px;background:var(--primary)}
        .custom-off-dialog header{flex:0 0 auto;display:flex;justify-content:space-between;gap:16px;margin-bottom:18px}.custom-off-dialog header span,.custom-off-name>span,.custom-off-selection-head>span{color:var(--primary);font-size:9px;font-weight:900;letter-spacing:1px;text-transform:uppercase}.custom-off-dialog h2{margin:4px 0 3px;font-size:21px}.custom-off-dialog header p{margin:0;color:var(--text-muted);font-size:11px}.custom-off-dialog header button{width:36px;height:36px;border:1px solid var(--border);border-radius:11px;color:var(--text-muted);background:var(--bg-main);font-size:22px}
        .custom-config-row{flex:0 0 auto;display:grid;grid-template-columns:minmax(240px,1fr) minmax(300px,.9fr);align-items:end;gap:14px}.custom-off-name{min-width:0}.custom-off-name input{width:100%;height:45px;margin-top:7px;padding:0 13px;outline:none;border:1px solid var(--border);border-radius:11px;color:var(--text-main);background:var(--bg-main)}.custom-off-name input:focus{border-color:var(--primary)}
        .custom-action-field{min-width:0}.custom-action-field>span{display:block;margin-bottom:7px;color:var(--primary);font-size:9px;font-weight:900;letter-spacing:1px;text-transform:uppercase}.custom-action-field>div{display:grid;grid-template-columns:1fr 1fr;gap:8px}.custom-action-field button{min-width:0;height:45px;display:flex;align-items:center;justify-content:center;gap:7px;padding:0 10px;border:1px solid var(--border);border-radius:11px;color:var(--text-main);background:var(--bg-main);white-space:nowrap}.custom-action-field button>i{width:25px;height:25px;display:grid;place-items:center;flex:0 0 25px;border-radius:8px;background:var(--bg-card);font-style:normal}.custom-action-field button>i img{width:13px;height:13px}.custom-action-field button>span{font-size:10px;font-weight:600}.custom-action-field button.active.on{border-color:#22c55e;background:rgba(34,197,94,.08);box-shadow:0 0 0 3px rgba(34,197,94,.1)}.custom-action-field button.active.on>i{background:#22c55e}.custom-action-field button.active.off{border-color:#ef4444;background:rgba(239,68,68,.07);box-shadow:0 0 0 3px rgba(239,68,68,.09)}.custom-action-field button.active.off>i{background:#ef4444}.custom-action-field button.active i img{filter:brightness(0) invert(1)!important}
        .custom-timing{flex:0 0 auto;display:flex;align-items:end;flex-wrap:wrap;gap:18px;margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--bg-main)}.custom-timing span{display:block;margin-bottom:8px;color:var(--text-muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px}.custom-timing-modes{min-width:290px}.custom-timing-modes>div{display:flex;gap:8px}.custom-timing button{height:40px;padding:0 17px;border:1px solid var(--border);border-radius:10px;color:var(--text-muted);background:var(--bg-card);font-size:12px}.custom-timing button.active{border-color:var(--primary);color:var(--primary);background:color-mix(in srgb,var(--primary) 10%,var(--bg-card))}.custom-duration-fields{display:flex;align-items:center;gap:8px}.custom-duration-fields label{display:flex;align-items:center;overflow:hidden;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)}.custom-timer-input input{width:70px;height:40px;padding:0 10px;border:0;outline:none;color:var(--text-main);background:transparent;font-size:14px}.custom-timer-input small{padding-right:10px;color:var(--text-muted);font-size:11px}.custom-duration-fields label:focus-within{border-color:var(--primary)}.custom-schedule-input{min-width:0;display:flex;align-items:end;flex:1;gap:14px}.custom-schedule-input input{height:40px;padding:0 10px;border:1px solid var(--border);border-radius:10px;color:var(--text-main);background:var(--bg-card);font-size:13px}.custom-schedule-input>div{min-width:0}.custom-schedule-input>div>div{display:flex;flex-wrap:wrap;gap:4px}.custom-schedule-input button{width:36px;padding:0}
        .custom-off-selection{min-height:0;display:flex;flex:none;flex-direction:column;margin-top:20px}.custom-off-selection-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.custom-off-selection-head button{color:var(--primary);background:none;font-size:11px;font-weight:600}.custom-off-channel-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:max-content;gap:12px;overflow:visible;padding:3px}.custom-off-channel-list label{position:relative;min-width:0;min-height:76px;display:grid;grid-template-columns:42px minmax(0,1fr);align-items:center;gap:11px;padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--bg-main);cursor:pointer;transition:.18s ease}.custom-off-channel-list label:hover{border-color:color-mix(in srgb,var(--primary) 45%,var(--border));transform:translateY(-1px)}.custom-off-channel-list label.selected{border-color:var(--primary);background:color-mix(in srgb,var(--primary) 13%,var(--bg-card));box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 13%,transparent),0 8px 20px color-mix(in srgb,var(--primary) 10%,transparent)}.custom-off-channel-list input{position:absolute;opacity:0;pointer-events:none}.custom-off-channel-list .icon{width:42px;height:42px;display:grid;place-items:center;border-radius:10px;background:var(--bg-card);font-size:21px}.custom-off-channel-list .channel-name,.custom-off-channel-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.custom-off-channel-list .channel-name{color:var(--text-main);font-size:13px;font-weight:500}.custom-off-channel-list small{margin-top:4px;color:var(--text-muted);font-size:10px;font-weight:400}.custom-off-channel-list label:has(.fan-level-picker){grid-template-columns:42px minmax(0,1fr);}.fan-level-picker{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:9px;border-top:1px solid var(--border)}.fan-level-picker>small{margin:0!important;font-size:9px!important}.fan-level-picker>span{display:flex;gap:4px}.fan-level-picker button{width:27px;height:27px;padding:0;border:1px solid var(--border);border-radius:7px;color:var(--text-muted);background:var(--bg-card);font-size:10px}.fan-level-picker button.active{border-color:var(--primary);color:#fff;background:var(--primary)}
        .custom-off-dialog footer{position:relative;z-index:2;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:16px;padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:var(--bg-main)}.footer-left{display:flex;align-items:center;gap:10px}.selection-summary{min-width:0;display:flex;align-items:center;gap:8px;color:var(--text-muted)}.selection-summary>span{width:30px;height:30px;display:grid;place-items:center;flex:0 0 30px;border-radius:9px;color:#fff;background:var(--primary);font-size:12px;font-weight:600}.selection-summary small{font-size:10px;font-weight:400;white-space:nowrap}.footer-actions{display:flex;align-items:center;gap:8px}.custom-off-dialog footer button{height:42px;padding:0 16px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap}.custom-off-dialog .delete-automation{height:34px;border:1px solid rgba(239,68,68,.3);color:#ef4444;background:rgba(239,68,68,.07)}.custom-off-dialog .delete-automation:hover{border-color:#ef4444;background:rgba(239,68,68,.12)}.custom-off-dialog .delete-automation:disabled{opacity:.5}.custom-off-dialog .cancel{min-width:82px;border:1px solid var(--border);color:var(--text-main);background:var(--bg-card)}.custom-off-dialog .save{min-width:150px;color:#fff;background:var(--primary)}.custom-off-dialog .save:disabled{opacity:.45}
        @media(max-width:760px){.custom-off-dialog{width:min(560px,100%);padding:22px}.custom-config-row{grid-template-columns:1fr}.custom-timing,.custom-schedule-input{align-items:stretch;flex-direction:column}.custom-timing-modes{min-width:0}.custom-off-channel-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:520px){
          .custom-off-overlay{align-items:center;padding:12px}
          .custom-off-dialog{width:100%;max-height:92dvh;padding:18px;border-radius:21px}
          .custom-off-channel-list{grid-template-columns:1fr;gap:10px}
          .custom-off-channel-list label{min-height:86px;padding:13px 16px}
          .custom-off-dialog footer{align-items:stretch;flex-direction:column;gap:10px;padding:11px}
          .footer-left{width:100%;display:grid;grid-template-columns:minmax(0,1fr) 104px;align-items:center;gap:10px}
          .selection-summary{justify-content:flex-start;padding-left:2px}
          .custom-off-dialog .delete-automation{width:104px;height:42px;padding:0 12px}
          .footer-actions{width:100%;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.25fr);gap:10px}
          .custom-off-dialog footer button{width:100%;padding:0 10px}
          .custom-off-dialog .save,.custom-off-dialog .cancel{min-width:0;height:48px}
        }
      `}</style>
    </div>
  );
};

export default CustomOffModal;
