const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/authMiddleware');
const {
  submitApplication,
  getMyApplication,
  getAllApplications,
  reviewApplication,
  submitSlot,
  reviewSlot,
  submitMentorFeedback,
  downloadResume
} = require('../controllers/jobAssistanceController');

const router = express.Router();

// ─── Multer setup for resume uploads ──────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'job-assistance');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const userId = req.user?.id || 'anon';
    const sanitizeExt = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `resume-user${userId}-${uniqueSuffix}${sanitizeExt}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword' // .doc
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and DOCX files are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB max
});

// ─── Middleware: Super Admin only ─────────────────────────────────────────────
const superAdminOnly = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access restricted to Super Admin only.'
    });
  }
  next();
};

// ─── Student Routes ───────────────────────────────────────────────────────────
router.post('/', protect, upload.single('resume'), submitApplication);
router.get('/my', protect, getMyApplication);
router.patch('/:id/slot', protect, submitSlot);

// ─── Admin Routes ─────────────────────────────────────────────────────────────
router.get('/', protect, superAdminOnly, getAllApplications);
router.patch('/:id/review', protect, superAdminOnly, reviewApplication);
router.patch('/:id/slot-review', protect, superAdminOnly, reviewSlot);
router.patch('/:id/feedback', protect, superAdminOnly, submitMentorFeedback);
router.get('/:id/resume', protect, superAdminOnly, downloadResume);

module.exports = router;
