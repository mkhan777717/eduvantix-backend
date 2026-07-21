const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.$queryRawUnsafe('SELECT current_database() as db')
  .then(r => { console.log('Connected OK:', r[0].db); })
  .catch(e => { console.error('Connection FAILED:', e.message); })
  .finally(() => prisma.$disconnect());
