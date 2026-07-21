const { PrismaClient } = require('@prisma/client');

const candidates = [
  "postgresql://eduvantixadmin:Eduvantix%40143@127.0.0.1:5433/eduvantix?schema=public",
  "postgresql://eduvantixadmin:Eduvantix%40143@localhost:5433/eduvantix?schema=public",
  "postgresql://eduvantixadmin:Eduvantix143@127.0.0.1:5433/eduvantix?schema=public",
  "postgresql://postgres:postgres@127.0.0.1:5433/eduvantix?schema=public",
  "postgresql://postgres:Eduvantix%40143@127.0.0.1:5433/eduvantix?schema=public",
  "postgresql://postgres:admin@127.0.0.1:5433/eduvantix?schema=public",
];

async function run() {
  for (const url of candidates) {
    const masked = url.replace(/:([^:@]+)@/, ':****@');
    console.log(`Testing URL: ${masked}`);
    const client = new PrismaClient({ datasources: { db: { url } } });
    try {
      const res = await client.$queryRaw`SELECT current_database() as db, current_user as usr`;
      console.log(`\n>>> SUCCESS! Connected on port 5433 with: ${masked}`, res);
      const tables = await client.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`;
      console.log('Tables found on port 5433:', tables.map(t => t.table_name));
      await client.$disconnect();
      return url;
    } catch (e) {
      console.log(`   Failed: ${e.message.split('\n')[0]}`);
    } finally {
      await client.$disconnect();
    }
  }
  console.log('None of the candidates succeeded on 5433.');
}

run();
