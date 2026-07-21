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

    // Run execution through pipeline and store result
    const submissionResult = await submitUserCode({
      userId,
      problemId: pid,
      language,
      code,
      runAll: req.body.runAll !== undefined ? !!req.body.runAll : true,
      options: {
        earlyTermination: req.body.earlyTermination !== undefined ? !!req.body.earlyTermination : !(req.body.runAll),
        scoringModel: req.body.scoringModel || 'PARTIAL',
        backend: req.body.backend || process.env.CODE_EXECUTION_BACKEND || 'local'
      }
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

const PaginationService = require('../services/paginationService');
const paginationConfig = require('../config/pagination');

/**
 * Get all submissions (with pagination, search, filtering, and sorting)
 */
const getAllSubmissions = async (req, res, next) => {
  try {
    const whereClause = {};

    if (req.user && req.user.role !== 'ADMIN') {
      whereClause.user = {
        instituteId: req.user.instituteId
      };
    }

    const result = await PaginationService.paginate({
      model: prisma.submission,
      query: req.query,
      config: paginationConfig.submission,
      where: whereClause,
      ctx: { user: req.user },
    });

    res.status(200).json(result);
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
          const assemblyEngine = require('../services/assemblyEngine');
          executableCode = assemblyEngine.assembleCode(language, code, problem);
        }
      }
    }

    const executionEngine = require('../services/execution/executionEngine');
    const execResult = await executionEngine.executeCode(language, executableCode, input || '', {
      backend: req.body.backend || process.env.CODE_EXECUTION_BACKEND || 'local',
      timeout: 3000
    });

    const result = {
      status: execResult.status,
      executionTime: execResult.executionTimeMs,
      output: execResult.stdout,
      error: execResult.stderr
    };

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

    // Run execution through pipeline and persist
    const submission = await submitUserCode({
      userId,
      problemId: problem.id,
      language,
      code,
      runAll: !!req.body.runAll,
      options: {
        earlyTermination: req.body.earlyTermination !== undefined ? !!req.body.earlyTermination : !req.body.runAll,
        scoringModel: req.body.scoringModel || 'PARTIAL',
        backend: req.body.backend || process.env.CODE_EXECUTION_BACKEND || 'local'
      }
    });

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
