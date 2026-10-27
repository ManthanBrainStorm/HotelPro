import { useEffect, useState } from 'react';
import api, { fmtDate, money } from '../../api';
import SimpleCrud from '../../components/SimpleCrud';

const day = (v) => (v ? String(v).slice(0, 10) : '');

export default function Catalog() {
  const [sub, setSub] = useState('categories');
  const [cats, setCats] = useState([]);
  useEffect(() => { api.get('/categories').then((r) => setCats(r.data)); }, [sub]);

  const tabs = [['categories', 'Room categories'], ['seasonal', 'Seasonal pricing'], ['services', 'Guest services'], ['hotels', 'Hotels']];
  return (
    <>
      <ul className="nav nav-underline mb-3">
        {tabs.map(([id, label]) => <li className="nav-item" key={id}><button className={`nav-link ${sub === id ? 'active' : ''}`} onClick={() => setSub(id)}>{label}</button></li>)}
      </ul>

      {sub === 'categories' && (
        <SimpleCrud endpoint="/categories" noun="Category" defaults={{ name: '', description: '' }}
          fields={[{ name: 'name', label: 'Name', required: true }, { name: 'description', label: 'Description', col: 'col-md-8' }]}
          columns={[{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }]} />
      )}
      {sub === 'seasonal' && (
        <>
          <p className="text-muted small">Multiplier 1.25 adds 25% to the nightly rate; 0.9 gives 10% off. When rules overlap, the highest multiplier applies. Leave category empty to price every room.</p>
          <SimpleCrud endpoint="/pricing" noun="Pricing rule" defaults={{ name: '', startDate: '', endDate: '', multiplier: 1.25, category: '' }}
            fields={[
              { name: 'name', label: 'Name', required: true },
              { name: 'startDate', label: 'From', type: 'date', required: true },
              { name: 'endDate', label: 'To (inclusive)', type: 'date', required: true },
              { name: 'multiplier', label: 'Multiplier', type: 'number', step: '0.05', min: '0.1', max: '5', required: true },
              { name: 'category', label: 'Room category', type: 'select', emptyLabel: 'All categories', options: cats.map((c) => ({ value: c._id, label: c.name })) },
            ]}
            toForm={(r) => ({ name: r.name, startDate: day(r.startDate), endDate: day(r.endDate), multiplier: r.multiplier, category: r.category?._id || '' })}
            columns={[{ key: 'name', label: 'Name' }, { label: 'Dates', render: (r) => `${fmtDate(r.startDate)} → ${fmtDate(r.endDate)}` },
              { label: 'Rate', render: (r) => `×${r.multiplier}` }, { label: 'Applies to', render: (r) => r.category?.name || 'All rooms' }]} />
        </>
      )}
      {sub === 'services' && (
        <SimpleCrud endpoint="/services" noun="Service" defaults={{ name: '', description: '', price: 0 }}
          fields={[{ name: 'name', label: 'Name', required: true }, { name: 'price', label: 'Price (₹)', type: 'number', min: '0' }, { name: 'description', label: 'Description' }]}
          prepare={(f) => ({ ...f, price: Number(f.price) })}
          columns={[{ key: 'name', label: 'Name' }, { label: 'Price', render: (s) => money(s.price) }, { key: 'description', label: 'Description' }]} />
      )}
      {sub === 'hotels' && (
        <SimpleCrud endpoint="/hotels" noun="Hotel" defaults={{ name: '', address: '', city: '', phone: '', email: '', checkInTime: '14:00', checkOutTime: '11:00', description: '' }}
          fields={[{ name: 'name', label: 'Name', required: true }, { name: 'address', label: 'Address' }, { name: 'city', label: 'City' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' },
            { name: 'checkInTime', label: 'Check-in time', type: 'time' }, { name: 'checkOutTime', label: 'Check-out time', type: 'time' }, { name: 'description', label: 'Description', col: 'col-md-8' }]}
          columns={[{ key: 'name', label: 'Name' }, { key: 'city', label: 'City' }, { key: 'phone', label: 'Phone' }, { label: 'Times', render: (h) => `${h.checkInTime} / ${h.checkOutTime}` }]} />
      )}
    </>
  );
}
