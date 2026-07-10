const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emailOrUsername = process.argv[2];
  if (!emailOrUsername) {
    console.error('Please specify the email or username of the user to promote.');
    console.error('Usage: node scripts/promote-admin.js <email_or_username>');
    process.exit(1);
  }

  const result = await prisma.user.updateMany({
    where: {
      OR: [
        { email: emailOrUsername },
        { username: emailOrUsername }
      ]
    },
    data: { role: 'ADMIN' }
  });

  console.log(`Successfully promoted ${result.count} user(s) matching "${emailOrUsername}" to ADMIN (Super Admin)!`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
