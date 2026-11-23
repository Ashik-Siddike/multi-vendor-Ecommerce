const jwt = require('jsonwebtoken');
const { sendError } = require('../utils/response');

/**
 * Middleware to verify JWT token from Authorization header
 */
const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 401, 'Access denied. No authentication token provided.');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return sendError(res, 401, 'Access denied. Invalid token format.');
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'ecommerce_super_secure_jwt_secret_suffix_it_2026';
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return sendError(res, 401, 'Token has expired. Please login again.');
      }
      return sendError(res, 401, 'Invalid authentication token.');
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Error in verifyToken middleware:', error);
    return sendError(res, 500, 'Internal server error during authentication.');
  }
};

/**
 * Middleware to enforce role-based access control
 * Accepts single role or array of roles: checkRole(['ADMIN', 'VENDOR', 'CUSTOMER'])
 */
const checkRole = (roles) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return sendError(res, 401, 'Unauthorized. User information not found.');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        403,
        `Access denied. Requires one of the following roles: ${allowedRoles.join(', ')}`
      );
    }

    next();
  };
};

module.exports = {
  verifyToken,
  checkRole,
};
