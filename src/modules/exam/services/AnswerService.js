const prisma = require('../../../prisma');
const answerRepository = require('../repositories/AnswerRepository');
const attemptRepository = require('../repositories/AttemptRepository');

/**
 * AnswerService
 * Implements business rules for student answers saves, including character/word validation.
 */
class AnswerService {
  /**
   * Save student answer.
   * Performs validation on text length limits for descriptive answers.
   * @param {number} attemptId - Active Attempt ID
   * @param {number} userId - Requesting Student ID
   * @param {number} questionId - Snapshotted Version Question ID
   * @param {object} answerUpdate - Visited, flagged, text/code details
   * @param {Array<number>} [mcqOptionIds] - MCQ option selections
   * @returns {Promise<object>} Updated Answer
   */
  async saveAnswer(attemptId, userId, questionId, answerUpdate, mcqOptionIds = null) {
    // 1. Verify Attempt is active and owned by student
    const attempt = await attemptRepository.findById(attemptId);
    if (!attempt) {
      throw new Error('ATTEMPT_NOT_FOUND');
    }

    if (attempt.userId !== userId) {
      throw new Error('FORBIDDEN_ATTEMPT_ACCESS');
    }

    if (attempt.status !== 'IN_PROGRESS') {
      throw new Error('ATTEMPT_ALREADY_SUBMITTED');
    }

    // 2. Fetch Answer record
    const answer = await answerRepository.findByQuestion(attemptId, questionId);
    if (!answer) {
      throw new Error('ANSWER_RECORD_NOT_FOUND');
    }

    // 3. Type-specific business rules validation
    const question = answer.question; // ExamVersionQuestion snap
    if (question.type === 'DESCRIPTIVE' && answerUpdate.descriptiveAnswer) {
      const snapDetails = question.descriptiveDetails; // Snapshot JSON
      const text = answerUpdate.descriptiveAnswer;

      if (snapDetails) {
        // Enforce character limit
        if (snapDetails.charLimit && text.length > snapDetails.charLimit) {
          throw new Error('CHAR_LIMIT_EXCEEDED');
        }

        // Enforce word limit
        if (snapDetails.wordLimit) {
          const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
          if (wordCount > snapDetails.wordLimit) {
            throw new Error('WORD_LIMIT_EXCEEDED');
          }
        }
      }
    }

    // 4. Save using repository transaction
    const savedAnswer = await answerRepository.save(answer.id, answerUpdate, mcqOptionIds);

    // 5. Audit event log (debounced or discrete logging based on flags)
    const logType = answerUpdate.visitedOnly ? 'QUESTION_VISITED' : 'ANSWER_SAVED';
    await attemptRepository.logExamEvent(attemptId, userId, logType, {
      questionId,
      flagged: answerUpdate.flagged
    });

    return savedAnswer;
  }
}

module.exports = new AnswerService();
