const { PrismaClient } = require('@prisma/client');

let databaseUrl = process.env.DATABASE_URL;

// If running in development and DATABASE_URL is set to localhost/127.0.0.1, fallback to the cloud Neon DB
if (process.env.NODE_ENV === 'development') {
  const isLocal = !databaseUrl || databaseUrl.includes('127.0.0.1') || databaseUrl.includes('localhost');
  if (isLocal) {
    databaseUrl = "postgresql://neondb_owner:npg_4IJakjCWriU7@ep-lively-lake-atkc284b.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require";
  }
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl
    }
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
});

module.exports = prisma;
