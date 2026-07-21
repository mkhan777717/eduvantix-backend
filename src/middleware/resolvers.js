'use strict';

/**
 * resolvers.js — Generic ResolverRegistry + Permission Middleware
 *
 * Architecture:
 *   Request → authenticate → resolveXxx → validateXxxAccess → Controller
 *
 * ResolverRegistry:
 *   A single generic mechanism that, given a resource type name, produces a
 *   middleware chain of:
 *     1. resolver    — slug → DB record → req.resource
 *     2. validator   — PermissionService.canAccessXxx → allow/deny
 *
 * Every resolver:
 *   • Accepts slug OR legacy numeric id (backward-compat window)
 *   • Checks slug history for renamed resources (301-style redirect hint in response)
 *   • Uses in-process TTL cache to avoid repeated DB lookups
 *   • Returns structured 401/403/404 — NEVER leaks existence on deny
 *
 * Usage in routes:
 *   router.get('/:slug', fetchUserIfExists, resolveProblem, validateProblemAccess, getHandler);
 *   router.put('/:slug', protect, resolveProblem, requireManageProblem, updateHandler);
 */

const prisma = require('../prisma');
const cache = require('../utils/resolverCache');
const permissionService = require('../services/permissionService');
const { logUnauthorizedAttempt } = require('../utils/securityLogger');

// ── Shared deny helper ────────────────────────────────────────────────────────

/**
 * Emit a structured security log then respond with the appropriate HTTP status.
 * @param {Object} res
 * @param {Object} req
 * @param {Object} denial       - { reason, httpStatus }
 * @param {string} resourceType - 'problem' | 'contest' | 'viva'
 * @param {string} identifier   - slug or id that was attempted
 */
function _deny(res, req, denial, resourceType, identifier) {
  logUnauthorizedAttempt({
    user: req.user ?? null,
    resource: resourceType,
    identifier,
    reason: denial.reason,
    req,
  });

  const status = denial.httpStatus ?? 403;
  const messages = {
    NOT_AUTHENTICATED: 'Authentication required.',
    RESOURCE_HIDDEN: 'Resource not found.',   // always 404 body for hidden
    RESOURCE_DRAFT:  'Resource not found.',   // same
    WRONG_INSTITUTE: 'You do not have access to this resource.',
    NOT_REGISTERED:  'You are not registered for this contest.',
    FORBIDDEN:       'You do not have permission to perform this action.',
    CONTEST_NOT_STARTED: 'This contest has not started yet.',
    CONTEST_ENDED:   'This contest has ended.',
    OUTSIDE_TIME_WINDOW: 'Access is only allowed during the scheduled time window.',
    WRONG_OWNERSHIP: 'This resource belongs to another user.',
  };

  return res.status(status).json({
    success: false,
    message: messages[denial.reason] ?? 'Access denied.',
    // Structured code for frontend to act on programmatically
    code: denial.reason,
  });
}

// ── Problem Resolver ──────────────────────────────────────────────────────────

const PROBLEM_SELECT = {
  id: true, slug: true, title: true, difficulty: true, visibility: true,
  instituteId: true, functionName: true, returnType: true, category: true,
  parameters: true, methods: true, judgeStrategy: true, scoringModel: true,
  comparator: true, epsilon: true, timeout: true, memoryLimit: true,
  statement: true, inputFormat: true, outputFormat: true, constraints: true,
  explanation: true, followup: true, editorial: true, solution: true,
  evaluation: true, templateJS: true, templatePython: true, templateGo: true,
  templateCPP: true, templateJava: true, createdAt: true,
};

/**
 * resolveProblem
 * Resolves req.params.slug → Problem → req.resource
 */
async function resolveProblem(req, res, next) {
  const identifier = req.params.slug;
  if (!identifier) {
    return res.status(400).json({ success: false, message: 'Resource identifier is required.' });
  }

  // 1. Cache hit
  let problem = cache.get('problem', identifier);

  // 2. Cache miss — query DB
  if (!problem) {
    // Support slug OR legacy numeric id (backward-compat window)
    const isNumeric = /^\d+$/.test(identifier);
    problem = isNumeric
      ? await prisma.problem.findUnique({ where: { id: parseInt(identifier, 10) }, select: PROBLEM_SELECT })
      : await prisma.problem.findUnique({ where: { slug: identifier }, select: PROBLEM_SELECT });

    // 3. Slug history check — resource may have been renamed
    if (!problem && !isNumeric) {
      const historyEntry = await prisma.problemSlugHistory.findFirst({
        where: { slug: identifier },
        include: { problem: { select: PROBLEM_SELECT } },
      });
      if (historyEntry?.problem) {
        // Indicate to the client that this slug has moved
        res.setHeader('X-Slug-Moved-To', historyEntry.problem.slug);
        problem = historyEntry.problem;
      }
    }

    if (!problem) {
      // Return 404 — do not reveal whether it ever existed
      return res.status(404).json({ success: false, message: 'Resource not found.' });
    }

    cache.set('problem', identifier, problem);
  }

  req.resource = problem;
  next();
}

/**
 * validateProblemAccess
 * Calls PermissionService. On deny: log + return correct HTTP status.
 * On allow: attach lean problem data and continue.
 */
async function validateProblemAccess(req, res, next) {
  const problem = req.resource;
  if (!problem) return res.status(500).json({ success: false, message: 'Resolver not applied.' });

  const result = await permissionService.canAccessProblem(req.user ?? null, problem, {
    contestId: req.contestId ?? null,
  });

  if (!result.allowed) {
    return _deny(res, req, result, 'problem', problem.slug);
  }

  next();
}

/**
 * requireManageProblem
 * Write-operation gate: admin / institute staff only.
 */
async function requireManageProblem(req, res, next) {
  const problem = req.resource;
  const result = permissionService.canManageProblem(req.user ?? null, problem);
  if (!result.allowed) {
    return _deny(res, req, result, 'problem', problem.slug);
  }
  next();
}

// ── Contest Resolver ──────────────────────────────────────────────────────────

const CONTEST_SELECT = {
  id: true, slug: true, title: true, description: true, category: true,
  visibility: true, startTime: true, endTime: true, createdAt: true,
  instituteId: true,
  creator: { select: { id: true, username: true, instituteId: true } },
  contestProblems: {
    include: {
      problem: {
        select: {
          id: true, title: true, slug: true, difficulty: true,
          statement: true, inputFormat: true, outputFormat: true,
          constraints: true, explanation: true, parameters: true,
          returnType: true, functionName: true, category: true,
          judgeStrategy: true, comparator: true, timeout: true,
          testCases: true,
        },
      },
    },
  },
};

/**
 * resolveContest
 * Resolves req.params.slug → Contest → req.resource
 */
async function resolveContest(req, res, next) {
  const identifier = req.params.slug;
  if (!identifier) {
    return res.status(400).json({ success: false, message: 'Resource identifier is required.' });
  }

  let contest = cache.get('contest', identifier);

  if (!contest) {
    const isNumeric = /^\d+$/.test(identifier);
    contest = isNumeric
      ? await prisma.contest.findUnique({ where: { id: parseInt(identifier, 10) }, select: CONTEST_SELECT })
      : await prisma.contest.findUnique({ where: { slug: identifier }, select: CONTEST_SELECT });

    // Slug history
    if (!contest && !isNumeric) {
      const historyEntry = await prisma.contestSlugHistory.findFirst({
        where: { slug: identifier },
        include: { contest: { select: CONTEST_SELECT } },
      });
      if (historyEntry?.contest) {
        res.setHeader('X-Slug-Moved-To', historyEntry.contest.slug);
        contest = historyEntry.contest;
      }
    }

    if (!contest) {
      return res.status(404).json({ success: false, message: 'Resource not found.' });
    }

    cache.set('contest', identifier, contest);
  }

  req.resource = contest;
  next();
}

/**
 * validateContestAccess
 */
async function validateContestAccess(req, res, next) {
  const contest = req.resource;
  if (!contest) return res.status(500).json({ success: false, message: 'Resolver not applied.' });

  const result = await permissionService.canAccessContest(req.user ?? null, contest);

  if (!result.allowed) {
    return _deny(res, req, result, 'contest', contest.slug);
  }

  next();
}

/**
 * requireManageContest
 * Write-operation gate: admin / institute staff only.
 */
async function requireManageContest(req, res, next) {
  const contest = req.resource;
  const result = permissionService.canManageContest(req.user ?? null, contest);
  if (!result.allowed) {
    return _deny(res, req, result, 'contest', contest.slug);
  }
  next();
}

// ── Viva Resolver ─────────────────────────────────────────────────────────────

const VIVA_SELECT = {
  id: true, title: true, subject: true, description: true,
  startTime: true, endTime: true, instituteId: true, creatorId: true,
  createdAt: true,
  creator: { select: { id: true, username: true } },
};

/**
 * resolveViva
 * Resolves req.params.id (numeric for now) → Viva → req.resource
 */
async function resolveViva(req, res, next) {
  const identifier = req.params.id;
  if (!identifier) {
    return res.status(400).json({ success: false, message: 'Resource identifier is required.' });
  }

  let viva = cache.get('viva', identifier);

  if (!viva) {
    const numericId = parseInt(identifier, 10);
    if (isNaN(numericId)) {
      return res.status(404).json({ success: false, message: 'Resource not found.' });
    }
    viva = await prisma.viva.findUnique({ where: { id: numericId }, select: VIVA_SELECT });
    if (!viva) {
      return res.status(404).json({ success: false, message: 'Resource not found.' });
    }
    cache.set('viva', identifier, viva);
  }

  req.resource = viva;
  next();
}

/**
 * validateVivaAccess
 */
async function validateVivaAccess(req, res, next) {
  const viva = req.resource;
  if (!viva) return res.status(500).json({ success: false, message: 'Resolver not applied.' });

  const result = await permissionService.canAccessViva(req.user ?? null, viva);
  if (!result.allowed) {
    return _deny(res, req, result, 'viva', String(viva.id));
  }

  next();
}

// ── Generic ResolverRegistry ──────────────────────────────────────────────────

/**
 * ResolverRegistry
 *
 * Allows registering custom resource types with their own DB lookup logic.
 * Useful for extending the system to new resource types without touching
 * the core resolver code.
 *
 * Example:
 *   ResolverRegistry.register('quiz', {
 *     find: (identifier) => prisma.quiz.findUnique({ where: { slug: identifier } }),
 *     cacheKey: (identifier) => `quiz:${identifier}`,
 *     permission: (user, resource) => permissionService.canAccessQuiz(user, resource),
 *   });
 *
 *   const { resolve, validate } = ResolverRegistry.get('quiz');
 *   router.get('/:slug', protect, resolve, validate, getQuizHandler);
 */
const ResolverRegistry = (() => {
  const _registry = new Map();

  function register(resourceType, { find, permission, select }) {
    _registry.set(resourceType, { find, permission, select });
  }

  function get(resourceType) {
    const def = _registry.get(resourceType);
    if (!def) throw new Error(`ResolverRegistry: unknown resource type '${resourceType}'`);

    const resolve = async (req, res, next) => {
      const identifier = req.params.slug || req.params.id;
      if (!identifier) {
        return res.status(400).json({ success: false, message: 'Resource identifier is required.' });
      }

      let resource = cache.get(resourceType, identifier);
      if (!resource) {
        resource = await def.find(identifier);
        if (!resource) {
          return res.status(404).json({ success: false, message: 'Resource not found.' });
        }
        cache.set(resourceType, identifier, resource);
      }
      req.resource = resource;
      next();
    };

    const validate = async (req, res, next) => {
      const resource = req.resource;
      if (!resource) return res.status(500).json({ success: false, message: 'Resolver not applied.' });

      const result = await def.permission(req.user ?? null, resource);
      if (!result.allowed) {
        return _deny(res, req, result, resourceType, String(resource.slug || resource.id));
      }
      next();
    };

    return { resolve, validate };
  }

  return { register, get };
})();

// ── Cache invalidation helper (call after create/update/delete) ───────────────

function invalidateResourceCache(resourceType, slug) {
  cache.invalidate(resourceType, slug);
}

function invalidateAllResourceCache(resourceType) {
  cache.invalidateAll(resourceType);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // Problem
  resolveProblem,
  validateProblemAccess,
  requireManageProblem,

  // Contest
  resolveContest,
  validateContestAccess,
  requireManageContest,

  // Viva
  resolveViva,
  validateVivaAccess,

  // Generic
  ResolverRegistry,
  invalidateResourceCache,
  invalidateAllResourceCache,
};
