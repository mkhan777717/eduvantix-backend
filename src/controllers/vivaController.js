const vivaService = require('../services/vivaService');
const { correctTranscript } = require('../services/transcriptCorrectionService');


/**
 * Get available subjects for Viva.
 */
const getSubjects = async (req, res, next) => {
  try {
    const subjects = await vivaService.getSubjects();
    res.status(200).json({
      success: true,
      subjects
    });
  } catch (error) {
    next(error);
  }
};

const startSession = async (req, res, next) => {
  try {
    const { vivaId } = req.body;
    if (!vivaId) {
      return res.status(400).json({ success: false, message: "vivaId is required" });
    }

    const userId = req.user.id;
    const result = await vivaService.startVivaSession(userId, parseInt(vivaId));

    res.status(201).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit an answer to a viva question.
 */
const submitQuestionAnswer = async (req, res, next) => {
  try {
    const { sessionId, questionText, studentAnswer, selectedQuestionIds } = req.body;

    if (!sessionId || !questionText || !studentAnswer) {
      return res.status(400).json({ success: false, message: "sessionId, questionText, and studentAnswer are required" });
    }

    const userId = req.user.id;
    const result = await vivaService.submitAnswer(
      userId,
      parseInt(sessionId),
      questionText,
      studentAnswer,
      selectedQuestionIds || []
    );

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * Complete a viva session.
 */
const completeSession = async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: "sessionId is required" });
    }

    const userId = req.user.id;
    const result = await vivaService.completeSession(userId, parseInt(sessionId));

    res.status(200).json({
      success: true,
      session: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get details of a single viva session.
 */
const getSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await vivaService.getSessionDetails(userId, parseInt(sessionId));

    res.status(200).json({
      success: true,
      session
    });
  } catch (error) {
    next(error);
  }
};

const prisma = require('../prisma');
const PaginationService = require('../services/paginationService');
const paginationConfig = require('../config/pagination');

/**
 * Get all viva sessions for the user with pagination.
 */
const getHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await PaginationService.paginate({
      model: prisma.vivaSession,
      query: req.query,
      config: paginationConfig.viva,
      where: { userId },
      ctx: { user: req.user },
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Correct a raw voice transcript using AI.
 * POST /api/viva/session/correct-transcript
 *
 * Body: { questionText, rawTranscript, subject, expectedAnswer? }
 * Returns: { correctedTranscript, rawTranscript, correctionApplied, usedAI }
 */
const correctTranscriptController = async (req, res) => {
  const raw = req.body?.rawTranscript || '';
  try {
    const { questionText, rawTranscript, subject, expectedAnswer } = req.body;

    if (!rawTranscript || !questionText || !subject) {
      return res.status(400).json({
        success: false,
        message: 'rawTranscript, questionText, and subject are required.',
      });
    }

    const result = await correctTranscript({ questionText, rawTranscript, subject, expectedAnswer });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    // Never let correction errors propagate — return raw fallback so submission never blocks
    res.status(200).json({
      success: true,
      correctedTranscript: raw,
      rawTranscript: raw,
      correctionApplied: false,
      usedAI: false,
      error: error.message,
    });
  }
};

module.exports = {
  getSubjects,
  startSession,
  submitQuestionAnswer,
  completeSession,
  getSession,
  getHistory,
  correctTranscript: correctTranscriptController,
};

