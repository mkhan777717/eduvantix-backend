'use strict';

/**
 * contestController.js
 *
 * Pure data layer — zero permission logic.
 * All authorization is enforced by middleware (resolvers.js + permissionService.js).
 *
 * req.resource is populated by resolveContest middleware before write handlers run.
 * Internal integer IDs are used for DB joins but never exposed in responses.
 */

const prisma = require('../prisma');
const { contestSchema, contestProblemSchema } = require('../utils/validators');
const { broadcastParticipationReport, broadcastLeaderboardUpdate } = require('../services/socketService');
const { invalidateResourceCache } = require('../middleware/resolvers');

// ── Slug helpers ───────────────────────────────────────────────────────────────

const slugify = (title) =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

async function generateUniqueContestSlug(base, excludeId = null) {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await prisma.contest.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

// ── Sanitize outbound contest (strip DB id) ────────────────────────────────────

function sanitizeContest(contest) {
  const { id, instituteId, ...rest } = contest;
  return rest;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /api/contests
 * Create a contest (staff only — enforced by route middleware).
 */
const createContest = async (req, res, next) => {
  try {
    const validatedData = contestSchema.parse(req.body);
    const { title, description, category, startTime, endTime, batchIds } = validatedData;
    const creatorId = req.user.id;

    // Validate batch ownership for non-super-admins
    if (req.user.role !== 'ADMIN' && batchIds && batchIds.length > 0) {
      const dbBatches = await prisma.batch.findMany({
        where: { id: { in: batchIds }, instituteId: req.user.instituteId },
        select: { id: true },
      });
      if (dbBatches.length !== batchIds.length) {
        return res.status(403).json({
          success: false,
          message: 'You can only target batches belonging to your own institute.',
        });
      }
    }

    const instituteId = req.user.role !== 'ADMIN' ? req.user.instituteId : null;
    const slug = await generateUniqueContestSlug(slugify(title));

    const contest = await prisma.contest.create({
      data: {
        title, slug, description, category,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        creatorId, instituteId,
        batches: batchIds?.length > 0 ? { connect: batchIds.map((id) => ({ id })) } : undefined,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Contest created successfully.',
      contest: sanitizeContest(contest),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/contests/:slug/problem
 * Add a problem to a contest — req.resource is the contest.
 */
const addProblemToContest = async (req, res, next) => {
  try {
    const contest = req.resource;
    const validatedData = contestProblemSchema.parse(req.body);
    const { problemId, points } = validatedData;

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { id: true, title: true, slug: true },
    });
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found.' });
    }

    const contestProblem = await prisma.contestProblem.create({
      data: { contestId: contest.id, problemId, points: points || 100 },
      include: {
        problem: { select: { title: true, slug: true } },
      },
    });

    // Invalidate contest cache (problem list changed)
    invalidateResourceCache('contest', contest.slug);

    res.status(201).json({
      success: true,
      message: 'Problem added to contest successfully.',
      contestProblem,
    });
  } catch (error) {
    next(error);
  }
};

const PaginationService = require('../services/paginationService');
const paginationConfig = require('../config/pagination');

/**
 * GET /api/contests
 * Institute-scoped contest list using PaginationService.
 */
const getAllContests = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    let whereClause = {};

    if (req.user.role === 'ADMIN' && !req.user.instituteId) {
      whereClause = {};
    } else if (req.user.role === 'USER') {
      const student = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { instituteId: true, batchesStudied: { select: { id: true } } },
      });
      const studentInstituteId = student?.instituteId ?? null;
      const batchIds = student ? student.batchesStudied.map((b) => b.id) : [];

      whereClause = {
        OR: [
          { instituteId: null },
          { instituteId: studentInstituteId },
          { creator: { instituteId: studentInstituteId } },
        ],
        AND: [{
          OR: [
            { batches: { none: {} } },
            ...(batchIds.length > 0 ? [{ batches: { some: { id: { in: batchIds } } } }] : []),
          ],
        }],
        visibility: { notIn: ['HIDDEN', 'DRAFT'] },
      };
    } else {
      const myInstituteId = req.user.instituteId;
      whereClause = {
        OR: [
          { instituteId: null },
          { instituteId: myInstituteId },
          { creator: { instituteId: myInstituteId } },
        ],
      };
    }

    const userParticipations = await prisma.contestParticipation.findMany({
      where: { userId: req.user.id },
      select: { contestId: true, completed: true, score: true },
    });
    const partByContestId = Object.fromEntries(userParticipations.map((p) => [p.contestId, p]));

    const result = await PaginationService.paginate({
      model: prisma.contest,
      query: req.query,
      config: paginationConfig.contest,
      where: whereClause,
      transform: (contests) => {
        return contests.map((c) => {
          const part = partByContestId[c.id] ?? null;
          const { id, instituteId, ...rest } = c;
          return {
            ...rest,
            userParticipation: part,
          };
        });
      },
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/contests/:slug
 * req.resource already resolved + access validated by middleware.
 */
const getContestDetails = async (req, res, next) => {
  try {
    const contest = req.resource;
    const user = req.user;
    const isStaff = ['ADMIN', 'INSTITUTE_ADMIN', 'MENTOR', 'BATCH_MANAGER'].includes(user?.role);

    // Filter test case expected outputs for students
    if (contest.contestProblems) {
      contest.contestProblems.forEach((cp) => {
        if (cp.problem?.testCases && !isStaff) {
          cp.problem.testCases = cp.problem.testCases.map((tc) => ({
            ...tc,
            expectedOutput: tc.isSample ? tc.expectedOutput : '',
          }));
        }
      });
    }

    let userParticipation = null;
    if (user) {
      userParticipation = await prisma.contestParticipation.findUnique({
        where: { userId_contestId: { userId: user.id, contestId: contest.id } },
        select: { completed: true, score: true, timeSpent: true, createdAt: true },
      });
    }

    res.status(200).json({
      success: true,
      contest: { ...sanitizeContest(contest), userParticipation },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/contests/:slug/leaderboard
 */
const getContestLeaderboard = async (req, res, next) => {
  try {
    const contest = req.resource;
    const problemIds = contest.contestProblems.map((cp) => cp.problem.id ?? cp.problemId);
    const pointsMap = Object.fromEntries(
      contest.contestProblems.map((cp) => [cp.problem?.id ?? cp.problemId, cp.points])
    );

    const submissions = await prisma.submission.findMany({
      where: {
        problemId: { in: problemIds },
        createdAt: { gte: contest.startTime, lte: contest.endTime },
      },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const leaderboardMap = {};
    for (const sub of submissions) {
      const uid = sub.userId;
      if (!leaderboardMap[uid]) {
        leaderboardMap[uid] = {
          user: { username: sub.user.username },
          solvedProblems: {},
          totalScore: 0,
          totalExecutionTime: 0,
          attempts: {},
        };
      }
      const stat = leaderboardMap[uid];
      if (!stat.solvedProblems[sub.problemId]) {
        stat.attempts[sub.problemId] = (stat.attempts[sub.problemId] ?? 0) + 1;
        if (sub.status === 'ACCEPTED') {
          const pts = pointsMap[sub.problemId] ?? 100;
          stat.solvedProblems[sub.problemId] = { points: pts, executionTime: sub.executionTime ?? 0 };
          stat.totalScore += pts;
          stat.totalExecutionTime += sub.executionTime ?? 0;
        }
      }
    }

    const leaderboard = Object.values(leaderboardMap)
      .map((p) => ({
        user: p.user,
        totalScore: p.totalScore,
        totalExecutionTime: p.totalExecutionTime,
        solvedCount: Object.keys(p.solvedProblems).length,
        attempts: p.attempts,
      }))
      .sort((a, b) =>
        b.totalScore !== a.totalScore
          ? b.totalScore - a.totalScore
          : a.totalExecutionTime - b.totalExecutionTime
      );

    res.status(200).json({
      success: true,
      contest: {
        slug: contest.slug,
        title: contest.title,
        startTime: contest.startTime,
        endTime: contest.endTime,
      },
      leaderboard,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/contests/:slug/participate
 */
const participateInContest = async (req, res, next) => {
  try {
    const contest = req.resource;
    const userId = req.user.id;

    const participation = await prisma.contestParticipation.upsert({
      where: { userId_contestId: { userId, contestId: contest.id } },
      update: {},
      create: { userId, contestId: contest.id, completed: false },
      include: {
        user: { select: { username: true, email: true, role: true } },
        contest: { select: { slug: true, title: true, category: true } },
      },
    });

    broadcastParticipationReport(participation);
    await broadcastLeaderboardUpdate(contest.id);

    res.status(200).json({
      success: true,
      message: 'Participation registered successfully.',
      participation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/contests/:slug/finish
 */
const finishContestAttempt = async (req, res, next) => {
  try {
    const contest = req.resource;
    const userId = req.user.id;
    const { score, timeSpent } = req.body;

    const participation = await prisma.contestParticipation.upsert({
      where: { userId_contestId: { userId, contestId: contest.id } },
      update: { completed: true, score: score ?? 0, timeSpent: timeSpent ?? '0m 0s' },
      create: { userId, contestId: contest.id, completed: true, score: score ?? 0, timeSpent: timeSpent ?? '0m 0s' },
      include: {
        user: { select: { username: true, email: true, role: true } },
        contest: { select: { slug: true, title: true, category: true } },
      },
    });

    broadcastParticipationReport(participation);

    res.status(200).json({
      success: true,
      message: 'Contest attempt finished successfully.',
      participation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/contests/:slug/participation
 */
const getContestParticipation = async (req, res, next) => {
  try {
    const contest = req.resource;
    const userId = req.user.id;

    const participation = await prisma.contestParticipation.findUnique({
      where: { userId_contestId: { userId, contestId: contest.id } },
      select: { completed: true, score: true, timeSpent: true, createdAt: true },
    });

    res.status(200).json({ success: true, participation });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/contests/:slug/participants (staff only)
 */
const getContestParticipants = async (req, res, next) => {
  try {
    const contest = req.resource;

    const participants = await prisma.contestParticipation.findMany({
      where: { contestId: contest.id },
      include: {
        user: { select: { username: true, email: true, role: true } },
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
    });

    res.status(200).json({ success: true, count: participants.length, participants });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/contests/reports/participations (super-admin / mentor)
 */
const getAllParticipationReports = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === 'ADMIN' && !req.user.instituteId;
    const myInstituteId = req.user.instituteId ?? null;

    const participations = await prisma.contestParticipation.findMany({
      where: isSuperAdmin ? {} : {
        OR: [
          { contest: { OR: [{ instituteId: myInstituteId }, { creator: { instituteId: myInstituteId } }] } },
          { user: { instituteId: myInstituteId } },
        ],
      },
      include: {
        user: { select: { username: true, email: true, role: true } },
        contest: { select: { slug: true, title: true, category: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, count: participations.length, participations });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/contests/:slug — req.resource is the contest.
 */
const updateContest = async (req, res, next) => {
  try {
    const contest = req.resource;
    const { title, description, category, startTime, endTime, problems, totalPoints } = req.body;

    const data = {};
    if (title !== undefined) {
      const newSlug = await generateUniqueContestSlug(slugify(title), contest.id);
      if (newSlug !== contest.slug) {
        await prisma.contestSlugHistory.create({
          data: { slug: contest.slug, contestId: contest.id },
        });
        data.slug = newSlug;
        invalidateResourceCache('contest', contest.slug);
      }
      data.title = title;
    }
    if (description !== undefined) data.description = description;
    if (category    !== undefined) data.category    = category;
    if (startTime   !== undefined) data.startTime   = new Date(startTime);
    if (endTime     !== undefined) data.endTime     = new Date(endTime);

    const updatedContest = await prisma.contest.update({
      where: { id: contest.id },
      data,
    });

    if (problems !== undefined && Array.isArray(problems)) {
      await prisma.contestProblem.deleteMany({ where: { contestId: contest.id } });
      const pointsEach = Math.round((totalPoints || 300) / (problems.length || 1));
      for (const pId of problems) {
        const numericId = parseInt(pId, 10);
        if (!isNaN(numericId)) {
          await prisma.contestProblem.create({
            data: { contestId: contest.id, problemId: numericId, points: pointsEach },
          });
        }
      }
    }

    invalidateResourceCache('contest', contest.slug);
    if (data.slug) invalidateResourceCache('contest', data.slug);

    res.status(200).json({
      success: true,
      message: 'Contest updated successfully.',
      contest: sanitizeContest(updatedContest),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/contests/:slug
 */
const deleteContest = async (req, res, next) => {
  try {
    const contest = req.resource;
    await prisma.contest.delete({ where: { id: contest.id } });
    invalidateResourceCache('contest', contest.slug);

    res.status(200).json({ success: true, message: 'Contest deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/contests/:slug/survey
 */
const submitContestSurvey = async (req, res, next) => {
  try {
    const contest = req.resource;
    const userId = req.user.id;
    const { employmentStatus, collegeName, companies, interviewStage } = req.body;

    const participation = await prisma.contestParticipation.upsert({
      where: { userId_contestId: { userId, contestId: contest.id } },
      update: {
        employmentStatus,
        collegeName,
        companies: Array.isArray(companies) ? companies.join(', ') : companies,
        interviewStage,
      },
      create: {
        userId, contestId: contest.id, completed: true,
        employmentStatus, collegeName,
        companies: Array.isArray(companies) ? companies.join(', ') : companies,
        interviewStage,
      },
    });

    broadcastParticipationReport(participation);

    res.status(200).json({
      success: true,
      message: 'Survey submitted successfully.',
      participation,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createContest,
  addProblemToContest,
  getAllContests,
  getContestDetails,
  getContestLeaderboard,
  participateInContest,
  finishContestAttempt,
  getContestParticipation,
  getContestParticipants,
  getAllParticipationReports,
  updateContest,
  deleteContest,
  submitContestSurvey,
};
