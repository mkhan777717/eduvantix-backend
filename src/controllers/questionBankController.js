const qbService = require('../services/questionBankService');

/** GET /api/viva/questions */
const listQuestions = async (req, res, next) => {
  try {
    const { subject, topic, difficulty, search } = req.query;
    const instituteId = req.user && req.user.role !== 'ADMIN' ? req.user.instituteId : null;
    const questions = await qbService.getQuestions({ subject, topic, difficulty, search, instituteId });
    res.json({ success: true, count: questions.length, questions });
  } catch (err) {
    next(err);
  }
};

/** GET /api/viva/questions/subjects */
const listSubjects = async (req, res, next) => {
  try {
    const instituteId = req.user && req.user.role !== 'ADMIN' ? req.user.instituteId : null;
    const subjects = await qbService.getSubjects(instituteId);
    res.json({ success: true, subjects });
  } catch (err) {
    next(err);
  }
};

/** GET /api/viva/questions/topics */
const listTopics = async (req, res, next) => {
  try {
    const { subject } = req.query;
    const instituteId = req.user && req.user.role !== 'ADMIN' ? req.user.instituteId : null;
    const topics = await qbService.getTopics(subject, instituteId);
    res.json({ success: true, topics });
  } catch (err) {
    next(err);
  }
};

/** GET /api/viva/questions/:id */
const getQuestion = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid question ID." });
    const question = await qbService.getQuestionById(id);

    // Scoping validation
    if (req.user && req.user.role !== 'ADMIN' && question.instituteId !== req.user.instituteId) {
      return res.status(403).json({ success: false, message: "You are not authorized to view this question." });
    }

    res.json({ success: true, question });
  } catch (err) {
    next(err);
  }
};

/** POST /api/viva/questions */
const createQuestion = async (req, res, next) => {
  try {
    const { questionText, subject, topic, difficulty, expectedAnswer, keywords } = req.body;
    const instituteId = req.user && req.user.role !== 'ADMIN' ? req.user.instituteId : null;
    const question = await qbService.createQuestion({ questionText, subject, topic, difficulty, expectedAnswer, keywords, instituteId });
    res.status(201).json({ success: true, question });
  } catch (err) {
    // Validation errors → 400
    if (err.message && !err.code) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
};

/** PUT /api/viva/questions/:id */
const updateQuestion = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid question ID." });

    const questionCheck = await qbService.getQuestionById(id);
    if (req.user && req.user.role !== 'ADMIN' && questionCheck.instituteId !== req.user.instituteId) {
      return res.status(403).json({ success: false, message: "You are not authorized to update this question." });
    }

    const { questionText, subject, topic, difficulty, expectedAnswer, keywords } = req.body;
    const question = await qbService.updateQuestion(id, { questionText, subject, topic, difficulty, expectedAnswer, keywords });
    res.json({ success: true, question });
  } catch (err) {
    if (err.message && !err.code) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
};

/** DELETE /api/viva/questions/:id */
const deleteQuestion = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid question ID." });

    const questionCheck = await qbService.getQuestionById(id);
    if (req.user && req.user.role !== 'ADMIN' && questionCheck.instituteId !== req.user.instituteId) {
      return res.status(403).json({ success: false, message: "You are not authorized to delete this question." });
    }

    const result = await qbService.deleteQuestion(id);
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.message && !err.code) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
};

module.exports = {
  listQuestions,
  listSubjects,
  listTopics,
  getQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion
};
