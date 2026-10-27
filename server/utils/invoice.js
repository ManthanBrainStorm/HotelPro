const PDFDocument = require('pdfkit');

const inr = (n) => `INR ${Number(n).toLocaleString('en-IN')}`;
const day = (d) => new Date(d).toISOString().slice(0, 10);

// Streams a simple PDF invoice into the response.
module.exports = function streamInvoice(res, { booking, room, guest, hotel, payment }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.fontSize(22).fillColor('#12263a').text(hotel?.name || 'HotelPro', { continued: false });
  doc.fontSize(10).fillColor('#555');
  if (hotel?.address || hotel?.city) doc.text([hotel.address, hotel.city].filter(Boolean).join(', '));
  if (hotel?.phone || hotel?.email) doc.text([hotel.phone, hotel.email].filter(Boolean).join('  |  '));

  doc.moveDown(1.5).fontSize(18).fillColor('#1f6f78').text('INVOICE');
  doc.fontSize(10).fillColor('#000')
    .text(`Invoice no: ${booking.invoiceNumber}`)
    .text(`Date: ${day(payment?.paidAt || booking.updatedAt)}`)
    .text(`Booking ref: ${booking._id}`);

  doc.moveDown().fontSize(11).fillColor('#12263a').text('Billed to', { underline: true });
  doc.fontSize(10).fillColor('#000').text(guest.name).text(guest.email);

  doc.moveDown().fontSize(11).fillColor('#12263a').text('Stay details', { underline: true });
  doc.fontSize(10).fillColor('#000')
    .text(`Room: ${room.number}${room.category?.name ? ` (${room.category.name})` : ''}`)
    .text(`Check-in: ${day(booking.checkIn)}   Check-out: ${day(booking.checkOut)}`)
    .text(`Guests: ${booking.guests}   Nights: ${booking.nights}`);

  const y = doc.moveDown(1.5).y;
  doc.rect(50, y, 495, 22).fill('#eef3f3');
  doc.fillColor('#12263a').fontSize(10).text('Description', 58, y + 6).text('Amount', 450, y + 6, { width: 87, align: 'right' });
  doc.fillColor('#000').text(`Room ${room.number} x ${booking.nights} night${booking.nights > 1 ? 's' : ''}`, 58, y + 32)
    .text(inr(booking.totalPrice), 450, y + 32, { width: 87, align: 'right' });
  doc.moveTo(50, y + 52).lineTo(545, y + 52).strokeColor('#d6e0e0').stroke();
  doc.fontSize(12).fillColor('#12263a').text('Total', 58, y + 62).text(inr(booking.totalPrice), 430, y + 62, { width: 107, align: 'right' });

  doc.fontSize(10).fillColor('#555').text(
    `Payment status: ${(payment?.status || booking.paymentStatus).replace('_', ' ')}${payment?.provider ? ` (${payment.provider})` : ''}`,
    50, y + 100
  );
  doc.moveDown(3).fontSize(9).text('Thank you for staying with us.', { align: 'center' });
  doc.end();
};
