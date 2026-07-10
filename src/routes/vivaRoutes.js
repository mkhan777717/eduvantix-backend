const express = require('express');
const path = require('path');
const multer = require('multer');

const {
  getSubjects, startSession, submitQuestionAnswer,
  completeSession, getSession, getHistory, correctTranscript
} = require('../controllers/vivaController');


const {
  listQuestions, listSubjects, listTopics,
  getQuestion, createQuestion, updateQuestion, deleteQuestion
} = require('../controllers/questionBankController');

const {
  list: listMaterials, get: getMaterial, upload: uploadMaterial,
  retry: retryExtraction, generate: generateQuestions,
  saveQuestions, remove: deleteMaterial, viewFile, downloadFile
} = require('../controllers/studyMaterialController');

const { protect, restrictTo } = require('../middleware/authMiddleware');
const { UPLOADS_DIR } = require('../services/studyMaterialService');
const {
  scheduleViva, listScheduledVivas, getScheduledVivaDetails, updateScheduledViva, deleteScheduledViva
} = require('../controllers/vivaSchedulingController');

// ── Multer: PDF uploads ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${ts}-${safe}`);
  }
});
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') cb(null, true);
  else cb(new Error('Only PDF files are allowed.'), false);
};
const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

const router = express.Router();

// ── Public ───────────────────────────────────────────────────────────
  router.get('/subjects', getSubjects);

// ── Question Bank (read: all authenticated) ──────────────────────────
router.get('/questions/subjects', protect, listSubjects);
router.get('/questions/topics',   protect, listTopics);
router.get('/questions',          protect, listQuestions);
router.get('/questions/:id',      protect, getQuestion);

router.post(  '/questions',      protect, restrictTo('INSTITUTE_ADMIN', 'BATCH_MANAGER', 'MENTOR'), createQuestion);
router.put(   '/questions/:id',  protect, restrictTo('INSTITUTE_ADMIN', 'BATCH_MANAGER', 'MENTOR'), updateQuestion);
router.delete('/questions/:id',  protect, restrictTo('INSTITUTE_ADMIN', 'BATCH_MANAGER', 'MENTOR'), deleteQuestion);

// ── Study Materials (read: all authenticated, write: mentor/admin only) ──────────────────────────────
// save-questions must come BEFORE /:id routes to avoid param collision
router.post('/materials/save-questions', protect, restrictTo('INSTITUTE_ADMIN', 'BATCH_MANAGER', 'MENTOR'), saveQuestions);

router.get(   '/materials',              protect, listMaterials);
router.post(  '/materials',              protect, restrictTo('INSTITUTE_ADMIN', 'BATCH_MANAGER', 'MENTOR'), uploadMiddleware.single('file'), uploadMaterial);
router.get(   '/materials/:id',          protect, getMaterial);
router.get(   '/materials/:id/view',     protect, viewFile);
router.get(   '/materials/:id/download', protect, downloadFile);
router.delete('/materials/:id',          protect, restrictTo('INSTITUTE_ADMIN', 'BATCH_MANAGER', 'MENTOR'), deleteMaterial);
router.post(  '/materials/:id/retry',    protect, restrictTo('INSTITUTE_ADMIN', 'BATCH_MANAGER', 'MENTOR'), retryExtraction);
router.post(  '/materials/:id/generate', protect, restrictTo('INSTITUTE_ADMIN', 'BATCH_MANAGER', 'MENTOR'), generateQuestions);

// ── Viva Scheduling ──────────────────────────────────────────────────
router.post('/schedule',      protect, restrictTo('INSTITUTE_ADMIN', 'BATCH_MANAGER', 'MENTOR'), scheduleViva);
router.get( '/scheduled',     protect, listScheduledVivas);
router.get( '/scheduled/:id', protect, getScheduledVivaDetails);
router.put( '/scheduled/:id', protect, restrictTo('INSTITUTE_ADMIN', 'BATCH_MANAGER', 'MENTOR'), updateScheduledViva);
router.delete('/scheduled/:id', protect, restrictTo('INSTITUTE_ADMIN', 'BATCH_MANAGER', 'MENTOR'), deleteScheduledViva);

// ── Session routes (all protected) ───────────────────────────────────
router.use(protect);
router.get( '/history',              getHistory);
router.get( '/history/:sessionId',   getSession);
router.post('/session/start',        startSession);
router.post('/session/correct-transcript', correctTranscript);
 router.post('/session/answer',       submitQuestionAnswer);

router.post('/session/complete',     completeSession);

module.exports = router;
