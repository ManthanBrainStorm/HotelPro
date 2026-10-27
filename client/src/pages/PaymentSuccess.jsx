import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api, { downloadInvoice, errMsg, fmtDate, money } from '../api';

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const bookingId = params.get('booking');
  const sessionId = params.get('session_id');
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const run = async () => {
      try {
        // For Stripe the server confirms the payment with Stripe before the booking is marked paid.
        if (sessionId) setBooking((await api.post('/payments/verify', { bookingId, sessionId })).data.booking);
        else setBooking((await api.get(`/bookings/${bookingId}`)).data);
      } catch (e) { setError(errMsg(e)); }
    };
    run();
  }, [bookingId, sessionId]);

  if (error) return <div className="container py-5"><div className="alert alert-danger">{error}</div><Link to="/my-bookings">Go to My bookings</Link></div>;
  if (!booking) return <div className="container py-5">Confirming your payment…</div>;

  const paid = booking.paymentStatus === 'paid';
  return (
    <div className="container py-5" style={{ maxWidth: 560 }}>
      <div className="panel text-center">
        <h1 className="h3">{paid ? 'Booking confirmed 🎉' : 'Payment not completed'}</h1>
        {paid ? (
          <>
            <p className="mt-3">Room <strong>{booking.room?.number}</strong> · {fmtDate(booking.checkIn)} to {fmtDate(booking.checkOut)}</p>
            <p className="price fs-4">{money(booking.totalPrice)}</p>
            <p className="small text-muted">Invoice {booking.invoiceNumber}. A confirmation email is sent when email is configured.</p>
            <div className="d-flex gap-2 justify-content-center">
              <button className="btn btn-outline-primary" onClick={() => downloadInvoice(booking).catch((e) => toast.error(errMsg(e)))}>Download invoice</button>
              <Link to="/my-bookings" className="btn btn-primary">My bookings</Link>
            </div>
          </>
        ) : <Link to={`/pay/${booking._id}`} className="btn btn-primary mt-3">Try again</Link>}
      </div>
    </div>
  );
}
