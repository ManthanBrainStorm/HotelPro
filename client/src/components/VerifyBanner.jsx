import { useState } from 'react';
import { toast } from 'react-toastify';
import api, { errMsg } from '../api';
import { useAuth } from '../hooks/useAuth';

// Shown only when the server requires email verification and the guest has not done it yet.
export default function VerifyBanner() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user || user.emailVerified || user.role !== 'guest') return null;

  const resend = async () => {
    setBusy(true);
    try { toast.info((await api.post('/auth/resend-verification')).data.message); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="alert alert-warning rounded-0 mb-0 text-center py-2">
      Please verify your email address to book rooms.{' '}
      <button className="btn btn-link p-0 align-baseline" onClick={resend} disabled={busy}>Resend verification email</button>
    </div>
  );
}
