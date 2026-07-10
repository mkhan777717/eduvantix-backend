const express = require('express');
const {
  getBatches, createBatch, deleteBatch,
  getBatchManagerBatches,
  addMentorToBatch, removeMentorFromBatch,
  addStudentToBatch, removeStudentFromBatch,
  updateBatch
} = require('../controllers/batchController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

// Institute Admin Cohort CRUD
router.route('/')
  .get(protect, restrictTo('INSTITUTE_ADMIN', 'ADMIN', 'BATCH_MANAGER', 'MENTOR'), getBatches)
  .post(protect, restrictTo('INSTITUTE_ADMIN', 'ADMIN'), createBatch);

router.route('/:id')
  .delete(protect, restrictTo('INSTITUTE_ADMIN', 'ADMIN'), deleteBatch)
  .patch(protect, restrictTo('INSTITUTE_ADMIN', 'ADMIN'), updateBatch);

// Batch Manager Roster controls
router.route('/batch-manager/batches')
  .get(protect, restrictTo('BATCH_MANAGER', 'INSTITUTE_ADMIN', 'ADMIN'), getBatchManagerBatches);

router.route('/batch-manager/batches/:id/mentors')
  .post(protect, restrictTo('BATCH_MANAGER', 'INSTITUTE_ADMIN', 'ADMIN'), addMentorToBatch);

router.route('/batch-manager/batches/:id/mentors/:mentorId')
  .delete(protect, restrictTo('BATCH_MANAGER', 'INSTITUTE_ADMIN', 'ADMIN'), removeMentorFromBatch);

router.route('/batch-manager/batches/:id/students')
  .post(protect, restrictTo('BATCH_MANAGER', 'INSTITUTE_ADMIN', 'ADMIN'), addStudentToBatch);

router.route('/batch-manager/batches/:id/students/:studentId')
  .delete(protect, restrictTo('BATCH_MANAGER', 'INSTITUTE_ADMIN', 'ADMIN'), removeStudentFromBatch);

module.exports = router;
