require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const seedSuperAdmin = async () => {
  try {
    if (
      !process.env.DEFAULT_ADMIN_EMAIL ||
      !process.env.DEFAULT_ADMIN_PASSWORD
    ) {
      console.log('❌ Super Admin credentials not found in .env');
      return;
    }

    const existingAdmin = await prisma.user.findUnique({
      where: {
        email: process.env.DEFAULT_ADMIN_EMAIL,
      },
    });

    if (existingAdmin) {
      console.log('✅ Super Admin already exists.');
      return;
    }

    const hashedPassword = await bcrypt.hash(
      process.env.DEFAULT_ADMIN_PASSWORD,
      10
    );

    await prisma.user.create({
      data: {
        username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
        email: process.env.DEFAULT_ADMIN_EMAIL,
        password: hashedPassword,
        role: 'SUPER_ADMIN', // Change if your enum value is different
      },
    });

    console.log('✅ Super Admin created successfully.');
  } catch (error) {
    console.error('❌ Error creating Super Admin:', error);
  }
};

const main = async () => {
  console.log('🚀 Starting database seeding...\n');

  // Seed Super Admin
  await seedSuperAdmin();

  console.log('\n📚 Seeding practice problems...');

  const problemsData = [
    {
      title: 'Authentication vs Authorization',
      slug: 'auth-vs-auth',
      difficulty: 'EASY',
      statement:
        'Understand and document the core security protocols defining user identity verification versus resource permission grants in modern systems. Fill in the code to return 401 for invalid tokens, and 403 for members accessing admin paths.',
      inputFormat:
        'JSON string containing keys token, userRole, and path.',
      outputFormat:
        'JSON string containing status key (e.g. {"status": 401}).',
      constraints: 'Follow standard HTTP status codes.',
      explanation:
        'No token -> 401. Non-admin accessing admin path -> 403.',
      testCases: [
        {
          input:
            '{"token": null, "userRole": "guest", "path": "/dashboard"}',
          expectedOutput: '{"status":401}',
          isSample: true,
        },
        {
          input:
            '{"token": "valid-session-jwt", "userRole": "member", "path": "/admin/delete-users"}',
          expectedOutput: '{"status":403}',
          isSample: false,
        },
      ],
    },
    {
      title: 'Two Sum Problem',
      slug: 'two-sum',
      difficulty: 'EASY',
      statement:
        'Given an array of integers nums and an integer target, find indices of the two elements that sum exactly to the target.',
      inputFormat:
        'A single line containing integers separated by spaces, followed by target.',
      outputFormat:
        'An array of two indices representing the elements that sum to target.',
      constraints:
        '2 <= nums.length <= 10^4, -10^9 <= nums[i] <= 10^9',
      explanation:
        'Input: [2, 7, 11, 15], 9 -> Output: [0, 1]',
      testCases: [
        {
          input: '2 7 11 15\n9',
          expectedOutput: '0 1',
          isSample: true,
        },
        {
          input: '3 2 4\n6',
          expectedOutput: '1 2',
          isSample: true,
        },
        {
          input: '3 3\n6',
          expectedOutput: '0 1',
          isSample: false,
        },
      ],
    },
    {
      title: 'Virtual DOM Reconciliation Diffing',
      slug: 'vdom-diff',
      difficulty: 'MEDIUM',
      statement:
        "Develop a lightweight version of React's Virtual DOM diffing engine to track and patch node modification actions. Detect REPLACE if tag changes, TEXT if string changes, and CHILDREN recursively.",
      inputFormat:
        'A JSON string of old VNode and new VNode.',
      outputFormat:
        'Array of patches (e.g. [{"type":"REPLACE"}]).',
      constraints:
        'Recursive depth-first search.',
      explanation:
        'div vs span -> [{"type":"REPLACE"}]',
      testCases: [
        {
          input: '{"type":"div"}\n{"type":"div"}',
          expectedOutput: '[]',
          isSample: true,
        },
        {
          input: '{"type":"div"}\n{"type":"span"}',
          expectedOutput: '[{"type":"REPLACE"}]',
          isSample: false,
        },
      ],
    },
    {
      title: 'Distributed Rate Limiter',
      slug: 'rate-limiter',
      difficulty: 'HARD',
      statement:
        'Architect a resilient API Rate Limiter using redis sliding-window log algorithms to curb excessive traffic spikes.',
      inputFormat:
        'JSON string of user requests.',
      outputFormat:
        'Boolean string (true if blocked, false if allowed).',
      constraints:
        'Using MULTI/EXEC pipeline operations.',
      explanation:
        'User exceeds limit -> true.',
      testCases: [
        {
          input: 'user_123 5',
          expectedOutput: 'false',
          isSample: true,
        },
      ],
    },
  ];

  for (const prob of problemsData) {
    const { testCases, ...problemFields } = prob;

    const existingProblem = await prisma.problem.findUnique({
      where: {
        slug: problemFields.slug,
      },
    });

    if (existingProblem) {
      console.log(`⏩ "${problemFields.title}" already exists. Skipping...`);
      continue;
    }

    await prisma.problem.create({
      data: {
        ...problemFields,
        testCases: {
          create: testCases,
        },
      },
    });

    console.log(`✅ "${problemFields.title}" seeded successfully.`);
  }

  console.log('\n🎉 Database seeding completed successfully.');
};

main()
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });