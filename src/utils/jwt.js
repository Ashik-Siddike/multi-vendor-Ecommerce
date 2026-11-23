const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ecommerce_super_secure_jwt_secret_suffix_it_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const generateToken = (payload, expiresIn = JWT_EXPIRES_IN) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

const verifyTokenPayload = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

module.exports = {
  generateToken,
  verifyTokenPayload,
};
