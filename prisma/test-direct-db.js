const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

console.log('ENV DATABASE_URL:', process.env.DATABASE_URL);

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

async function test() {
  try {
    const res = await prisma.$queryRaw`SELECT current_database() as db, current_user as usr`;
    console.log('Successfully connected to DB:', res);

    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    console.log('Existing tables in DB:', tables.map(t => t.table_name));
  } catch (err) {
    console.error('Connection failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
