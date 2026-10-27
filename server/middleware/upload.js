const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const dir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(dir, { recursive: true });

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Room images are stored on local disk. Swap diskStorage for a Cloudinary/S3 storage engine in production.
module.exports = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT[file.mimetype]}`),
  }),
  fileFilter: (req, file, cb) => {
    if (EXT[file.mimetype]) return cb(null, true);
    cb(Object.assign(new Error('Only JPG, PNG or WebP images are allowed'), { status: 400 }));
  },
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
});

module.exports.uploadDir = dir;
