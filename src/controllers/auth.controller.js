const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { generateToken } = require('../utils/jwt');
const { sendSuccess, sendError } = require('../utils/response');

const VALID_ROLES = ['CUSTOMER', 'VENDOR', 'ADMIN'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Register a new user
 * POST /api/v1/auth/register
 */
const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return sendError(res, 400, 'Name is required');
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return sendError(res, 400, 'A valid email address is required');
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return sendError(res, 400, 'Password must be at least 6 characters long');
    }

    // Security Hardening: New registrations are ALWAYS 'CUSTOMER' by default.
    // Only in test environments (NODE_ENV === 'test') do we allow role override for test fixtures.
    let assignedRole = 'CUSTOMER';
    if (process.env.NODE_ENV === 'test' && role) {
      const candidateRole = role.toUpperCase();
      if (VALID_ROLES.includes(candidateRole)) {
        assignedRole = candidateRole;
      }
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return sendError(res, 409, 'User with this email already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: assignedRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Generate JWT token
    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    return sendSuccess(res, 201, 'User registered successfully', {
      token,
      user: newUser,
    });
  } catch (error) {
    console.error('Error in register controller:', error);
    return sendError(res, 500, 'Failed to register user', error.message);
  }
};

/**
 * Login user
 * POST /api/v1/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return sendError(res, 401, 'Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return sendError(res, 401, 'Invalid email or password');
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const userProfile = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return sendSuccess(res, 200, 'Login successful', {
      token,
      user: userProfile,
    });
  } catch (error) {
    console.error('Error in login controller:', error);
    return sendError(res, 500, 'Failed to login', error.message);
  }
};

/**
 * Get current authenticated user profile
 * GET /api/v1/auth/me
 */
const getMe = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        shop: {
          select: {
            id: true,
            name: true,
            description: true,
            logo: true,
            isApproved: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return sendError(res, 404, 'User profile not found');
    }

    return sendSuccess(res, 200, 'User profile retrieved successfully', { user });
  } catch (error) {
    console.error('Error in getMe controller:', error);
    return sendError(res, 500, 'Failed to retrieve profile', error.message);
  }
};

module.exports = {
  register,
  login,
  getMe,
};
