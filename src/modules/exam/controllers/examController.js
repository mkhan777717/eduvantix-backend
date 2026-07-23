'use strict';

const examService = require('../services/ExamService');
const examDto = require('../dto/examDto');
const prisma = require('../../../prisma');
const templateGenerator = require('../services/templateGenerator');
const examImportService = require('../services/examImportService');
const examExportService = require('../services/examExportService');
const { parseCSV } = require('../services/csvParser');
const { parseExcelBuffer } = require('../services/excelParser');
const { parseJSONPaper } = require('../services/jsonParser');

/**
 * ExamController
 * Thin layer that parses request parameters and coordinates with ExamService.
 */
class ExamController {
  async createExam(req, res, next) {
    try {
      let instituteId = req.user?.instituteId;
      if (!instituteId) {
        const inst = await prisma.institute.findFirst();
        if (inst) {
          instituteId = inst.id;
        } else {
          const newInst = await prisma.institute.create({ data: { name: 'Eduvantix Main Institute' } });
          instituteId = newInst.id;
        }
      }

      const examData = {
        title: req.body.title,
        description: req.body.description,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
        timezone: req.body.timezone || 'UTC',
        resultReleasePolicy: req.body.resultReleasePolicy || 'IMMEDIATE',
        publishResultDate: req.body.publishResultDate ? new Date(req.body.publishResultDate) : null,
        creatorId: req.user.id,
        instituteId
      };

      const settingsData = req.body.settings || {};
      const instructions = req.body.instructions || [];

      const exam = await examService.createExam(examData, settingsData, instructions);

      res.status(210).json({
        success: true,
        message: 'Exam draft created successfully',
        data: examDto.toExamResponse(exam)
      });
    } catch (error) {
      next(error);
    }
  }

  async updateExam(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam ID' });
      }

      const currentVersion = req.body.version;
      const examUpdate = {
        title: req.body.title,
        description: req.body.description,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        timezone: req.body.timezone,
        duration: req.body.duration !== undefined ? parseInt(req.body.duration, 10) : undefined,
        resultReleasePolicy: req.body.resultReleasePolicy,
        publishResultDate: req.body.publishResultDate ? new Date(req.body.publishResultDate) : undefined
      };

      // Clean undefined keys
      Object.keys(examUpdate).forEach((key) => examUpdate[key] === undefined && delete examUpdate[key]);

      const settingsUpdate = req.body.settings;
      const instructions = req.body.instructions;

      const exam = await examService.updateExam(
        examId,
        req.user.instituteId,
        currentVersion,
        examUpdate,
        settingsUpdate,
        instructions
      );

      res.status(200).json({
        success: true,
        message: 'Exam draft updated successfully',
        data: examDto.toExamResponse(exam)
      });
    } catch (error) {
      if (error.message === 'VERSION_CONFLICT') {
        return res.status(409).json({
          success: false,
          code: 'VERSION_CONFLICT',
          message: 'This exam draft was modified by another editor. Please reload and try again.'
        });
      }
      next(error);
    }
  }

  async listExams(req, res, next) {
    try {
      if (req.user.role === 'STUDENT' && !req.user.instituteId) {
        return res.status(403).json({ success: false, message: 'Exams are restricted to enrolled institute students only.' });
      }
      if (req.user.role === 'MENTOR' && !req.user.instituteId) {
        return res.status(403).json({ success: false, message: 'Exams are restricted to institute mentors only.' });
      }

      const isTeacherOrManager = ['ADMIN', 'MENTOR', 'INSTITUTE_ADMIN', 'BATCH_MANAGER'].includes(req.user.role);

      const filters = {
        instituteId: req.user.instituteId,
        status: isTeacherOrManager ? req.query.status : 'PUBLISHED',
        creatorId: req.query.creatorId ? parseInt(req.query.creatorId, 10) : undefined,
        skip: req.query.skip ? parseInt(req.query.skip, 10) : 0,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 10
      };

      const result = await examService.listExams(filters);

      // Query student attempts if candidate user
      let userAttemptsMap = {};
      if (!isTeacherOrManager && result.exams.length > 0) {
        const examIds = result.exams.map(e => e.id);
        const userAttempts = await prisma.attempt.findMany({
          where: {
            userId: req.user.id,
            examVersion: { examId: { in: examIds } }
          },
          select: {
            id: true,
            status: true,
            score: true,
            createdAt: true,
            examVersion: { select: { examId: true } },
            result: { select: { published: true, score: true } }
          },
          orderBy: { createdAt: 'desc' }
        });

        userAttempts.forEach(att => {
          const eId = att.examVersion.examId;
          if (!userAttemptsMap[eId]) {
            userAttemptsMap[eId] = att;
          }
        });
      }

      res.status(200).json({
        success: true,
        data: result.exams.map(e => examDto.toExamResponse(e, userAttemptsMap[e.id])),
        total: result.total
      });
    } catch (error) {
      next(error);
    }
  }

  async getExam(req, res, next) {
    try {
      if (req.user.role === 'STUDENT' && !req.user.instituteId) {
        return res.status(403).json({ success: false, message: 'Exams are restricted to enrolled institute students only.' });
      }
      if (req.user.role === 'MENTOR' && !req.user.instituteId) {
        return res.status(403).json({ success: false, message: 'Exams are restricted to institute mentors only.' });
      }

      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam ID' });
      }

      const exam = await examService.getExam(examId, req.user.instituteId);
      if (!exam) {
        return res.status(404).json({ success: false, message: 'Exam not found' });
      }

      const isTeacherOrManager = ['ADMIN', 'MENTOR', 'INSTITUTE_ADMIN', 'BATCH_MANAGER'].includes(req.user.role);
      if (!isTeacherOrManager && exam.status !== 'PUBLISHED') {
        return res.status(403).json({ success: false, message: 'Exam is not published yet' });
      }

      let userAttempt = null;
      if (!isTeacherOrManager) {
        userAttempt = await prisma.attempt.findFirst({
          where: {
            userId: req.user.id,
            examVersion: { examId }
          },
          select: { id: true, status: true, score: true, createdAt: true, result: { select: { published: true, score: true } } },
          orderBy: { createdAt: 'desc' }
        });
      }

      res.status(200).json({
        success: true,
        data: examDto.toExamResponse(exam, userAttempt)
      });
    } catch (error) {
      if (error.message === 'EXAM_NOT_FOUND') {
        return res.status(404).json({ success: false, message: 'Exam not found' });
      }
      next(error);
    }
  }

  async rescheduleExam(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam ID' });
      }

      const scheduleData = {
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        publishResultDate: req.body.publishResultDate,
        timezone: req.body.timezone
      };

      const exam = await examService.rescheduleExam(examId, req.user.instituteId, scheduleData);

      res.status(200).json({
        success: true,
        message: 'Exam rescheduled successfully',
        data: examDto.toExamResponse(exam)
      });
    } catch (error) {
      if (error.message === 'INVALID_DATE_RANGE') {
        return res.status(400).json({ success: false, message: 'Start date must be before end date' });
      }
      next(error);
    }
  }

  async deleteExam(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam ID' });
      }

      await examService.deleteExam(examId, req.user.instituteId, req.user.id);

      res.status(200).json({
        success: true,
        message: 'Exam deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  async publishExam(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam ID' });
      }

      const publishedVersion = await examService.publishExam(examId, req.user.instituteId);

      res.status(200).json({
        success: true,
        message: 'Exam published and snapshot version created successfully',
        data: publishedVersion
      });
    } catch (error) {
      next(error);
    }
  }

  async archiveExam(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) {
        return res.status(400).json({ success: false, message: 'Invalid exam ID' });
      }

      const exam = await examService.archiveExam(examId, req.user.instituteId);

      res.status(200).json({
        success: true,
        message: 'Exam archived successfully',
        data: examDto.toExamResponse(exam)
      });
    } catch (error) {
      next(error);
    }
  }

  // ── Section actions ────────────────────────────────────────────────────────

  async addSection(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) return res.status(400).json({ success: false, message: 'Invalid exam ID' });
      const { title, description, type } = req.body;
      const section = await examService.addSection(examId, title, description, type);
      res.status(210).json({ success: true, message: 'Section added successfully', data: section });
    } catch (error) {
      next(error);
    }
  }

  async updateSection(req, res, next) {
    try {
      const sectionId = parseInt(req.params.sectionId, 10);
      if (isNaN(sectionId)) return res.status(400).json({ success: false, message: 'Invalid section ID' });
      const { title, description, type } = req.body;
      const section = await examService.updateSection(sectionId, title, description, type);
      res.status(200).json({ success: true, message: 'Section updated successfully', data: section });
    } catch (error) {
      next(error);
    }
  }

  async deleteSection(req, res, next) {
    try {
      const sectionId = parseInt(req.params.sectionId, 10);
      if (isNaN(sectionId)) return res.status(400).json({ success: false, message: 'Invalid section ID' });
      await examService.deleteSection(sectionId);
      res.status(200).json({ success: true, message: 'Section deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  // ── Question actions ───────────────────────────────────────────────────────

  async createQuestion(req, res, next) {
    try {
      const sectionId = parseInt(req.params.sectionId, 10);
      if (isNaN(sectionId)) return res.status(400).json({ success: false, message: 'Invalid section ID' });

      const questionData = {
        title: req.body.title,
        text: req.body.text,
        type: req.body.type,
        marks: req.body.marks,
        negativeMarks: req.body.negativeMarks,
        explanation: req.body.explanation,
        difficulty: req.body.difficulty
      };

      const details = {
        options: req.body.options,
        coding: req.body.coding,
        descriptive: req.body.descriptive,
        tags: req.body.tags
      };

      const question = await examService.createQuestionInSection(sectionId, questionData, details);
      res.status(210).json({ success: true, message: 'Question created inside section', data: question });
    } catch (error) {
      next(error);
    }
  }

  async updateQuestion(req, res, next) {
    try {
      const questionId = parseInt(req.params.questionId, 10);
      if (isNaN(questionId)) return res.status(400).json({ success: false, message: 'Invalid question ID' });

      const questionData = {
        title: req.body.title,
        text: req.body.text,
        marks: req.body.marks,
        negativeMarks: req.body.negativeMarks,
        explanation: req.body.explanation,
        difficulty: req.body.difficulty
      };

      const details = {
        options: req.body.options,
        coding: req.body.coding,
        descriptive: req.body.descriptive,
        tags: req.body.tags
      };

      const question = await examService.updateQuestion(questionId, questionData, details);
      res.status(200).json({ success: true, message: 'Question updated successfully', data: question });
    } catch (error) {
      next(error);
    }
  }

  async addQuestionToSection(req, res, next) {
    try {
      const sectionId = parseInt(req.params.sectionId, 10);
      const questionId = parseInt(req.body.questionId, 10);
      if (isNaN(sectionId) || isNaN(questionId)) {
        return res.status(400).json({ success: false, message: 'Invalid section or question ID' });
      }

      await examService.addQuestionToSection(sectionId, questionId);
      res.status(200).json({ success: true, message: 'Question linked to section successfully' });
    } catch (error) {
      next(error);
    }
  }

  async removeQuestionFromSection(req, res, next) {
    try {
      const sectionId = parseInt(req.params.sectionId, 10);
      const questionId = parseInt(req.params.questionId, 10);
      if (isNaN(sectionId) || isNaN(questionId)) {
        return res.status(400).json({ success: false, message: 'Invalid section or question ID' });
      }

      await examService.removeQuestionFromSection(sectionId, questionId);
      res.status(200).json({ success: true, message: 'Question unlinked from section' });
    } catch (error) {
      next(error);
    }
  }

  // ── Drag & Drop Reorder action ─────────────────────────────────────────────

  async reorderExam(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) return res.status(400).json({ success: false, message: 'Invalid exam ID' });
      const { sections } = req.body;
      if (!sections || !Array.isArray(sections)) {
        return res.status(400).json({ success: false, message: 'Sections array is required' });
      }

      await examService.reorderExam(examId, sections);
      res.status(200).json({ success: true, message: 'Exam reordered successfully' });
    } catch (error) {
      next(error);
    }
  }

  // ── Duplicate action ───────────────────────────────────────────────────────

  async duplicateExam(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) return res.status(400).json({ success: false, message: 'Invalid exam ID' });

      const exam = await examService.duplicateExam(examId, req.user.instituteId, req.user.id);
      res.status(201).json({
        success: true,
        message: 'Exam duplicated successfully',
        data: examDto.toExamResponse(exam)
      });
    } catch (error) {
      next(error);
    }
  }

  // ── Preview action ─────────────────────────────────────────────────────────

  async previewExam(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) return res.status(400).json({ success: false, message: 'Invalid exam ID' });

      const attempt = await examService.previewExam(examId, req.user.instituteId, req.user.id);
      
      // Map response using DTO (with teacher view = true to bypass student redactions)
      const attemptResponse = examDto.toAttemptResponse(attempt, true);

      res.status(200).json({
        success: true,
        message: 'Draft sandbox preview attempt created',
        data: attemptResponse
      });
    } catch (error) {
      next(error);
    }
  }

  // ── Paper Bulk Import & Export Controllers ─────────────────────────────────

  async downloadTemplate(req, res, next) {
    try {
      const format = (req.query.format || 'csv').toLowerCase();
      if (format === 'excel' || format === 'xlsx') {
        const buffer = templateGenerator.generateExcelTemplateBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=exam_question_template.xlsx');
        return res.send(buffer);
      } else {
        const csv = templateGenerator.generateCSVTemplate();
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=exam_question_template.csv');
        return res.send(csv);
      }
    } catch (error) {
      next(error);
    }
  }

  async previewImportPaper(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) return res.status(400).json({ success: false, message: 'Invalid exam ID' });

      let fileBuffer = req.file ? req.file.buffer : Buffer.from(req.body.csv || req.body.json || '', 'utf-8');
      let mimeType = req.file ? req.file.mimetype : (req.body.csv ? 'text/csv' : 'application/json');
      let filename = req.file ? req.file.originalname : (req.body.csv ? 'paper.csv' : 'paper.json');

      const previewResult = await examImportService.dryRunImport({ fileBuffer, mimeType, filename });
      res.status(200).json({ success: true, data: previewResult });
    } catch (error) {
      next(error);
    }
  }

  async importPaper(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) return res.status(400).json({ success: false, message: 'Invalid exam ID' });

      let fileBuffer = req.file ? req.file.buffer : Buffer.from(req.body.csv || req.body.json || '', 'utf-8');
      let mimeType = req.file ? req.file.mimetype : (req.body.csv ? 'text/csv' : 'application/json');
      let filename = req.file ? req.file.originalname : (req.body.csv ? 'paper.csv' : 'paper.json');

      const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
      const duplicateMode = req.body.duplicateMode || 'CREATE_NEW';
      const questionBankId = req.body.questionBankId;

      const outcome = await examImportService.executeImport({
        examId,
        userId: req.user ? req.user.id : 1,
        instituteId: req.user ? req.user.instituteId : 1,
        fileBuffer,
        mimeType,
        filename,
        duplicateMode,
        questionBankId,
        idempotencyKey
      });

      res.status(200).json({ success: true, data: outcome });
    } catch (error) {
      next(error);
    }
  }

  async exportPaperPDF(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) return res.status(400).json({ success: false, message: 'Invalid exam ID' });

      const options = {
        profile: req.query.profile || 'STUDENT',
        includeAnswerKey: req.query.includeAnswerKey === 'true',
        includeExplanations: req.query.includeExplanations === 'true'
      };

      const html = await examExportService.exportPDF(examId, req.user.instituteId, options);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      next(error);
    }
  }

  async exportPaperExcel(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) return res.status(400).json({ success: false, message: 'Invalid exam ID' });

      const buffer = await examExportService.exportExcel(examId, req.user.instituteId, req.query);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=exam_${examId}_paper.xlsx`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  async exportPaperCSV(req, res, next) {
    try {
      const examId = parseInt(req.params.id, 10);
      if (isNaN(examId)) return res.status(400).json({ success: false, message: 'Invalid exam ID' });

      const csv = await examExportService.exportCSV(examId, req.user.instituteId, req.query);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=exam_${examId}_paper.csv`);
      res.send(csv);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ExamController();
