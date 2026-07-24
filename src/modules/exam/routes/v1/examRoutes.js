'use strict';

const express = require('express');
const examController = require('../../controllers/examController');
const questionBankController = require('../../controllers/questionBankController');
const gradingController = require('../../controllers/gradingController');
const resultController = require('../../controllers/resultController');

const { protect, restrictTo } = require('../../../../middleware/authMiddleware');
const validateRequest = require('../../middlewares/validateRequest');
const { createExamSchema, updateExamSchema, manualGradeSchema } = require('../../validators/examValidators');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const router = express.Router();

// Enforce JWT auth for all exam endpoints
router.use(protect);

// Sample Template Download (Accessible by teachers & managers)
router.get('/template', examController.downloadTemplate);

// Public Read Endpoints (Filtered by role in controller)
router.get('/', examController.listExams);
router.get('/:id', examController.getExam);

// Reschedule action accessible by ADMIN, INSTITUTE_ADMIN, MENTOR, BATCH_MANAGER
router.patch('/:id/reschedule', restrictTo('ADMIN', 'INSTITUTE_ADMIN', 'MENTOR', 'BATCH_MANAGER'), examController.rescheduleExam);

// Paper Export Endpoints (Accessible by ADMIN, INSTITUTE_ADMIN, MENTOR, BATCH_MANAGER)
router.get('/:id/export-paper/pdf', restrictTo('ADMIN', 'INSTITUTE_ADMIN', 'MENTOR', 'BATCH_MANAGER'), examController.exportPaperPDF);
router.get('/:id/export-paper/excel', restrictTo('ADMIN', 'INSTITUTE_ADMIN', 'MENTOR', 'BATCH_MANAGER'), examController.exportPaperExcel);
router.get('/:id/export-paper/csv', restrictTo('ADMIN', 'INSTITUTE_ADMIN', 'MENTOR', 'BATCH_MANAGER'), examController.exportPaperCSV);

// Analytics & Report Endpoints (Accessible by ADMIN, INSTITUTE_ADMIN, MENTOR, BATCH_MANAGER)
router.get('/:id/analytics', restrictTo('ADMIN', 'INSTITUTE_ADMIN', 'MENTOR', 'BATCH_MANAGER'), resultController.getAnalytics);
router.get('/:id/reports/csv', restrictTo('ADMIN', 'INSTITUTE_ADMIN', 'MENTOR', 'BATCH_MANAGER'), resultController.exportCSV);

// Enforce Role auth for teacher/admin builder and management endpoints
router.use(restrictTo('ADMIN', 'MENTOR', 'INSTITUTE_ADMIN'));

// Paper Import Endpoints (Restricted to ADMIN, INSTITUTE_ADMIN, MENTOR)
router.post('/:id/import-paper/preview', upload.single('file'), examController.previewImportPaper);
router.post('/:id/import-paper', upload.single('file'), examController.importPaper);

// Exam Draft CRUD
router.post('/', validateRequest(createExamSchema), examController.createExam);
router.put('/:id', validateRequest(updateExamSchema), examController.updateExam);
router.delete('/:id', examController.deleteExam);

// Version Release Snapshots
router.post('/:id/publish', examController.publishExam);
router.post('/:id/archive', examController.archiveExam);
router.post('/:id/duplicate', examController.duplicateExam);
router.post('/:id/preview', examController.previewExam);

// Drag & Drop Reorder
router.post('/:id/reorder', examController.reorderExam);

// Section Draft CRUD
router.post('/:id/sections', examController.addSection);
router.put('/:id/sections/:sectionId', examController.updateSection);
router.delete('/:id/sections/:sectionId', examController.deleteSection);

// Question Draft CRUD inside Sections
router.post('/:id/sections/:sectionId/questions', examController.createQuestion);
router.put('/:id/sections/:sectionId/questions/:questionId', examController.updateQuestion);
router.post('/:id/sections/:sectionId/questions/import', examController.addQuestionToSection);
router.delete('/:id/sections/:sectionId/questions/:questionId', examController.removeQuestionFromSection);

// Reusable Question Banks CRUD
router.post('/question-banks', questionBankController.createBank);
router.get('/question-banks', questionBankController.listBanks);
router.get('/question-banks/:id', questionBankController.getBank);
router.put('/question-banks/:id', questionBankController.updateBank);
router.delete('/question-banks/:id', questionBankController.deleteBank);
router.post('/question-banks/:id/import', questionBankController.importQuestions);
router.get('/question-banks/:id/export', questionBankController.exportQuestions);

// Essay review & grading
router.get('/grading/pending', gradingController.getPendingGrades);
router.patch('/answers/:id/manual-grade', validateRequest(manualGradeSchema), gradingController.gradeDescriptive);

// Bulk release of final scores
router.post('/results/publish', resultController.publishResults);
router.post('/:id/results/publish', resultController.publishResults);
router.post('/:id/publish-results', resultController.publishResults);
router.post('/attempts/:attemptId/publish', resultController.publishAttemptResult);

module.exports = router;
