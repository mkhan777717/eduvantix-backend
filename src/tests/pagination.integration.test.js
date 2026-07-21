'use strict';

/**
 * pagination.integration.test.js
 *
 * Integration test suite for PaginationService across all 7 supported modules:
 * 1. Problems
 * 2. Contests
 * 3. Quizzes (Arcade Questions)
 * 4. Users
 * 5. Submissions
 * 6. Institutes
 * 7. Viva Sessions
 *
 * Tests combined query scenarios: page + limit + search + filters + sort + order.
 * Uses mock Prisma models — no DB connection required.
 *
 * Run via: node src/tests/pagination.integration.test.js
 */

const PaginationService = require('../services/paginationService');
const paginationConfig = require('../config/pagination');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

async function testModule(moduleName, fn) {
  console.log(`\nTesting Module: ${moduleName}`);
  try {
    await fn();
  } catch (err) {
    console.error(`  ❌ THREW ERROR: ${err.message}`);
    failed++;
  }
}

// ── Mock Prisma Model Delegate Factory ─────────────────────────────────────────

function createMockModel(sampleDataset) {
  return {
    findMany: async ({ where, orderBy, skip, take, select, include }) => {
      let result = [...sampleDataset];

      // Simulate AND conditions filtering
      if (where?.AND && Array.isArray(where.AND)) {
        for (const clause of where.AND) {
          result = filterDataset(result, clause);
        }
      } else if (where && Object.keys(where).length > 0) {
        result = filterDataset(result, where);
      }

      // Simulate sorting
      if (orderBy) {
        const key = Object.keys(orderBy)[0];
        const dir = orderBy[key];
        result.sort((a, b) => {
          if (a[key] < b[key]) return dir === 'asc' ? -1 : 1;
          if (a[key] > b[key]) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      }

      // Simulate skip/take
      return result.slice(skip, skip + take);
    },
    count: async ({ where }) => {
      let result = [...sampleDataset];
      if (where?.AND && Array.isArray(where.AND)) {
        for (const clause of where.AND) {
          result = filterDataset(result, clause);
        }
      } else if (where && Object.keys(where).length > 0) {
        result = filterDataset(result, where);
      }
      return result.length;
    },
  };
}

function filterDataset(dataset, clause) {
  return dataset.filter((item) => {
    // Check OR search clause
    if (clause.OR && Array.isArray(clause.OR)) {
      return clause.OR.some((orClause) => {
        const field = Object.keys(orClause)[0];
        const term = orClause[field]?.contains;
        if (!term) return true;
        return String(item[field] || '')
          .toLowerCase()
          .includes(term.toLowerCase());
      });
    }

    // Check direct equality filters
    for (const [key, val] of Object.entries(clause)) {
      if (key === 'OR' || key === 'AND') continue;
      if (typeof val === 'object' && val !== null && val.notIn) {
        if (val.notIn.includes(item[key])) return false;
      } else if (item[key] !== val) {
        return false;
      }
    }
    return true;
  });
}

// ── Datasets ──────────────────────────────────────────────────────────────────

const problemsData = [
  { id: 1, title: 'Two Sum', slug: 'two-sum', difficulty: 'EASY', visibility: 'PUBLIC', category: 'FUNCTIONAL', createdAt: '2026-01-01' },
  { id: 2, title: 'Add Two Numbers', slug: 'add-two-numbers', difficulty: 'MEDIUM', visibility: 'PUBLIC', category: 'FUNCTIONAL', createdAt: '2026-01-02' },
  { id: 3, title: 'Median of Two Sorted Arrays', slug: 'median-of-two', difficulty: 'HARD', visibility: 'PUBLIC', category: 'FUNCTIONAL', createdAt: '2026-01-03' },
  { id: 4, title: 'Binary Tree Level Order', slug: 'binary-tree', difficulty: 'MEDIUM', visibility: 'PUBLIC', category: 'FUNCTIONAL', createdAt: '2026-01-04' },
];

const contestsData = [
  { id: 10, slug: 'weekly-1', title: 'Weekly Contest 1', category: 'ALGO', visibility: 'PUBLIC', startTime: '2026-02-01' },
  { id: 20, slug: 'weekly-2', title: 'Weekly Contest 2', category: 'ALGO', visibility: 'PUBLIC', startTime: '2026-02-02' },
  { id: 30, slug: 'biweekly-1', title: 'Biweekly Contest 1', category: 'DS', visibility: 'PUBLIC', startTime: '2026-02-03' },
];

const quizzesData = [
  { id: 100, title: 'JS Basics Quiz', question: 'What is closure?', type: 'quiz', track: 'JavaScript', level: 1, createdAt: '2026-03-01' },
  { id: 101, title: 'React Hooks Quiz', question: 'What is useEffect?', type: 'quiz', track: 'React', level: 2, createdAt: '2026-03-02' },
  { id: 102, title: 'Python Loops', question: 'What is range()?', type: 'quiz', track: 'Python', level: 1, createdAt: '2026-03-03' },
];

const usersData = [
  { id: 1, username: 'admin_user', email: 'admin@dmx.com', role: 'ADMIN', createdAt: '2026-01-01' },
  { id: 2, username: 'student_1', email: 'student1@dmx.com', role: 'USER', createdAt: '2026-01-02' },
  { id: 3, username: 'student_2', email: 'student2@dmx.com', role: 'USER', createdAt: '2026-01-03' },
];

const submissionsData = [
  { id: 500, userId: 2, problemId: 1, status: 'ACCEPTED', language: 'CPP', executionTime: 12, createdAt: '2026-04-01' },
  { id: 501, userId: 2, problemId: 1, status: 'WRONG_ANSWER', language: 'PYTHON', executionTime: 45, createdAt: '2026-04-02' },
  { id: 502, userId: 3, problemId: 2, status: 'ACCEPTED', language: 'JAVASCRIPT', executionTime: 88, createdAt: '2026-04-03' },
];

const institutesData = [
  { id: 1, name: 'Synapse Institute', isBlocked: false, createdAt: '2026-01-01' },
  { id: 2, name: 'Tech Academy', isBlocked: false, createdAt: '2026-01-02' },
  { id: 3, name: 'Blocked Institute', isBlocked: true, createdAt: '2026-01-03' },
];

const vivasData = [
  { id: 1000, subject: 'Operating Systems', status: 'COMPLETED', score: 85, userId: 2, createdAt: '2026-05-01' },
  { id: 1001, subject: 'DBMS', status: 'COMPLETED', score: 92, userId: 2, createdAt: '2026-05-02' },
  { id: 1002, subject: 'Computer Networks', status: 'IN_PROGRESS', score: 0, userId: 3, createdAt: '2026-05-03' },
];

// ── Integration Tests ──────────────────────────────────────────────────────────

(async () => {

  // 1. Problems Module Combined Query
  await testModule('1. Problems Module', async () => {
    const mockModel = createMockModel(problemsData);
    const result = await PaginationService.paginate({
      model: mockModel,
      query: { page: '1', limit: '2', search: 'Two', difficulty: 'EASY', sort: 'title', order: 'asc' },
      config: paginationConfig.problem,
    });

    assert(result.success === true, 'Problems combined query returned success: true');
    assert(result.data.length === 1, 'Search + filter narrowed down to 1 matching problem');
    assert(result.data[0].title === 'Two Sum', 'Correct problem title returned');
    assert(result.pagination.total === 1, 'Total matching count is 1');
    assert(result.pagination.hasNext === false, 'hasNext is false');
  });

  // 2. Contests Module Combined Query
  await testModule('2. Contests Module', async () => {
    const mockModel = createMockModel(contestsData);
    const result = await PaginationService.paginate({
      model: mockModel,
      query: { page: '1', limit: '2', category: 'ALGO', sort: 'startTime', order: 'desc' },
      config: paginationConfig.contest,
    });

    assert(result.success === true, 'Contests query returned success');
    assert(result.data.length === 2, 'Limit 2 returned 2 contests');
    assert(result.pagination.total === 2, 'Total ALGO contests count is 2');
    assert(result.data[0].slug === 'weekly-2', 'Desc sorting by startTime applied correctly');
  });

  // 3. Quizzes (Arcade Questions) Combined Query
  await testModule('3. Quizzes Module', async () => {
    const mockModel = createMockModel(quizzesData);
    const result = await PaginationService.paginate({
      model: mockModel,
      query: { page: '1', limit: '10', type: 'quiz', track: 'JavaScript', search: 'closure' },
      config: paginationConfig.quiz,
    });

    assert(result.success === true, 'Quiz query returned success');
    assert(result.data.length === 1, 'Custom search builder filtered 1 matching quiz');
    assert(result.data[0].title === 'JS Basics Quiz', 'Correct quiz returned');
  });

  // 4. Users Module Combined Query
  await testModule('4. Users Module', async () => {
    const mockModel = createMockModel(usersData);
    const result = await PaginationService.paginate({
      model: mockModel,
      query: { page: '1', limit: '2', role: 'USER', sort: 'username', order: 'asc' },
      config: paginationConfig.user,
    });

    assert(result.success === true, 'User query returned success');
    assert(result.data.length === 2, 'Filtered to 2 USER role records');
    assert(result.data[0].username === 'student_1', 'Sorted by username asc');
  });

  // 5. Submissions Module Combined Query
  await testModule('5. Submissions Module', async () => {
    const mockModel = createMockModel(submissionsData);
    const result = await PaginationService.paginate({
      model: mockModel,
      query: { page: '1', limit: '5', status: 'ACCEPTED', language: 'CPP' },
      config: paginationConfig.submission,
    });

    assert(result.success === true, 'Submission query returned success');
    assert(result.data.length === 1, 'Filtered to 1 ACCEPTED CPP submission');
    assert(result.data[0].id === 500, 'Correct submission ID returned');
  });

  // 6. Institutes Module Combined Query
  await testModule('6. Institutes Module', async () => {
    const mockModel = createMockModel(institutesData);
    const result = await PaginationService.paginate({
      model: mockModel,
      query: { page: '1', limit: '10', isBlocked: 'false', search: 'Tech' },
      config: paginationConfig.institute,
    });

    assert(result.success === true, 'Institute query returned success');
    assert(result.data.length === 1, 'Filtered unblocked institute with search Tech');
    assert(result.data[0].name === 'Tech Academy', 'Correct institute name returned');
  });

  // 7. Viva Sessions Module Combined Query
  await testModule('7. Viva Sessions Module', async () => {
    const mockModel = createMockModel(vivasData);
    const result = await PaginationService.paginate({
      model: mockModel,
      query: { page: '1', limit: '10', status: 'COMPLETED', sort: 'score', order: 'desc' },
      config: paginationConfig.viva,
      where: { userId: 2 },
    });

    assert(result.success === true, 'Viva query returned success');
    assert(result.data.length === 2, 'Returned 2 completed vivas for user 2');
    assert(result.data[0].score === 92, 'Sorted by score desc');
  });

  console.log('\n=================================================');
  console.log(` Pagination Integration Tests Result`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log('=================================================\n');

  if (failed > 0) process.exit(1);
})();
