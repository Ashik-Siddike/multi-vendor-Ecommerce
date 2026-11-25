const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/swagger.json');

const authRoutes = require('./routes/auth.routes');
const categoryRoutes = require('./routes/category.routes');
const shopRoutes = require('./routes/shop.routes');
const adminRoutes = require('./routes/admin.routes');
const productRoutes = require('./routes/product.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/order.routes');
const reviewRoutes = require('./routes/review.routes');
const wishlistRoutes = require('./routes/wishlist.routes');
const couponRoutes = require('./routes/coupon.routes');
const vendorRoutes = require('./routes/vendor.routes');
const addressRoutes = require('./routes/address.routes');
const notificationRoutes = require('./routes/notification.routes');
const questionRoutes = require('./routes/question.routes');
const { authRateLimiter } = require('./middlewares/rateLimiter.middleware');
const { sendError, sendSuccess } = require('./utils/response');

const app = express();

// Security Headers (CSP disabled to allow Swagger UI styling and scripts)
app.use(helmet({ contentSecurityPolicy: false }));

// Standard Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Interactive API Documentation via Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health Check endpoint
app.get('/health', (req, res) => {
  sendSuccess(res, 200, 'Multi-vendor E-commerce Backend API is healthy', {
    status: 'UP',
    timestamp: new Date().toISOString(),
    docs: '/api-docs',
  });
});

// Mount Routes with Rate Limiting on Auth
app.use('/api/v1/auth', authRateLimiter, authRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/shops', shopRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/wishlist', wishlistRoutes);
app.use('/api/v1/coupons', couponRoutes);
app.use('/api/v1/vendor', vendorRoutes);
app.use('/api/v1/addresses', addressRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/questions', questionRoutes);

// Admin Routes (supporting /api/v1/admin/dashboard-stats & /api/v1/admin/shops)
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
