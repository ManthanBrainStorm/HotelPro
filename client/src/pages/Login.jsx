import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../hooks/useAuth';
import { login } from '../store/authSlice';

export default function Login() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await dispatch(login(form)).unwrap();
      const fallback = ['staff', 'admin'].includes(u.role) ? '/admin' : '/';
      navigate(location.state?.from?.pathname || fallback, { replace: true });
    } catch (msg) {
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container py-5" style={{ maxWidth: 460 }}>
      <h1 className="h2 mb-4">Log in</h1>
      <form className="panel" onSubmit={submit}>
        <label className="form-label" htmlFor="email">Email</label>
        <input id="email" type="email" required autoComplete="email" className="form-control mb-3" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <label className="form-label" htmlFor="pw">Password</label>
        <input id="pw" type="password" required autoComplete="current-password" className="form-control mb-3" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <button className="btn btn-primary w-100" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="mt-3">New here? <Link to="/register">Create an account</Link></p>
    </div>
  );
}
