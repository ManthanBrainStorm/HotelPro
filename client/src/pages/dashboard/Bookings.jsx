import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api, { errMsg, fmtDate, money } from '../../api';
import Pagination from '../../components/Pagination';
import StatusBadge from '../../components/StatusBadge';

const VIEWS = [['', 'All'], ['arrivals', 'Arrivals today'], ['departures', 'Departures today'], ['in-house', 'In house']];

export default function Bookings() {
  const [data, setData] = useState({ bookings: [], page: 1, pages: 1, total: 0 });
  const [view, setView] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);

  const load = useCallback(() =>
    api.get('/bookings', { params: { view: view || undefined, status: status || undefined, q: search || undefined, page } })
      .then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errMsg(e))), [view, status, search, page]);
  useEffect(() => { load(); }, [load]);

  const act = async (b, path, body, ok) => {
    try { await api.patch(`/bookings/${b._id}/${path}`, body); toast.success(ok); load(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <>
      <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
        <div className="btn-group" role="group" aria-label="Quick views">
          {VIEWS.map(([v, l]) => <button key={v} className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => { setView(v); setPage(1); }}>{l}</button>)}
        </div>
        <select className="form-select form-select-sm w-auto" aria-label="Status" value={status} disabled={!!view} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Any status</option>
          {['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <input className="form-control form-control-sm w-auto" placeholder="Search guest or room…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="small text-muted ms-auto">{data.total} booking{data.total === 1 ? '' : 's'}</span>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive panel p-0">
        <table className="table table-hover align-middle mb-0">
          <thead><tr><th>Guest</th><th>Room</th><th>Stay</th><th>Total</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data.bookings.map((b) => (
              <tr key={b._id}>
                <td>{b.user?.name}<div className="small text-muted">{b.user?.email}{b.user?.phone ? ` · ${b.user.phone}` : ''}</div></td>
                <td>{b.room?.number}<div className="small text-muted">{b.room?.category?.name}</div></td>
                <td className="text-nowrap">{fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}<div className="small text-muted">{b.nights}n · {b.guests} guest{b.guests > 1 ? 's' : ''}</div></td>
                <td>{money(b.totalPrice)}</td>
                <td><StatusBadge value={b.status} /><div className="mt-1"><StatusBadge value={b.paymentStatus} /></div></td>
                <td className="text-end text-nowrap">
                  {b.status === 'confirmed' && b.paymentStatus === 'paid' && <button className="btn btn-sm btn-primary me-1" onClick={() => act(b, 'status', { status: 'checked-in' }, 'Guest checked in')}>Check in</button>}
                  {b.status === 'checked-in' && <button className="btn btn-sm btn-primary me-1" onClick={() => act(b, 'status', { status: 'checked-out' }, 'Guest checked out')}>Check out</button>}
                  {['pending', 'confirmed'].includes(b.status) && <button className="btn btn-sm btn-outline-danger" onClick={() => window.confirm('Cancel this booking?') && act(b, 'cancel', undefined, 'Booking cancelled')}>Cancel</button>}
                </td>
              </tr>
            ))}
            {data.bookings.length === 0 && <tr><td colSpan="6" className="text-muted">No bookings match.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </>
  );
}
