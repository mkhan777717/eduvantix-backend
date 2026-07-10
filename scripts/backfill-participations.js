const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting backfill for ContestParticipation records...');

  // Fetch all participations
  const participations = await prisma.contestParticipation.findMany({
    include: {
      user: {
        select: { username: true }
      },
      contest: {
        select: { title: true }
      }
    }
  });

  console.log(`Found ${participations.length} participation records to process.`);

  let updatedCount = 0;
  for (const part of participations) {
    const username = part.user?.username || null;
    const contestTitle = part.contest?.title || null;

    await prisma.contestParticipation.update({
      where: { id: part.id },
      data: {
        username,
        contestTitle
      }
    });
    updatedCount++;
  }

  console.log(`Successfully updated ${updatedCount} participation records with usernames and contest titles.`);
}

main()
  .catch((e) => {
    console.error('Error during backfill:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
