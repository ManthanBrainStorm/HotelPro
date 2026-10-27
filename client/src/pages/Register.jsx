import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAppDispatch } from '../hooks/useAuth';
import { register } from '../store/authSlice';

export default function Register() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await dispatch(register(form)).unwrap();
      toast.success(u.emailVerified ? 'Account created. Welcome!' : 'Account created. Check your email to verify your address.');
      navigate('/');
    } catch (msg) {
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container py-5" style={{ maxWidth: 460 }}>
      <h1 className="h2 mb-4">Create your account</h1>
      <form className="panel" onSubmit={submit}>
        <label className="form-label" htmlFor="name">Full name</label>
        <input id="name" required minLength="2" maxLength="60" autoComplete="name" className="form-control mb-3" value={form.name} onChange={set('name')} />
        <label className="form-label" htmlFor="email">Email</label>
        <input id="email" type="email" required autoComplete="email" className="form-control mb-3" value={form.email} onChange={set('email')} />
        <label className="form-label" htmlFor="phone">Phone (optional)</label>
        <input id="phone" type="tel" autoComplete="tel" className="form-control mb-3" value={form.phone} onChange={set('phone')} />
        <label className="form-label" htmlFor="pw">Password</label>
        <input id="pw" type="password" required minLength="8" autoComplete="new-password" className="form-control" value={form.password} onChange={set('password')} />
        <div className="form-text mb-3">At least 8 characters, with a letter and a number.</div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <button className="btn btn-primary w-100" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="mt-3">Already registered? <Link to="/login">Log in</Link></p>
    </div>
  );
}
