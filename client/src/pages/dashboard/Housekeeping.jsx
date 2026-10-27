import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api, { errMsg, fmtDateTime } from '../../api';
import Pagination from '../../components/Pagination';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../hooks/useAuth';

export default function Housekeeping() {
  const { user } = useAuth();
  const admin = user.role === 'admin';
  const [data, setData] = useState({ tasks: [], page: 1, pages: 1 });
  const [filter, setFilter] = useState({ status: '', mine: '' });
  const [page, setPage] = useState(1);
  const [staff, setStaff] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState({ room: '', type: 'cleaning', assignedTo: '', notes: '' });

  const load = useCallback(() =>
    api.get('/housekeeping', { params: { status: filter.status || undefined, mine: filter.mine || undefined, page } }).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e))), [filter, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/admin/staff').then((r) => setStaff(r.data));
    api.get('/rooms/manage/list').then((r) => setRooms(r.data));
  }, []);

  const patch = async (t, body, ok) => { try { await api.patch(`/housekeeping/${t._id}`, body); if (ok) toast.success(ok); load(); } catch (e) { toast.error(errMsg(e)); } };
  const create = async (e) => {
    e.preventDefault();
    try { await api.post('/housekeeping', { ...form, assignedTo: form.assignedTo || undefined }); toast.success('Task created'); setForm({ room: '', type: 'cleaning', assignedTo: '', notes: '' }); load(); } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <>
      <form className="panel mb-4" onSubmit={create}>
        <h2 className="h6 mb-3">New task</h2>
        <div className="row g-2 align-items-end">
          <div className="col-6 col-md-2"><label className="form-label" htmlFor="hr">Room</label><select id="hr" required className="form-select" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}><option value="">Choose…</option>{rooms.map((r) => <option key={r._id} value={r._id}>{r.number}</option>)}</select></div>
          <div className="col-6 col-md-2"><label className="form-label" htmlFor="ht">Type</label><select id="ht" className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{['cleaning', 'maintenance', 'inspection'].map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="col-6 col-md-3"><label className="form-label" htmlFor="ha">Assign to</label><select id="ha" className="form-select" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}><option value="">Unassigned</option>{staff.filter((s) => admin || s._id === user.id).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
          <div className="col-6 col-md-3"><label className="form-label" htmlFor="hn">Notes</label><input id="hn" maxLength="500" className="form-control" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="col-md-2 d-grid"><button className="btn btn-primary">Create</button></div>
        </div>
      </form>

      <div className="d-flex gap-2 mb-3 flex-wrap">
        <select className="form-select form-select-sm w-auto" aria-label="Status" value={filter.status} onChange={(e) => { setFilter({ ...filter, status: e.target.value }); setPage(1); }}>
          <option value="">Any status</option>{['pending', 'in-progress', 'done'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="form-check align-self-center"><input id="mine" type="checkbox" className="form-check-input" checked={filter.mine === '1'} onChange={(e) => { setFilter({ ...filter, mine: e.target.checked ? '1' : '' }); setPage(1); }} /><label className="form-check-label" htmlFor="mine">Assigned to me</label></div>
      </div>
      <div className="table-responsive panel p-0">
        <table className="table table-hover align-middle mb-0">
          <thead><tr><th>Room</th><th>Type</th><th>Status</th><th>Assigned to</th><th>Notes</th><th>Created</th></tr></thead>
          <tbody>
            {data.tasks.map((t) => (
              <tr key={t._id}>
                <td><strong>{t.room?.number}</strong></td><td className="text-capitalize">{t.type}</td>
                <td>
                  <select className="form-select form-select-sm" aria-label="Task status" value={t.status} onChange={(e) => patch(t, { status: e.target.value }, `Task marked ${e.target.value}`)}>
                    {['pending', 'in-progress', 'done'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td>
                  {admin ? (
                    <select className="form-select form-select-sm" aria-label="Assign task" value={t.assignedTo?._id || ''} onChange={(e) => patch(t, { assignedTo: e.target.value || null }, 'Assignment updated')}>
                      <option value="">Unassigned</option>{staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                    </select>
                  ) : t.assignedTo ? t.assignedTo.name : <button className="btn btn-sm btn-outline-primary" onClick={() => patch(t, { assignedTo: user.id }, 'Task assigned to you')}>Take it</button>}
                </td>
                <td className="small">{t.notes}</td><td className="small text-muted">{fmtDateTime(t.createdAt)}</td>
              </tr>
            ))}
            {data.tasks.length === 0 && <tr><td colSpan="6" className="text-muted">No tasks.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </>
  );
}
