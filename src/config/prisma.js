const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const connectionString = process.env.DATABASE_URL;

// Parse schema from query param or fallback to 'multivendor'
let schema = 'multivendor';
try {
  const url = new URL(connectionString);
  const schemaParam = url.searchParams.get('schema');
  if (schemaParam) schema = schemaParam;
} catch (e) {
  // connectionString without protocol or standard format
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client pool:', err);
});

const adapter = new PrismaPg(pool, { schema });

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

prisma.$pool = pool;

module.exports = prisma;
