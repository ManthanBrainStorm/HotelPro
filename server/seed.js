// Run once:  npm run seed      (WARNING: wipes every collection and loads demo data)
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Hotel = require('./models/Hotel');
const RoomCategory = require('./models/RoomCategory');
const Room = require('./models/Room');
const SeasonalPrice = require('./models/SeasonalPrice');
const Booking = require('./models/Booking');
const Payment = require('./models/Payment');
const Review = require('./models/Review');
const Notification = require('./models/Notification');
const Service = require('./models/Service');
const ServiceRequest = require('./models/ServiceRequest');
const HousekeepingTask = require('./models/HousekeepingTask');
const CheckLog = require('./models/CheckLog');
const AdminLog = require('./models/AdminLog');
const { todayUTC, DAY, quote } = require('./utils/pricing');

const addDays = (d, n) => new Date(d.getTime() + n * DAY);

(async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set (see .env.example)');
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to wipe data in production');
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([
    User, Hotel, RoomCategory, Room, SeasonalPrice, Booking, Payment, Review, Notification,
    Service, ServiceRequest, HousekeepingTask, CheckLog, AdminLog,
  ].map((m) => m.deleteMany()));

  const today = todayUTC();

  // ---- Users ----
  const admin = await User.create({ name: 'Admin', email: 'admin@hotelpro.com', password: 'Admin@123', role: 'admin', department: 'management', emailVerified: true, phone: '+91 98765 00001' });
  const front = await User.create({ name: 'Front Desk', email: 'staff@hotelpro.com', password: 'Staff@123', role: 'staff', department: 'front-desk', emailVerified: true });
  const keeper = await User.create({ name: 'House Keeper', email: 'housekeeping@hotelpro.com', password: 'Staff@123', role: 'staff', department: 'housekeeping', emailVerified: true });
  const guests = await User.create([
    { name: 'Demo Guest', email: 'guest@hotelpro.com', password: 'Guest@123', emailVerified: true, phone: '+91 98765 00002' },
    { name: 'Aarav Mehta', email: 'aarav@example.com', password: 'Guest@123', emailVerified: true },
    { name: 'Priya Sharma', email: 'priya@example.com', password: 'Guest@123', emailVerified: true },
    { name: 'Rohan Verma', email: 'rohan@example.com', password: 'Guest@123', emailVerified: true },
  ]);
  const [demo] = guests;

  // ---- Hotel, categories, rooms ----
  const hotel = await Hotel.create({
    name: 'HotelPro Grand', address: '12 Palasia Square', city: 'Indore', phone: '+91 731 400 0000', email: 'stay@hotelpro.com',
    description: 'A modern city hotel with comfortable rooms and a quiet garden.',
  });
  const cats = await RoomCategory.create([
    { name: 'Single', description: 'One bed, ideal for solo travellers.' },
    { name: 'Double', description: 'Queen bed for two.' },
    { name: 'Deluxe', description: 'Spacious room with a balcony.' },
    { name: 'Suite', description: 'Separate lounge and premium amenities.' },
  ]);
  const [single, double, deluxe, suite] = cats;
  const roomSpecs = [
    ['101', single, 1800, 1, ['Wi-Fi', 'AC', 'Desk']], ['102', single, 1900, 1, ['Wi-Fi', 'AC', 'Desk']],
    ['103', double, 2800, 2, ['Wi-Fi', 'AC', 'TV']], ['104', double, 3000, 2, ['Wi-Fi', 'AC', 'TV', 'Garden view']],
    ['201', deluxe, 4200, 3, ['Wi-Fi', 'AC', 'Mini bar', 'Balcony']], ['202', deluxe, 4400, 3, ['Wi-Fi', 'AC', 'Mini bar', 'Balcony']],
    ['301', suite, 7500, 4, ['Wi-Fi', 'AC', 'Mini bar', 'Lounge', 'Bathtub']], ['302', suite, 8200, 4, ['Wi-Fi', 'AC', 'Mini bar', 'Lounge', 'Bathtub', 'City view']],
  ];
  const rooms = await Room.create(roomSpecs.map(([number, category, pricePerNight, capacity, amenities]) => ({
    hotel: hotel._id, category: category._id, number, pricePerNight, capacity, amenities,
    description: `${category.name} room ${number}. ${category.description}`,
  })));

  await Service.create([
    { name: 'Breakfast in room', description: 'Continental breakfast for two', price: 600 },
    { name: 'Laundry', description: 'Same-day wash and press', price: 350 },
    { name: 'Airport pickup', description: 'Private cab from the airport', price: 1500 },
    { name: 'Spa session', description: '60 minute massage', price: 2500 },
    { name: 'Extra bed', description: 'Rollaway bed added to your room', price: 800 },
  ]);

  const rules = await SeasonalPrice.create([
    { name: 'Festive season', startDate: addDays(today, 20), endDate: addDays(today, 30), multiplier: 1.3 },
    { name: 'Monsoon offer (Single rooms)', startDate: addDays(today, -40), endDate: addDays(today, 10), multiplier: 0.9, category: single._id },
  ]);

  // ---- Bookings (with payments) ----
  let invoiceSeq = 100000;
  const ym = today.toISOString().slice(0, 7).replace('-', '');
  async function makeBooking(user, room, inOffset, nights, { status = 'checked-out', payStatus = 'paid' } = {}) {
    const checkIn = addDays(today, inOffset);
    const checkOut = addDays(checkIn, nights);
    const q = quote(room, checkIn, checkOut, rules);
    const paid = ['paid', 'refund_requested', 'refunded'].includes(payStatus);
    const booking = await Booking.create({
      user: user._id, room: room._id, checkIn, checkOut, guests: Math.min(room.capacity, 2), nights: q.nights, totalPrice: q.total,
      status, paymentStatus: payStatus, invoiceNumber: paid ? `INV-${ym}-${invoiceSeq++}` : undefined,
      cancelledAt: status === 'cancelled' ? addDays(today, -1) : undefined, reminderSent: inOffset < 2,
    });
    if (paid) {
      const paidAt = addDays(checkIn, -3 - (invoiceSeq % 4));
      await Payment.create({
        booking: booking._id, user: user._id, amount: q.total, currency: 'inr', provider: 'demo', status: payStatus,
        cardLast4: '4242', paidAt: paidAt < today ? paidAt : today, providerSessionId: `demo_seed_${invoiceSeq}`,
        refundRequestedAt: payStatus !== 'paid' ? addDays(today, -1) : undefined,
        refundedAt: payStatus === 'refunded' ? today : undefined, refundId: payStatus === 'refunded' ? 'demo_re_seed' : undefined,
      });
    }
    return booking;
  }

  // Past stays spread over the last month so the reports have something to show.
  const comments = ['Spotless room and friendly staff.', 'Great location, comfortable bed.', 'Good value. Breakfast could be better.', 'Loved the balcony!', 'Quiet and clean. Would stay again.'];
  for (let i = 0; i < 22; i += 1) {
    const room = rooms[i % rooms.length];
    const user = guests[i % guests.length];
    const nights = 1 + (i % 3);
    const b = await makeBooking(user, room, -30 + Math.floor(i * 1.25), nights);
    if (i % 2 === 0) {
      await Review.create({ booking: b._id, user: user._id, room: room._id, rating: 3 + (i % 3), comment: comments[i % comments.length] });
    }
  }
  for (const room of rooms) {
    const rs = await Review.find({ room: room._id }).select('rating');
    if (rs.length) {
      await Room.findByIdAndUpdate(room._id, { ratingAvg: Math.round((rs.reduce((t, r) => t + r.rating, 0) / rs.length) * 10) / 10, ratingCount: rs.length });
    }
  }

  // Right now: one guest in-house, one arriving today, one confirmed for next week, refund examples.
  const inHouseRoom = rooms[4]; // 201
  const inHouse = await makeBooking(demo, inHouseRoom, -1, 3, { status: 'checked-in' });
  await Room.findByIdAndUpdate(inHouseRoom._id, { status: 'occupied' });
  await CheckLog.create({ booking: inHouse._id, room: inHouseRoom._id, guest: demo._id, staff: front._id, type: 'check-in' });
  await makeBooking(guests[1], rooms[2], 0, 2, { status: 'confirmed' });
  await makeBooking(demo, rooms[6], 7, 2, { status: 'confirmed' });
  await makeBooking(guests[2], rooms[1], 3, 2, { status: 'cancelled', payStatus: 'refund_requested' });
  await makeBooking(guests[3], rooms[5], 5, 1, { status: 'cancelled', payStatus: 'refunded' });

  // Housekeeping: one room being cleaned, one done task
  await Room.findByIdAndUpdate(rooms[3]._id, { status: 'cleaning' });
  await HousekeepingTask.create({ room: rooms[3]._id, type: 'cleaning', status: 'pending', assignedTo: keeper._id, createdBy: front._id, notes: 'Turnover after check-out' });
  await HousekeepingTask.create({ room: rooms[0]._id, type: 'inspection', status: 'done', assignedTo: keeper._id, createdBy: admin._id, completedAt: addDays(today, -1) });

  await ServiceRequest.create({ booking: inHouse._id, user: demo._id, room: inHouseRoom._id, type: 'service', subject: 'Laundry', message: 'Three shirts, please.' });
  await ServiceRequest.create({ booking: inHouse._id, user: demo._id, room: inHouseRoom._id, type: 'support', subject: 'Wi-Fi is slow', message: 'Could someone check the router?', status: 'in-progress', assignedTo: front._id });

  await Notification.create([
    { user: demo._id, type: 'booking', title: 'Booking confirmed', message: 'Room 301 is booked for next week.', link: '/my-bookings' },
    { user: demo._id, type: 'stay', title: 'Welcome!', message: `You are checked in to room ${inHouseRoom.number}.`, link: '/my-bookings' },
    { user: front._id, type: 'request', title: 'New service request', message: 'Laundry', link: '/admin' },
    { user: admin._id, type: 'payment', title: 'Refund request pending', message: 'A cancelled booking is waiting for review.', link: '/admin' },
  ]);
  await AdminLog.create([
    { actor: admin._id, actorEmail: admin.email, actorRole: 'admin', action: 'login', entity: 'user', entityId: String(admin._id), ip: '127.0.0.1' },
    { actorEmail: 'unknown@example.com', action: 'login_failed', entity: 'user', details: { email: 'unknown@example.com' }, ip: '203.0.113.7' },
    { actor: admin._id, actorEmail: admin.email, actorRole: 'admin', action: 'seasonal_price_created', entity: 'pricing', details: { name: 'Festive season', multiplier: 1.3 }, ip: '127.0.0.1' },
  ]);

  console.log('Seeded demo data.');
  console.log('  Admin:        admin@hotelpro.com        / Admin@123');
  console.log('  Front desk:   staff@hotelpro.com        / Staff@123');
  console.log('  Housekeeping: housekeeping@hotelpro.com / Staff@123');
  console.log('  Guest:        guest@hotelpro.com        / Guest@123');
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
