'use strict';

/**
 * contestRoutes.js
 *
 * Security model:
 *   GET  /                     → authenticated only (institute-scoped)
 *   GET  /:slug                → resolve slug → validate access → details
 *   GET  /:slug/leaderboard    → resolve slug → validate access → leaderboard
 *   POST /:slug/participate    → authenticated → resolve → validate → register
 *   POST /:slug/finish         → authenticated → resolve → validate → finish
 *   POST /:slug/survey         → authenticated → resolve → validate → survey
 *   GET  /:slug/participation  → authenticated → resolve → validate → my record
 *   GET  /:slug/participants   → authenticated → resolve → staff-only → list
 *   POST /                     → authenticated staff → create
 *   PUT  /:slug                → authenticated → resolve → staff-only → update
 *   DELETE /:slug              → authenticated → resolve → staff-only → delete
 *   POST /:slug/problem        → authenticated → resolve → staff-only → add problem
 *   GET  /reports/participations → staff admin only
 */

const express = require('express');
const {
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
} = require('../controllers/contestController');

const { protect, restrictTo, fetchUserIfExists } = require('../middleware/authMiddleware');
const {
  resolveContest,
  validateContestAccess,
  requireManageContest,
} = require('../middleware/resolvers');
const { invalidAccessLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// ── Static routes MUST come before /:slug ─────────────────────────────────────

// Reports — staff only, no resource resolution needed
router.get(
  '/reports/participations',
  protect,
  restrictTo('ADMIN', 'MENTOR'),
  getAllParticipationReports
);

// ── Public / semi-public reads ────────────────────────────────────────────────

// Contest list — authenticated only (guests see nothing, controlled in controller)
router.get('/', protect, getAllContests);

// Contest detail — resolve slug, validate access
router.get(
  '/:slug',
  invalidAccessLimiter,
  fetchUserIfExists,
  resolveContest,
  validateContestAccess,
  getContestDetails
);

// Leaderboard — same access rules as detail view
router.get(
  '/:slug/leaderboard',
  invalidAccessLimiter,
  fetchUserIfExists,
  resolveContest,
  validateContestAccess,
  getContestLeaderboard
);

// ── Participant actions ───────────────────────────────────────────────────────

router.post(
  '/:slug/participate',
  protect,
  resolveContest,
  validateContestAccess,
  participateInContest
);

router.post(
  '/:slug/finish',
  protect,
  resolveContest,
  validateContestAccess,
  finishContestAttempt
);

router.post(
  '/:slug/survey',
  protect,
  resolveContest,
  validateContestAccess,
  submitContestSurvey
);

router.get(
  '/:slug/participation',
  protect,
  resolveContest,
  validateContestAccess,
  getContestParticipation
);

// ── Staff-only reads ──────────────────────────────────────────────────────────

router.get(
  '/:slug/participants',
  protect,
  resolveContest,
  requireManageContest,
  getContestParticipants
);

// ── Staff write operations ────────────────────────────────────────────────────

router.post(
  '/',
  protect,
  restrictTo('ADMIN', 'MENTOR', 'INSTITUTE_ADMIN'),
  createContest
);

router.put(
  '/:slug',
  protect,
  resolveContest,
  requireManageContest,
  updateContest
);

router.delete(
  '/:slug',
  protect,
  resolveContest,
  requireManageContest,
  deleteContest
);

router.post(
  '/:slug/problem',
  protect,
  resolveContest,
  requireManageContest,
  addProblemToContest
);

module.exports = router;
