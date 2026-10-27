// Dates are handled as whole days in UTC ("YYYY-MM-DD" -> midnight UTC) so results
// do not depend on the server's time zone.
const SeasonalPrice = require('../models/SeasonalPrice');

const DAY = 24 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

exports.DAY = DAY;

exports.parseDay = (value) => {
  if (typeof value !== 'string' || !DAY_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

exports.todayUTC = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};

exports.nightsBetween = (a, b) => Math.round((b - a) / DAY);

exports.loadRules = (from, to) =>
  SeasonalPrice.find({ isActive: true, startDate: { $lte: to }, endDate: { $gte: from } }).lean();

// Price a stay night by night. When several seasonal rules cover a night, the highest multiplier wins.
exports.quote = (room, checkIn, checkOut, rules = []) => {
  const nights = exports.nightsBetween(checkIn, checkOut);
  const categoryId = String(room.category?._id || room.category || '');
  const breakdown = [];
  let total = 0;
  for (let i = 0; i < nights; i += 1) {
    const day = new Date(checkIn.getTime() + i * DAY);
    const hits = rules.filter(
      (r) => day >= r.startDate && day <= r.endDate && (!r.category || String(r.category) === categoryId)
    );
    const best = hits.reduce((m, r) => (r.multiplier > (m?.multiplier || 0) ? r : m), null);
    const price = Math.round(room.pricePerNight * (best ? best.multiplier : 1));
    total += price;
    breakdown.push({ date: day.toISOString().slice(0, 10), price, season: best ? best.name : null });
  }
  return {
    nights,
    total,
    avgPerNight: nights ? Math.round(total / nights) : 0,
    seasonal: breakdown.some((b) => b.season),
    breakdown,
  };
};
