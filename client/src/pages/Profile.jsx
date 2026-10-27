import { useState } from 'react';
import { toast } from 'react-toastify';
import api, { errMsg } from '../api';
import { useAppDispatch, useAuth } from '../hooks/useAuth';
import { clearUser, updateProfile } from '../store/authSlice';

export default function Profile() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });

  const save = async (e) => {
    e.preventDefault();
    try { await dispatch(updateProfile(form)).unwrap(); toast.success('Profile updated'); } catch (msg) { toast.error(String(msg)); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.put('/auth/password', pw);
      localStorage.setItem('token', data.token);
      setPw({ currentPassword: '', newPassword: '' });
      toast.success(data.message);
    } catch (err) { toast.error(errMsg(err)); }
  };
  const logoutAll = async () => {
    if (!window.confirm('Sign out on every device, including this one?')) return;
    try { await api.post('/auth/logout-all'); } catch { /* token may already be invalid */ }
    dispatch(clearUser());
  };

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h2 mb-4">My profile</h1>
      <form className="panel mb-4" onSubmit={save}>
        <p className="text-muted small mb-3">{user.email} · {user.role}{user.department ? ` (${user.department})` : ''} · {user.emailVerified ? 'email verified' : 'email not verified'}</p>
        <label className="form-label" htmlFor="n">Name</label>
        <input id="n" required minLength="2" maxLength="60" className="form-control mb-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label className="form-label" htmlFor="p">Phone</label>
        <input id="p" type="tel" className="form-control mb-3" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <button className="btn btn-primary">Save changes</button>
      </form>

      <form className="panel mb-4" onSubmit={changePw}>
        <h2 className="h5">Change password</h2>
        <label className="form-label" htmlFor="cp">Current password</label>
        <input id="cp" type="password" required autoComplete="current-password" className="form-control mb-3" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        <label className="form-label" htmlFor="np">New password</label>
        <input id="np" type="password" required minLength="8" autoComplete="new-password" className="form-control" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
        <div className="form-text mb-3">At least 8 characters, with a letter and a number. Other devices are signed out.</div>
        <button className="btn btn-primary">Update password</button>
      </form>

      <div className="panel">
        <h2 className="h5">Sessions</h2>
        <p className="small text-muted">Lost a device or used a shared computer? End every active session.</p>
        <button className="btn btn-outline-danger" onClick={logoutAll}>Sign out everywhere</button>
      </div>
    </div>
  );
}
