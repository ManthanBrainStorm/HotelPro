import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import Overview from './Overview';
import Bookings from './Bookings';
import Rooms from './Rooms';
import Housekeeping from './Housekeeping';
import Requests from './Requests';
import Payments from './Payments';
import Catalog from './Catalog';
import Users from './Users';
import Reviews from './Reviews';
import Security from './Security';

const TABS = [
  { id: 'overview', label: 'Overview', C: Overview },
  { id: 'bookings', label: 'Bookings', C: Bookings },
  { id: 'rooms', label: 'Rooms', C: Rooms },
  { id: 'housekeeping', label: 'Housekeeping', C: Housekeeping },
  { id: 'requests', label: 'Requests', C: Requests },
  { id: 'payments', label: 'Payments', C: Payments, admin: true },
  { id: 'catalog', label: 'Pricing & catalog', C: Catalog, admin: true },
  { id: 'users', label: 'Users & staff', C: Users, admin: true },
  { id: 'reviews', label: 'Reviews', C: Reviews, admin: true },
  { id: 'security', label: 'Security & logs', C: Security, admin: true },
];

export default function Dashboard() {
  const { user } = useAuth();
  const tabs = TABS.filter((t) => !t.admin || user.role === 'admin');
  const [tab, setTab] = useState(() => (tabs.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : 'overview'));
  const Active = (tabs.find((t) => t.id === tab) || tabs[0]).C;

  const pick = (id) => { setTab(id); history.replaceState(null, '', `#${id}`); };

  return (
    <div className="container py-4">
      <h1 className="h2 mb-1">{user.role === 'admin' ? 'Admin dashboard' : 'Staff dashboard'}</h1>
      <p className="text-muted">Signed in as {user.name}{user.department ? ` · ${user.department}` : ''}</p>
      <ul className="nav nav-pills dash-tabs mb-4 flex-nowrap overflow-auto" role="tablist">
        {tabs.map((t) => (
          <li className="nav-item" key={t.id}>
            <button role="tab" aria-selected={tab === t.id} className={`nav-link text-nowrap ${tab === t.id ? 'active' : ''}`} onClick={() => pick(t.id)}>{t.label}</button>
          </li>
        ))}
      </ul>
      <Active />
    </div>
  );
}
