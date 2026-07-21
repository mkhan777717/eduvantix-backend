'use strict';

/**
 * problemController.js
 *
 * Pure data layer — zero permission logic.
 * All authorization is enforced by middleware (resolvers.js + permissionService.js).
 *
 * req.resource is populated by resolveProblem middleware before these handlers run.
 */

const prisma = require('../prisma');
const { problemSchema, problemUpdateSchema } = require('../utils/validators');
const { invalidateResourceCache } = require('../middleware/resolvers');

// ── Slug helpers ───────────────────────────────────────────────────────────────

const slugify = (title) =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

async function generateUniqueSlug(base, excludeId = null) {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await prisma.problem.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

// ── Strip internal integer ID from outbound responses ─────────────────────────

function sanitizeProblem(problem, { isStaff = false } = {}) {
  // Strip DB id — consumers must use slug
  const { id, instituteId, ...rest } = problem;
  if (!isStaff) {
    // Non-staff: strip solution, editorial, evaluation
    delete rest.solution;
    delete rest.editorial;
    delete rest.evaluation;
  }
  return rest;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /api/problems
 * Create a new problem (staff only — enforced by route middleware).
 */
const createProblem = async (req, res, next) => {
  try {
    const validatedData = problemSchema.parse(req.body);
    const {
      title, difficulty, statement, inputFormat, outputFormat, constraints,
      explanation, followup, editorial, solution, evaluation,
      templateJS, templatePython, templateGo, templateCPP, templateJava,
      testCases,
      functionName, category, returnType, judgeStrategy, scoringModel,
      parameters, methods, timeout, memoryLimit, comparator,
    } = validatedData;

    const slug = await generateUniqueSlug(slugify(title));
    const instituteId = req.user.role !== 'ADMIN' ? req.user.instituteId : null;

    const problem = await prisma.problem.create({
      data: {
        title, slug, difficulty, statement, inputFormat, outputFormat,
        constraints, explanation,
        followup:   followup   ?? '',
        editorial:  editorial  ?? '',
        solution:   solution   ?? '',
        evaluation: evaluation ?? '',
        templateJS:     templateJS     ?? '',
        templatePython: templatePython ?? '',
        templateGo:     templateGo     ?? '',
        templateCPP:    templateCPP    ?? '',
        templateJava:   templateJava   ?? '',
        functionName:  functionName  ?? 'solve',
        category:      category      ?? 'FUNCTIONAL',
        returnType:    returnType     ?? 'INT',
        judgeStrategy: judgeStrategy ?? 'tokens',
        scoringModel:  scoringModel  ?? 'PARTIAL',
        parameters:    parameters    ?? [],
        methods:       methods       ?? [],
        timeout:       timeout       ?? 2000,
        memoryLimit:   memoryLimit   ?? 256,
        comparator:    comparator    ?? judgeStrategy ?? 'tokens',
        instituteId,
        testCases: { create: testCases },
      },
      include: { testCases: true },
    });

    res.status(201).json({
      success: true,
      message: 'Problem created successfully.',
      problem: sanitizeProblem(problem, { isStaff: true }),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/problems/:slug
 * Update a problem — req.resource is already resolved and permission verified.
 */
const updateProblem = async (req, res, next) => {
  try {
    const problem = req.resource; // resolved by resolveProblem
    const validatedData = problemUpdateSchema.parse(req.body);
    const {
      title, difficulty, statement, inputFormat, outputFormat, constraints,
      explanation, followup, editorial, solution, evaluation,
      templateJS, templatePython, templateGo, templateCPP, templateJava,
      testCases,
      functionName, category, returnType, judgeStrategy, scoringModel,
      parameters, methods, timeout, memoryLimit, comparator,
    } = validatedData;

    const updateData = {};

    if (title !== undefined) {
      const newSlug = await generateUniqueSlug(slugify(title), problem.id);
      // Slug changed — archive old slug in history
      if (newSlug !== problem.slug) {
        await prisma.problemSlugHistory.create({
          data: { slug: problem.slug, problemId: problem.id },
        });
        updateData.slug = newSlug;
        // Invalidate old slug from cache
        invalidateResourceCache('problem', problem.slug);
      }
      updateData.title = title;
    }

    if (difficulty  !== undefined) updateData.difficulty  = difficulty;
    if (statement   !== undefined) updateData.statement   = statement;
    if (inputFormat !== undefined) updateData.inputFormat = inputFormat;
    if (outputFormat !== undefined) updateData.outputFormat = outputFormat;
    if (constraints !== undefined) updateData.constraints = constraints;
    if (explanation !== undefined) updateData.explanation = explanation;
    if (followup    !== undefined) updateData.followup    = followup;
    if (editorial   !== undefined) updateData.editorial   = editorial;
    if (solution    !== undefined) updateData.solution    = solution;
    if (evaluation  !== undefined) updateData.evaluation  = evaluation;
    if (templateJS      !== undefined) updateData.templateJS      = templateJS;
    if (templatePython  !== undefined) updateData.templatePython  = templatePython;
    if (templateGo      !== undefined) updateData.templateGo      = templateGo;
    if (templateCPP     !== undefined) updateData.templateCPP     = templateCPP;
    if (templateJava    !== undefined) updateData.templateJava    = templateJava;
    if (functionName  !== undefined) updateData.functionName  = functionName;
    if (category      !== undefined) updateData.category      = category;
    if (returnType    !== undefined) updateData.returnType    = returnType;
    if (judgeStrategy !== undefined) updateData.judgeStrategy = judgeStrategy;
    if (scoringModel  !== undefined) updateData.scoringModel  = scoringModel;
    if (parameters    !== undefined) updateData.parameters    = parameters;
    if (methods       !== undefined) updateData.methods       = methods;
    if (timeout       !== undefined) updateData.timeout       = timeout;
    if (memoryLimit   !== undefined) updateData.memoryLimit   = memoryLimit;
    if (comparator    !== undefined) updateData.comparator    = comparator;

    const result = await prisma.$transaction(async (tx) => {
      if (testCases !== undefined) {
        await tx.testCase.deleteMany({ where: { problemId: problem.id } });
        updateData.testCases = { create: testCases };
      }
      return tx.problem.update({
        where: { id: problem.id },
        data: updateData,
        include: { testCases: true },
      });
    });

    // Invalidate cache for the current slug (it may have changed)
    invalidateResourceCache('problem', problem.slug);
    if (updateData.slug) invalidateResourceCache('problem', updateData.slug);

    res.status(200).json({
      success: true,
      message: 'Problem updated successfully.',
      problem: sanitizeProblem(result, { isStaff: true }),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/problems/:slug
 */
const deleteProblem = async (req, res, next) => {
  try {
    const problem = req.resource;
    await prisma.problem.delete({ where: { id: problem.id } });
    invalidateResourceCache('problem', problem.slug);

    res.status(200).json({ success: true, message: 'Problem deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

const PaginationService = require('../services/paginationService');
const paginationConfig = require('../config/pagination');

/**
 * GET /api/problems
 * Institute-scoped listing using PaginationService.
 */
const getAllProblems = async (req, res, next) => {
  try {
    const user = req.user;
    let whereClause = {};

    if (user) {
      if (user.role === 'ADMIN' && !user.instituteId) {
        whereClause = { instituteId: null };
      } else {
        whereClause = {
          OR: [{ instituteId: null }, { instituteId: user.instituteId }],
          ...(!['ADMIN', 'INSTITUTE_ADMIN', 'MENTOR', 'BATCH_MANAGER'].includes(user.role)
            ? { visibility: { notIn: ['DRAFT', 'HIDDEN'] } }
            : {}),
        };
      }
    } else {
      // Guests: only global, public problems
      whereClause = { instituteId: null, visibility: 'PUBLIC' };
    }

    const result = await PaginationService.paginate({
      model: prisma.problem,
      query: req.query,
      config: paginationConfig.problem,
      where: whereClause,
      ctx: { user },
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/problems/:slug
 * req.resource is already resolved and access validated by middleware.
 */
const getSingleProblem = async (req, res, next) => {
  try {
    const problem = req.resource;
    const user = req.user;
    const isStaff = ['ADMIN', 'INSTITUTE_ADMIN', 'MENTOR', 'BATCH_MANAGER'].includes(user?.role);

    // Include full testCases — re-fetch with testCases since resolver uses lean select
    const fullProblem = await prisma.problem.findUnique({
      where: { id: problem.id },
      include: { testCases: true },
    });

    // Generate boilerplate stubs if schema-driven
    let paramsList = [];
    if (fullProblem.parameters) {
      paramsList = typeof fullProblem.parameters === 'string'
        ? JSON.parse(fullProblem.parameters)
        : fullProblem.parameters;
    }

    if (Array.isArray(paramsList) && paramsList.length > 0) {
      const { generateBoilerplate } = require('../services/boilerplateService');
      const fn = fullProblem.functionName || 'solve';
      const rt = fullProblem.returnType || 'INT';
      fullProblem.templateJS     = generateBoilerplate('JAVASCRIPT', fn, paramsList, rt);
      fullProblem.templatePython = generateBoilerplate('PYTHON',     fn, paramsList, rt);
      fullProblem.templateGo     = generateBoilerplate('GO',         fn, paramsList, rt);
      fullProblem.templateCPP    = generateBoilerplate('CPP',        fn, paramsList, rt);
      fullProblem.templateJava   = generateBoilerplate('JAVA',       fn, paramsList, rt);
    }

    // Filter test cases for non-staff
    if (!isStaff) {
      const isContestProblem = await prisma.contestProblem.findFirst({
        where: { problemId: problem.id },
        select: { id: true },
      });
      if (isContestProblem) {
        fullProblem.testCases = fullProblem.testCases.map((tc) => ({
          ...tc,
          expectedOutput: tc.isSample ? tc.expectedOutput : '',
        }));
      } else {
        fullProblem.testCases = fullProblem.testCases.filter((tc) => tc.isSample);
      }
    }

    res.status(200).json({
      success: true,
      problem: sanitizeProblem(fullProblem, { isStaff }),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProblem,
  updateProblem,
  deleteProblem,
  getAllProblems,
  getSingleProblem,
};
