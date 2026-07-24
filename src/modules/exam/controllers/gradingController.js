'use strict';

const answerRepository = require('../repositories/AnswerRepository');
const gradingService = require('../services/GradingService');

/**
 * GradingController
 * Handles teacher manual scoring tasks.
 */
class GradingController {
  async getPendingGrades(req, res, next) {
    try {
      const examId = req.query.examId ? parseInt(req.query.examId, 10) : null;
      const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;

      const result = await answerRepository.findPendingGrades(
        req.user.instituteId,
        examId,
        skip,
        limit
      );

      res.status(200).json({
        success: true,
        data: result.answers,
        total: result.total
      });
    } catch (error) {
      next(error);
    }
  }

  async gradeDescriptive(req, res, next) {
    try {
      const rawId = req.params.id;
      const answerId = parseInt(rawId, 10);
      const { score, comments, attemptId, questionId } = req.body;

      const grade = await gradingService.gradeDescriptive(
        isNaN(answerId) ? null : answerId,
        score,
        comments,
        req.user.id,
        { attemptId: attemptId ? parseInt(attemptId, 10) : null, questionId: questionId ? parseInt(questionId, 10) : null }
      );

      res.status(200).json({
        success: true,
        message: 'Descriptive question score saved successfully',
        data: grade
      });
    } catch (error) {
      if (error.message === 'INVALID_SCORE_BOUNDS') {
        return res.status(400).json({
          success: false,
          code: 'INVALID_SCORE_BOUNDS',
          message: 'The assigned score cannot be negative and must not exceed the question maximum marks.'
        });
      }
      next(error);
    }
  }
}

module.exports = new GradingController();
