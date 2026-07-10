const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  console.log('Running database verification...');

  // 1. Create a test user
  const randomSuffix = Math.floor(Math.random() * 1000000);
  const username = `testuser_${randomSuffix}`;
  const email = `testuser_${randomSuffix}@example.com`;
  
  const user = await prisma.user.create({
    data: {
      username,
      email,
      password: 'testpassword123',
    }
  });
  console.log(`Created test user: ${username} (ID: ${user.id})`);

  // 2. Create a test contest
  const contestTitle = `Test Verification Contest ${randomSuffix}`;
  const contest = await prisma.contest.create({
    data: {
      title: contestTitle,
      description: 'Verification contest description',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
    }
  });
  console.log(`Created test contest: "${contestTitle}" (ID: ${contest.id})`);

  // 3. Register user participation using the same logic as the controller
  console.log('Registering participation...');
  const participation = await prisma.contestParticipation.upsert({
    where: {
      userId_contestId: { userId: user.id, contestId: contest.id }
    },
    update: {
      username: user.username,
      contestTitle: contest.title,
    },
    create: {
      userId: user.id,
      contestId: contest.id,
      completed: false,
      username: user.username,
      contestTitle: contest.title,
    }
  });

  console.log('Retrieved participation from DB:', participation);

  // 4. Validate fields
  if (participation.username === username && participation.contestTitle === contestTitle) {
    console.log('✅ Success! username and contestTitle are correctly saved in the database!');
  } else {
    throw new Error(`❌ Verification Failed! Expected username="${username}" and contestTitle="${contestTitle}", but got username="${participation.username}" and contestTitle="${participation.contestTitle}"`);
  }

  // 5. Clean up
  console.log('Cleaning up verification records...');
  await prisma.contestParticipation.delete({
    where: { id: participation.id }
  });
  await prisma.contest.delete({
    where: { id: contest.id }
  });
  await prisma.user.delete({
    where: { id: user.id }
  });
  console.log('Cleanup completed successfully.');
}

verify()
  .catch((e) => {
    console.error('Verification failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
