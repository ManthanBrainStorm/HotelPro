// End-to-end API tests. Run with:  npm test
// Needs a MongoDB instance. Uses MONGO_URI_TEST (default: mongodb://127.0.0.1:27017/hotelpro_test) and WIPES that database.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.DEMO_PAYMENTS = 'true';
delete process.env.STRIPE_SECRET_KEY;
delete process.env.SMTP_HOST;

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const app = require('../app');
const User = require('../models/User');
const Hotel = require('../models/Hotel');
const RoomCategory = require('../models/RoomCategory');
const jobs = require('../jobs');

let server; let base;
const DAY = 86400000;
const iso = (offset) => new Date(Math.floor(Date.now() / DAY) * DAY + offset * DAY).toISOString().slice(0, 10);

async function call(method, path, { token, body, raw } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

const ctx = {};

before(async () => {
  await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/hotelpro_test');
  await mongoose.connection.dropDatabase();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  await User.create({ name: 'Admin', email: 'admin@test.com', password: 'Admin@123', role: 'admin', emailVerified: true });
  const login = await call('POST', '/auth/login', { body: { email: 'admin@test.com', password: 'Admin@123' } });
  ctx.admin = login.data.token;
  ctx.hotel = await Hotel.create({ name: 'Test Hotel' });
  ctx.cat = await RoomCategory.create({ name: 'Deluxe' });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  server.close();
});

describe('Authentication & security', () => {
  test('rejects weak passwords and invalid emails', async () => {
    const weak = await call('POST', '/auth/register', { body: { name: 'Weak', email: 'weak@test.com', password: 'abc' } });
    assert.equal(weak.status, 400);
    const badEmail = await call('POST', '/auth/register', { body: { name: 'Weak', email: 'nope', password: 'Passw0rd!' } });
    assert.equal(badEmail.status, 400);
  });

  test('registers a guest, ignores a role in the body, blocks duplicates', async () => {
    const r = await call('POST', '/auth/register', { body: { name: 'Gina Guest', email: 'gina@test.com', password: 'Guest@123', phone: '+91 98765 43210', role: 'admin' } });
    assert.equal(r.status, 201);
    assert.equal(r.data.user.role, 'guest');
    ctx.guest = r.data.token;
    ctx.guestId = r.data.user.id;
    const dup = await call('POST', '/auth/register', { body: { name: 'Gina Again', email: 'gina@test.com', password: 'Guest@123' } });
    assert.equal(dup.status, 409);
  });

  test('phone numbers are encrypted at rest but returned in clear text', async () => {
    const raw = await mongoose.connection.collection('users').findOne({ email: 'gina@test.com' });
    assert.ok(raw.phone.startsWith('enc:'));
    const me = await call('GET', '/auth/me', { token: ctx.guest });
    assert.equal(me.data.user.phone, '+91 98765 43210');
  });

  test('login: wrong password 401, NoSQL injection rejected, protected routes need a token', async () => {
    assert.equal((await call('POST', '/auth/login', { body: { email: 'gina@test.com', password: 'Wrong@123' } })).status, 401);
    assert.equal((await call('POST', '/auth/login', { body: { email: { $gt: '' }, password: { $gt: '' } } })).status, 400);
    assert.equal((await call('GET', '/auth/me')).status, 401);
    assert.equal((await call('GET', '/bookings', { token: ctx.guest })).status, 403);
    assert.equal((await call('GET', '/admin/users', { token: ctx.guest })).status, 403);
  });

  test('account locks after repeated failed logins and failures are audited', async () => {
    await call('POST', '/auth/register', { body: { name: 'Lock Me', email: 'lock@test.com', password: 'Guest@123' } });
    for (let i = 0; i < 5; i += 1) await call('POST', '/auth/login', { body: { email: 'lock@test.com', password: 'Nope@1234' } });
    const locked = await call('POST', '/auth/login', { body: { email: 'lock@test.com', password: 'Guest@123' } });
    assert.equal(locked.status, 423);
    const sec = await call('GET', '/admin/security', { token: ctx.admin });
    assert.ok(sec.data.failed24h >= 5);
    assert.equal(sec.data.lockedAccounts, 1);
  });

  test('changing the password signs out older tokens', async () => {
    const reg = await call('POST', '/auth/register', { body: { name: 'Pat', email: 'pat@test.com', password: 'Guest@123' } });
    const old = reg.data.token;
    const change = await call('PUT', '/auth/password', { token: old, body: { currentPassword: 'Guest@123', newPassword: 'Newpass@456' } });
    assert.equal(change.status, 200);
    assert.equal((await call('GET', '/auth/me', { token: old })).status, 401);
    assert.equal((await call('GET', '/auth/me', { token: change.data.token })).status, 200);
  });
});

describe('Admin setup: staff, rooms, pricing', () => {
  test('admin creates a staff account; staff can log in', async () => {
    const r = await call('POST', '/admin/users', { token: ctx.admin, body: { name: 'Front Desk', email: 'staff@test.com', password: 'Staff@123', role: 'staff', department: 'front-desk' } });
    assert.equal(r.status, 201);
    ctx.staffId = r.data._id;
    const login = await call('POST', '/auth/login', { body: { email: 'staff@test.com', password: 'Staff@123' } });
    ctx.staff = login.data.token;
    assert.ok(ctx.staff);
  });

  test('only admins manage rooms; validation applies', async () => {
    const body = { hotel: String(ctx.hotel._id), category: String(ctx.cat._id), number: '201', pricePerNight: 4000, capacity: 2, amenities: ['Wi-Fi'] };
    assert.equal((await call('POST', '/rooms', { token: ctx.staff, body })).status, 403);
    assert.equal((await call('POST', '/rooms', { token: ctx.admin, body: { ...body, pricePerNight: -5 } })).status, 400);
    const r = await call('POST', '/rooms', { token: ctx.admin, body });
    assert.equal(r.status, 201);
    ctx.room = r.data._id;
    const dupe = await call('POST', '/rooms', { token: ctx.admin, body });
    assert.equal(dupe.status, 409);
    const second = await call('POST', '/rooms', { token: ctx.admin, body: { ...body, number: '202' } });
    ctx.room2 = second.data._id;
  });

  test('search lists rooms with paging; seasonal pricing changes the quote', async () => {
    const list = await call('GET', `/rooms?checkIn=${iso(10)}&checkOut=${iso(12)}&guests=2`);
    assert.equal(list.status, 200);
    assert.equal(list.data.total, 2);
    assert.equal(list.data.rooms[0].quote.total, 8000);

    const rule = await call('POST', '/pricing', { token: ctx.admin, body: { name: 'Peak', startDate: iso(10), endDate: iso(10), multiplier: 1.5 } });
    assert.equal(rule.status, 201);
    const q = await call('GET', `/rooms/${ctx.room}/quote?checkIn=${iso(10)}&checkOut=${iso(12)}&guests=2`);
    assert.equal(q.data.available, true);
    assert.equal(q.data.total, 6000 + 4000);
    assert.equal(q.data.seasonal, true);
    await call('DELETE', `/pricing/${rule.data._id}`, { token: ctx.admin });
  });
});

describe('Booking, payment and stay workflow', () => {
  test('booking validation: past dates, bad range, capacity', async () => {
    const mk = (over) => call('POST', '/bookings', { token: ctx.guest, body: { roomId: ctx.room, checkIn: iso(5), checkOut: iso(7), guests: 2, ...over } });
    assert.equal((await mk({ checkIn: iso(-2), checkOut: iso(1) })).status, 400);
    assert.equal((await mk({ checkOut: iso(5) })).status, 400);
    assert.equal((await mk({ guests: 5 })).status, 400);
    assert.equal((await mk({ checkIn: 'tomorrow' })).status, 400);
  });

  test('creates a held booking, strips HTML, and prevents double booking', async () => {
    const r = await call('POST', '/bookings', { token: ctx.guest, body: { roomId: ctx.room, checkIn: iso(5), checkOut: iso(7), guests: 2, specialRequests: 'Late arrival <script>alert(1)</script>' } });
    assert.equal(r.status, 201);
    assert.equal(r.data.status, 'pending');
    assert.equal(r.data.totalPrice, 8000);
    assert.ok(!r.data.specialRequests.includes('<script>'));
    ctx.booking = r.data._id;

    const other = await call('POST', '/auth/register', { body: { name: 'Other', email: 'other@test.com', password: 'Guest@123' } });
    const clash = await call('POST', '/bookings', { token: other.data.token, body: { roomId: ctx.room, checkIn: iso(6), checkOut: iso(8), guests: 1 } });
    assert.equal(clash.status, 409);

    const avail = await call('GET', `/rooms/${ctx.room}/quote?checkIn=${iso(6)}&checkOut=${iso(8)}`);
    assert.equal(avail.data.available, false);
  });

  test('concurrent requests for the same room: exactly one wins', async () => {
    const tokens = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await call('POST', '/auth/register', { body: { name: `Racer ${i}`, email: `racer${i}@test.com`, password: 'Guest@123' } });
      tokens.push(r.data.token);
    }
    const results = await Promise.all(tokens.map((token) => call('POST', '/bookings', { token, body: { roomId: ctx.room2, checkIn: iso(20), checkOut: iso(22), guests: 1 } })));
    const wins = results.filter((r) => r.status === 201).length;
    assert.equal(wins, 1, `expected 1 winner, got ${results.map((r) => r.status)}`);
  });

  test('a pending booking cannot be checked in; unpaid invoice is unavailable', async () => {
    assert.equal((await call('PATCH', `/bookings/${ctx.booking}/status`, { token: ctx.staff, body: { status: 'checked-in' } })).status, 409);
    assert.equal((await call('GET', `/bookings/${ctx.booking}/invoice`, { token: ctx.guest })).status, 404);
  });

  test('payments: config, declined card, successful card, and cannot pay twice', async () => {
    assert.equal((await call('GET', '/payments/config')).data.provider, 'demo');
    assert.equal((await call('POST', '/payments/checkout', { token: ctx.guest, body: { bookingId: ctx.booking } })).data.provider, 'demo');
    const declined = await call('POST', '/payments/demo-pay', { token: ctx.guest, body: { bookingId: ctx.booking, cardNumber: '4000 0000 0000 0002' } });
    assert.equal(declined.status, 402);
    const ok = await call('POST', '/payments/demo-pay', { token: ctx.guest, body: { bookingId: ctx.booking, cardNumber: '4242 4242 4242 4242' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.booking.status, 'confirmed');
    assert.equal(ok.data.booking.paymentStatus, 'paid');
    assert.match(ok.data.booking.invoiceNumber, /^INV-\d{6}-\d{6}$/);
    assert.equal((await call('POST', '/payments/demo-pay', { token: ctx.guest, body: { bookingId: ctx.booking, cardNumber: '4242424242424242' } })).status, 409);
  });

  test('invoice downloads as a PDF for the owner only', async () => {
    const res = await call('GET', `/bookings/${ctx.booking}/invoice`, { token: ctx.guest, raw: true });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 4).toString(), '%PDF');
    const stranger = await call('POST', '/auth/register', { body: { name: 'Stranger', email: 'stranger@test.com', password: 'Guest@123' } });
    assert.equal((await call('GET', `/bookings/${ctx.booking}/invoice`, { token: stranger.data.token })).status, 403);
  });

  test('guest is notified of the confirmation', async () => {
    const n = await call('GET', '/notifications', { token: ctx.guest });
    assert.ok(n.data.items.some((i) => i.title === 'Booking confirmed'));
    assert.ok(n.data.unread >= 1);
    await call('PATCH', '/notifications/read-all', { token: ctx.guest });
    assert.equal((await call('GET', '/notifications/unread-count', { token: ctx.guest })).data.unread, 0);
  });

  test('staff: invalid transitions rejected, check-in then check-out update room and housekeeping', async () => {
    const out = await call('PATCH', `/bookings/${ctx.booking}/status`, { token: ctx.staff, body: { status: 'checked-out' } });
    assert.equal(out.status, 409);
    const inn = await call('PATCH', `/bookings/${ctx.booking}/status`, { token: ctx.staff, body: { status: 'checked-in' } });
    assert.equal(inn.status, 200);
    let rooms = await call('GET', '/rooms/manage/list', { token: ctx.staff });
    assert.equal(rooms.data.find((r) => r._id === ctx.room).status, 'occupied');

    // Cannot cancel an in-house booking, and cannot review before the stay ends
    assert.equal((await call('PATCH', `/bookings/${ctx.booking}/cancel`, { token: ctx.guest })).status, 400);
    assert.equal((await call('POST', '/reviews', { token: ctx.guest, body: { bookingId: ctx.booking, rating: 5 } })).status, 409);

    assert.equal((await call('PATCH', `/bookings/${ctx.booking}/status`, { token: ctx.staff, body: { status: 'checked-out' } })).status, 200);
    rooms = await call('GET', '/rooms/manage/list', { token: ctx.staff });
    assert.equal(rooms.data.find((r) => r._id === ctx.room).status, 'cleaning');
    const tasks = await call('GET', '/housekeeping?status=pending', { token: ctx.staff });
    assert.equal(tasks.data.tasks.length, 1);
    ctx.task = tasks.data.tasks[0]._id;
  });

  test('housekeeping: staff completes the task and the room becomes available again', async () => {
    const done = await call('PATCH', `/housekeeping/${ctx.task}`, { token: ctx.staff, body: { status: 'done' } });
    assert.equal(done.status, 200);
    const rooms = await call('GET', '/rooms/manage/list', { token: ctx.staff });
    assert.equal(rooms.data.find((r) => r._id === ctx.room).status, 'available');
  });

  test('reviews: one per completed stay, updates the room rating, admin can hide', async () => {
    const r = await call('POST', '/reviews', { token: ctx.guest, body: { bookingId: ctx.booking, rating: 4, comment: 'Lovely <b>stay</b>' } });
    assert.equal(r.status, 201);
    assert.equal(r.data.comment, 'Lovely stay');
    assert.equal((await call('POST', '/reviews', { token: ctx.guest, body: { bookingId: ctx.booking, rating: 5 } })).status, 409);
    assert.equal((await call('POST', '/reviews', { token: ctx.guest, body: { bookingId: ctx.booking, rating: 9 } })).status, 400);

    let room = await call('GET', `/rooms/${ctx.room}`);
    assert.equal(room.data.ratingAvg, 4);
    assert.equal(room.data.ratingCount, 1);
    const pub = await call('GET', `/rooms/${ctx.room}/reviews`);
    assert.equal(pub.data.reviews[0].guest, 'Gina G.');

    await call('PATCH', `/reviews/${r.data._id}/visibility`, { token: ctx.admin, body: { isVisible: false } });
    room = await call('GET', `/rooms/${ctx.room}`);
    assert.equal(room.data.ratingCount, 0);
  });
});

describe('Cancellation and refunds', () => {
  test('cancelling a paid booking creates a refund request that only an admin can approve', async () => {
    const b = await call('POST', '/bookings', { token: ctx.guest, body: { roomId: ctx.room, checkIn: iso(30), checkOut: iso(32), guests: 2 } });
    await call('POST', '/payments/demo-pay', { token: ctx.guest, body: { bookingId: b.data._id, cardNumber: '4242424242424242' } });

    const cancel = await call('PATCH', `/bookings/${b.data._id}/cancel`, { token: ctx.guest });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.data.status, 'cancelled');
    assert.equal(cancel.data.paymentStatus, 'refund_requested');

    // dates are free again
    assert.equal((await call('GET', `/rooms/${ctx.room}/quote?checkIn=${iso(30)}&checkOut=${iso(32)}`)).data.available, true);

    const list = await call('GET', '/payments?status=refund_requested', { token: ctx.admin });
    assert.equal(list.data.payments.length, 1);
    const pid = list.data.payments[0]._id;
    assert.equal((await call('POST', `/payments/${pid}/refund`, { token: ctx.guest })).status, 403);
    assert.equal((await call('POST', `/payments/${pid}/refund`, { token: ctx.staff })).status, 403);
    const refund = await call('POST', `/payments/${pid}/refund`, { token: ctx.admin });
    assert.equal(refund.status, 200);
    assert.equal(refund.data.status, 'refunded');
    assert.equal((await call('POST', `/payments/${pid}/refund`, { token: ctx.admin })).status, 409);

    const mine = await call('GET', '/bookings/mine', { token: ctx.guest });
    assert.equal(mine.data.bookings.find((x) => x._id === b.data._id).paymentStatus, 'refunded');
  });

  test('refund can be rejected with a reason', async () => {
    const b = await call('POST', '/bookings', { token: ctx.guest, body: { roomId: ctx.room, checkIn: iso(40), checkOut: iso(41), guests: 1 } });
    await call('POST', '/payments/demo-pay', { token: ctx.guest, body: { bookingId: b.data._id, cardNumber: '4242424242424242' } });
    await call('PATCH', `/bookings/${b.data._id}/cancel`, { token: ctx.staff });
    const pid = (await call('GET', '/payments?status=refund_requested', { token: ctx.admin })).data.payments[0]._id;
    const rej = await call('POST', `/payments/${pid}/refund/reject`, { token: ctx.admin, body: { reason: 'Late cancellation' } });
    assert.equal(rej.data.status, 'refund_rejected');
  });

  test('unpaid held bookings are released by the background job', async () => {
    const b = await call('POST', '/bookings', { token: ctx.guest, body: { roomId: ctx.room2, checkIn: iso(50), checkOut: iso(51), guests: 1 } });
    await mongoose.connection.collection('bookings').updateOne({ _id: new mongoose.Types.ObjectId(b.data._id) }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await call('GET', `/rooms/${ctx.room2}/quote?checkIn=${iso(50)}&checkOut=${iso(51)}`)).data.available, true);
    assert.equal(await jobs.expirePendingBookings(), 1);
    const pay = await call('POST', '/payments/demo-pay', { token: ctx.guest, body: { bookingId: b.data._id, cardNumber: '4242424242424242' } });
    assert.equal(pay.status, 409);
  });
});

describe('Guest services, support and reports', () => {
  test('in-house guest raises a service request and a support ticket; staff handles them', async () => {
    const b = await call('POST', '/bookings', { token: ctx.guest, body: { roomId: ctx.room, checkIn: iso(0), checkOut: iso(2), guests: 1 } });
    await call('POST', '/payments/demo-pay', { token: ctx.guest, body: { bookingId: b.data._id, cardNumber: '4242424242424242' } });
    await call('PATCH', `/bookings/${b.data._id}/status`, { token: ctx.staff, body: { status: 'checked-in' } });

    const svc = await call('POST', '/services', { token: ctx.admin, body: { name: 'Laundry', price: 300 } });
    assert.equal(svc.status, 201);
    assert.equal((await call('POST', '/requests', { token: ctx.guest, body: { bookingId: b.data._id, type: 'service' } })).status, 400);
    const sr = await call('POST', '/requests', { token: ctx.guest, body: { bookingId: b.data._id, type: 'service', serviceId: svc.data._id, message: '3 shirts' } });
    assert.equal(sr.status, 201);
    const ticket = await call('POST', '/requests', { token: ctx.guest, body: { bookingId: b.data._id, type: 'support', subject: 'AC is noisy' } });
    assert.equal(ticket.status, 201);

    const queue = await call('GET', '/requests?status=open', { token: ctx.staff });
    assert.equal(queue.data.requests.length, 2);
    const upd = await call('PATCH', `/requests/${ticket.data._id}`, { token: ctx.staff, body: { status: 'resolved', response: 'Technician sent' } });
    assert.equal(upd.data.status, 'resolved');
    const mine = await call('GET', '/notifications', { token: ctx.guest });
    assert.ok(mine.data.items.some((n) => n.message === 'Technician sent'));

    // staff may not assign work to someone else (admin only)
    const adminId = (await call('GET', '/auth/me', { token: ctx.admin })).data.user.id;
    assert.equal((await call('PATCH', `/requests/${sr.data._id}`, { token: ctx.staff, body: { assignedTo: adminId } })).status, 403);
    assert.equal((await call('PATCH', `/requests/${sr.data._id}`, { token: ctx.admin, body: { assignedTo: ctx.staffId } })).status, 200);
  });

  test('staff dashboard summary works; analytics are admin-only', async () => {
    const s = await call('GET', '/reports/summary', { token: ctx.staff });
    assert.equal(s.status, 200);
    assert.equal(s.data.rooms, 2);
    assert.equal(s.data.occupiedRooms, 1);
    assert.ok(s.data.revenue > 0);
    assert.equal((await call('GET', '/reports/overview', { token: ctx.staff })).status, 403);
    const o = await call('GET', `/reports/overview?from=${iso(-5)}&to=${iso(5)}`, { token: ctx.admin });
    assert.equal(o.status, 200);
    assert.equal(o.data.series.length, 11);
    assert.ok(o.data.totals.grossRevenue > 0);
    assert.equal((await call('GET', '/reports/overview?from=2020-01-01&to=2026-01-01', { token: ctx.admin })).status, 400);
  });

  test('audit log records admin actions; health endpoint reports status', async () => {
    const logs = await call('GET', '/admin/logs?action=refund_approved', { token: ctx.admin });
    assert.ok(logs.data.logs.length >= 1);
    const health = await call('GET', '/admin/health', { token: ctx.admin });
    assert.equal(health.data.status, 'ok');
    assert.equal(health.data.database.state, 'connected');
    assert.equal((await call('GET', '/health')).status, 200);
  });

  test('disabling a user ends their session immediately; admins cannot disable themselves', async () => {
    const adminId = (await call('GET', '/auth/me', { token: ctx.admin })).data.user.id;
    assert.equal((await call('PATCH', `/admin/users/${adminId}`, { token: ctx.admin, body: { isActive: false } })).status, 400);
    const off = await call('PATCH', `/admin/users/${ctx.guestId}`, { token: ctx.admin, body: { isActive: false } });
    assert.equal(off.status, 200);
    assert.equal((await call('GET', '/auth/me', { token: ctx.guest })).status, 401);
    assert.equal((await call('POST', '/auth/login', { body: { email: 'gina@test.com', password: 'Guest@123' } })).status, 403);
  });
});
