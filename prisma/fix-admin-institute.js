const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Find or create the institute
  let institute = await prisma.institute.findFirst({
    where: { name: 'Polaris Campus' }
  });

  if (!institute) {
    institute = await prisma.institute.create({
      data: { name: 'Polaris Campus' }
    });
    console.log(`✅ Created institute: "${institute.name}" (id: ${institute.id})`);
  } else {
    console.log(`ℹ️  Found existing institute: "${institute.name}" (id: ${institute.id})`);
  }

  // 2. Link the admin user to the institute
  const updated = await prisma.user.update({
    where: { username: 'polaris_admin' },
    data: { instituteId: institute.id },
    select: { id: true, username: true, role: true, instituteId: true }
  });

  console.log(`✅ Linked user:`, updated);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
