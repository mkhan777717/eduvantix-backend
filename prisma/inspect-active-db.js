const prisma = require('../src/prisma');

async function check() {
  try {
    const dbInfo = await prisma.$queryRaw`SELECT current_database() as db, current_user as usr`;
    console.log('Active DB connection:', dbInfo);

    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    console.log('Total tables count:', tables.length);
    console.log('Tables list:', tables.map(t => t.table_name));

    // Check Discussion tables specifically
    const discussionTables = tables.filter(t => t.table_name.toLowerCase().includes('discussion') || t.table_name.toLowerCase().includes('comment') || t.table_name.toLowerCase().includes('bookmark') || t.table_name.toLowerCase().includes('mention') || t.table_name.toLowerCase().includes('tag'));
    console.log('\nDiscussion module tables found:', discussionTables.map(t => t.table_name));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
