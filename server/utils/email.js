const nodemailer = require('nodemailer');
const logger = require('./logger');

const emailEnabled = () => Boolean(process.env.SMTP_HOST);
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const layout = (title, body) => `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #d6e0e0">
  <div style="background:#12263a;color:#fff;padding:16px 24px;font-size:20px">HotelPro</div>
  <div style="padding:24px;color:#12263a"><h2 style="margin-top:0">${esc(title)}</h2>${body}</div>
  <div style="padding:12px 24px;background:#eef3f3;color:#667;font-size:12px">This is an automated message from HotelPro.</div>
</div>`;

// Never throws: a failed email must not break a booking or a payment.
async function sendMail({ to, subject, html, text }) {
  if (!emailEnabled()) {
    logger.info(`[email disabled - not sent] to=${to} subject="${subject}"${text ? ` | ${text}` : ''}`);
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || 'HotelPro <no-reply@hotelpro.local>',
      to,
      subject,
      html,
      text,
    });
    return true;
  } catch (err) {
    logger.error('Email failed:', err.message);
    return false;
  }
}

const fmtDate = (d) => new Date(d).toISOString().slice(0, 10);

exports.emailEnabled = emailEnabled;
exports.sendMail = sendMail;

exports.sendVerificationEmail = (user, link) =>
  sendMail({
    to: user.email,
    subject: 'Verify your HotelPro email',
    text: `Verification link for ${user.email}: ${link}`,
    html: layout('Confirm your email', `<p>Hi ${esc(user.name)}, please confirm your email address to start booking.</p>
      <p><a href="${esc(link)}" style="background:#1f6f78;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px">Verify email</a></p>
      <p style="font-size:12px">This link expires in 24 hours.</p>`),
  });

exports.sendBookingConfirmation = (user, booking, room) =>
  sendMail({
    to: user.email,
    subject: `Booking confirmed - Room ${room.number}`,
    html: layout('Your booking is confirmed', `<p>Hi ${esc(user.name)}, thank you for choosing HotelPro.</p>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><td>Room</td><td><strong>${esc(room.number)}</strong></td></tr>
        <tr><td>Check-in</td><td>${fmtDate(booking.checkIn)}</td></tr>
        <tr><td>Check-out</td><td>${fmtDate(booking.checkOut)}</td></tr>
        <tr><td>Guests</td><td>${booking.guests}</td></tr>
        <tr><td>Total paid</td><td><strong>INR ${booking.totalPrice.toLocaleString('en-IN')}</strong></td></tr>
        <tr><td>Invoice</td><td>${esc(booking.invoiceNumber)}</td></tr>
      </table>
      <p>You can download your invoice from the My bookings page.</p>`),
  });

exports.sendCancellation = (user, booking, room, refundRequested) =>
  sendMail({
    to: user.email,
    subject: `Booking cancelled - Room ${room.number}`,
    html: layout('Your booking was cancelled', `<p>Hi ${esc(user.name)}, your booking for room ${esc(room.number)}
      (${fmtDate(booking.checkIn)} to ${fmtDate(booking.checkOut)}) has been cancelled.</p>
      ${refundRequested ? '<p>A refund request has been created and will be reviewed by our team.</p>' : ''}`),
  });

exports.sendRefundUpdate = (user, booking, approved, reason) =>
  sendMail({
    to: user.email,
    subject: approved ? 'Your refund has been processed' : 'Update on your refund request',
    html: layout(approved ? 'Refund processed' : 'Refund not approved', approved
      ? `<p>Your refund of <strong>INR ${booking.totalPrice.toLocaleString('en-IN')}</strong> has been processed. It may take a few days to appear on your statement.</p>`
      : `<p>Your refund request could not be approved.${reason ? ` Reason: ${esc(reason)}` : ''}</p>`),
  });

exports.sendCheckInReminder = (user, booking, room) =>
  sendMail({
    to: user.email,
    subject: 'Your stay starts tomorrow',
    html: layout('See you tomorrow!', `<p>Hi ${esc(user.name)}, a quick reminder that your stay in room ${esc(room.number)} begins on ${fmtDate(booking.checkIn)}.</p>`),
  });
