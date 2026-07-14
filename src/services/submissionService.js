const prisma = require('../prisma');
const { judgeQueuedSubmission } = require('./judgeService');
const { broadcastLiveSubmission, broadcastLeaderboardUpdate } = require('./socketService');

/**
 * Submits user code, triggers execution against test cases, and stores the results
 * @param {Object} data - Submission info
 * @param {number} data.userId
 * @param {number} data.problemId
 * @param {string} data.language
 * @param {string} data.code
 * @param {boolean} data.runAll
 */
const submitUserCode = async ({ userId, problemId, language, code, runAll = false }) => {
  // 1. Fetch problem and testcases
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    include: { testCases: true },
  });

  if (!problem) {
    const error = new Error('Problem not found');
    error.statusCode = 404;
    throw error;
  }

  if (problem.testCases.length === 0) {
    const error = new Error('This problem does not have any test cases configured.');
    error.statusCode = 400;
    throw error;
  }

  // 2. Create pending submission in DB first
  const pendingSubmission = await prisma.submission.create({
    data: {
      userId,
      problemId,
      language: (() => {
        const lang = language.toUpperCase();
        if (lang === 'JAVA') return 'JAVA';
        if (lang === 'PYTHON') return 'PYTHON';
        if (lang === 'JAVASCRIPT') return 'JAVASCRIPT';
        if (lang === 'TYPESCRIPT') return 'JAVASCRIPT'; // Store as JS in DB
        if (lang === 'GO') return 'GO';
        if (lang === 'C') return 'CPP';      // Store as CPP in DB
        if (lang === 'CSHARP') return 'CPP';
        if (lang === 'KOTLIN') return 'JAVA';
        if (lang === 'SCALA') return 'JAVA';
        if (lang === 'SWIFT') return 'CPP';
        if (lang === 'RUST') return 'CPP';
        if (lang === 'RUBY') return 'PYTHON';
        if (lang === 'PHP') return 'PYTHON';
        if (lang === 'DART') return 'JAVASCRIPT';
        if (lang === 'ELIXIR') return 'PYTHON';
        if (lang === 'ERLANG') return 'PYTHON';
        if (lang === 'RACKET') return 'PYTHON';
        return 'CPP';
      })(),
      code,
      status: 'PENDING',
      executionTime: 0,
    },
  });

  let finalSubmission;

  try {
    // Determine if this is a schema-driven problem
    let paramsList = [];
    if (problem.parameters) {
      paramsList = typeof problem.parameters === 'string' 
        ? JSON.parse(problem.parameters) 
        : problem.parameters;
    }

    let executableCode = code;
    if (Array.isArray(paramsList) && paramsList.length > 0) {
      const { generateDriverCode } = require('./boilerplateService');
      executableCode = generateDriverCode(language, problem.functionName || 'solve', paramsList, problem.returnType || 'INT', code);
    }

    // 3. Execute code in sandbox
    const result = await judgeQueuedSubmission(language, executableCode, problem, problem.testCases, { runAll });

    // 4. Update submission with execution status
    finalSubmission = await prisma.submission.update({
      where: { id: pendingSubmission.id },
      data: {
        status: result.verdict,
        executionTime: result.executionTimeMs,
      },
      include: {
        user: { select: { id: true, username: true } },
        problem: { select: { id: true, title: true, slug: true } }
      }
    });

    // Attach raw verdict/results for controller mapping
    finalSubmission.judgeResult = result;

  } catch (error) {
    // If execution crashes unexpectedly, mark submission as RUNTIME_ERROR
    console.error('Submission execution failed:', error);
    finalSubmission = await prisma.submission.update({
      where: { id: pendingSubmission.id },
      data: {
        status: 'RUNTIME_ERROR',
        executionTime: 0,
      },
      include: {
        user: { select: { id: true, username: true } },
        problem: { select: { id: true, title: true, slug: true } }
      }
    });
  }

  // 5. Broadcast live submission update to admins
  if (finalSubmission) {
    broadcastLiveSubmission(finalSubmission);
  }

  // 6. Handle active contest score calculation and WebSocket leaderboard broadcasts
  try {
    const now = new Date();
    const activeContests = await prisma.contest.findMany({
      where: {
        contestProblems: {
          some: { problemId: problemId }
        },
        startTime: { lte: now },
        endTime: { gte: now }
      },
      include: {
        contestProblems: true
      }
    });

    for (const contest of activeContests) {
      const participation = await prisma.contestParticipation.findUnique({
        where: {
          userId_contestId: { userId, contestId: contest.id }
        }
      });

      if (participation) {
        const problemIds = contest.contestProblems.map(cp => cp.problemId);

        // Fetch all accepted submissions for this user during this contest window
        const userAcceptedSubmissions = await prisma.submission.findMany({
          where: {
            userId,
            problemId: { in: problemIds },
            status: 'ACCEPTED',
            createdAt: {
              gte: contest.startTime,
              lte: contest.endTime
            }
          }
        });

        // Calculate points based on unique solved problems
        const solvedProblemIds = new Set(userAcceptedSubmissions.map(s => s.problemId));
        let totalScore = 0;
        solvedProblemIds.forEach(pId => {
          const cp = contest.contestProblems.find(item => item.problemId === pId);
          totalScore += cp ? cp.points : 100;
        });

        // Update scores in ContestParticipation
        await prisma.contestParticipation.update({
          where: { id: participation.id },
          data: { score: totalScore }
        });

        // Trigger real-time updates for contest leaderboard and participants
        await broadcastLeaderboardUpdate(contest.id);
      }
    }
  } catch (err) {
    console.error('Failed to update contest scores or broadcast leaderboard updates:', err);
  }

  return finalSubmission;
};

module.exports = {
  submitUserCode,
};
