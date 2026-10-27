// Usage: throw httpError(409, 'Room is already booked');
module.exports = (status, message) => Object.assign(new Error(message), { status });
