const fs = require('fs');
const svc = require('../services/studyMaterialService');

/** GET /api/viva/materials */
const list = async (req, res, next) => {
  try {
    const instituteId = req.user ? req.user.instituteId : null;
    if (!instituteId) {
      return res.json({ success: true, count: 0, materials: [] });
    }
    const materials = await svc.listMaterials(instituteId);
    res.json({ success: true, count: materials.length, materials });
  } catch (err) { next(err); }
};

/** GET /api/viva/materials/:id */
const get = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID.' });
    const material = await svc.getMaterial(id);

    // Scoping validation
    if (req.user?.role !== 'ADMIN' && material.instituteId !== null && material.instituteId !== req.user?.instituteId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view this material.' });
    }

    res.json({ success: true, material });
  } catch (err) {
    if (err.message === 'Study material not found.') return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
};

/** POST /api/viva/materials  (multipart/form-data: file + title + subject) */
const upload = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No PDF file uploaded.' });
    const { title, subject } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, message: 'Title is required.' });
    if (!subject?.trim()) return res.status(400).json({ success: false, message: 'Subject is required.' });

    const instituteId = req.user ? req.user.instituteId : null;
    if (!instituteId) {
      return res.status(403).json({ success: false, message: 'You must belong to an institute to upload materials.' });
    }

    const material = await svc.createMaterial({
      title,
      subject,
      fileName: req.file.originalname,
      filePath: req.file.path,
      uploadedById: req.user.id,
      instituteId
    });
    res.status(201).json({ success: true, material });
  } catch (err) {
    if (err.message && !err.code) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
};

/** POST /api/viva/materials/:id/retry */
const retry = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID.' });
    
    const materialCheck = await svc.getMaterial(id);
    if (!req.user || !req.user.instituteId || materialCheck.instituteId !== req.user.instituteId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to retry extraction on this material.' });
    }

    const material = await svc.retryExtraction(id);
    res.json({ success: true, material });
  } catch (err) {
    if (err.message && !err.code) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
};

/** POST /api/viva/materials/:id/generate */
const generate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID.' });

    const materialCheck = await svc.getMaterial(id);
    if (!req.user || !req.user.instituteId || materialCheck.instituteId !== req.user.instituteId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to generate questions from this material.' });
    }

    const count = Math.min(parseInt(req.body.count) || 10, 30);
    const existingQuestions = Array.isArray(req.body.existingQuestions) ? req.body.existingQuestions : [];
    const questions = await svc.generateFromMaterial(id, count, existingQuestions);
    res.json({ success: true, count: questions.length, questions });
  } catch (err) {
    if (err.message && !err.code) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
};

/** POST /api/viva/materials/save-questions */
const saveQuestions = async (req, res, next) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: 'questions array is required.' });
    }
    const instituteId = req.user ? req.user.instituteId : null;
    if (!instituteId) {
      return res.status(403).json({ success: false, message: 'You must belong to an institute to save questions.' });
    }
    const saved = await svc.saveQuestionsToBank(questions, instituteId);
    res.json({ success: true, saved: saved.length, questions: saved });
  } catch (err) {
    if (err.message && !err.code) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
};

/** DELETE /api/viva/materials/:id */
const remove = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID.' });

    const materialCheck = await svc.getMaterial(id);
    if (!req.user || !req.user.instituteId || materialCheck.instituteId !== req.user.instituteId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to delete this material.' });
    }

    const result = await svc.deleteMaterial(id);
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.message && !err.code) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
};

/** GET /api/viva/materials/:id/view */
const viewFile = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID.' });
    const material = await svc.getMaterial(id);

    if (!req.user || !req.user.instituteId || material.instituteId !== req.user.instituteId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view this material.' });
    }

    if (!fs.existsSync(material.filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on disk.' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(material.filePath).pipe(res);
  } catch (err) {
    next(err);
  }
};

/** GET /api/viva/materials/:id/download */
const downloadFile = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID.' });
    const material = await svc.getMaterial(id);

    if (!req.user || !req.user.instituteId || material.instituteId !== req.user.instituteId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to download this material.' });
    }

    if (!fs.existsSync(material.filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on disk.' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(material.fileName)}"`);
    fs.createReadStream(material.filePath).pipe(res);
  } catch (err) {
    next(err);
  }
};

module.exports = { list, get, upload, retry, generate, saveQuestions, remove, viewFile, downloadFile };
