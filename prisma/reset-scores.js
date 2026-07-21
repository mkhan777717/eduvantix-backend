const prisma = require('../src/prisma');

async function main() {
  await prisma.discussion.updateMany({
    data: { score: 0 }
  });
  await prisma.comment.updateMany({
    data: { score: 0 }
  });
  await prisma.discussionVote.deleteMany();
  console.log('Successfully reset all votes and scores to 0 in database.');
  await prisma.$disconnect();
}

main();
