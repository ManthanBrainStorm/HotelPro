import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api, { errMsg, fmtDateTime } from '../../api';
import Pagination from '../../components/Pagination';
import { useAuth } from '../../hooks/useAuth';

function Row({ r, staff, admin, me, onChange }) {
  const [reply, setReply] = useState(r.response || '');
  const patch = async (body, ok) => { try { await api.patch(`/requests/${r._id}`, body); toast.success(ok); onChange(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <tr>
      <td>{r.user?.name}<div className="small text-muted">Room {r.room?.number}</div></td>
      <td><span className={`badge ${r.type === 'support' ? 'text-bg-warning' : 'text-bg-info'}`}>{r.type}</span></td>
      <td><strong>{r.subject}</strong>{r.service?.price ? <span className="small text-muted"> (₹{r.service.price})</span> : null}<div className="small">{r.message}</div><div className="small text-muted">{fmtDateTime(r.createdAt)}</div></td>
      <td>
        <select className="form-select form-select-sm" aria-label="Request status" value={r.status} onChange={(e) => patch({ status: e.target.value }, `Marked ${e.target.value}`)}>
          {['open', 'in-progress', 'resolved'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="mt-1">
          {admin ? (
            <select className="form-select form-select-sm" aria-label="Assign request" value={r.assignedTo?._id || ''} onChange={(e) => patch({ assignedTo: e.target.value || null }, 'Assignment updated')}>
              <option value="">Unassigned</option>{staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          ) : r.assignedTo ? <span className="small text-muted">Handled by {r.assignedTo.name}</span> : <button className="btn btn-sm btn-outline-primary" onClick={() => patch({ assignedTo: me }, 'Assigned to you')}>Take it</button>}
        </div>
      </td>
      <td style={{ minWidth: 220 }}>
        <textarea rows="2" maxLength="1000" className="form-control form-control-sm" aria-label="Reply to guest" placeholder="Reply to guest…" value={reply} onChange={(e) => setReply(e.target.value)} />
        <button className="btn btn-sm btn-outline-primary mt-1" disabled={!reply || reply === r.response} onClick={() => patch({ response: reply }, 'Reply sent')}>Send reply</button>
      </td>
    </tr>
  );
}

export default function Requests() {
  const { user } = useAuth();
  const [data, setData] = useState({ requests: [], page: 1, pages: 1 });
  const [filter, setFilter] = useState({ status: '', type: '' });
  const [page, setPage] = useState(1);
  const [staff, setStaff] = useState([]);

  const load = useCallback(() => api.get('/requests', { params: { status: filter.status || undefined, type: filter.type || undefined, page } }).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e))), [filter, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/admin/staff').then((r) => setStaff(r.data)); }, []);

  return (
    <>
      <div className="d-flex gap-2 mb-3">
        <select className="form-select form-select-sm w-auto" aria-label="Status" value={filter.status} onChange={(e) => { setFilter({ ...filter, status: e.target.value }); setPage(1); }}>
          <option value="">Any status</option>{['open', 'in-progress', 'resolved'].map((s) => <option key={s}>{s}</option>)}</select>
        <select className="form-select form-select-sm w-auto" aria-label="Type" value={filter.type} onChange={(e) => { setFilter({ ...filter, type: e.target.value }); setPage(1); }}>
          <option value="">Services and support</option><option value="service">Services</option><option value="support">Support</option></select>
      </div>
      <div className="table-responsive panel p-0">
        <table className="table align-middle mb-0">
          <thead><tr><th>Guest</th><th>Type</th><th>Request</th><th>Status / owner</th><th>Reply</th></tr></thead>
          <tbody>
            {data.requests.map((r) => <Row key={r._id + r.updatedAt} r={r} staff={staff} admin={user.role === 'admin'} me={user.id} onChange={load} />)}
            {data.requests.length === 0 && <tr><td colSpan="5" className="text-muted">No requests.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </>
  );
}
