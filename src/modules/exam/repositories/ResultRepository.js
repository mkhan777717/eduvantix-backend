const prisma = require('../../../prisma');

/**
 * ResultRepository
 * Handles database operations for ExamResults and Analytics.
 */
class ResultRepository {
  /**
   * Find a result by Attempt ID.
   * @param {number} attemptId - Attempt ID
   * @returns {Promise<object|null>}
   */
  async findByAttempt(attemptId) {
    return prisma.examResult.findUnique({
      where: { attemptId },
      include: {
        attempt: {
          include: {
            user: { select: { id: true, username: true, email: true, fullName: true } },
            examVersion: true
          }
        }
      }
    });
  }

  /**
   * Create or update an ExamResult.
   * @param {number} attemptId - Attempt ID
   * @param {object} resultData - totalMarks, score, percentage, passed, published
   * @returns {Promise<object>} Created/Updated ExamResult
   */
  async save(attemptId, resultData) {
    return prisma.examResult.upsert({
      where: { attemptId },
      update: {
        totalMarks: resultData.totalMarks,
        score: resultData.score,
        percentage: resultData.percentage,
        passed: resultData.passed,
        published: resultData.published ?? false,
        updatedAt: new Date()
      },
      create: {
        attemptId,
        totalMarks: resultData.totalMarks,
        score: resultData.score,
        percentage: resultData.percentage,
        passed: resultData.passed,
        published: resultData.published ?? false
      }
    });
  }

  /**
   * Bulk publish all results for a specific Exam.
   * @param {number} examId - Exam ID
   * @returns {Promise<object>} Update result summary
   */
  async publishExamResults(examId) {
    // Publish all results associated with attempts of this exam
    return prisma.examResult.updateMany({
      where: {
        attempt: {
          examVersion: {
            examId
          }
        }
      },
      data: {
        published: true
      }
    });
  }

  /**
   * Get historical performance scores for a student.
   * @param {number} userId - Student ID
   * @returns {Promise<Array>} List of results
   */
  async findStudentResults(userId) {
    return prisma.examResult.findMany({
      where: {
        attempt: {
          userId,
          status: 'SUBMITTED'
        },
        published: true
      },
      include: {
        attempt: {
          include: {
            examVersion: {
              select: { title: true, maxMarks: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}

module.exports = new ResultRepository();
