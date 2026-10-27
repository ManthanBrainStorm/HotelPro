# Testing guide

## Automated API tests

```bash
cd server
MONGO_URI_TEST=mongodb://127.0.0.1:27017/hotelpro_test npm test
```

The suite wipes the test database and runs 26 tests:

| SRS area | What is verified |
|---|---|
| Authentication | weak password and bad email rejected, role in request body ignored, duplicate email, wrong password, NoSQL-injection payload rejected, token required, role checks (403), account lockout, password change revokes old tokens, phone encrypted at rest |
| Booking workflow | past dates / invalid ranges / capacity rejected, HTML stripped from special requests, double booking blocked, **simultaneous requests: exactly one wins**, seasonal pricing in the quote |
| Payment | declined card, successful card, invoice number, cannot pay twice, PDF invoice only for the owner |
| Hotel operations | invalid check-in/out transitions rejected, room status and housekeeping task created on check-out, finishing the task frees the room |
| Reviews | only after check-out, one per booking, rating recalculated, hide by admin |
| Refunds | cancel creates a refund request, only an admin approves, reject with reason, expired holds released by the job |
| Admin | staff creation, room CRUD permissions, reports (staff vs admin), audit log, health, disabling a user ends their session |

## Manual UI checklist

Seed first (`npm run seed`). Tick each item.

**Authentication**
- [ ] Register with a weak password: error shown. Register properly: logged in.
- [ ] Log in / log out. Wrong password shows an error. After 5 wrong attempts the account is locked.
- [ ] Open `/admin` as a guest: redirected home.
- [ ] Profile: change name, change password. A second browser logged in earlier is signed out.

**Booking**
- [ ] Home: search with dates; only free rooms listed; filters, sort and pagination work.
- [ ] Room page: choose dates, quote and availability update; seasonal pricing note appears for the festive dates (20 to 30 days ahead).
- [ ] Reserve: payment page with countdown. Pay with `4000 0000 0000 0002` (declined), then `4242 4242 4242 4242` (success).
- [ ] My bookings: invoice PDF downloads, booking is confirmed, a notification arrived (bell).
- [ ] Try booking the same room and dates from a second account: blocked.
- [ ] Cancel a paid booking: refund requested.

**Staff (staff@hotelpro.com)**
- [ ] Bookings > Arrivals today > Check in. Check out a checked-in guest.
- [ ] After check-out a housekeeping task exists; mark it done; the room becomes available.
- [ ] Requests: reply to the guest; the guest sees the reply and gets a notification.
- [ ] Rooms: set a room to maintenance; it disappears from guest search.

**Guest after stay**
- [ ] Leave a review after check-out; room rating updates on the room page.
- [ ] Raise a service request / support ticket on a confirmed booking.

**Admin (admin@hotelpro.com)**
- [ ] Overview charts load and the date range filter works.
- [ ] Payments: approve and reject refund requests.
- [ ] Rooms: add a room, upload photos (JPG/PNG/WebP under 2 MB), delete a photo.
- [ ] Pricing & catalog: add a category, a seasonal rule, a service, edit a hotel.
- [ ] Users: create a staff user, change role, disable an account (that user is signed out immediately).
- [ ] Reviews: hide a review. Security & logs: failed logins and actions are listed; system health shows OK.

**General**
- [ ] Dark / light toggle persists after refresh.
- [ ] Resize to mobile width: navbar collapses, tables scroll, pages usable.
