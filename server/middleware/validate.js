const { validationResult } = require('express-validator');

// validate([...rules]) -> array of middleware: runs the rules, then returns a 400 with the first message.
module.exports = (rules) => [
  ...rules,
  (req, res, next) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();
    const errors = result.array();
    res.status(400).json({ message: errors[0].msg, errors: errors.map((e) => ({ field: e.path, message: e.msg })) });
  },
];
