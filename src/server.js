require('dotenv').config();
const app = require('./app');
const prisma = require('./config/prisma');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, async () => {
  console.log(`🚀 Multi-vendor E-commerce Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base: http://localhost:${PORT}/api/v1`);

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Supabase PostgreSQL connected successfully via Prisma 7!');
  } catch (err) {
    console.error('❌ Failed to connect to database:', err.message);
  }
});

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('🔌 HTTP server closed.');
    await prisma.$disconnect();
    console.log('💾 Database connection closed.');
    process.exit(0);
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = server;
