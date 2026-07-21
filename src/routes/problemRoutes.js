'use strict';

/**
 * problemRoutes.js
 *
 * Security model:
 *   GET  /                → public listing (institute-scoped by fetchUserIfExists)
 *   GET  /:slug           → resolve slug → check access → return problem
 *   POST /                → authenticated staff only
 *   PUT  /:slug           → authenticated staff + institute ownership check
 *   DELETE /:slug         → authenticated staff + institute ownership check
 */

const express = require('express');
const {
  createProblem,
  updateProblem,
  deleteProblem,
  getAllProblems,
  getSingleProblem,
} = require('../controllers/problemController');

const { protect, fetchUserIfExists, restrictTo } = require('../middleware/authMiddleware');
const {
  resolveProblem,
  validateProblemAccess,
  requireManageProblem,
} = require('../middleware/resolvers');
const { invalidAccessLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// ── Read ──────────────────────────────────────────────────────────────────────

// Public list — institute-scoped inside controller
router.get('/', fetchUserIfExists, getAllProblems);

// Single problem — resolve slug, validate access, return
router.get(
  '/:slug',
  invalidAccessLimiter,        // limit repeated invalid slug probes
  fetchUserIfExists,
  resolveProblem,
  validateProblemAccess,
  getSingleProblem
);

// ── Write ─────────────────────────────────────────────────────────────────────

router.post(
  '/',
  protect,
  restrictTo('ADMIN', 'INSTITUTE_ADMIN', 'MENTOR'),
  createProblem
);

router.put(
  '/:slug',
  protect,
  resolveProblem,
  requireManageProblem,
  updateProblem
);

router.delete(
  '/:slug',
  protect,
  resolveProblem,
  requireManageProblem,
  deleteProblem
);

module.exports = router;
