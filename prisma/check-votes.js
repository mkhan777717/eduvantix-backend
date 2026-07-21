const prisma = require('../src/prisma');

async function check() {
  const discussions = await prisma.discussion.findMany({
    select: { id: true, title: true, score: true, slug: true, replyCount: true }
  });
  console.log('DISCUSSIONS IN DB:', discussions);

  const votes = await prisma.discussionVote.findMany();
  console.log('VOTES IN DB:', votes);

  await prisma.$disconnect();
}

check();
