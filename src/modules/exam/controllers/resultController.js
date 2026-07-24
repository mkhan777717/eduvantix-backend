'use strict';

const resultService = require('../services/ResultService');

/**
 * ResultController
 * Handles result retrievals and bulk publication releases.
 */
class ResultController {
  async getResult(req, res, next) {
    try {
      const attemptId = parseInt(req.params.attemptId, 10);
      if (isNaN(attemptId)) {
        return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
      }

      const data = await resultService.getStudentResult(attemptId, req.user);

      res.status(200).json({
        success: true,
        data: data.result,
        breakdown: data.answers
      });
    } catch (error) {
      if (error.message === 'RESULT_NOT_PUBLISHED_YET') {
        return res.status(403).json({
          success: false,
          code: 'RESULT_NOT_PUBLISHED',
          message: 'The results for this exam have not been published by the instructor yet.'
        });
      }
      next(error);
    }
  }

  async publishResults(req, res, next) {
    try {
      const rawExamId = req.body?.examId ?? req.body?.id ?? req.params?.id ?? req.params?.examId ?? req.query?.examId ?? req.query?.id;
      const examId = parseInt(rawExamId, 10);
      if (isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam ID' });
      }

      await resultService.releaseResults(examId, req.user?.instituteId, req.user?.id);

      res.status(200).json({
        success: true,
        message: 'Exam results published successfully to all students'
      });
    } catch (error) {
      next(error);
    }
  }

  async publishAttemptResult(req, res, next) {
    try {
      const attemptId = parseInt(req.params.attemptId, 10);
      if (isNaN(attemptId)) {
        return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
      }

      await resultService.publishAttemptResult(attemptId);

      res.status(200).json({
        success: true,
        message: 'Candidate attempt result published successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  async getAnalytics(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam ID' });
      }

      const data = await resultService.getExamAnalytics(examId, req.user.instituteId);
      
      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }

  async exportCSV(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam ID' });
      }

      const data = await resultService.getExamAnalytics(examId, req.user.instituteId);
      
      // Build CSV String
      let csv = 'Attempt ID,Username,Email,Status,Proctor Violations,Score,Max Marks\n';
      data.attempts.forEach(att => {
        csv += `${att.id},"${att.username}","${att.email}",${att.status},${att.proctorFlags},${att.score || 0},${data.maxMarks}\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=exam_${examId}_results.csv`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ResultController();
