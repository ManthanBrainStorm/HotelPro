import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api, { errMsg, fmtDate } from '../../api';
import Pagination from '../../components/Pagination';
import { useAuth } from '../../hooks/useAuth';

const DEPTS = ['', 'front-desk', 'housekeeping', 'support', 'management'];
const blank = { name: '', email: '', password: '', role: 'staff', department: 'front-desk', phone: '' };

export default function Users() {
  const { user: me } = useAuth();
  const [data, setData] = useState({ users: [], page: 1, pages: 1, total: 0 });
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');

  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);
  const load = useCallback(() => api.get('/admin/users', { params: { role: role || undefined, q: search || undefined, page } }).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e))), [role, search, page]);
  useEffect(() => { load(); }, [load]);

  const patch = async (u, body, ok) => { try { await api.patch(`/admin/users/${u._id}`, body); toast.success(ok); load(); } catch (e) { toast.error(errMsg(e)); } };
  const create = async (e) => {
    e.preventDefault();
    setError('');
    try { await api.post('/admin/users', form); toast.success('Account created'); setForm(blank); load(); } catch (err) { setError(errMsg(err)); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <form className="panel mb-4" onSubmit={create}>
        <h2 className="h6 mb-3">Add a staff or admin account</h2>
        <div className="row g-2 align-items-end">
          <div className="col-md-3"><label className="form-label" htmlFor="un">Name</label><input id="un" required minLength="2" className="form-control" value={form.name} onChange={set('name')} /></div>
          <div className="col-md-3"><label className="form-label" htmlFor="ue">Email</label><input id="ue" type="email" required className="form-control" value={form.email} onChange={set('email')} /></div>
          <div className="col-md-2"><label className="form-label" htmlFor="up">Password</label><input id="up" type="password" required minLength="8" autoComplete="new-password" className="form-control" value={form.password} onChange={set('password')} /></div>
          <div className="col-6 col-md-1"><label className="form-label" htmlFor="ur">Role</label><select id="ur" className="form-select" value={form.role} onChange={set('role')}><option>staff</option><option>admin</option><option>guest</option></select></div>
          <div className="col-6 col-md-2"><label className="form-label" htmlFor="ud">Department</label><select id="ud" className="form-select" value={form.department} onChange={set('department')}>{DEPTS.map((d) => <option key={d} value={d}>{d || 'None'}</option>)}</select></div>
          <div className="col-md-1 d-grid"><button className="btn btn-primary">Add</button></div>
        </div>
        {error && <div className="alert alert-danger mt-3 mb-0" role="alert">{error}</div>}
      </form>

      <div className="d-flex gap-2 mb-3 flex-wrap">
        <select className="form-select form-select-sm w-auto" aria-label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">All roles</option><option>guest</option><option>staff</option><option>admin</option></select>
        <input className="form-control form-control-sm w-auto" placeholder="Search name or email…" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="small text-muted ms-auto align-self-center">{data.total} users</span>
      </div>
      <div className="table-responsive panel p-0">
        <table className="table table-hover align-middle mb-0">
          <thead><tr><th>User</th><th>Role</th><th>Department</th><th>Joined</th><th>Status</th></tr></thead>
          <tbody>
            {data.users.map((u) => {
              const self = u._id === me.id;
              return (
                <tr key={u._id} className={u.isActive ? '' : 'opacity-50'}>
                  <td>{u.name}{self && ' (you)'}<div className="small text-muted">{u.email}{u.phone ? ` · ${u.phone}` : ''}</div></td>
                  <td><select className="form-select form-select-sm w-auto" aria-label="Role" disabled={self} value={u.role} onChange={(e) => patch(u, { role: e.target.value }, 'Role updated')}><option>guest</option><option>staff</option><option>admin</option></select></td>
                  <td><select className="form-select form-select-sm w-auto" aria-label="Department" disabled={u.role === 'guest'} value={u.department || ''} onChange={(e) => patch(u, { department: e.target.value }, 'Department updated')}>{DEPTS.map((d) => <option key={d} value={d}>{d || 'None'}</option>)}</select></td>
                  <td className="small">{fmtDate(u.createdAt)}</td>
                  <td>{self ? 'Active' : <button className={`btn btn-sm ${u.isActive ? 'btn-outline-danger' : 'btn-outline-success'}`} onClick={() => patch(u, { isActive: !u.isActive }, u.isActive ? 'Account disabled' : 'Account enabled')}>{u.isActive ? 'Disable' : 'Enable'}</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </>
  );
}
