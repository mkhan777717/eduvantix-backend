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

const router = express.Router();

// Public routes with optional user identification
router.get('/', fetchUserIfExists, getAllContests);
router.get('/reports/participations', protect, restrictTo('ADMIN', 'MENTOR'), getAllParticipationReports);
router.get('/:id', fetchUserIfExists, getContestDetails);
router.get('/:id/leaderboard', getContestLeaderboard);

// User contest attempt routes
router.post('/:id/participate', protect, participateInContest);
router.post('/:id/finish', protect, finishContestAttempt);
router.post('/:id/survey', protect, submitContestSurvey);
router.get('/:id/participation', protect, getContestParticipation);

// Admin/Mentor/Institute-Admin routes
router.post('/', protect, restrictTo('ADMIN', 'MENTOR', 'INSTITUTE_ADMIN'), createContest);
router.put('/:id', protect, restrictTo('ADMIN', 'MENTOR', 'INSTITUTE_ADMIN'), updateContest);
router.delete('/:id', protect, restrictTo('ADMIN', 'MENTOR', 'INSTITUTE_ADMIN'), deleteContest);
router.post('/:id/problem', protect, restrictTo('ADMIN', 'MENTOR', 'INSTITUTE_ADMIN'), addProblemToContest);
router.get('/:id/participants', protect, restrictTo('ADMIN', 'MENTOR', 'INSTITUTE_ADMIN'), getContestParticipants);

module.exports = router;

