import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAppDispatch } from '../hooks/useAuth';
import { setVerified } from '../store/authSlice';

export default function VerifyEmail() {
  const { token } = useParams();
  const dispatch = useAppDispatch();
  const [state, setState] = useState({ loading: true, ok: false, message: '' });

  useEffect(() => {
    api.post('/auth/verify-email', { token })
      .then((r) => { setState({ loading: false, ok: true, message: r.data.message }); dispatch(setVerified()); })
      .catch((e) => setState({ loading: false, ok: false, message: errMsg(e) }));
  }, [token, dispatch]);

  return (
    <div className="container py-5" style={{ maxWidth: 520 }}>
      <div className="panel text-center">
        <h1 className="h3">{state.loading ? 'Verifying…' : state.ok ? 'Email verified' : 'Verification failed'}</h1>
        {!state.loading && <p className="mt-3">{state.message}</p>}
        <Link to="/" className="btn btn-primary mt-2">Browse rooms</Link>
      </div>
    </div>
  );
}
