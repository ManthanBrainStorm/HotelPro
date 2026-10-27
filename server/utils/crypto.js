// AES-256-GCM encryption for sensitive fields at rest (guest phone numbers).
const crypto = require('crypto');

const key = () =>
  crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-only-key').digest();

exports.encrypt = (text) => {
  if (text === undefined || text === null || text === '') return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc:' + [iv, tag, enc].map((b) => b.toString('base64')).join(':');
};

exports.decrypt = (value) => {
  if (!value || !String(value).startsWith('enc:')) return value;
  try {
    const [iv, tag, enc] = String(value).slice(4).split(':').map((p) => Buffer.from(p, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
};
