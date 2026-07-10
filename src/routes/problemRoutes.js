const express = require('express');
const {
  createProblem,
  updateProblem,
  deleteProblem,
  getAllProblems,
  getSingleProblem,
} = require('../controllers/problemController');
const { protect, restrictTo, fetchUserIfExists } = require('../middleware/authMiddleware');

const router = express.Router();

// Public/Authed routes
router.get('/', fetchUserIfExists, getAllProblems);
router.get('/:slug', fetchUserIfExists, getSingleProblem);

// Admin/Institute/Mentor routes
router.post('/', protect, restrictTo('ADMIN', 'INSTITUTE_ADMIN', 'MENTOR'), createProblem);
router.put('/:id', protect, restrictTo('ADMIN', 'INSTITUTE_ADMIN', 'MENTOR'), updateProblem);
router.delete('/:id', protect, restrictTo('ADMIN', 'INSTITUTE_ADMIN', 'MENTOR'), deleteProblem);

module.exports = router;
