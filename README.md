# HotelPro - Hotel Management System (MERN)

HotelPro lets **guests** search and book rooms, pay online and manage their stays, **hotel staff** run check-ins, housekeeping and guest requests, and **administrators** manage hotels, rooms, pricing, users, payments, reports and security.

Built with **MongoDB, Express, React and Node.js**, with JWT authentication, role-based access control, Stripe payments (plus a built-in demo payment mode), PDF invoices, email, and an analytics dashboard.

---

## Quick start

**Requirements:** Node.js 18+ (SRS: 16+), npm 8+, and a MongoDB instance (local, Docker, or MongoDB Atlas).

```bash
# 1. MongoDB (skip if you already have one running)
docker compose up -d

# 2. API
cd server
cp .env.example .env          # then edit JWT_SECRET (and MONGO_URI if not local)
npm install
npm run seed                  # loads demo hotel, rooms, users, bookings, payments
npm run dev                   # http://localhost:5000

# 3. Web app (new terminal)
cd client
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

`npm run seed` **wipes the database** and loads demo data. Do not run it against real data.

### Demo accounts (created by the seed)

| Role | Email | Password |
|---|---|---|
| Admin | admin@hotelpro.com | Admin@123 |
| Front desk (staff) | staff@hotelpro.com | Staff@123 |
| Housekeeping (staff) | housekeeping@hotelpro.com | Staff@123 |
| Guest | guest@hotelpro.com | Guest@123 |

The seed also creates a checked-in guest, an arrival for today, a pending refund request, open service requests, a month of paid stays with reviews, and a seasonal price rule, so every dashboard screen has data.

---

## Features

### Guests
- Register / log in, email verification, profile management, change password, "sign out everywhere"
- Browse and search rooms by dates, guests, category, hotel and price; sort by price or rating; pagination
- Live availability and price quote on the room page; booked-dates list; seasonal pricing applied per night
- Room is **held for 15 minutes** while paying (released automatically by a background job)
- **Online payment**: Stripe Checkout (test mode) or a built-in demo card flow
- Booking history with filters, **PDF invoice download**, cancellation, **refund requests**
- Reviews and star ratings (only after a completed stay, one per booking)
- Service requests (breakfast, laundry, airport pickup...) and customer-support tickets, with staff replies
- In-app **notification centre** with unread badge, email confirmations
- Dark / light theme

### Hotel staff
- Dashboard with arrivals, departures, in-house guests, occupancy
- **Check-in / check-out** with an enforced state machine (a booking cannot be checked in unless paid, or checked out unless checked in)
- Reservation management: search by guest or room, filter, cancel
- Room status updates (available / occupied / cleaning / maintenance); maintenance rooms cannot be booked
- **Housekeeping** tasks (auto-created on check-out; finishing a task frees the room)
- Service-request and support queue with replies and self-assignment

### Admin
- Everything staff can do, plus:
- **Hotels, room categories and rooms** (inventory, pricing, amenities, up to 8 photos per room)
- **Seasonal pricing** rules (per category or all rooms)
- Guest-service catalogue
- **Staff assignment** for housekeeping tasks and requests
- User and staff management (create accounts, change role / department, disable)
- **Payment tracking** and **refund approval / rejection**
- **Reports and analytics**: revenue, occupancy, bookings by status, revenue by category, date-range filter
- Review moderation, **activity log**, security monitoring (failed logins, locked accounts) and system health

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (JSX), Vite, React Router, Redux Toolkit, Axios, Bootstrap 5, Material UI (Rating, Badge), react-toastify, Recharts |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB |
| Auth & security | JWT, bcryptjs, helmet, express-rate-limit, express-validator, express-mongo-sanitize |
| Payments | Stripe (Checkout + server-side verification + webhook), demo mode |
| Other | Multer (uploads), Nodemailer (email), PDFKit (invoices), morgan (request logs) |

---

## Database design (MongoDB collections)

| SRS collection | Implementation |
|---|---|
| Users, Guests, Staff | `users` (one collection, `role` = guest / staff / admin, staff `department`) |
| Hotels | `hotels` |
| Room Categories | `roomcategories` |
| Rooms | `rooms` (linked to hotel and category, images, status, rating) |
| Bookings | `bookings` (linked to user and room) |
| Payments | `payments` (linked to booking; provider, refund state) |
| Reviews | `reviews` |
| Notifications | `notifications` |
| Services | `services` (catalogue) and `servicerequests` (guest requests and support tickets) |
| Check-Ins & Check-Outs | `checklogs` (who checked which guest in or out, and when) |
| Reports | generated on demand with aggregation queries (`/api/reports/*`) |
| Admin Logs | `adminlogs` |
| (extra) | `seasonalprices`, `housekeepingtasks` |

---

## Security

- Passwords hashed with bcrypt; 8+ characters with a letter and a number
- JWT bearer tokens (1 day by default); every token carries a version, so **password change, "sign out everywhere", disabling an account or changing a role revokes existing sessions immediately**
- Role-based access control (guest / staff / admin) on every protected route; registration can only create guests
- Account lockout after 5 failed logins (15 minutes); login rate limiting; global API rate limit
- Input validation (express-validator), HTML stripped from all text input, NoSQL-injection sanitisation, JSON body size limit
- Guest phone numbers encrypted at rest (AES-256-GCM, key from `ENCRYPTION_KEY`)
- Prices are always calculated on the server; payments are verified server-side before a booking is confirmed
- Double-booking is prevented, including simultaneous requests (covered by an automated test)
- helmet security headers, CORS limited to `CLIENT_URL`, upload type and size limits
- Audit log of privileged actions, failed logins and refunds

---

## Payments

- **No keys needed (default):** demo mode. Use card `4242 4242 4242 4242` to succeed or `4000 0000 0000 0002` to see a declined payment. No card data is stored.
- **Stripe test mode:** set `STRIPE_SECRET_KEY=sk_test_...` in `server/.env`. Guests are redirected to Stripe Checkout; on return the server retrieves the session from Stripe and checks amount and booking before confirming. For webhooks set `STRIPE_WEBHOOK_SECRET` and point Stripe to `POST /api/payments/webhook`.
- Cancelling a paid booking creates a **refund request**; an admin approves (refunds through Stripe when applicable) or rejects it with a reason.

## Email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` to send real email (verification, booking confirmation, cancellation, refund, check-in reminder). Without SMTP, messages are written to the server log and new accounts are auto-verified so the project works out of the box.

---

## API overview

All routes are under `/api`. Roles: **P** public, **G** logged in, **S** staff + admin, **A** admin.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` `POST /auth/login` `GET /auth/me` `PUT /auth/profile` `PUT /auth/password` `POST /auth/logout-all` `POST /auth/verify-email` `POST /auth/resend-verification` |
| Rooms | `GET /rooms` (P, search + paging) `GET /rooms/:id` `GET /rooms/:id/quote` `GET /rooms/:id/availability` `GET /rooms/:id/reviews` · S: `GET /rooms/manage/list` `PATCH /rooms/:id/status` · A: `POST/PUT/DELETE /rooms` `POST/DELETE /rooms/:id/images` |
| Hotels, categories | `GET /hotels` `GET /categories` (P) · A: `POST/PUT/DELETE` |
| Seasonal pricing | S: `GET /pricing` · A: `POST/PUT/DELETE /pricing` |
| Bookings | G: `POST /bookings` `GET /bookings/mine` `GET /bookings/:id` `PATCH /bookings/:id/cancel` `GET /bookings/:id/invoice` · S: `GET /bookings` `PATCH /bookings/:id/status` |
| Payments | `GET /payments/config` (P) · G: `POST /payments/checkout` `POST /payments/verify` `POST /payments/demo-pay` · A: `GET /payments` `POST /payments/:id/refund` `POST /payments/:id/refund/reject` · `POST /payments/webhook` (Stripe) |
| Reviews | G: `POST /reviews` · A: `GET /reviews` `PATCH /reviews/:id/visibility` |
| Notifications | G: `GET /notifications` `GET /notifications/unread-count` `PATCH /notifications/read-all` `PATCH /notifications/:id/read` `DELETE /notifications/:id` |
| Services & requests | G: `GET /services` `POST /requests` `GET /requests/mine` · S: `GET /requests` `PATCH /requests/:id` · A: `POST/PUT/DELETE /services` |
| Housekeeping | S: `GET/POST /housekeeping` `PATCH /housekeeping/:id` |
| Reports | S: `GET /reports/summary` · A: `GET /reports/overview` |
| Admin | S: `GET /admin/staff` · A: `GET/POST /admin/users` `PATCH /admin/users/:id` `GET /admin/logs` `GET /admin/security` `GET /admin/health` |
| Health | `GET /health` |

---

## Testing

```bash
cd server
MONGO_URI_TEST=mongodb://127.0.0.1:27017/hotelpro_test npm test
```

**This test run wipes the test database.** It runs 26 end-to-end API tests covering authentication and security, the booking and payment workflow, check-in / check-out, housekeeping, reviews, refunds, requests, reports and the audit log. See [`docs/TESTING.md`](docs/TESTING.md) for the manual UI checklist that matches the SRS test areas.

---

## Project structure

```
hotelpro/
├── server/
│   ├── app.js / server.js      Express app and bootstrap
│   ├── config/                 database connection
│   ├── middleware/             auth, validation, sanitising, rate limits, uploads, errors
│   ├── models/                 14 Mongoose models
│   ├── routes/                 REST routes by area
│   ├── utils/                  pricing, payments, email, invoice PDF, notifications, audit, crypto
│   ├── jobs/                   background jobs (release expired holds, check-in reminders)
│   ├── tests/                  API tests
│   └── seed.js                 demo data
├── client/
│   └── src/
│       ├── store/              Redux Toolkit (auth, notifications)
│       ├── components/         navbar, pagination, modal, shared UI
│       └── pages/              guest pages and pages/dashboard/ (staff + admin)
└── docs/TESTING.md
```

## Performance and deployment notes

- **Implemented:** MongoDB indexes on every hot query, aggregation pipelines for reports, server-side pagination, lazy-loaded routes (code splitting), lazy-loaded images, gzip compression, request logging, error log file, background job processing, health endpoints.
- **Not implemented (listed as optional in the SRS):** Redis caching, CDN, load balancer, microservices. The app is stateless (JWT, uploads aside), so it can run behind a load balancer; for multiple servers move `server/uploads` to object storage (S3 / Cloudinary) in `middleware/upload.js`.
- **Production checklist:** set `NODE_ENV=production`, a strong `JWT_SECRET` (32+ chars) and `ENCRYPTION_KEY`, `CLIENT_URL` to your site, `DEMO_PAYMENTS=false`, real Stripe and SMTP credentials, and serve over HTTPS.

## Known limitations

- The Stripe and SMTP code paths could not be exercised against live services in development; they follow the official APIs and the demo/log fallbacks are tested. Try them with Stripe test keys before relying on them.
- "Real-time" availability is implemented by refreshing every 30 seconds and on tab focus (no WebSockets).
- Room images are stored on local disk.
