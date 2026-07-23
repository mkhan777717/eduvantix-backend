'use strict';

const attemptService = require('../services/AttemptService');
const answerService = require('../services/AnswerService');
const codingService = require('../services/CodingService');
const examDto = require('../dto/examDto');

/**
 * AttemptController
 * Coordinates Student Exam lifecycle: starting, saving, running code, and final submissions.
 */
class AttemptController {
  async startAttempt(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam ID' });
      }

      const password = req.body.password;
      const attempt = await attemptService.startAttempt(req.user.id, examId, password);

      res.status(200).json({
        success: true,
        message: 'Exam attempt initialized successfully',
        data: attempt
      });
    } catch (error) {
      if (error.message === 'INVALID_EXAM_PASSWORD') {
        return res.status(401).json({
          success: false,
          code: 'PASSWORD_REQUIRED',
          message: 'This exam is password-protected. Please enter a valid password.'
        });
      }
      if (error.message === 'MAX_ATTEMPTS_EXCEEDED') {
        return res.status(403).json({
          success: false,
          code: 'MAX_ATTEMPTS_EXCEEDED',
          message: 'You have already reached the maximum attempts allowed for this exam.'
        });
      }
      next(error);
    }
  }

  async getAttempt(req, res, next) {
    try {
      // req.attempt has been pre-loaded by verifyAttemptOwnership middleware with all relations
      const isTeacher = ['ADMIN', 'MENTOR', 'INSTITUTE_ADMIN'].includes(req.user.role);
      const sanitized = examDto.toAttemptResponse(req.attempt, isTeacher);
      res.status(200).json({
        success: true,
        data: sanitized
      });
    } catch (error) {
      next(error);
    }
  }

  async saveAnswer(req, res, next) {
    try {
      const attemptId = req.attempt.id;
      const questionId = req.body.questionId;
      const answerUpdate = {
        visited: req.body.visited,
        flagged: req.body.flagged,
        descriptiveAnswer: req.body.descriptiveAnswer,
        codingCode: req.body.codingCode,
        codingLanguage: req.body.codingLanguage
      };

      const rawOptionIds = req.body.mcqOptionIds ?? req.body.mcqAnswers;
      const mcqOptionIds = Array.isArray(rawOptionIds)
        ? rawOptionIds.map(id => typeof id === 'number' ? id : parseInt(id, 10)).filter(id => !isNaN(id))
        : (rawOptionIds === null ? null : undefined);

      const answer = await answerService.saveAnswer(attemptId, req.user.id, questionId, answerUpdate, mcqOptionIds);

      res.status(200).json({
        success: true,
        message: 'Answer autosaved successfully',
        data: answer
      });
    } catch (error) {
      next(error);
    }
  }

  async runCode(req, res, next) {
    try {
      const attemptId = req.attempt.id;
      const { questionId, code, language } = req.body;

      const result = await codingService.runCode(req.user.id, attemptId, questionId, code, language);

      res.status(202).json({
        success: true,
        message: 'Compilation job added to run queue successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async submitCode(req, res, next) {
    try {
      const attemptId = req.attempt.id;
      const { questionId, code, language } = req.body;

      const result = await codingService.submitCode(req.user.id, attemptId, questionId, code, language);

      res.status(202).json({
        success: true,
        message: 'Compilation job added to submission queue successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async submitAttempt(req, res, next) {
    try {
      const attemptId = req.attempt.id;

      const result = await attemptService.submitAttempt(attemptId, req.user.id, false);

      res.status(200).json({
        success: true,
        message: 'Exam attempt submitted successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async logProctorIncident(req, res, next) {
    try {
      const attemptId = req.attempt.id;
      const { event, severity, metadata } = req.body;

      const result = await attemptService.logIncident(attemptId, req.user.id, event, severity, metadata);

      res.status(200).json({
        success: true,
        message: 'Proctoring incident event logged successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AttemptController();
