const prisma = require('../prisma');
const { submissionSchema } = require('../utils/validators');
const { submitUserCode } = require('../services/submissionService');

/**
 * Submit code for a problem
 */
const submitSolution = async (req, res, next) => {
  try {
    const { problemId } = req.params;
    const pid = parseInt(problemId);

    if (isNaN(pid)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid problem ID format.',
      });
    }

    // Validate submission input
    const validatedData = submissionSchema.parse(req.body);
    const { language, code } = validatedData;

    const userId = req.user.id; // From protect middleware

    // Run execution and store result
    const submissionResult = await submitUserCode({
      userId,
      problemId: pid,
      language,
      code,
      runAll: true,
    });

    res.status(201).json({
      success: true,
      message: 'Code execution completed.',
      submission: submissionResult,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all submissions (with optional filtering by user, problem, or status)
 */
const getAllSubmissions = async (req, res, next) => {
  try {
    const { userId, problemId, status } = req.query;

    const whereClause = {};

    if (userId) {
      whereClause.userId = parseInt(userId);
    }
    if (problemId) {
      whereClause.problemId = parseInt(problemId);
    }
    if (status) {
      whereClause.status = status;
    }

    if (req.user && req.user.role !== 'ADMIN') {
      whereClause.user = {
        instituteId: req.user.instituteId
      };
    }

    const submissions = await prisma.submission.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        problem: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Limit to recent 50 submissions for performance
    });

    res.status(200).json({
      success: true,
      count: submissions.length,
      submissions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get details of a single submission
 */
const getSingleSubmission = async (req, res, next) => {
  try {
    const { id } = req.params;
    const submissionId = parseInt(id);

    if (isNaN(submissionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid submission ID format.',
      });
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        user: {
          select: { id: true, username: true, instituteId: true },
        },
        problem: {
          select: { id: true, title: true, slug: true },
        },
      },
    });

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found.',
      });
    }

    if (!req.user || (req.user.role !== 'ADMIN' && submission.user.instituteId !== req.user.instituteId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this submission.',
      });
    }

    // Only the author or an admin should see the source code (optional privacy rule, let's keep it visible or private based on preference. Let's allow public display or restrict it. Usually CP platforms allow public view unless private. Let's let it be readable but keep safety).
    res.status(200).json({
      success: true,
      submission,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Run user code once with custom inputs in real-time (without database persistence)
 */
const runCode = async (req, res, next) => {
  try {
    const { language, code, input, problemId } = req.body;

    if (!language || !code) {
      return res.status(400).json({
        success: false,
        message: 'Language and code are required.',
      });
    }

    let executableCode = code;
    if (problemId) {
      const numericId = parseInt(problemId, 10);
      let problem;
      if (!isNaN(numericId)) {
        problem = await prisma.problem.findUnique({ where: { id: numericId } });
      } else {
        problem = await prisma.problem.findUnique({ where: { slug: problemId } });
      }

      if (problem && problem.parameters) {
        let paramsList = typeof problem.parameters === 'string'
          ? JSON.parse(problem.parameters)
          : problem.parameters;

        if (Array.isArray(paramsList) && paramsList.length > 0) {
          const { generateDriverCode } = require('../services/boilerplateService');
          executableCode = generateDriverCode(language, problem.functionName || 'solve', paramsList, problem.returnType || 'INT', code);
        }
      }
    }

    const { runCustomCode } = require('../services/executionService');
    const result = await runCustomCode(language, executableCode, input || '');

    res.status(200).json({
      success: true,
      result,
    });
  } catch (error) {
    next(error);
  }
};

const submitSolutionDirect = async (req, res, next) => {
  try {
    const { problemId } = req.body;

    if (!problemId) {
      return res.status(400).json({
        success: false,
        message: 'problemId is required.',
      });
    }

    // Validate submission input
    const validatedData = submissionSchema.parse(req.body);
    const { language, code } = validatedData;

    const userId = req.user.id; // Resolved by protect middleware

    // Resolve problem by integer ID or slug string
    let problem;
    const numericId = parseInt(problemId, 10);
    if (!isNaN(numericId)) {
      problem = await prisma.problem.findUnique({
        where: { id: numericId },
      });
    }

    if (!problem) {
      problem = await prisma.problem.findUnique({
        where: { slug: problemId },
      });
    }

    if (!problem) {
      return res.status(404).json({
        success: false,
        message: `Problem not found for identifier: ${problemId}`,
      });
    }

    // Run execution through the queue and persist
    const submission = await submitUserCode({
      userId,
      problemId: problem.id,
      language,
      code,
      runAll: !!req.body.runAll,
    });

    // Check configuration and construct output verdict response mapping
    const debugMode = process.env.DEBUG === 'true' || req.query.debug === 'true' || process.env.NODE_ENV !== 'production';
    const result = submission.judgeResult || {
      verdict: submission.status,
      failedTestCase: null,
      totalTestCases: 0,
      passedTestCases: 0,
      executionTimeMs: submission.executionTime || 0,
      memoryKb: 0,
      stderr: '',
    };

    res.status(201).json({
      verdict: result.verdict,
      failedTestCase: result.failedTestCase,
      totalTestCases: result.totalTestCases,
      passedTestCases: result.passedTestCases,
      executionTimeMs: result.executionTimeMs,
      memoryKb: result.memoryKb || 0,
      ...(debugMode ? { stderr: result.stderr || '' } : {}),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitSolution,
  submitSolutionDirect,
  getAllSubmissions,
  getSingleSubmission,
  runCode,
};
