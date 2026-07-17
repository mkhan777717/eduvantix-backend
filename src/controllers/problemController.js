const prisma = require('../prisma');
const { problemSchema, problemUpdateSchema } = require('../utils/validators');

/**
 * Helper to slugify title
 */
const slugify = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, '') // Remove invalid chars
    .replace(/\s+/g, '-') // Collapse whitespace and replace by -
    .replace(/-+/g, '-'); // Collapse dashes
};

/**
 * Create a new problem (Admin only)
 */
const createProblem = async (req, res, next) => {
  try {
    const validatedData = problemSchema.parse(req.body);
    const {
      title, difficulty, statement, inputFormat, outputFormat, constraints,
      explanation, followup, editorial, solution, evaluation,
      templateJS, templatePython, templateGo, templateCPP, templateJava,
      testCases,
      // Compiler/Judge fields
      functionName, category, returnType, judgeStrategy, scoringModel,
      parameters, methods, timeout, memoryLimit, comparator
    } = validatedData;

    // Generate unique slug
    let slug = slugify(title);
    const existingProblem = await prisma.problem.findUnique({ where: { slug } });
    if (existingProblem) {
      slug = `${slug}-${Date.now()}`;
    }

    const instituteId = req.user && req.user.role !== 'ADMIN' ? req.user.instituteId : null;

    // Create problem along with testcases in a transaction
    const problem = await prisma.problem.create({
      data: {
        title,
        slug,
        difficulty,
        statement,
        inputFormat,
        outputFormat,
        constraints,
        explanation,
        followup: followup || '',
        editorial: editorial || '',
        solution: solution || '',
        evaluation: evaluation || '',
        templateJS: templateJS || '',
        templatePython: templatePython || '',
        templateGo: templateGo || '',
        templateCPP: templateCPP || '',
        templateJava: templateJava || '',
        // Compiler/Judge fields
        functionName: functionName || 'solve',
        category: category || 'FUNCTIONAL',
        returnType: returnType || 'INT',
        judgeStrategy: judgeStrategy || 'tokens',
        scoringModel: scoringModel || 'PARTIAL',
        parameters: parameters || [],
        methods: methods || [],
        timeout: timeout || 2000,
        memoryLimit: memoryLimit || 256,
        comparator: comparator || judgeStrategy || 'tokens',
        instituteId,
        testCases: {
          create: testCases,
        },
      },
      include: {
        testCases: true,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Problem created successfully.',
      problem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a problem (Admin only)
 */
const updateProblem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const problemId = parseInt(id);

    if (isNaN(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem ID format.' });
    }

    const validatedData = problemUpdateSchema.parse(req.body);
    const {
      title, difficulty, statement, inputFormat, outputFormat, constraints,
      explanation, followup, editorial, solution, evaluation,
      templateJS, templatePython, templateGo, templateCPP, templateJava,
      testCases,
      // Compiler/Judge fields
      functionName, category, returnType, judgeStrategy, scoringModel,
      parameters, methods, timeout, memoryLimit, comparator
    } = validatedData;

    // Find the problem first
    const problemExists = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!problemExists) {
      return res.status(404).json({ success: false, message: 'Problem not found.' });
    }

    // Permission check: Non-super admins can only update their own institute's problems or global problems
    if (req.user && req.user.role !== 'ADMIN') {
      if (problemExists.instituteId && problemExists.instituteId !== req.user.instituteId) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to update this problem.'
        });
      }
    }

    // Prepare update data
    const updateData = {};
    if (title !== undefined) {
      updateData.title = title;
      updateData.slug = slugify(title);
      // Ensure slug is unique if it changed
      if (updateData.slug !== problemExists.slug) {
        const slugExists = await prisma.problem.findUnique({ where: { slug: updateData.slug } });
        if (slugExists) {
          updateData.slug = `${updateData.slug}-${Date.now()}`;
        }
      }
    }
    if (difficulty !== undefined) updateData.difficulty = difficulty;
    if (statement !== undefined) updateData.statement = statement;
    if (inputFormat !== undefined) updateData.inputFormat = inputFormat;
    if (outputFormat !== undefined) updateData.outputFormat = outputFormat;
    if (constraints !== undefined) updateData.constraints = constraints;
    if (explanation !== undefined) updateData.explanation = explanation;
    if (followup !== undefined) updateData.followup = followup;
    if (editorial !== undefined) updateData.editorial = editorial;
    if (solution !== undefined) updateData.solution = solution;
    if (evaluation !== undefined) updateData.evaluation = evaluation;
    if (templateJS !== undefined) updateData.templateJS = templateJS;
    if (templatePython !== undefined) updateData.templatePython = templatePython;
    if (templateGo !== undefined) updateData.templateGo = templateGo;
    if (templateCPP !== undefined) updateData.templateCPP = templateCPP;
    if (templateJava !== undefined) updateData.templateJava = templateJava;
    // Compiler/Judge fields
    if (functionName !== undefined) updateData.functionName = functionName;
    if (category !== undefined) updateData.category = category;
    if (returnType !== undefined) updateData.returnType = returnType;
    if (judgeStrategy !== undefined) updateData.judgeStrategy = judgeStrategy;
    if (scoringModel !== undefined) updateData.scoringModel = scoringModel;
    if (parameters !== undefined) updateData.parameters = parameters;
    if (methods !== undefined) updateData.methods = methods;
    if (timeout !== undefined) updateData.timeout = timeout;
    if (memoryLimit !== undefined) updateData.memoryLimit = memoryLimit;
    if (comparator !== undefined) updateData.comparator = comparator;

    // Perform update in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // If test cases are provided, delete existing and create new ones
      if (testCases !== undefined) {
        await tx.testCase.deleteMany({
          where: { problemId },
        });

        updateData.testCases = {
          create: testCases,
        };
      }

      return await tx.problem.update({
        where: { id: problemId },
        data: updateData,
        include: { testCases: true },
      });
    });

    res.status(200).json({
      success: true,
      message: 'Problem updated successfully.',
      problem: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a problem (Admin only)
 */
const deleteProblem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const problemId = parseInt(id);

    if (isNaN(problemId)) {
      return res.status(400).json({ success: false, message: 'Invalid problem ID format.' });
    }

    const problemExists = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!problemExists) {
      return res.status(404).json({ success: false, message: 'Problem not found.' });
    }

    // Permission check: Non-super admins can only delete their own institute's problems or global problems
    if (req.user && req.user.role !== 'ADMIN') {
      if (problemExists.instituteId && problemExists.instituteId !== req.user.instituteId) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to delete this problem.'
        });
      }
    }

    // Delete problem (testcases will delete cascade due to schema mapping)
    await prisma.problem.delete({
      where: { id: problemId },
    });

    res.status(200).json({
      success: true,
      message: 'Problem deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all problems (Public/Authenticated)
 */
const getAllProblems = async (req, res, next) => {
  try {
    const user = req.user;
    let whereClause = {};

    if (user) {
      if (user.role === 'ADMIN') {
        // Super Admin only manages global problems
        whereClause = { instituteId: null };
      } else {
        // Institute Admin/Mentor/Batch Manager see global problems + their institute's problems
        whereClause = {
          OR: [
            { instituteId: null },
            { instituteId: user.instituteId }
          ]
        };
      }
    } else {
      // Guests only see global problems
      whereClause = { instituteId: null };
    }

    const problems = await prisma.problem.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        slug: true,
        difficulty: true,
        createdAt: true,
        instituteId: true,
        _count: {
          select: { testCases: true }
        }
      },
      orderBy: { id: 'desc' },
    });

    const problemsWithCount = problems.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      difficulty: p.difficulty,
      createdAt: p.createdAt,
      instituteId: p.instituteId,
      testCasesCount: p._count?.testCases || 0,
    }));

    res.status(200).json({
      success: true,
      count: problemsWithCount.length,
      problems: problemsWithCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single problem by slug (Public/Admin)
 * Filters testcases to show only sample cases for non-admins to prevent cheating.
 */
const getSingleProblem = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const isId = /^\d+$/.test(slug);
    const problem = await prisma.problem.findUnique({
      where: isId ? { id: parseInt(slug) } : { slug },
      include: {
        testCases: true,
      },
    });

    if (!problem) {
      return res.status(404).json({
        success: false,
        message: 'Problem not found.',
      });
    }

    // Generate stubs dynamically if schema-driven
    let paramsList = [];
    if (problem.parameters) {
      paramsList = typeof problem.parameters === 'string'
        ? JSON.parse(problem.parameters)
        : problem.parameters;
    }

    if (Array.isArray(paramsList) && paramsList.length > 0) {
      const { generateBoilerplate } = require('../services/boilerplateService');
      const functionName = problem.functionName || 'solve';
      const returnType = problem.returnType || 'INT';

      problem.templateJS = generateBoilerplate('JAVASCRIPT', functionName, paramsList, returnType);
      problem.templatePython = generateBoilerplate('PYTHON', functionName, paramsList, returnType);
      problem.templateGo = generateBoilerplate('GO', functionName, paramsList, returnType);
      problem.templateCPP = generateBoilerplate('CPP', functionName, paramsList, returnType);
      problem.templateJava = generateBoilerplate('JAVA', functionName, paramsList, returnType);
    }

    // Filter test cases based on user permission (if admin, show all, otherwise only samples)
    const isAdmin = req.user && req.user.role === 'ADMIN';
    if (!isAdmin) {
      const isContestProblem = await prisma.contestProblem.findFirst({
        where: { problemId: problem.id }
      });
      if (isContestProblem) {
        problem.testCases = problem.testCases.map(tc => {
          const plainTc = { ...tc };
          if (!plainTc.isSample) {
            plainTc.expectedOutput = '';
          }
          return plainTc;
        });
      } else {
        problem.testCases = problem.testCases.filter((tc) => tc.isSample);
      }
    }

    res.status(200).json({
      success: true,
      problem,
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
