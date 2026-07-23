'use strict';

const prisma = require('../../../prisma');
const { ForbiddenError, AttemptExpiredError, NotFoundError } = require('../errors/customErrors');

/**
 * Verifies that the student attempt belongs to the requesting user.
 * Attaches attempt record to req.attempt.
 */
const verifyAttemptOwnership = async (req, res, next) => {
  try {
    const attemptId = parseInt(req.params.attemptId || req.body.attemptId, 10);
    if (isNaN(attemptId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attempt ID format',
        code: 'VALIDATION_ERROR'
      });
    }

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        examVersion: {
          include: {
            sections: {
              orderBy: { order: 'asc' },
              include: {
                questions: {
                  orderBy: { order: 'asc' }
                }
              }
            }
          }
        },
        answers: {
          include: {
            mcqAnswers: true
          }
        }
      }
    });

    if (!attempt) {
      return next(new NotFoundError('Student attempt record not found'));
    }

    const isMentor = req.user.role === 'ADMIN' || req.user.role === 'MENTOR' || req.user.role === 'INSTITUTE_ADMIN';

    // Verify ownership unless requesting user is a mentor/admin
    if (!isMentor && attempt.userId !== req.user.id) {
      return next(new ForbiddenError('You do not have access permission for this student attempt'));
    }

    req.attempt = attempt;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Checks if the student attempt is active (IN_PROGRESS) and enforces server-side timers.
 * If expired, it triggers database lock auto-submit and blocks the request.
 */
const verifyAttemptStatus = async (req, res, next) => {
  try {
    const attempt = req.attempt;
    if (!attempt) {
      return next(new NotFoundError('No active attempt context loaded'));
    }

    if (attempt.status !== 'IN_PROGRESS') {
      return res.status(403).json({
        success: false,
        message: `This attempt is locked. Status: ${attempt.status}`,
        code: 'ATTEMPT_LOCKED',
        status: attempt.status
      });
    }

    // Server-Side timer enforcement
    const now = new Date();
    
    // Check Exam Absolute End Date
    if (now > new Date(attempt.examVersion.endDate)) {
      // Trigger submission immediately
      const attemptService = require('../services/AttemptService');
      await attemptService.submitAttempt(attempt.id, attempt.userId, true);
      return next(new AttemptExpiredError('Exam window deadline has passed. Attempt auto-submitted.'));
    }

    // Check Exam Duration (minutes)
    const durationMs = attempt.examVersion.duration * 60 * 1000;
    const elapsedMs = now.getTime() - new Date(attempt.startTime).getTime();
    
    if (elapsedMs > durationMs) {
      // Trigger submission immediately
      const attemptService = require('../services/AttemptService');
      await attemptService.submitAttempt(attempt.id, attempt.userId, true);
      return next(new AttemptExpiredError('Attempt duration expired. Attempt auto-submitted.'));
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  verifyAttemptOwnership,
  verifyAttemptStatus
};
