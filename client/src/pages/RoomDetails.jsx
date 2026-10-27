import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { assetUrl, errMsg, fmtDate, money, today } from '../api';
import { useAuth } from '../hooks/useAuth';
import Stars from '../components/Stars';

export default function RoomDetails() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [booked, setBooked] = useState([]);
  const [reviews, setReviews] = useState({ reviews: [], page: 1, pages: 1 });
  const [img, setImg] = useState(0);
  const [form, setForm] = useState({ checkIn: params.get('checkIn') || '', checkOut: params.get('checkOut') || '', guests: Number(params.get('guests')) || 1, specialRequests: '' });
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/rooms/${id}`).then((r) => setRoom(r.data)).catch((e) => setError(errMsg(e)));
    api.get(`/rooms/${id}/availability`).then((r) => setBooked(r.data)).catch(() => {});
    api.get(`/rooms/${id}/reviews`).then((r) => setReviews(r.data)).catch(() => {});
  }, [id]);

  // Live price + availability whenever the dates or guests change.
  useEffect(() => {
    setQuote(null);
    if (!form.checkIn || !form.checkOut || form.checkOut <= form.checkIn) return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      api.get(`/rooms/${id}/quote`, { params: { checkIn: form.checkIn, checkOut: form.checkOut, guests: form.guests } })
        .then((r) => !cancelled && setQuote(r.data))
        .catch((e) => !cancelled && setError(errMsg(e)));
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [id, form.checkIn, form.checkOut, form.guests]);

  const moreReviews = async () => {
    const { data } = await api.get(`/rooms/${id}/reviews`, { params: { page: reviews.page + 1 } });
    setReviews({ ...data, reviews: [...reviews.reviews, ...data.reviews] });
  };

  if (!room) return <div className="container py-5">{error || 'Loading…'}</div>;

  const book = async (e) => {
    e.preventDefault();
    if (!user) return navigate('/login', { state: { from: { pathname: `/rooms/${id}` } } });
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/bookings', { roomId: id, ...form });
      navigate(`/pay/${data._id}`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container py-5">
      <Link to="/">← Back to rooms</Link>
      <div className="row g-4 mt-1">
        <div className="col-lg-7">
          <div className="room-art room-art-lg">
            {room.images?.length ? <img src={assetUrl(room.images[img])} alt={`Room ${room.number}`} /> : <span>{room.category?.name}</span>}
          </div>
          {room.images?.length > 1 && (
            <div className="d-flex gap-2 mt-2 flex-wrap">
              {room.images.map((u, i) => (
                <button key={u} className={`thumb ${i === img ? 'active' : ''}`} onClick={() => setImg(i)} aria-label={`Show image ${i + 1}`}>
                  <img src={assetUrl(u)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          <h1 className="h2 mt-4">{room.category?.name} room {room.number}</h1>
          <Stars value={room.ratingAvg} count={room.ratingCount} size="medium" />
          <p className="mt-3">{room.description}</p>
          <p className="mb-2">Sleeps up to {room.capacity} guests · {room.hotel?.name}{room.hotel?.city ? `, ${room.hotel.city}` : ''}</p>
          <p className="small text-muted">Check-in from {room.hotel?.checkInTime || '14:00'}, check-out by {room.hotel?.checkOutTime || '11:00'}.</p>
          <div>{room.amenities.map((a) => <span className="amenity" key={a}>{a}</span>)}</div>

          {booked.length > 0 && (
            <div className="mt-4">
              <h2 className="h6">Already booked</h2>
              <ul className="small text-muted mb-0">{booked.map((b) => <li key={b._id}>{fmtDate(b.checkIn)} to {fmtDate(b.checkOut)}</li>)}</ul>
            </div>
          )}

          <h2 className="h4 mt-5">Guest reviews</h2>
          {reviews.reviews.length === 0 && <p className="text-muted">No reviews yet.</p>}
          {reviews.reviews.map((r) => (
            <div className="panel mb-2" key={r._id}>
              <div className="d-flex justify-content-between"><strong>{r.guest}</strong><small className="text-muted">{fmtDate(r.createdAt)}</small></div>
              <Stars value={r.rating} />
              {r.comment && <p className="mb-0 mt-1">{r.comment}</p>}
            </div>
          ))}
          {reviews.page < reviews.pages && <button className="btn btn-sm btn-outline-primary" onClick={moreReviews}>Show more reviews</button>}
        </div>

        <div className="col-lg-5">
          <form className="panel sticky-panel" onSubmit={book}>
            <p className="price fs-4 mb-3">{money(room.pricePerNight)} <small className="text-muted fw-normal">per night</small></p>
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label" htmlFor="ci">Check-in</label>
                <input id="ci" type="date" required className="form-control" value={form.checkIn} min={today()} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label" htmlFor="co">Check-out</label>
                <input id="co" type="date" required className="form-control" value={form.checkOut} min={form.checkIn || today()} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="g">Guests</label>
                <input id="g" type="number" min="1" max={room.capacity} className="form-control" value={form.guests} onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })} />
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="sr">Special requests (optional)</label>
                <textarea id="sr" rows="2" maxLength="500" className="form-control" value={form.specialRequests} onChange={(e) => setForm({ ...form, specialRequests: e.target.value })} />
              </div>
            </div>

            {quote && (
              <div className={`alert mt-3 mb-0 ${quote.available ? 'alert-success' : 'alert-warning'}`} role="status">
                {quote.available ? (
                  <>
                    <strong>Available.</strong> {quote.nights} night{quote.nights > 1 ? 's' : ''} · <strong>{money(quote.total)}</strong> total
                    {quote.seasonal && <div className="small mt-1">Includes seasonal pricing: {[...new Set(quote.breakdown.filter((b) => b.season).map((b) => b.season))].join(', ')}</div>}
                  </>
                ) : quote.reason}
              </div>
            )}
            {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
            <button className="btn btn-primary w-100 mt-3" disabled={busy || (quote && !quote.available)}>
              {user ? (busy ? 'Reserving…' : 'Reserve and pay') : 'Log in to book'}
            </button>
            <p className="small text-muted mt-2 mb-0">Your room is held for 15 minutes while you complete payment.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
