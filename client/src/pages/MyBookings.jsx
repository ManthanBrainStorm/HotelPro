import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Rating from '@mui/material/Rating';
import { toast } from 'react-toastify';
import api, { downloadInvoice, errMsg, fmtDate, money } from '../api';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import StatusBadge from '../components/StatusBadge';

export default function MyBookings() {
  const [data, setData] = useState({ bookings: [], page: 1, pages: 1 });
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState([]);
  const [services, setServices] = useState([]);
  const [modal, setModal] = useState(null); // { kind: 'review' | 'request', booking }
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([api.get('/bookings/mine', { params: { page, status: status || undefined } }), api.get('/requests/mine', { params: { limit: 5 } })]);
      setData(b.data);
      setRequests(r.data.requests);
    } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, [page, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/services').then((r) => setServices(r.data)).catch(() => {}); }, []);

  const cancel = async (b) => {
    const msg = b.paymentStatus === 'paid' ? 'Cancel this booking? A refund request will be sent for review.' : 'Cancel this booking?';
    if (!window.confirm(msg)) return;
    try { await api.patch(`/bookings/${b._id}/cancel`); toast.success('Booking cancelled'); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const invoice = (b) => downloadInvoice(b).catch((e) => toast.error(errMsg(e)));

  return (
    <div className="container py-5">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <h1 className="h2 mb-0">My bookings</h1>
        <select className="form-select w-auto" aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All bookings</option>
          {['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {!loading && data.bookings.length === 0 && <div className="panel">No bookings found. <Link to="/">Find a room</Link></div>}

      <div className="d-grid gap-3">
        {data.bookings.map((b) => (
          <div className="panel" key={b._id}>
            <div className="d-flex flex-wrap justify-content-between gap-3">
              <div>
                <strong>{b.room?.category?.name} room {b.room?.number}</strong>
                <div className="text-muted small">{fmtDate(b.checkIn)} to {fmtDate(b.checkOut)} · {b.nights} night{b.nights > 1 ? 's' : ''} · {b.guests} guest{b.guests > 1 ? 's' : ''}</div>
                {b.invoiceNumber && <div className="text-muted small">Invoice {b.invoiceNumber}</div>}
              </div>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <span className="price">{money(b.totalPrice)}</span>
                <StatusBadge value={b.status} />
                {b.paymentStatus !== 'pending' && <StatusBadge value={b.paymentStatus} />}
              </div>
            </div>
            <div className="d-flex flex-wrap gap-2 mt-3">
              {b.status === 'pending' && <Link to={`/pay/${b._id}`} className="btn btn-sm btn-primary">Pay now</Link>}
              {b.invoiceNumber && <button className="btn btn-sm btn-outline-primary" onClick={() => invoice(b)}>Invoice (PDF)</button>}
              {['confirmed', 'checked-in'].includes(b.status) && <button className="btn btn-sm btn-outline-secondary" onClick={() => setModal({ kind: 'request', booking: b })}>Request service or help</button>}
              {b.status === 'checked-out' && !b.reviewed && <button className="btn btn-sm btn-outline-primary" onClick={() => setModal({ kind: 'review', booking: b })}>Leave a review</button>}
              {['pending', 'confirmed'].includes(b.status) && <button className="btn btn-sm btn-outline-danger" onClick={() => cancel(b)}>Cancel booking</button>}
            </div>
          </div>
        ))}
      </div>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />

      {requests.length > 0 && (
        <section className="mt-5">
          <h2 className="h4">My requests</h2>
          <div className="d-grid gap-2">
            {requests.map((r) => (
              <div className="panel" key={r._id}>
                <div className="d-flex justify-content-between gap-2"><strong>{r.subject}</strong><StatusBadge value={r.status} /></div>
                <div className="small text-muted">Room {r.room?.number} · {r.type === 'support' ? 'Support ticket' : 'Service request'}</div>
                {r.response && <div className="alert alert-light border mt-2 mb-0 small"><strong>Hotel reply:</strong> {r.response}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {modal?.kind === 'review' && <ReviewModal booking={modal.booking} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.kind === 'request' && <RequestModal booking={modal.booking} services={services} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </div>
  );
}

function ReviewModal({ booking, onClose, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.post('/reviews', { bookingId: booking._id, rating, comment }); toast.success('Thanks for your review!'); onDone(); } catch (err) { toast.error(errMsg(err)); setBusy(false); }
  };
  return (
    <Modal title={`Review room ${booking.room?.number}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="mb-1">Your rating</p>
        <Rating value={rating} onChange={(_, v) => setRating(v || 1)} size="large" />
        <label className="form-label mt-3" htmlFor="rc">Comment (optional)</label>
        <textarea id="rc" rows="3" maxLength="1000" className="form-control" value={comment} onChange={(e) => setComment(e.target.value)} />
        <button className="btn btn-primary mt-3" disabled={busy}>Submit review</button>
      </form>
    </Modal>
  );
}

function RequestModal({ booking, services, onClose, onDone }) {
  const [type, setType] = useState('service');
  const [serviceId, setServiceId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/requests', { bookingId: booking._id, type, serviceId: type === 'service' ? serviceId : undefined, subject, message });
      toast.success('Request sent to the front desk');
      onDone();
    } catch (err) { toast.error(errMsg(err)); setBusy(false); }
  };
  return (
    <Modal title={`Room ${booking.room?.number}: request`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="btn-group mb-3 w-100" role="group">
          <button type="button" className={`btn btn-sm ${type === 'service' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setType('service')}>Service</button>
          <button type="button" className={`btn btn-sm ${type === 'support' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setType('support')}>Help / complaint</button>
        </div>
        {type === 'service' ? (
          <>
            <label className="form-label" htmlFor="sv">Service</label>
            <select id="sv" required className="form-select mb-2" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">Choose…</option>
              {services.map((s) => <option key={s._id} value={s._id}>{s.name}{s.price ? ` (${money(s.price)})` : ''}</option>)}
            </select>
          </>
        ) : (
          <>
            <label className="form-label" htmlFor="sj">Subject</label>
            <input id="sj" required maxLength="120" className="form-control mb-2" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </>
        )}
        <label className="form-label" htmlFor="ms">Details</label>
        <textarea id="ms" rows="3" maxLength="1000" className="form-control" value={message} onChange={(e) => setMessage(e.target.value)} />
        <button className="btn btn-primary mt-3" disabled={busy}>Send request</button>
      </form>
    </Modal>
  );
}
