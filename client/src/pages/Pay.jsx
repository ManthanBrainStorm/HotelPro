import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg, fmtDate, money } from '../api';

export default function Pay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(null);
  const [card, setCard] = useState({ name: '', number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' });

  useEffect(() => {
    api.get(`/bookings/${id}`).then((r) => setBooking(r.data)).catch((e) => setError(errMsg(e)));
    api.get('/payments/config').then((r) => setConfig(r.data)).catch(() => {});
  }, [id]);

  // Countdown for the payment hold.
  useEffect(() => {
    if (!booking?.holdExpiresAt) return undefined;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(booking.holdExpiresAt) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [booking]);

  if (error && !booking) return <div className="container py-5"><div className="alert alert-danger">{error}</div></div>;
  if (!booking || !config) return <div className="container py-5">Loading…</div>;
  if (booking.paymentStatus === 'paid' || booking.status !== 'pending') return <Navigate to="/my-bookings" replace />;

  const expired = left === 0;
  const mm = String(Math.floor((left || 0) / 60)).padStart(2, '0');
  const ss = String((left || 0) % 60).padStart(2, '0');

  const payStripe = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/payments/checkout', { bookingId: id });
      window.location.href = data.url;
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  };

  const payDemo = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/payments/demo-pay', { bookingId: id, cardNumber: card.number });
      navigate(`/payment/success?booking=${id}`);
    } catch (err) { setError(errMsg(err)); setBusy(false); }
  };

  return (
    <div className="container py-5" style={{ maxWidth: 760 }}>
      <h1 className="h2 mb-4">Complete your payment</h1>
      <div className="row g-4">
        <div className="col-md-6">
          <div className="panel h-100">
            <h2 className="h5">Booking summary</h2>
            <p className="mb-1"><strong>Room {booking.room?.number}</strong> · {booking.room?.category?.name}</p>
            <p className="text-muted small mb-3">{fmtDate(booking.checkIn)} to {fmtDate(booking.checkOut)} · {booking.nights} night{booking.nights > 1 ? 's' : ''} · {booking.guests} guest{booking.guests > 1 ? 's' : ''}</p>
            <p className="price fs-3 mb-3">{money(booking.totalPrice)}</p>
            <div className={`alert ${expired ? 'alert-danger' : 'alert-info'} mb-0`} role="timer">
              {expired ? 'Your hold has expired. The room was released.' : <>Room held for <strong>{mm}:{ss}</strong></>}
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="panel h-100">
            <h2 className="h5">Payment</h2>
            {config.provider === 'stripe' && (
              <>
                <p className="small text-muted">You will be redirected to Stripe's secure checkout.</p>
                <button className="btn btn-primary w-100" onClick={payStripe} disabled={busy || expired}>{busy ? 'Redirecting…' : `Pay ${money(booking.totalPrice)} with Stripe`}</button>
              </>
            )}
            {config.provider === 'demo' && (
              <form onSubmit={payDemo}>
                <div className="alert alert-warning small">Demo mode: no real money moves. Use <code>4242 4242 4242 4242</code> to succeed or <code>4000 0000 0000 0002</code> to see a declined card.</div>
                <label className="form-label" htmlFor="cn">Name on card</label>
                <input id="cn" className="form-control mb-2" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
                <label className="form-label" htmlFor="num">Card number</label>
                <input id="num" inputMode="numeric" required className="form-control mb-2" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} />
                <div className="row g-2">
                  <div className="col-6"><label className="form-label" htmlFor="ex">Expiry</label><input id="ex" className="form-control" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} /></div>
                  <div className="col-6"><label className="form-label" htmlFor="cv">CVC</label><input id="cv" className="form-control" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} /></div>
                </div>
                <button className="btn btn-primary w-100 mt-3" disabled={busy || expired}>{busy ? 'Processing…' : `Pay ${money(booking.totalPrice)}`}</button>
              </form>
            )}
            {config.provider === 'none' && <div className="alert alert-danger mb-0">Online payments are not configured on this server.</div>}
            {error && <div className="alert alert-danger mt-3 mb-0" role="alert">{error}</div>}
          </div>
        </div>
      </div>
      <p className="mt-3"><Link to="/my-bookings">Pay later from My bookings</Link></p>
    </div>
  );
}
