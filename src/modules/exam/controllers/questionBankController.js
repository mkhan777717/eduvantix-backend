'use strict';

const questionBankService = require('../services/QuestionBankService');

/**
 * QuestionBankController
 * Coordinates Question Bank folders and import/export tasks.
 */
class QuestionBankController {
  async createBank(req, res, next) {
    try {
      const data = {
        title: req.body.title,
        description: req.body.description,
        instituteId: req.user.instituteId,
        creatorId: req.user.id
      };

      const bank = await questionBankService.createBank(data);

      res.status(210).json({
        success: true,
        message: 'Question bank folder created successfully',
        data: bank
      });
    } catch (error) {
      next(error);
    }
  }

  async updateBank(req, res, next) {
    try {
      const bankId = parseInt(req.params.id, 10);
      if (isNaN(bankId)) {
        return res.status(400).json({ success: false, message: 'Invalid question bank ID' });
      }

      const data = {
        title: req.body.title,
        description: req.body.description
      };

      const bank = await questionBankService.updateBank(bankId, req.user.instituteId, data);

      res.status(200).json({
        success: true,
        message: 'Question bank folder updated successfully',
        data: bank
      });
    } catch (error) {
      next(error);
    }
  }

  async getBank(req, res, next) {
    try {
      const bankId = parseInt(req.params.id, 10);
      if (isNaN(bankId)) {
        return res.status(400).json({ success: false, message: 'Invalid question bank ID' });
      }

      const bank = await questionBankService.getBank(bankId, req.user.instituteId);

      res.status(200).json({
        success: true,
        data: bank
      });
    } catch (error) {
      if (error.message === 'QUESTION_BANK_NOT_FOUND') {
        return res.status(404).json({ success: false, message: 'Question bank not found' });
      }
      next(error);
    }
  }

  async listBanks(req, res, next) {
    try {
      const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;

      const result = await questionBankService.listBanks(req.user.instituteId, skip, limit);

      res.status(200).json({
        success: true,
        data: result.banks,
        total: result.total
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteBank(req, res, next) {
    try {
      const bankId = parseInt(req.params.id, 10);
      if (isNaN(bankId)) {
        return res.status(400).json({ success: false, message: 'Invalid question bank ID' });
      }

      await questionBankService.deleteBank(bankId, req.user.instituteId, req.user.id);

      res.status(200).json({
        success: true,
        message: 'Question bank folder deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  async importQuestions(req, res, next) {
    try {
      const bankId = parseInt(req.params.id, 10);
      if (isNaN(bankId)) {
        return res.status(400).json({ success: false, message: 'Invalid question bank ID' });
      }

      const questions = req.body.questions;
      if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ success: false, message: 'Questions array is required for bulk import' });
      }

      // Verify folder exists
      await questionBankService.getBank(bankId, req.user.instituteId);

      const outcome = await questionBankService.importQuestions(bankId, questions);

      res.status(200).json({
        success: true,
        message: `Bulk import processed. ${outcome.successCount} questions imported successfully.`,
        successCount: outcome.successCount,
        errors: outcome.errors
      });
    } catch (error) {
      next(error);
    }
  }

  async exportQuestions(req, res, next) {
    try {
      const bankId = parseInt(req.params.id, 10);
      if (isNaN(bankId)) {
        return res.status(400).json({ success: false, message: 'Invalid question bank ID' });
      }

      // Verify folder exists
      await questionBankService.getBank(bankId, req.user.instituteId);

      const questions = await questionBankService.exportQuestions(bankId);

      res.status(200).json({
        success: true,
        data: questions
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new QuestionBankController();
