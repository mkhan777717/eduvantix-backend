const prisma = require('../prisma');
const { contestSchema, contestProblemSchema } = require('../utils/validators');
const { broadcastParticipationReport, broadcastLeaderboardUpdate } = require('../services/socketService');

/**
 * Create a new contest (Admin only)
 */
const createContest = async (req, res, next) => {
  try {
    const validatedData = contestSchema.parse(req.body);
    const { title, description, category, startTime, endTime, batchIds } = validatedData;
    const creatorId = req.user.id;

    // Validate that all targeted batches belong to the creator's institute for non-super-admins
    if (req.user.role !== 'ADMIN' && batchIds && batchIds.length > 0) {
      const dbBatches = await prisma.batch.findMany({
        where: {
          id: { in: batchIds },
          instituteId: req.user.instituteId
        }
      });
      if (dbBatches.length !== batchIds.length) {
        return res.status(403).json({
          success: false,
          message: 'You can only target cohorts/batches belonging to your own institute.'
        });
      }
    }

    const instituteId = req.user.role !== 'ADMIN' ? req.user.instituteId : null;

    const contest = await prisma.contest.create({
      data: {
        title,
        description,
        category,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        creatorId,
        instituteId,
        batches: batchIds && batchIds.length > 0 ? {
          connect: batchIds.map(id => ({ id }))
        } : undefined
      },
    });

    res.status(201).json({
      success: true,
      message: 'Contest created successfully.',
      contest,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a problem to a contest (Admin only)
 */
const addProblemToContest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const contestId = parseInt(id);

    if (isNaN(contestId)) {
      return res.status(400).json({ success: false, message: 'Invalid contest ID format.' });
    }

    const validatedData = contestProblemSchema.parse(req.body);
    const { problemId, points } = validatedData;

    // Verify contest exists
    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found.' });
    }

    // Verify problem exists
    const problem = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      return res.status(404).json({ success: false, message: 'Problem not found.' });
    }

    // Add problem to contest
    const contestProblem = await prisma.contestProblem.create({
      data: {
        contestId,
        problemId,
        points: points || 100,
      },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Problem added to contest successfully.',
      contestProblem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all contests (Public)
 */
const getAllContests = async (req, res, next) => {
  try {
    // Unauthenticated users see nothing
    if (!req.user) {
      return res.status(200).json({ success: true, count: 0, contests: [] });
    }

    let whereClause = {};

    if (req.user.role === 'ADMIN' && !req.user.instituteId) {
      // Super-admin (no institute): see every contest
      whereClause = {};
    } else if (req.user.role === 'USER') {
      // Student: fetch their institute and enrolled batches
      const student = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          instituteId: true,
          batchesStudied: { select: { id: true } }
        }
      });
      const studentInstituteId = student?.instituteId || null;
      const batchIds = student ? student.batchesStudied.map(b => b.id) : [];

      // Only show contests that belong to the student's institute
      // AND (no batch restriction OR student is enrolled in that batch)
      whereClause = {
        OR: [
          { instituteId: null },
          { instituteId: studentInstituteId },
          { creator: { instituteId: studentInstituteId } }
        ],
        AND: [
          {
            OR: [
              { batches: { none: {} } },
              ...(batchIds.length > 0 ? [{
                batches: { some: { id: { in: batchIds } } }
              }] : [])
            ]
          }
        ]
      };
    } else {
      // Institute admin / Mentor / scoped Admin: only their own institute's contests
      const myInstituteId = req.user.instituteId;
      whereClause = {
        OR: [
          { instituteId: null },
          { instituteId: myInstituteId },
          { creator: { instituteId: myInstituteId } }
        ]
      };
    }

    const contests = await prisma.contest.findMany({
      where: whereClause,
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            instituteId: true,
          },
        },
        contestProblems: {
          select: {
            points: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    const userParticipations = await prisma.contestParticipation.findMany({
      where: { userId: req.user.id }
    });

    const mappedContests = contests.map(c => {
      const participation = userParticipations.find(p => p.contestId === c.id) || null;
      return {
        ...c,
        userParticipation: participation
      };
    });

    res.status(200).json({
      success: true,
      count: mappedContests.length,
      contests: mappedContests,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get details of a single contest including its problems
 */
const getContestDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const contestId = parseInt(id);

    if (isNaN(contestId)) {
      return res.status(400).json({ success: false, message: 'Invalid contest ID format.' });
    }

    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        creator: {
          select: { id: true, username: true, instituteId: true },
        },
        contestProblems: {
          include: {
            problem: {
              include: {
                testCases: true,
              },
            },
          },
        },
      },
    });

    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found.' });
    }

    // ── Institute isolation ─────────────────────────────────────────────────────
    // Super-admin (ADMIN with no institute) can access any contest.
    // Everyone else can only access contests belonging to their own institute.
    if (req.user) {
      const isSuperAdmin = req.user.role === 'ADMIN' && !req.user.instituteId;
      if (!isSuperAdmin) {
        // For students: check their own instituteId (fetched fresh to be safe)
        let viewerInstituteId = req.user.instituteId;
        if (!viewerInstituteId && req.user.role === 'USER') {
          const freshUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { instituteId: true }
          });
          viewerInstituteId = freshUser?.instituteId || null;
        }

        const contestInstituteId = contest.instituteId || contest.creator?.instituteId;
        if (viewerInstituteId && contestInstituteId && contestInstituteId !== viewerInstituteId) {
          return res.status(403).json({ success: false, message: 'You do not have access to this contest.' });
        }
      }
    }

    // Filter test cases based on user permission (admins / institute admins see all, students see samples only)
    const isAdmin = req.user && (req.user.role === 'ADMIN' || req.user.role === 'INSTITUTE_ADMIN' || req.user.role === 'MENTOR' || req.user.role === 'BATCH_MANAGER');
    if (contest.contestProblems) {
      contest.contestProblems.forEach(cp => {
        if (cp.problem && cp.problem.testCases) {
          if (!isAdmin) {
            cp.problem.testCases = cp.problem.testCases.map(tc => {
              const plainTc = { ...tc };
              if (!plainTc.isSample) {
                plainTc.expectedOutput = '';
              }
              return plainTc;
            });
          }
        }
      });
    }

    let userParticipation = null;
    if (req.user) {
      userParticipation = await prisma.contestParticipation.findUnique({
        where: {
          userId_contestId: { userId: req.user.id, contestId }
        }
      });
    }

    res.status(200).json({
      success: true,
      contest: {
        ...contest,
        userParticipation
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Leaderboard for a contest
 */
const getContestLeaderboard = async (req, res, next) => {
  try {
    const { id } = req.params;
    const contestId = parseInt(id);

    if (isNaN(contestId)) {
      return res.status(400).json({ success: false, message: 'Invalid contest ID format.' });
    }

    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        contestProblems: {
          include: { problem: true },
        },
      },
    });

    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found.' });
    }

    // Get all problems associated with this contest
    const problemIds = contest.contestProblems.map((cp) => cp.problemId);

    // Map points for easy lookup
    const problemPointsMap = {};
    contest.contestProblems.forEach((cp) => {
      problemPointsMap[cp.problemId] = cp.points;
    });

    // Fetch all submissions for these problems during the contest period
    const submissions = await prisma.submission.findMany({
      where: {
        problemId: { in: problemIds },
        createdAt: {
          gte: contest.startTime,
          lte: contest.endTime,
        },
      },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
      orderBy: { createdAt: 'asc' }, // Process in chronological order
    });

    // Aggregate statistics per user
    const leaderboardMap = {};

    submissions.forEach((sub) => {
      const uId = sub.userId;
      if (!leaderboardMap[uId]) {
        leaderboardMap[uId] = {
          user: {
            id: sub.user.id,
            username: sub.user.username,
          },
          solvedProblems: {}, // problemId -> { points, executionTime, submissionId, createdAt }
          totalScore: 0,
          totalExecutionTime: 0,
          attempts: {}, // problemId -> attemptCount
        };
      }

      const userStats = leaderboardMap[uId];

      // If the problem is not solved yet by this user, evaluate this submission
      if (!userStats.solvedProblems[sub.problemId]) {
        userStats.attempts[sub.problemId] = (userStats.attempts[sub.problemId] || 0) + 1;

        if (sub.status === 'ACCEPTED') {
          const points = problemPointsMap[sub.problemId] || 100;
          userStats.solvedProblems[sub.problemId] = {
            points,
            executionTime: sub.executionTime || 0,
            submissionId: sub.id,
            createdAt: sub.createdAt,
          };
          userStats.totalScore += points;
          userStats.totalExecutionTime += sub.executionTime || 0;
        }
      }
    });

    // Convert map to array
    const leaderboard = Object.values(leaderboardMap).map((player) => {
      return {
        user: player.user,
        totalScore: player.totalScore,
        totalExecutionTime: player.totalExecutionTime,
        solvedCount: Object.keys(player.solvedProblems).length,
        solvedProblems: player.solvedProblems,
        attempts: player.attempts,
      };
    });

    // Sort: Higher Score first, then lower total execution time
    leaderboard.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      return a.totalExecutionTime - b.totalExecutionTime;
    });

    res.status(200).json({
      success: true,
      contest: {
        id: contest.id,
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
 * Register user participation in a contest
 */
const participateInContest = async (req, res, next) => {
  try {
    const contestId = parseInt(req.params.id);
    const userId = req.user.id;

    if (isNaN(contestId)) {
      return res.status(400).json({ success: false, message: 'Invalid contest ID format.' });
    }

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found.' });
    }

    const participation = await prisma.contestParticipation.upsert({
      where: {
        userId_contestId: { userId, contestId }
      },
      update: {},
      create: {
        userId,
        contestId,
        completed: false,
      },
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true }
        },
        contest: {
          select: { id: true, title: true, category: true }
        }
      }
    });

    broadcastParticipationReport(participation);
    await broadcastLeaderboardUpdate(contestId);

    res.status(200).json({
      success: true,
      message: 'Participation registered successfully.',
      participation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Finish user contest attempt
 */
const finishContestAttempt = async (req, res, next) => {
  try {
    const contestId = parseInt(req.params.id);
    const userId = req.user.id;
    const { score, timeSpent } = req.body;

    if (isNaN(contestId)) {
      return res.status(400).json({ success: false, message: 'Invalid contest ID format.' });
    }

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found.' });
    }

    const participation = await prisma.contestParticipation.upsert({
      where: {
        userId_contestId: { userId, contestId }
      },
      update: {
        completed: true,
        score: score || 0,
        timeSpent: timeSpent || '0m 0s',
      },
      create: {
        userId,
        contestId,
        completed: true,
        score: score || 0,
        timeSpent: timeSpent || '0m 0s',
      },
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true }
        },
        contest: {
          select: { id: true, title: true, category: true }
        }
      }
    });

    broadcastParticipationReport(participation);

    res.status(200).json({
      success: true,
      message: 'Contest attempt finished successfully.',
      participation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user participation in a contest
 */
const getContestParticipation = async (req, res, next) => {
  try {
    const contestId = parseInt(req.params.id);
    const userId = req.user.id;

    if (isNaN(contestId)) {
      return res.status(400).json({ success: false, message: 'Invalid contest ID format.' });
    }

    const participation = await prisma.contestParticipation.findUnique({
      where: {
        userId_contestId: { userId, contestId }
      }
    });

    res.status(200).json({
      success: true,
      participation
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all participants for a contest (Admin only)
 */
const getContestParticipants = async (req, res, next) => {
  try {
    const contestId = parseInt(req.params.id);

    if (isNaN(contestId)) {
      return res.status(400).json({ success: false, message: 'Invalid contest ID format.' });
    }

    const participants = await prisma.contestParticipation.findMany({
      where: { contestId },
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true }
        }
      },
      orderBy: [
        { score: 'desc' },
        { createdAt: 'asc' }
      ]
    });

    res.status(200).json({
      success: true,
      count: participants.length,
      participants
    });
  } catch (error) {
    next(error);
  }
};

const getAllParticipationReports = async (req, res, next) => {
  try {
    // Super-admin sees everything; institute admins are scoped to their own institute
    const isSuperAdmin = req.user.role === 'ADMIN' && !req.user.instituteId;
    const myInstituteId = req.user.instituteId || null;

    const participations = await prisma.contestParticipation.findMany({
      where: isSuperAdmin ? {} : {
        OR: [
          {
            contest: {
              OR: [
                { instituteId: myInstituteId },
                { creator: { instituteId: myInstituteId } }
              ]
            }
          },
          {
            user: { instituteId: myInstituteId }
          }
        ]
      },
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true }
        },
        contest: {
          select: { id: true, title: true, category: true }
        }
      },
      orderBy: [
        { createdAt: 'desc' }
      ]
    });

    res.status(200).json({
      success: true,
      count: participations.length,
      participations
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a contest (Admin only)
 */
const updateContest = async (req, res, next) => {
  try {
    const contestId = parseInt(req.params.id);

    if (isNaN(contestId)) {
      return res.status(400).json({ success: false, message: 'Invalid contest ID format.' });
    }

    // Verify contest exists
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: { creator: true }
    });
    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found.' });
    }

    // Permission check:
    // - Super-admin (role=ADMIN, no instituteId) can update anything
    // - Institute admins/mentors can only update contests belonging to their own institute
    const isSuperAdmin = req.user.role === 'ADMIN' && !req.user.instituteId;
    if (!isSuperAdmin) {
      const contestInstituteId = contest.instituteId || contest.creator?.instituteId;
      if (contestInstituteId !== req.user.instituteId) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to update this contest.'
        });
      }
    }

    const { title, description, category, startTime, endTime, problems, totalPoints } = req.body;

    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (category !== undefined) data.category = category;
    if (startTime !== undefined) data.startTime = new Date(startTime);
    if (endTime !== undefined) data.endTime = new Date(endTime);

    // Update contest core details
    const updatedContest = await prisma.contest.update({
      where: { id: contestId },
      data,
    });

    // If problems list is provided, synchronize it
    if (problems !== undefined && Array.isArray(problems)) {
      // 1. Delete all existing problems for this contest
      await prisma.contestProblem.deleteMany({
        where: { contestId }
      });

      // 2. Add the new ones
      const pointsPerProblem = Math.round((totalPoints || 300) / (problems.length || 1));
      for (const pId of problems) {
        const problemId = parseInt(pId);
        if (!isNaN(problemId)) {
          await prisma.contestProblem.create({
            data: {
              contestId,
              problemId,
              points: pointsPerProblem
            }
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Contest updated successfully.',
      contest: updatedContest,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a contest (Admin only)
 */
const deleteContest = async (req, res, next) => {
  try {
    const contestId = parseInt(req.params.id);

    if (isNaN(contestId)) {
      return res.status(400).json({ success: false, message: 'Invalid contest ID format.' });
    }

    // Verify contest exists
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: { creator: true }
    });
    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found.' });
    }

    // Permission check:
    // - Super-admin (role=ADMIN, no instituteId) can delete anything
    // - Institute admins/mentors can only delete contests belonging to their own institute
    const isSuperAdminDel = req.user.role === 'ADMIN' && !req.user.instituteId;
    if (!isSuperAdminDel) {
      const contestInstituteId = contest.instituteId || contest.creator?.instituteId;
      if (contestInstituteId !== req.user.instituteId) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to delete this contest.'
        });
      }
    }

    // Delete the contest
    await prisma.contest.delete({
      where: { id: contestId }
    });

    res.status(200).json({
      success: true,
      message: 'Contest deleted successfully.'
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
};

