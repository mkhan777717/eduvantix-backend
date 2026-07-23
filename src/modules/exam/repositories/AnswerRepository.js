const prisma = require('../../../prisma');

/**
 * AnswerRepository
 * Handles CRUD operations for Answers and ManualGrades.
 */
class AnswerRepository {
  /**
   * Find a student's answer by ID.
   * @param {number} id - Answer ID
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    return prisma.answer.findUnique({
      where: { id },
      include: {
        mcqAnswers: true,
        manualGrade: true,
        question: true
      }
    });
  }

  /**
   * Find a student's answer by Attempt ID and Question ID.
   * @param {number} attemptId - Attempt ID
   * @param {number} questionId - Snapshotted Question ID
   * @returns {Promise<object|null>}
   */
  async findByQuestion(attemptId, questionId) {
    return prisma.answer.findFirst({
      where: { attemptId, questionId },
      include: {
        mcqAnswers: true,
        manualGrade: true,
        question: true
      }
    });
  }

  /**
   * Get all answers for an attempt.
   * Used by student's screen and final grading summaries.
   * @param {number} attemptId - Attempt ID
   * @returns {Promise<Array>} List of answers
   */
  async findByAttempt(attemptId) {
    return prisma.answer.findMany({
      where: { attemptId },
      orderBy: { question: { order: 'asc' } },
      include: {
        mcqAnswers: true,
        manualGrade: true,
        question: true
      }
    });
  }

  /**
   * Save a student's answer.
   * Updates visited status, option lists, code contents, or text attachments.
   * @param {number} id - Answer ID
   * @param {object} answerData - Update data (e.g. visited, flagged, descriptiveAnswer, codingCode, codingLanguage)
   * @param {Array<number>} [mcqOptionIds] - Chosen option IDs (if MCQ)
   * @returns {Promise<object>} Updated Answer record
   */
  async save(id, answerData, mcqOptionIds = null) {
    return prisma.$transaction(async (tx) => {
      // 1. Update basic fields (visited, flagged, text, code details)
      const answer = await tx.answer.update({
        where: { id },
        data: {
          ...answerData,
          updatedAt: new Date()
        }
      });

      // 2. If MCQ option list is provided, update option junction rows
      if (mcqOptionIds !== null) {
        await tx.answerMCQOption.deleteMany({
          where: { answerId: id }
        });

        if (mcqOptionIds.length > 0) {
          await tx.answerMCQOption.createMany({
            data: mcqOptionIds.map((optId) => {
              const parsedIntId = typeof optId === 'number' ? optId : parseInt(optId, 10);
              return {
                answerId: id,
                optionId: parsedIntId,
                optionIdRef: parsedIntId
              };
            })
          });
        }
      }

      return tx.answer.findUnique({
        where: { id },
        include: {
          mcqAnswers: true,
          manualGrade: true,
          question: true
        }
      });
    });
  }

  /**
   * Find answers requiring manual grading (Descriptive answers not yet graded).
   * Scopes by institute to maintain multi-tenancy.
   * @param {number} instituteId - Tenant ID
   * @param {number} [examId] - Specific exam filter
   * @param {number} [skip=0]
   * @param {number} [limit=10]
   * @returns {Promise<{answers: Array, total: number}>}
   */
  async findPendingGrades(instituteId, examId = null, skip = 0, limit = 50) {
    const where = {
      isGraded: false,
      question: {
        type: { in: ['DESCRIPTIVE', 'CODING'] }
      },
      attempt: {
        status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'AUTO_SUBMITTED'] },
        ...(examId && {
          examVersion: {
            examId: examId
          }
        })
      }
    };

    const [answers, total] = await Promise.all([
      prisma.answer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          question: true,
          attempt: {
            include: {
              user: {
                select: { id: true, username: true, email: true, fullName: true }
              },
              examVersion: {
                select: { examId: true, title: true }
              }
            }
          }
        }
      }),
      prisma.answer.count({ where })
    ]);

    return { answers, total };
  }

  /**
   * Save a manual grade for a descriptive answer.
   * @param {number} answerId - Answer ID
   * @param {object} gradingData - Score, comments, and gradedById
   * @returns {Promise<object>} Created/Updated ManualGrade
   */
  async saveManualGrade(answerId, gradingData) {
    return prisma.$transaction(async (tx) => {
      // 1. Create or update ManualGrade row
      const manualGrade = await tx.manualGrade.upsert({
        where: { answerId },
        update: {
          score: gradingData.score,
          comments: gradingData.comments,
          gradedById: gradingData.gradedById,
          updatedAt: new Date()
        },
        create: {
          answerId,
          score: gradingData.score,
          comments: gradingData.comments,
          gradedById: gradingData.gradedById
        }
      });

      // 2. Mark Answer as graded and assign points score
      await tx.answer.update({
        where: { id: answerId },
        data: {
          isGraded: true,
          score: gradingData.score
        }
      });

      return manualGrade;
    });
  }
}

module.exports = new AnswerRepository();
