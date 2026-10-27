const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'logs');
const file = path.join(dir, 'error.log');

function write(level, args) {
  const line = `${new Date().toISOString()} [${level}] ${args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
  if (level === 'error') {
    console.error(line);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(file, line + '\n');
    } catch { /* logging must never crash the app */ }
  } else if (process.env.NODE_ENV !== 'test') {
    console.log(line);
  }
}

module.exports = {
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
};
