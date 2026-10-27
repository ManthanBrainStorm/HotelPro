import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg, fmtDateTime } from '../api';
import Pagination from '../components/Pagination';
import { useAppDispatch } from '../hooks/useAuth';
import { setUnread } from '../store/notificationSlice';

export default function Notifications() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], unread: 0, page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get('/notifications', { params: { page } });
      setData(d);
      dispatch(setUnread(d.unread));
    } catch (e) { setError(errMsg(e)); }
  }, [page, dispatch]);
  useEffect(() => { load(); }, [load]);

  const open = async (n) => {
    if (!n.read) await api.patch(`/notifications/${n._id}/read`).catch(() => {});
    if (n.link) navigate(n.link); else load();
  };
  const readAll = async () => { await api.patch('/notifications/read-all'); load(); };
  const remove = async (n) => { await api.delete(`/notifications/${n._id}`); load(); };

  return (
    <div className="container py-5" style={{ maxWidth: 760 }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h2 mb-0">Notifications</h1>
        <button className="btn btn-sm btn-outline-primary" onClick={readAll} disabled={!data.unread}>Mark all as read</button>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {data.items.length === 0 && !error && <div className="panel">You are all caught up.</div>}
      <div className="d-grid gap-2">
        {data.items.map((n) => (
          <div key={n._id} className={`panel d-flex justify-content-between gap-3 ${n.read ? '' : 'unread'}`}>
            <button className="btn btn-link text-start p-0 text-decoration-none flex-grow-1 notif-btn" onClick={() => open(n)}>
              <strong>{n.title}</strong>
              <div>{n.message}</div>
              <small className="text-muted">{fmtDateTime(n.createdAt)}</small>
            </button>
            <button className="btn btn-sm btn-outline-secondary align-self-start" aria-label="Delete notification" onClick={() => remove(n)}>✕</button>
          </div>
        ))}
      </div>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </div>
  );
}
