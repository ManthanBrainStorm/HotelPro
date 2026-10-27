// Strips HTML tags and control characters from every string in the request body.
// React escapes output, so this is defence in depth against stored XSS.
const SKIP = new Set(['password', 'currentPassword', 'newPassword']);
const TAGS = /<[^>]*>/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const clean = (value, key) => {
  if (typeof value === 'string') return SKIP.has(key) ? value : value.replace(TAGS, '').replace(CONTROL, '').trim();
  if (Array.isArray(value)) return value.map((v) => clean(v, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k)]));
  }
  return value;
};

module.exports = (req, res, next) => {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  next();
};
