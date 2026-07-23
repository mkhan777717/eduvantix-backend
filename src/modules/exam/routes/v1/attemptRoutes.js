'use strict';

const express = require('express');
const attemptController = require('../../controllers/attemptController');
const resultController = require('../../controllers/resultController');

const { protect } = require('../../../../middleware/authMiddleware');
const { verifyAttemptOwnership, verifyAttemptStatus } = require('../../middlewares/examSecurityMiddlewares');
const validateRequest = require('../../middlewares/validateRequest');
const { startAttemptSchema, saveAnswerSchema, runCodeSchema } = require('../../validators/examValidators');

const router = express.Router();

// Enforce student authentication
router.use(protect);

// Initialize exam attempt
router.post('/:id/start', validateRequest(startAttemptSchema), attemptController.startAttempt);

// Attempt queries (Requires ownership check)
router.get('/:attemptId', verifyAttemptOwnership, attemptController.getAttempt);
router.get('/:attemptId/result', verifyAttemptOwnership, resultController.getResult);

// In-attempt actions (Requires both ownership AND status/timer check)
router.post('/:attemptId/answer', verifyAttemptOwnership, verifyAttemptStatus, validateRequest(saveAnswerSchema), attemptController.saveAnswer);
router.post('/:attemptId/run', verifyAttemptOwnership, verifyAttemptStatus, validateRequest(runCodeSchema), attemptController.runCode);
router.post('/:attemptId/submit-code', verifyAttemptOwnership, verifyAttemptStatus, validateRequest(runCodeSchema), attemptController.submitCode);
router.post('/:attemptId/submit', verifyAttemptOwnership, verifyAttemptStatus, attemptController.submitAttempt);
router.post('/:attemptId/proctor', verifyAttemptOwnership, verifyAttemptStatus, attemptController.logProctorIncident);

module.exports = router;
