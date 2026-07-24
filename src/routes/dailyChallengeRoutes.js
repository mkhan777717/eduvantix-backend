const express = require('express');
const router = express.Router();
const {
  getChallenges,
  createChallenge,
  updateChallenge,
  deleteChallenge,
  getTodayChallenge,
  submitChallenge
} = require('../controllers/dailyChallengeController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Student routes
router.get('/student/today', protect, getTodayChallenge);
router.post('/student/submit', protect, submitChallenge);

// Admin routes
router.use('/admin', protect, restrictTo('ADMIN'));
router.route('/admin')
  .get(getChallenges)
  .post(createChallenge);

router.route('/admin/:id')
  .put(updateChallenge)
  .delete(deleteChallenge);

module.exports = router;
