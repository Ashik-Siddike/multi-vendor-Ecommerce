const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const categoryRoutes = require('./routes/category.routes');
const shopRoutes = require('./routes/shop.routes');
const adminRoutes = require('./routes/admin.routes');
const productRoutes = require('./routes/product.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/order.routes');
const { sendError, sendSuccess } = require('./utils/response');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check endpoint
app.get('/health', (req, res) => {
  sendSuccess(res, 200, 'Multi-vendor E-commerce Backend API is healthy', {
    status: 'UP',
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/shops', shopRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', orderRoutes);

// Admin Routes (supporting both /api/v1/admin/dashboard-stats & /api/v1/admin/shops)
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin/shops', adminRoutes);

// 404 Catch-all handler
app.use((req, res) => {
  sendError(res, 404, `Endpoint ${req.method} ${req.originalUrl} not found`);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  sendError(
    res,
    err.status || 500,
    err.message || 'Internal Server Error',
    process.env.NODE_ENV === 'development' ? err.stack : undefined
  );
});

module.exports = app;
