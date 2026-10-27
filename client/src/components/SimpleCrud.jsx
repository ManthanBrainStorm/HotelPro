import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api, { errMsg } from '../api';

// Small generic list + create/edit/delete screen, used for categories, seasonal prices, services and hotels.
export default function SimpleCrud({ endpoint, noun, fields, columns, defaults, prepare, toForm }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(defaults);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api.get(endpoint).then((r) => setItems(r.data)).catch((e) => setError(errMsg(e))), [endpoint]);
  useEffect(() => { load(); }, [load]);

  const reset = () => { setForm(defaults); setEditId(null); setError(''); };
  const edit = (item) => { setEditId(item._id); setForm(toForm ? toForm(item) : { ...defaults, ...item }); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = prepare ? prepare(form) : form;
    try {
      if (editId) await api.put(`${endpoint}/${editId}`, payload); else await api.post(endpoint, payload);
      toast.success(`${noun} ${editId ? 'updated' : 'added'}`);
      reset();
      load();
    } catch (err) { setError(errMsg(err)); }
  };
  const remove = async (item) => {
    if (!window.confirm(`Remove this ${noun.toLowerCase()}?`)) return;
    try { await api.delete(`${endpoint}/${item._id}`); toast.success(`${noun} removed`); load(); } catch (err) { toast.error(errMsg(err)); }
  };

  const input = (f) => {
    const v = form[f.name] ?? '';
    const set = (val) => setForm({ ...form, [f.name]: val });
    const id = `${endpoint}-${f.name}`;
    if (f.type === 'select') return (
      <select id={id} className="form-select" value={v} required={f.required} onChange={(e) => set(e.target.value)}>
        {f.optional !== false && <option value="">{f.emptyLabel || 'None'}</option>}
        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
    if (f.type === 'textarea') return <textarea id={id} rows="2" className="form-control" value={v} onChange={(e) => set(e.target.value)} />;
    return <input id={id} type={f.type || 'text'} step={f.step} min={f.min} max={f.max} className="form-control" required={f.required} value={v} onChange={(e) => set(e.target.value)} />;
  };

  return (
    <>
      <form className="panel mb-4" onSubmit={submit}>
        <h3 className="h6 mb-3">{editId ? `Edit ${noun.toLowerCase()}` : `Add ${noun.toLowerCase()}`}</h3>
        <div className="row g-3">
          {fields.map((f) => (
            <div className={f.col || 'col-md-4'} key={f.name}>
              <label className="form-label" htmlFor={`${endpoint}-${f.name}`}>{f.label}</label>
              {input(f)}
            </div>
          ))}
        </div>
        {error && <div className="alert alert-danger mt-3 mb-0" role="alert">{error}</div>}
        <div className="mt-3 d-flex gap-2">
          <button className="btn btn-primary btn-sm">{editId ? 'Save changes' : `Add ${noun.toLowerCase()}`}</button>
          {editId && <button type="button" className="btn btn-outline-secondary btn-sm" onClick={reset}>Cancel</button>}
        </div>
      </form>
      <div className="table-responsive panel p-0">
        <table className="table table-hover align-middle mb-0">
          <thead><tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it._id}>
                {columns.map((c) => <td key={c.label}>{c.render ? c.render(it) : it[c.key]}</td>)}
                <td className="text-end text-nowrap">
                  <button className="btn btn-sm btn-outline-primary me-1" onClick={() => edit(it)}>Edit</button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => remove(it)}>Remove</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={columns.length + 1} className="text-muted">Nothing here yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
