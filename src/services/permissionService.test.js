'use strict';

/**
 * permissionService.test.js
 *
 * Unit tests for PermissionService.
 * Uses in-process mock — no DB connection required.
 *
 * Run:  node src/services/permissionService.test.js
 */

// ── Mock Prisma ────────────────────────────────────────────────────────────────
const mockPrisma = {
  contestParticipation: {
    findUnique: async () => null,
  },
  contest: {
    findUnique: async () => null,
  },
};

// Patch require before loading the service
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.includes('prisma') && !request.includes('node_modules')) {
    return mockPrisma;
  }
  return originalLoad.apply(this, arguments);
};

const {
  canAccessProblem,
  canAccessContest,
  canManageProblem,
  canManageContest,
  isSuperAdmin,
  isStaff,
  sameInstitute,
} = require('./permissionService');

// ── Simple assertion helpers ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

async function test(name, fn) {
  console.log(`\n${name}`);
  try {
    await fn();
  } catch (err) {
    console.error(`  ❌ THREW: ${err.message}`);
    failed++;
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const superAdmin   = { id: 1, role: 'ADMIN',           instituteId: null };
const instAdmin    = { id: 2, role: 'INSTITUTE_ADMIN',  instituteId: 10 };
const mentor       = { id: 3, role: 'MENTOR',           instituteId: 10 };
const student      = { id: 4, role: 'USER',             instituteId: 10 };
const otherStudent = { id: 5, role: 'USER',             instituteId: 99 };

const publicProblem  = { id: 100, slug: 'two-sum',   visibility: 'PUBLIC',  instituteId: null };
const privateProblem = { id: 101, slug: 'secret',    visibility: 'PRIVATE', instituteId: 10 };
const draftProblem   = { id: 102, slug: 'wip',       visibility: 'DRAFT',   instituteId: 10 };
const hiddenProblem  = { id: 103, slug: 'gone',      visibility: 'HIDDEN',  instituteId: null };
const instProblem    = { id: 104, slug: 'inst-prob', visibility: 'PUBLIC',  instituteId: 10 };

const publicContest  = { id: 200, slug: 'open-cup',    visibility: 'PUBLIC',  instituteId: null, startTime: new Date(Date.now() - 3600_000), endTime: new Date(Date.now() + 3600_000) };
const privateContest = { id: 201, slug: 'closed-cup',  visibility: 'PRIVATE', instituteId: 10,   startTime: new Date(Date.now() - 3600_000), endTime: new Date(Date.now() + 3600_000) };
const hiddenContest  = { id: 202, slug: 'phantom',     visibility: 'HIDDEN',  instituteId: null, startTime: new Date(), endTime: new Date() };

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {

  // ── Helper tests ──────────────────────────────────────────────────────────
  await test('isSuperAdmin()', () => {
    assert(isSuperAdmin(superAdmin) === true,   'ADMIN with no institute is super-admin');
    assert(isSuperAdmin(instAdmin) === false,   'INSTITUTE_ADMIN is not super-admin');
    assert(isSuperAdmin(null) === false,        'null user is not super-admin');
  });

  await test('isStaff()', () => {
    assert(isStaff(superAdmin) === true,   'ADMIN is staff');
    assert(isStaff(instAdmin)  === true,   'INSTITUTE_ADMIN is staff');
    assert(isStaff(mentor)     === true,   'MENTOR is staff');
    assert(isStaff(student)    === false,  'USER is not staff');
    assert(isStaff(null)       === false,  'null is not staff');
  });

  await test('sameInstitute()', () => {
    assert(sameInstitute(student, { instituteId: 10 })   === true,  'same institute');
    assert(sameInstitute(student, { instituteId: 99 })   === false, 'different institute');
    assert(sameInstitute(student, { instituteId: null }) === true,  'global resource is accessible to all');
  });

  // ── Problem access ────────────────────────────────────────────────────────
  await test('canAccessProblem() — PUBLIC global', async () => {
    assert((await canAccessProblem(null,         publicProblem)).allowed === true,  'guest can access public global problem');
    assert((await canAccessProblem(student,      publicProblem)).allowed === true,  'student can access public global problem');
    assert((await canAccessProblem(superAdmin,   publicProblem)).allowed === true,  'super-admin can access public global problem');
  });

  await test('canAccessProblem() — PUBLIC institute-scoped', async () => {
    assert((await canAccessProblem(student,      instProblem)).allowed === true,   'same-institute student can access public institute problem');
    assert((await canAccessProblem(otherStudent, instProblem)).allowed === false,  'other-institute student cannot access');
    const r = await canAccessProblem(null,       instProblem);
    assert(r.allowed === false && r.httpStatus === 401, 'guest gets 401 on institute problem');
  });

  await test('canAccessProblem() — PRIVATE', async () => {
    const r1 = await canAccessProblem(null, privateProblem);
    assert(r1.allowed === false && r1.httpStatus === 401, 'guest gets 401 on private problem');
    assert((await canAccessProblem(student,      privateProblem)).allowed === true,   'same-institute student can access private problem');
    assert((await canAccessProblem(otherStudent, privateProblem)).allowed === false,  'other-institute student cannot');
    assert((await canAccessProblem(superAdmin,   privateProblem)).allowed === true,   'super-admin can access private problem');
  });

  await test('canAccessProblem() — DRAFT', async () => {
    const r1 = await canAccessProblem(null,    draftProblem);
    assert(r1.allowed === false && r1.httpStatus === 401, 'guest gets 401 on draft');
    const r2 = await canAccessProblem(student, draftProblem);
    assert(r2.allowed === false && r2.httpStatus === 403, 'student gets 403 on draft');
    assert((await canAccessProblem(mentor,      draftProblem)).allowed === true,  'mentor can see draft in same institute');
    assert((await canAccessProblem(superAdmin,  draftProblem)).allowed === true,  'super-admin can see draft');
  });

  await test('canAccessProblem() — HIDDEN', async () => {
    for (const user of [null, student, mentor, superAdmin]) {
      const r = await canAccessProblem(user, hiddenProblem);
      assert(r.allowed === false && r.httpStatus === 404, `HIDDEN returns 404 for ${user?.role ?? 'guest'}`);
    }
  });

  // ── Contest access ────────────────────────────────────────────────────────
  await test('canAccessContest() — PUBLIC', async () => {
    const r1 = await canAccessContest(null, publicContest);
    assert(r1.allowed === false && r1.httpStatus === 401, 'guest gets 401 on public contest');
    assert((await canAccessContest(student,    publicContest)).allowed === true, 'student can access public contest');
    assert((await canAccessContest(superAdmin, publicContest)).allowed === true, 'super-admin can access');
  });

  await test('canAccessContest() — PRIVATE (not registered)', async () => {
    // mockPrisma returns null participation
    const r = await canAccessContest(student, privateContest);
    assert(r.allowed === false && r.reason === 'NOT_REGISTERED', 'unregistered student denied private contest');
  });

  await test('canAccessContest() — PRIVATE (staff bypass)', async () => {
    assert((await canAccessContest(mentor,    privateContest)).allowed === true,  'mentor bypasses registration check');
    assert((await canAccessContest(instAdmin, privateContest)).allowed === true,  'instAdmin bypasses registration check');
  });

  await test('canAccessContest() — HIDDEN', async () => {
    for (const user of [null, student, mentor, superAdmin]) {
      const r = await canAccessContest(user, hiddenContest);
      assert(r.allowed === false && r.httpStatus === 404, `HIDDEN contest → 404 for ${user?.role ?? 'guest'}`);
    }
  });

  // ── Management checks ─────────────────────────────────────────────────────
  await test('canManageProblem()', () => {
    assert(canManageProblem(superAdmin, instProblem).allowed === true,  'super-admin can manage any problem');
    assert(canManageProblem(mentor,     instProblem).allowed === true,  'mentor can manage same-institute problem');
    assert(canManageProblem(student,    instProblem).allowed === false, 'student cannot manage problem');
    assert(canManageProblem(null,       instProblem).allowed === false, 'guest cannot manage problem');
  });

  await test('canManageContest()', () => {
    const globalContest = { id: 300, slug: 'g', instituteId: null, creator: null };
    assert(canManageContest(superAdmin, globalContest).allowed === true, 'super-admin can manage global contest');
    assert(canManageContest(mentor,     globalContest).allowed === true, 'mentor can manage contest with no institute');
    assert(canManageContest(student,    globalContest).allowed === false, 'student cannot manage contest');
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n=================================================');
  console.log(` PermissionService Tests`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log('=================================================\n');
  if (failed > 0) process.exit(1);
})();
