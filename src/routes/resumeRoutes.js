const express = require('express');
const router = express.Router();
const { getResumes, getResumeById, createResume, updateResume, deleteResume } = require('../controllers/resumeController');
const { protect } = require('../middleware/authMiddleware');

// All resume routes require authentication
router.use(protect);

router.route('/')
  .get(getResumes)
  .post(createResume);

router.route('/:id')
  .get(getResumeById)
  .put(updateResume)
  .delete(deleteResume);

module.exports = router;
