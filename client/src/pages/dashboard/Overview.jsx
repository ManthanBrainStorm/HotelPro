import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api, { addDays, errMsg, money, today } from '../../api';
import { useAuth } from '../../hooks/useAuth';

const COLORS = ['#1f6f78', '#b8893b', '#4b5d12', '#b3412f', '#6a7fa3', '#8a5a9a'];

const Stat = ({ label, value, hint }) => (
  <div className="col-6 col-lg-3"><div className="stat h-100"><div className="small text-muted">{label}</div><div className="num">{value}</div>{hint && <div className="small text-muted">{hint}</div>}</div></div>
);

export default function Overview() {
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [range, setRange] = useState({ from: addDays(today(), -29), to: today() });
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const admin = user.role === 'admin';

  useEffect(() => {
    api.get('/reports/summary').then((r) => setS(r.data)).catch((e) => setError(errMsg(e)));
    const t = setInterval(() => api.get('/reports/summary').then((r) => setS(r.data)).catch(() => {}), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!admin) return;
    api.get('/reports/overview', { params: range }).then((r) => { setReport(r.data); setError(''); }).catch((e) => setError(errMsg(e)));
  }, [admin, range]);

  if (!s) return <p>{error || 'Loading…'}</p>;
  const fmt = (v) => money(v);

  return (
    <>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="row g-3 mb-4">
        <Stat label="Occupancy" value={`${s.occupancy}%`} hint={`${s.occupiedRooms} of ${s.rooms} rooms`} />
        <Stat label="Arrivals today" value={s.arrivalsToday} hint={`${s.departuresToday} departures`} />
        <Stat label="Net revenue" value={money(s.revenue)} hint={`${money(s.revenueThisMonth)} this month`} />
        <Stat label="Guest rating" value={s.avgRating || '-'} hint={`${s.activeBookings} active bookings`} />
        <Stat label="Open requests" value={s.openRequests} />
        <Stat label="Housekeeping tasks" value={s.openTasks} />
        <Stat label="Pending refunds" value={s.pendingRefunds} />
        <div className="col-6 col-lg-3"><div className="stat h-100"><div className="small text-muted mb-1">Room status</div>
          {Object.entries(s.roomStatus).map(([k, v]) => <span key={k} className={`status status-${k} me-1`}>{k} {v}</span>)}</div></div>
      </div>

      {admin && report && (
        <>
          <div className="panel mb-4 d-flex flex-wrap gap-3 align-items-end">
            <div><label className="form-label small mb-1" htmlFor="rf">From</label><input id="rf" type="date" className="form-control form-control-sm" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
            <div><label className="form-label small mb-1" htmlFor="rt">To</label><input id="rt" type="date" className="form-control form-control-sm" value={range.to} min={range.from} max={today()} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
            <div className="ms-auto small">
              <strong>{money(report.totals.netRevenue)}</strong> net · {money(report.totals.refunds)} refunded · {report.totals.bookings} bookings · {report.totals.cancellationRate}% cancelled · {report.totals.avgOccupancy}% avg occupancy
            </div>
          </div>
          <div className="row g-4">
            <div className="col-lg-7">
              <div className="panel"><h2 className="h6">Revenue per day</h2>
                <ResponsiveContainer width="100%" height={260}><LineChart data={report.series}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `${v / 1000}k`} /><Tooltip formatter={fmt} /><Line type="monotone" dataKey="revenue" name="Revenue" stroke="#1f6f78" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
            </div>
            <div className="col-lg-5">
              <div className="panel"><h2 className="h6">Booking status</h2>
                <ResponsiveContainer width="100%" height={260}><PieChart><Pie data={report.byStatus} dataKey="count" nameKey="name" outerRadius={90} label>{report.byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Legend /><Tooltip /></PieChart></ResponsiveContainer></div>
            </div>
            <div className="col-lg-7">
              <div className="panel"><h2 className="h6">Occupancy %</h2>
                <ResponsiveContainer width="100%" height={240}><LineChart data={report.series}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} /><Tooltip /><Line type="monotone" dataKey="occupancy" name="Occupancy %" stroke="#b8893b" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
            </div>
            <div className="col-lg-5">
              <div className="panel"><h2 className="h6">Revenue by room category</h2>
                <ResponsiveContainer width="100%" height={240}><BarChart data={report.byCategory}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `${v / 1000}k`} /><Tooltip formatter={fmt} /><Bar dataKey="revenue" name="Revenue" fill="#1f6f78" /></BarChart></ResponsiveContainer></div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
