import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api, { errMsg, fmtDateTime, money } from '../../api';
import Pagination from '../../components/Pagination';
import StatusBadge from '../../components/StatusBadge';

export default function Payments() {
  const [data, setData] = useState({ payments: [], page: 1, pages: 1 });
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => api.get('/payments', { params: { status: status || undefined, page } }).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e))), [status, page]);
  useEffect(() => { load(); }, [load]);

  const approve = async (p) => {
    if (!window.confirm(`Refund ${money(p.amount)} to ${p.user?.name}?`)) return;
    try { await api.post(`/payments/${p._id}/refund`); toast.success('Refund processed'); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const reject = async (p) => {
    const reason = window.prompt('Reason for rejecting this refund (shown to the guest):', '');
    if (reason === null) return;
    try { await api.post(`/payments/${p._id}/refund/reject`, { reason }); toast.info('Refund rejected'); load(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <>
      <select className="form-select form-select-sm w-auto mb-3" aria-label="Payment status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="">All payments</option>{['paid', 'pending', 'failed', 'refund_requested', 'refunded', 'refund_rejected'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
      </select>
      <div className="table-responsive panel p-0">
        <table className="table table-hover align-middle mb-0">
          <thead><tr><th>Date</th><th>Guest</th><th>Booking</th><th>Amount</th><th>Method</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data.payments.map((p) => (
              <tr key={p._id}>
                <td className="small">{fmtDateTime(p.paidAt || p.createdAt)}</td>
                <td>{p.user?.name}<div className="small text-muted">{p.user?.email}</div></td>
                <td className="small">Room {p.booking?.room?.number}<div className="text-muted">{p.booking?.invoiceNumber || '-'}</div></td>
                <td>{money(p.amount)}</td>
                <td className="small text-capitalize">{p.provider}{p.cardLast4 ? ` ····${p.cardLast4}` : ''}</td>
                <td><StatusBadge value={p.status} />{p.refundNote && <div className="small text-muted">{p.refundNote}</div>}</td>
                <td className="text-end text-nowrap">
                  {p.status === 'refund_requested' && (<><button className="btn btn-sm btn-primary me-1" onClick={() => approve(p)}>Approve refund</button><button className="btn btn-sm btn-outline-danger" onClick={() => reject(p)}>Reject</button></>)}
                </td>
              </tr>
            ))}
            {data.payments.length === 0 && <tr><td colSpan="7" className="text-muted">No payments.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </>
  );
}
