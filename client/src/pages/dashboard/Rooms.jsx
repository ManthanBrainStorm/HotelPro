import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api, { assetUrl, errMsg, money } from '../../api';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../hooks/useAuth';

const blank = { number: '', category: '', hotel: '', pricePerNight: '', capacity: 2, amenities: '', description: '' };

export default function Rooms() {
  const { user } = useAuth();
  const admin = user.role === 'admin';
  const [rooms, setRooms] = useState([]);
  const [cats, setCats] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null); // full room doc while editing
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = useCallback(() => api.get('/rooms/manage/list').then((r) => setRooms(r.data)).catch((e) => setError(errMsg(e))), []);
  useEffect(() => {
    load();
    api.get('/categories').then((r) => setCats(r.data));
    api.get('/hotels').then((r) => setHotels(r.data));
  }, [load]);

  const setStatus = async (room, status) => {
    try { await api.patch(`/rooms/${room._id}/status`, { status }); toast.success(`Room ${room.number} is now ${status}`); load(); } catch (e) { toast.error(errMsg(e)); }
  };

  const edit = (r) => {
    setEditing(r);
    setForm({ number: r.number, category: r.category?._id || '', hotel: r.hotel?._id || '', pricePerNight: r.pricePerNight, capacity: r.capacity, amenities: (r.amenities || []).join(', '), description: r.description || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const reset = () => { setEditing(null); setForm(blank); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = { ...form, pricePerNight: Number(form.pricePerNight), capacity: Number(form.capacity), amenities: form.amenities.split(',').map((a) => a.trim()).filter(Boolean), hotel: form.hotel || undefined };
    try {
      if (editing) { await api.put(`/rooms/${editing._id}`, payload); toast.success('Room updated'); reset(); }
      else {
        const { data } = await api.post('/rooms', payload);
        toast.success('Room created. You can now add photos.');
        await load();
        const full = (await api.get(`/rooms/${data._id}`)).data;
        edit(full);
        return;
      }
      load();
    } catch (err) { setError(errMsg(err)); }
  };

  const remove = async (r) => {
    if (!window.confirm(`Remove room ${r.number} from listings?`)) return;
    try { await api.delete(`/rooms/${r._id}`); toast.success('Room removed'); load(); } catch (e) { toast.error(errMsg(e)); }
  };

  const upload = async (e) => {
    const files = [...e.target.files];
    if (!files.length || !editing) return;
    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));
    try {
      const { data } = await api.post(`/rooms/${editing._id}/images`, fd);
      setEditing({ ...editing, images: data.images });
      toast.success('Images uploaded');
      load();
    } catch (err) { toast.error(errMsg(err)); }
    e.target.value = '';
  };
  const deleteImage = async (url) => {
    try {
      const { data } = await api.delete(`/rooms/${editing._id}/images`, { data: { url } });
      setEditing({ ...editing, images: data.images });
      load();
    } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <>
      {admin && (
        <form className="panel mb-4" onSubmit={submit}>
          <h2 className="h6 mb-3">{editing ? `Edit room ${editing.number}` : 'Add a room'}</h2>
          <div className="row g-3">
            <div className="col-6 col-md-2"><label className="form-label" htmlFor="rn">Number</label><input id="rn" required className="form-control" value={form.number} onChange={set('number')} /></div>
            <div className="col-6 col-md-3"><label className="form-label" htmlFor="rc">Category</label>
              <select id="rc" required className="form-select" value={form.category} onChange={set('category')}><option value="">Choose…</option>{cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></div>
            {hotels.length > 1 && <div className="col-6 col-md-3"><label className="form-label" htmlFor="rh">Hotel</label>
              <select id="rh" className="form-select" value={form.hotel} onChange={set('hotel')}><option value="">Default</option>{hotels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}</select></div>}
            <div className="col-6 col-md-2"><label className="form-label" htmlFor="rp">Price / night</label><input id="rp" type="number" min="0" required className="form-control" value={form.pricePerNight} onChange={set('pricePerNight')} /></div>
            <div className="col-6 col-md-2"><label className="form-label" htmlFor="rg">Sleeps</label><input id="rg" type="number" min="1" max="20" required className="form-control" value={form.capacity} onChange={set('capacity')} /></div>
            <div className="col-md-6"><label className="form-label" htmlFor="ra">Amenities (comma separated)</label><input id="ra" className="form-control" value={form.amenities} onChange={set('amenities')} /></div>
            <div className="col-md-6"><label className="form-label" htmlFor="rd">Description</label><input id="rd" maxLength="1000" className="form-control" value={form.description} onChange={set('description')} /></div>
          </div>
          {editing && (
            <div className="mt-3">
              <label className="form-label" htmlFor="ri">Photos (JPG, PNG or WebP, max 2 MB each, up to 8)</label>
              <input id="ri" type="file" accept="image/jpeg,image/png,image/webp" multiple className="form-control" onChange={upload} />
              <div className="d-flex gap-2 flex-wrap mt-2">
                {editing.images?.map((u) => (
                  <div className="thumb-wrap" key={u}><img src={assetUrl(u)} alt="" className="thumb-img" /><button type="button" className="btn btn-sm btn-danger thumb-x" aria-label="Delete image" onClick={() => deleteImage(u)}>✕</button></div>
                ))}
              </div>
            </div>
          )}
          {error && <div className="alert alert-danger mt-3 mb-0" role="alert">{error}</div>}
          <div className="mt-3 d-flex gap-2">
            <button className="btn btn-primary btn-sm">{editing ? 'Save changes' : 'Add room'}</button>
            {editing && <button type="button" className="btn btn-outline-secondary btn-sm" onClick={reset}>Done</button>}
          </div>
        </form>
      )}

      {!admin && error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive panel p-0">
        <table className="table table-hover align-middle mb-0">
          <thead><tr><th>Room</th><th>Category</th><th>Rate</th><th>Sleeps</th><th>Rating</th><th>Status</th></tr></thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r._id}>
                <td><strong>{r.number}</strong></td><td>{r.category?.name}</td><td>{money(r.pricePerNight)}</td><td>{r.capacity}</td>
                <td>{r.ratingCount ? `${r.ratingAvg} (${r.ratingCount})` : '-'}</td>
                <td>
                  <div className="d-flex gap-2 align-items-center">
                    <StatusBadge value={r.status} />
                    <select className="form-select form-select-sm w-auto" aria-label={`Set status for room ${r.number}`} value={r.status} onChange={(e) => setStatus(r, e.target.value)}>
                      {['available', 'occupied', 'cleaning', 'maintenance'].map((s) => <option key={s}>{s}</option>)}
                    </select>
                    {admin && <><button className="btn btn-sm btn-outline-primary" onClick={() => edit(r)}>Edit</button><button className="btn btn-sm btn-outline-danger" onClick={() => remove(r)}>Remove</button></>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
