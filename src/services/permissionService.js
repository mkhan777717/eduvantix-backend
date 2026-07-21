'use strict';

/**
 * permissionService.js
 *
 * Central authorization decision engine.
 * Every access-control decision on the platform flows through this service.
 * Controllers must never contain permission logic.
 *
 * Denial reasons (structured, never expose to client — use in logs only):
 *   NOT_AUTHENTICATED    — request has no valid JWT
 *   FORBIDDEN            — authenticated but lacks permission
 *   RESOURCE_HIDDEN      — resource is HIDDEN (always 404, even for admins via public API)
 *   RESOURCE_DRAFT       — resource is a DRAFT (only authors/admins can see it)
 *   WRONG_INSTITUTE      — resource belongs to a different institute
 *   CONTEST_NOT_STARTED  — contest hasn't begun yet (problems blocked)
 *   CONTEST_ENDED        — contest is over (submissions blocked)
 *   NOT_REGISTERED       — user isn't registered for this contest
 *   OUTSIDE_TIME_WINDOW  — request is outside the scheduled viva time window
 *   WRONG_OWNERSHIP      — resource owned by a different user
 */

const prisma = require('../prisma');

// ── Helpers ────────────────────────────────────────────────────────────────────

const STAFF_ROLES = ['ADMIN', 'INSTITUTE_ADMIN', 'MENTOR', 'BATCH_MANAGER'];

function isSuperAdmin(user) {
  return user?.role === 'ADMIN' && !user?.instituteId;
}

function isStaff(user) {
  return STAFF_ROLES.includes(user?.role);
}

function sameInstitute(user, resource) {
  // A resource with no instituteId is global → accessible to all
  if (!resource.instituteId) return true;
  return resource.instituteId === user?.instituteId;
}

function allow() {
  return { allowed: true, reason: null };
}

function deny(reason, httpStatus = 403) {
  return { allowed: false, reason, httpStatus };
}

// ── Problem Access ─────────────────────────────────────────────────────────────

/**
 * Determine whether a user may read a problem.
 *
 * @param {Object|null} user     - req.user
 * @param {Object}      problem  - Prisma Problem record (must include visibility, instituteId)
 * @param {Object}      [ctx]    - Optional context: { contestId }
 * @returns {{ allowed: boolean, reason: string|null, httpStatus: number }}
 */
async function canAccessProblem(user, problem, ctx = {}) {
  // HIDDEN: always 404 — existence must not be revealed
  if (problem.visibility === 'HIDDEN') {
    return deny('RESOURCE_HIDDEN', 404);
  }

  // DRAFT: only super-admin or institute staff of the owning institute
  if (problem.visibility === 'DRAFT') {
    if (!user) return deny('NOT_AUTHENTICATED', 401);
    if (isSuperAdmin(user)) return allow();
    if (isStaff(user) && sameInstitute(user, problem)) return allow();
    return deny('RESOURCE_DRAFT', 403);
  }

  // PRIVATE: only authenticated members of the owning institute
  if (problem.visibility === 'PRIVATE') {
    if (!user) return deny('NOT_AUTHENTICATED', 401);
    if (isSuperAdmin(user)) return allow();
    if (sameInstitute(user, problem)) return allow();
    return deny('WRONG_INSTITUTE', 403);
  }

  // Contest-linked problem: require contest registration
  if (ctx.contestId) {
    const contestCheck = await _checkContestAccess(user, ctx.contestId);
    if (!contestCheck.allowed) return contestCheck;
  }

  // PUBLIC: institute-scoped problems require membership, global problems are open
  if (problem.instituteId) {
    if (!user) return deny('NOT_AUTHENTICATED', 401);
    if (isSuperAdmin(user)) return allow();
    if (sameInstitute(user, problem)) return allow();
    return deny('WRONG_INSTITUTE', 403);
  }

  // Truly public & global problem — anyone can read
  return allow();
}

// ── Contest Access ─────────────────────────────────────────────────────────────

/**
 * Determine whether a user may read contest metadata + problems.
 *
 * @param {Object|null} user
 * @param {Object}      contest  - Prisma Contest record (visibility, instituteId, startTime, endTime)
 * @returns {{ allowed: boolean, reason: string|null, httpStatus: number }}
 */
async function canAccessContest(user, contest) {
  if (contest.visibility === 'HIDDEN') {
    return deny('RESOURCE_HIDDEN', 404);
  }

  if (contest.visibility === 'DRAFT') {
    if (!user) return deny('NOT_AUTHENTICATED', 401);
    if (isSuperAdmin(user)) return allow();
    if (isStaff(user) && sameInstitute(user, contest)) return allow();
    return deny('RESOURCE_DRAFT', 403);
  }

  // All non-HIDDEN contests require authentication
  if (!user) return deny('NOT_AUTHENTICATED', 401);
  if (isSuperAdmin(user)) return allow();

  // Institute-scoped access
  if (contest.instituteId && !sameInstitute(user, contest)) {
    return deny('WRONG_INSTITUTE', 403);
  }

  if (contest.visibility === 'PRIVATE') {
    // Private: only registered participants or institute staff
    if (isStaff(user)) return allow();
    const participation = await prisma.contestParticipation.findUnique({
      where: { userId_contestId: { userId: user.id, contestId: contest.id } },
      select: { id: true },
    });
    if (!participation) return deny('NOT_REGISTERED', 403);
  }

  return allow();
}

/**
 * Check whether a user can submit to a contest (it must be active).
 */
async function canSubmitToContest(user, contest) {
  const baseAccess = await canAccessContest(user, contest);
  if (!baseAccess.allowed) return baseAccess;

  const now = new Date();
  if (now < new Date(contest.startTime)) {
    return deny('CONTEST_NOT_STARTED', 403);
  }
  if (now > new Date(contest.endTime)) {
    return deny('CONTEST_ENDED', 403);
  }

  return allow();
}

// ── Viva Access ────────────────────────────────────────────────────────────────

/**
 * Determine whether a user may access a scheduled viva.
 */
async function canAccessViva(user, viva) {
  if (!user) return deny('NOT_AUTHENTICATED', 401);
  if (isSuperAdmin(user)) return allow();

  if (!sameInstitute(user, viva)) {
    return deny('WRONG_INSTITUTE', 403);
  }

  const now = new Date();
  const start = new Date(viva.startTime);
  const end = viva.endTime ? new Date(viva.endTime) : null;

  // Staff (mentors, admins) can access at any time
  if (isStaff(user)) return allow();

  if (now < start) return deny('OUTSIDE_TIME_WINDOW', 403);
  if (end && now > end) return deny('OUTSIDE_TIME_WINDOW', 403);

  return allow();
}

// ── Management Checks (write operations) ──────────────────────────────────────

/**
 * Can the user create/update/delete a problem?
 */
function canManageProblem(user, problem) {
  if (!user) return deny('NOT_AUTHENTICATED', 401);
  if (isSuperAdmin(user)) return allow();
  if (!isStaff(user)) return deny('FORBIDDEN', 403);
  if (!sameInstitute(user, problem)) return deny('WRONG_INSTITUTE', 403);
  return allow();
}

/**
 * Can the user create/update/delete a contest?
 */
function canManageContest(user, contest) {
  if (!user) return deny('NOT_AUTHENTICATED', 401);
  if (isSuperAdmin(user)) return allow();
  if (!isStaff(user)) return deny('FORBIDDEN', 403);

  // Institute staff can only manage their own institute's contests
  const contestInstituteId = contest.instituteId ?? contest.creator?.instituteId;
  if (contestInstituteId && contestInstituteId !== user.instituteId) {
    return deny('WRONG_INSTITUTE', 403);
  }
  return allow();
}

// ── Internal Helpers ───────────────────────────────────────────────────────────

async function _checkContestAccess(user, contestId) {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { id: true, startTime: true, endTime: true, visibility: true, instituteId: true },
  });
  if (!contest) return deny('RESOURCE_HIDDEN', 404);
  return canAccessContest(user, contest);
}

module.exports = {
  canAccessProblem,
  canAccessContest,
  canSubmitToContest,
  canAccessViva,
  canManageProblem,
  canManageContest,
  // Expose helpers for tests
  isSuperAdmin,
  isStaff,
  sameInstitute,
};
