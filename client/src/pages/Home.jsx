import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errMsg, money, today } from '../api';
import Pagination from '../components/Pagination';
import RoomImage from '../components/RoomImage';
import Stars from '../components/Stars';

const FIELDS = ['checkIn', 'checkOut', 'guests', 'category', 'hotel', 'minPrice', 'maxPrice', 'sort'];

export default function Home() {
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((k) => [k, params.get(k) || (k === 'guests' ? '1' : '')])));
  const [categories, setCategories] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [data, setData] = useState({ rooms: [], total: 0, page: 1, pages: 1 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data)).catch(() => {});
    api.get('/hotels').then((r) => setHotels(r.data)).catch(() => {});
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const query = Object.fromEntries([...params].filter(([, v]) => v));
      const { data: d } = await api.get('/rooms', { params: query });
      setData(d);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  // Near-real-time availability: refresh every 30 s and whenever the tab regains focus.
  useEffect(() => {
    const tick = setInterval(() => load(true), 30000);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(tick); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const search = (e) => {
    e.preventDefault();
    if ((form.checkIn && !form.checkOut) || (!form.checkIn && form.checkOut)) return setError('Choose both check-in and check-out dates');
    if (form.checkIn && form.checkOut && form.checkOut <= form.checkIn) return setError('Check-out must be after check-in');
    setParams(Object.fromEntries(Object.entries(form).filter(([, v]) => v)));
  };
  const goto = (page) => { setParams({ ...Object.fromEntries(params), page }); window.scrollTo({ top: 300, behavior: 'smooth' }); };

  const stay = params.get('checkIn') && params.get('checkOut')
    ? `?checkIn=${params.get('checkIn')}&checkOut=${params.get('checkOut')}&guests=${params.get('guests') || 1}` : '';

  return (
    <>
      <header className="hero">
        <div className="container">
          <h1>A room that is free when you are</h1>
          <p className="mt-3 mb-0">Pick your dates and see only the rooms available for your whole stay.</p>
        </div>
      </header>

      <div className="container">
        <form className="search-panel row g-3 align-items-end" onSubmit={search}>
          <div className="col-6 col-md-3">
            <label className="form-label" htmlFor="ci">Check-in</label>
            <input id="ci" type="date" className="form-control" min={today()} value={form.checkIn} onChange={set('checkIn')} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label" htmlFor="co">Check-out</label>
            <input id="co" type="date" className="form-control" min={form.checkIn || today()} value={form.checkOut} onChange={set('checkOut')} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="g">Guests</label>
            <input id="g" type="number" min="1" max="10" className="form-control" value={form.guests} onChange={set('guests')} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="cat">Room category</label>
            <select id="cat" className="form-select" value={form.category} onChange={set('category')}>
              <option value="">Any</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-2 d-grid"><button className="btn btn-primary">Search rooms</button></div>
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="min">Min price</label>
            <input id="min" type="number" min="0" className="form-control" value={form.minPrice} onChange={set('minPrice')} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="max">Max price</label>
            <input id="max" type="number" min="0" className="form-control" value={form.maxPrice} onChange={set('maxPrice')} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label" htmlFor="sort">Sort by</label>
            <select id="sort" className="form-select" value={form.sort} onChange={set('sort')}>
              <option value="">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="rating">Best rated</option>
            </select>
          </div>
          {hotels.length > 1 && (
            <div className="col-6 col-md-3">
              <label className="form-label" htmlFor="hotel">Hotel</label>
              <select id="hotel" className="form-select" value={form.hotel} onChange={set('hotel')}>
                <option value="">All hotels</option>
                {hotels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </div>
          )}
        </form>

        {error && <div className="alert alert-danger mt-4">{error}</div>}

        <section className="py-5">
          <h2 className="h3 mb-4">{loading ? 'Looking for rooms…' : `${data.total} room${data.total === 1 ? '' : 's'} available`}</h2>
          {!loading && data.rooms.length === 0 && !error && <div className="panel">No rooms match. Try different dates, fewer guests or a wider price range.</div>}
          <div className="row g-4">
            {data.rooms.map((r) => (
              <div className="col-md-6 col-lg-3" key={r._id}>
                <div className="room-card">
                  <RoomImage room={r} />
                  <div className="p-3 d-flex flex-column flex-grow-1">
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <strong>Room {r.number}</strong>
                      <span className="price text-end">
                        {money(r.quote ? r.quote.avgPerNight : r.pricePerNight)}<small className="text-muted fw-normal"> / night</small>
                      </span>
                    </div>
                    <Stars value={r.ratingAvg} count={r.ratingCount} />
                    <p className="small text-muted my-2">{r.category?.name} · sleeps {r.capacity}. {r.description}</p>
                    {r.quote?.seasonal && <span className="badge text-bg-warning align-self-start mb-2">Seasonal rate</span>}
                    {r.quote && <p className="small mb-2">{r.quote.nights} night{r.quote.nights > 1 ? 's' : ''}: <strong>{money(r.quote.total)}</strong></p>}
                    <div className="mb-3">{r.amenities.slice(0, 4).map((a) => <span className="amenity" key={a}>{a}</span>)}</div>
                    <Link to={`/rooms/${r._id}${stay}`} className="btn btn-outline-primary mt-auto">View and book</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={goto} />
        </section>
      </div>
    </>
  );
}
