import { useCallback, useEffect, useState } from 'react';
import api, { errMsg, fmtDateTime } from '../../api';
import Pagination from '../../components/Pagination';

export default function Security() {
  const [sec, setSec] = useState(null);
  const [health, setHealth] = useState(null);
  const [logs, setLogs] = useState({ logs: [], page: 1, pages: 1 });
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const loadTop = useCallback(() => {
    api.get('/admin/security').then((r) => setSec(r.data)).catch((e) => setError(errMsg(e)));
    api.get('/admin/health').then((r) => setHealth(r.data)).catch((e) => setError(errMsg(e)));
  }, []);
  useEffect(() => { loadTop(); }, [loadTop]);
  useEffect(() => { api.get('/admin/logs', { params: { action: action || undefined, page } }).then((r) => setLogs(r.data)).catch((e) => setError(errMsg(e))); }, [action, page]);

  const actions = ['login', 'login_failed', 'password_changed', 'user_created', 'user_updated', 'room_created', 'room_updated', 'room_removed', 'refund_approved', 'refund_rejected', 'check_in', 'check_out', 'booking_cancelled', 'seasonal_price_created'];
  const up = health ? `${Math.floor(health.uptimeSeconds / 3600)}h ${Math.floor((health.uptimeSeconds % 3600) / 60)}m` : '';

  return (
    <>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3"><div className="stat h-100"><div className="small text-muted">Failed logins (24h)</div><div className="num">{sec?.failed24h ?? '-'}</div></div></div>
        <div className="col-6 col-lg-3"><div className="stat h-100"><div className="small text-muted">Locked accounts</div><div className="num">{sec?.lockedAccounts ?? '-'}</div></div></div>
        <div className="col-6 col-lg-3"><div className="stat h-100"><div className="small text-muted">Disabled accounts</div><div className="num">{sec?.disabledAccounts ?? '-'}</div></div></div>
        <div className="col-6 col-lg-3"><div className="stat h-100">
          <div className="small text-muted d-flex justify-content-between">System health <button className="btn btn-link btn-sm p-0" onClick={loadTop}>Refresh</button></div>
          <div className="num">{health ? (health.status === 'ok' ? 'OK' : 'Degraded') : '-'}</div>
          {health && <div className="small text-muted">DB {health.database.state} ({health.database.pingMs} ms) · up {up} · {health.memory.rssMB} MB</div>}
        </div></div>
      </div>

      {sec?.recentFailures?.length > 0 && (
        <div className="panel mb-4"><h2 className="h6">Recent failed logins</h2>
          <ul className="small mb-0">{sec.recentFailures.map((f) => <li key={f._id}>{fmtDateTime(f.createdAt)}: {f.actorEmail || f.details?.email} from {f.ip}</li>)}</ul></div>
      )}

      <div className="d-flex gap-2 mb-3 align-items-center">
        <h2 className="h5 mb-0">Activity log</h2>
        <select className="form-select form-select-sm w-auto ms-auto" aria-label="Filter by action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">All actions</option>{actions.map((a) => <option key={a}>{a}</option>)}
        </select>
      </div>
      <div className="table-responsive panel p-0">
        <table className="table table-sm align-middle mb-0">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>
            {logs.logs.map((l) => (
              <tr key={l._id}>
                <td className="small text-nowrap">{fmtDateTime(l.createdAt)}</td>
                <td className="small">{l.actorEmail || '-'}<div className="text-muted">{l.actorRole}</div></td>
                <td><code>{l.action}</code></td><td className="small">{l.entity}</td>
                <td className="small text-break" style={{ maxWidth: 260 }}>{l.details && Object.keys(l.details).length ? JSON.stringify(l.details) : ''}</td>
                <td className="small">{l.ip}</td>
              </tr>
            ))}
            {logs.logs.length === 0 && <tr><td colSpan="6" className="text-muted">No activity recorded.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={logs.page} pages={logs.pages} onChange={setPage} />
    </>
  );
}
