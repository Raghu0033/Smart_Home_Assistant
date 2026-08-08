import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './ProfilePage.css';
import avatarSprite from '../assets/avatars/profile-avatar-sprite.png';

const API_BASE = `http://${window.location.hostname}:3000`;
export const PROFILE_PERMISSIONS = [
  ['dashboard', 'Dashboard'],
  ['devices', 'Devices'],
  ['sensors', 'Sensors'],
  ['scenes', 'Scenes & automations'],
  ['audio-devices', 'Audio'],
  ['staircase', 'Staircase'],
  ['water-level', 'Water tanks'],
  ['surveillance', 'Surveillance'],
  ['settings', 'System settings']
];
const AVATARS = Array.from({ length: 10 }, (_, index) => `avatar-${index + 1}`);
const FULL_ACCESS = PROFILE_PERMISSIONS.map(([id]) => id);

export const Avatar = ({ value = 'avatar-1', large = false }) => {
  const avatarIndex = Math.max(0, AVATARS.indexOf(value));
  return (
    <span
      className={`avatar-sprite avatar-position-${avatarIndex + 1}${large ? ' large' : ''}`}
      style={{ backgroundImage: `url(${avatarSprite})` }}
      aria-hidden="true"
    />
  );
};

const AvatarPicker = ({ value, onChange }) => (
  <div className="avatar-picker" aria-label="Choose avatar">
    {AVATARS.map(avatar => (
      <button type="button" key={avatar} className={value === avatar ? 'selected' : ''} onClick={() => onChange(avatar)} aria-label={`Select ${avatar}`}>
        <Avatar value={avatar} />
      </button>
    ))}
  </div>
);

const GenderField = ({ value, onChange }) => (
  <label>Gender
    <select value={value || 'prefer-not-to-say'} onChange={event => onChange(event.target.value)}>
      <option value="prefer-not-to-say">Prefer not to say</option>
      <option value="female">Female</option>
      <option value="male">Male</option>
      <option value="non-binary">Non-binary</option>
    </select>
  </label>
);

const authRequest = (url, options = {}) => fetch(`${API_BASE}${url}`, {
  ...options,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('smarthome_token')}`,
    ...options.headers
  }
});

const PermissionPicker = ({ value, onChange }) => (
  <div className="profile-permissions">
    {PROFILE_PERMISSIONS.map(([id, label]) => (
      <label key={id} className={value.includes(id) ? 'enabled' : ''}>
        <input
          type="checkbox"
          checked={value.includes(id)}
          onChange={() => onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id])}
        />
        <span>{label}</span>
      </label>
    ))}
  </div>
);

const RoomAccessPicker = ({ rooms, allRoomsAccess, allowedRoomIds, onChange }) => (
  <div className="room-access-picker">
    <label className={allRoomsAccess ? 'enabled' : ''}>
      <input type="checkbox" checked={Boolean(allRoomsAccess)} onChange={event => onChange({ allRoomsAccess: event.target.checked, allowedRoomIds })} />
      <span>All rooms</span>
    </label>
    {!allRoomsAccess && rooms.map(room => {
      const id = room._id;
      const selected = allowedRoomIds.includes(id);
      return (
        <label key={id} className={selected ? 'enabled' : ''}>
          <input type="checkbox" checked={selected} onChange={() => onChange({
            allRoomsAccess: false,
            allowedRoomIds: selected ? allowedRoomIds.filter(roomId => roomId !== id) : [...allowedRoomIds, id]
          })} />
          <span>{room.name}</span>
        </label>
      );
    })}
  </div>
);

const MemberCard = ({ member, rooms, onSaved, notify }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(member);

  useEffect(() => setDraft(member), [member]);

  const save = async () => {
    const phone = String(draft.phone || '').trim();
    if (!phone) return notify('Phone number is required for member profiles');

    const response = await authRequest(`/api/auth/members/${member.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...draft, phone })
    });
    const data = await response.json();
    if (!response.ok) return notify(data.message || 'Could not update member');
    setEditing(false);
    onSaved(data);
    notify('Member profile updated');
  };

  return (
    <article className="household-member-card glass">
      <div className="member-card-heading">
        <div className="profile-avatar"><Avatar value={member.avatar} /></div>
        <div>
          <h3>{member.name || member.username}</h3>
          <p>@{member.username}</p>
        </div>
        {member.accountType === 'child' && <span className="account-type child">Kids account</span>}
      </div>

      {editing ? (
        <div className="member-edit-form">
          <div className="profile-form-grid">
            <label>Name<input value={draft.name || ''} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>Phone<input value={draft.phone || ''} onChange={event => setDraft({ ...draft, phone: event.target.value })} /></label>
            <GenderField value={draft.gender} onChange={gender => setDraft({ ...draft, gender })} />
          </div>
          <AvatarPicker value={draft.avatar} onChange={avatar => setDraft({ ...draft, avatar })} />
          <label className="permanent-child-control">
            <input type="checkbox" checked={Boolean(draft.permanentChild)} onChange={event => setDraft({ ...draft, permanentChild: event.target.checked })} />
            <span><strong>Kids account</strong><small>Changes require approval from an adult profile.</small></span>
          </label>
          <h4>Home access</h4>
          <PermissionPicker value={draft.permissions || []} onChange={permissions => setDraft({ ...draft, permissions })} />
          <h4>Room access</h4>
          <RoomAccessPicker
            rooms={rooms}
            allRoomsAccess={draft.allRoomsAccess}
            allowedRoomIds={(draft.allowedRoomIds || []).map(String)}
            onChange={roomAccess => setDraft({ ...draft, ...roomAccess })}
          />
          <div className="profile-form-actions">
            <button onClick={() => { setDraft(member); setEditing(false); }}>Cancel</button>
            <button className="primary" onClick={save}>Save member</button>
          </div>
        </div>
      ) : (
        <>
          <div className="member-access-summary">
            {(member.permissions || []).map(permission => <span key={permission}>{PROFILE_PERMISSIONS.find(([id]) => id === permission)?.[1] || permission}</span>)}
            {(member.permissions || []).length === 0 && <small>No home controls assigned</small>}
          </div>
          <div className="member-card-actions">
            <button onClick={() => setEditing(true)}>Edit profile & access</button>
          </div>
        </>
      )}
    </article>
  );
};

const ProfilePage = ({ profile, onProfileChange, notify, onOpenApproval, onLogout }) => {
  const [selfDraft, setSelfDraft] = useState(profile);
  const [members, setMembers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [activity, setActivity] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMember, setNewMember] = useState({
    name: '', username: '', phone: '', password: '', gender: 'prefer-not-to-say', avatar: 'avatar-1', permanentChild: false, permissions: FULL_ACCESS, allRoomsAccess: true, allowedRoomIds: []
  });

  useEffect(() => setSelfDraft(profile), [profile]);
  useEffect(() => {
    if (profile?.role !== 'admin') {
      if (profile?.accountType === 'adult') {
        authRequest('/api/auth/change-requests').then(response => response.json()).then(data => setChangeRequests(Array.isArray(data) ? data : []));
      }
      return;
    }
    Promise.all([
      authRequest('/api/auth/members').then(response => response.json()),
      authRequest('/api/rooms').then(response => response.json()),
      authRequest('/api/auth/activity').then(response => response.json()),
      authRequest('/api/auth/change-requests').then(response => response.json())
    ]).then(([memberData, roomData, activityData, requestData]) => {
      setMembers(Array.isArray(memberData) ? memberData : []);
      setRooms(Array.isArray(roomData) ? roomData : []);
      setActivity(Array.isArray(activityData) ? activityData : []);
      setChangeRequests(Array.isArray(requestData) ? requestData : []);
    });
  }, [profile?.role, profile?.accountType]);
  useEffect(() => {
    if (!showAddMember) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setShowAddMember(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [showAddMember]);

  const saveSelf = async () => {
    const phone = String(selfDraft?.phone || '').trim();
    if (!phone) return notify('Phone number is required');

    const response = await authRequest('/api/auth/me', { method: 'PUT', body: JSON.stringify({ ...selfDraft, phone }) });
    const data = await response.json();
    if (!response.ok) return notify(data.message || 'Could not update profile');
    onProfileChange(data);
    notify('Profile updated');
  };

  const changePassword = async event => {
    event.preventDefault();
    const response = await authRequest('/api/auth/me/password', { method: 'PUT', body: JSON.stringify(passwords) });
    const data = await response.json();
    if (!response.ok) return notify(data.message || 'Could not change password');
    setPasswords({ currentPassword: '', newPassword: '' });
    notify('Password updated');
  };

  const addMember = async event => {
    event.preventDefault();
    const phone = String(newMember.phone || '').trim();
    if (!phone) return notify('Phone number is required');

    const response = await authRequest('/api/auth/members', { method: 'POST', body: JSON.stringify({ ...newMember, phone }) });
    const data = await response.json();
    if (!response.ok) return notify(data.message || 'Could not create member');
    setMembers(previous => [...previous, data]);
    setNewMember({ name: '', username: '', phone: '', password: '', gender: 'prefer-not-to-say', avatar: 'avatar-1', permanentChild: false, permissions: FULL_ACCESS, allRoomsAccess: true, allowedRoomIds: [] });
    setShowAddMember(false);
    notify('Household profile created');
  };

  const reviewChange = async (id, decision) => {
    const response = await authRequest(`/api/auth/change-requests/${id}/${decision}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) return notify(data.message || 'Could not review request');
    setChangeRequests(previous => previous.filter(request => request._id !== id));
    notify(`Request ${decision}d`);
  };

  if (!profile) return <div className="profile-loading">Loading profile…</div>;

  return (
    <div className="profile-page animate-slide-up">
      <div className="welcome-header">
        <div className="header-text"><h1>Profiles & Access</h1><p>Personal details, household members and safe home permissions</p></div>
        <div className="profile-header-actions">
          {profile.role === 'admin' && <button className="action-btn-pill primary" onClick={() => setShowAddMember(value => !value)}>+ Add Profile</button>}
          <button className="action-btn-pill profile-logout-btn" onClick={onLogout}>
            <img src="/icons/icons/Logout-White.svg" alt="" />
            Logout
          </button>
        </div>
      </div>

      <div className="profile-layout">
        <section className="profile-panel glass">
          <div className="profile-panel-title"><div className="profile-avatar large"><Avatar value={profile.avatar} large /></div><div><h2>Your profile</h2><p>{profile.role === 'admin' ? 'Home administrator' : profile.accountType === 'child' ? 'Kids account' : 'Home member'}</p></div></div>
          <div className="profile-form-grid">
            <label>Display name<input value={selfDraft?.name || ''} onChange={event => setSelfDraft({ ...selfDraft, name: event.target.value })} /></label>
            <label>Username<input value={profile.username} disabled /></label>
            <label>Phone<input required value={selfDraft?.phone || ''} onChange={event => setSelfDraft({ ...selfDraft, phone: event.target.value })} /></label>
            <GenderField value={selfDraft?.gender} onChange={gender => setSelfDraft({ ...selfDraft, gender })} />
          </div>
          <AvatarPicker value={selfDraft?.avatar} onChange={avatar => setSelfDraft({ ...selfDraft, avatar })} />
          <button className="profile-save-btn" onClick={saveSelf}>Save personal details</button>
        </section>

        <form className="profile-panel glass" onSubmit={changePassword}>
          <div className="profile-panel-title"><div className="profile-security-icon">••</div><div><h2>Security</h2><p>Use at least 8 characters</p></div></div>
          <div className="profile-form-grid one-column">
            <label>Current password<input type="password" required value={passwords.currentPassword} onChange={event => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label>
            <label>New password<input type="password" required minLength="8" value={passwords.newPassword} onChange={event => setPasswords({ ...passwords, newPassword: event.target.value })} /></label>
          </div>
          <button className="profile-save-btn" type="submit">Change password</button>
        </form>
      </div>

      {profile.role === 'admin' && (
        <section className="household-section">
          <div className="section-header"><div><h2>Household profiles</h2><p>Mark a profile as a Kids account to restrict access and require adult approval for changes.</p></div></div>
          {showAddMember && createPortal((
            <div className="profile-modal-backdrop" role="presentation" onMouseDown={event => {
              if (event.target === event.currentTarget) setShowAddMember(false);
            }}>
            <form className="profile-panel add-member-panel glass profile-modal" onSubmit={addMember} role="dialog" aria-modal="true" aria-labelledby="add-profile-title">
              <button className="profile-modal-close" type="button" onClick={() => setShowAddMember(false)} aria-label="Close">×</button>
              <h2 id="add-profile-title">Create household profile</h2>
              <div className="profile-form-grid">
                <label>Name<input required value={newMember.name} onChange={event => setNewMember({ ...newMember, name: event.target.value })} /></label>
                <label>Login username<input required value={newMember.username} onChange={event => setNewMember({ ...newMember, username: event.target.value })} /></label>
                <label>Phone<input required value={newMember.phone} onChange={event => setNewMember({ ...newMember, phone: event.target.value })} /></label>
                <label>Temporary password<input required minLength="8" type="password" value={newMember.password} onChange={event => setNewMember({ ...newMember, password: event.target.value })} /></label>
                <GenderField value={newMember.gender} onChange={gender => setNewMember({ ...newMember, gender })} />
              </div>
              <AvatarPicker value={newMember.avatar} onChange={avatar => setNewMember({ ...newMember, avatar })} />
              <label className="permanent-child-control">
                <input type="checkbox" checked={newMember.permanentChild} onChange={event => setNewMember({ ...newMember, permanentChild: event.target.checked, permissions: event.target.checked ? ['dashboard'] : FULL_ACCESS, allRoomsAccess: !event.target.checked })} />
                <span><strong>Kids account</strong><small>Enable restricted access and require adult approval for changes.</small></span>
              </label>
              <h4>Allowed areas</h4>
              <PermissionPicker value={newMember.permissions} onChange={permissions => setNewMember({ ...newMember, permissions })} />
              <h4>Room access</h4>
              <RoomAccessPicker
                rooms={rooms}
                allRoomsAccess={newMember.allRoomsAccess}
                allowedRoomIds={newMember.allowedRoomIds}
                onChange={roomAccess => setNewMember({ ...newMember, ...roomAccess })}
              />
              <div className="profile-form-actions"><button type="button" onClick={() => setShowAddMember(false)}>Cancel</button><button className="primary" type="submit">Create profile</button></div>
            </form>
            </div>
          ), document.body)}
          <div className="household-grid">
            {members.map(member => <MemberCard key={member.id} member={member} rooms={rooms} notify={notify} onSaved={updated => setMembers(previous => previous.map(item => item.id === updated.id ? updated : item))} />)}
            {members.length === 0 && <div className="empty-state glass"><p>No additional household profiles yet</p></div>}
          </div>

          <div className="admin-audit-grid">
            <section className="profile-panel glass">
              <h2>Pending child requests</h2>
              <div className="audit-list">
                {changeRequests.map(request => (
                  <div className="audit-row" key={request._id}>
                    <div><strong>{request.requestedBy?.name || request.requestedBy?.username || 'Member'}</strong><span>{request.method} {request.resource} · {new Date(request.createdAt).toLocaleString()}</span></div>
                    <div className="audit-actions">
                      <button className="view-request" onClick={() => onOpenApproval?.(request)}>View card</button>
                      <button className="reject-request" onClick={() => reviewChange(request._id, 'reject')}>Reject</button>
                      <button className="primary approve-request" onClick={() => reviewChange(request._id, 'approve')}>Approve</button>
                    </div>
                  </div>
                ))}
                {changeRequests.length === 0 && <p className="audit-empty">No requests awaiting approval</p>}
              </div>
            </section>
            <section className="profile-panel glass">
              <h2>Login activity</h2>
              <div className="audit-list">
                {activity.map(log => (
                  <div className="audit-row" key={log._id}>
                    <div><strong>{log.username || 'Unknown user'}</strong><span>{log.action.replace('-', ' ')} · {new Date(log.createdAt).toLocaleString()}</span></div>
                    <small title={log.userAgent || 'Unknown device'}>{log.ip || 'Unknown IP'} · {log.userAgent ? log.userAgent.split(' ').slice(0, 3).join(' ') : 'Unknown device'}</small>
                  </div>
                ))}
                {activity.length === 0 && <p className="audit-empty">No login activity recorded yet</p>}
              </div>
            </section>
          </div>
        </section>
      )}
      {profile.role !== 'admin' && profile.accountType === 'adult' && (
        <section className="profile-panel glass adult-review-panel">
          <h2>Child requests awaiting an adult</h2>
          <div className="audit-list">
            {changeRequests.map(request => (
              <div className="audit-row" key={request._id}>
                <div><strong>{request.requestedBy?.name || request.requestedBy?.username || 'Member'}</strong><span>{request.method} {request.resource} · {new Date(request.createdAt).toLocaleString()}</span></div>
                <div className="audit-actions">
                  <button className="view-request" onClick={() => onOpenApproval?.(request)}>View card</button>
                  <button className="reject-request" onClick={() => reviewChange(request._id, 'reject')}>Reject</button>
                  <button className="primary approve-request" onClick={() => reviewChange(request._id, 'approve')}>Approve</button>
                </div>
              </div>
            ))}
            {changeRequests.length === 0 && <p className="audit-empty">No requests awaiting approval</p>}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProfilePage;
