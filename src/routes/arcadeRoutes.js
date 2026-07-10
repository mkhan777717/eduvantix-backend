const express = require('express');
const { getQuestions, createQuestion, updateQuestion, deleteQuestion } = require('../controllers/arcadeController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/questions', getQuestions);
router.post('/questions', restrictTo('ADMIN', 'INSTITUTE_ADMIN'), createQuestion);
router.put('/questions/:id', restrictTo('ADMIN', 'INSTITUTE_ADMIN'), updateQuestion);
router.delete('/questions/:id', restrictTo('ADMIN', 'INSTITUTE_ADMIN'), deleteQuestion);

module.exports = router;
