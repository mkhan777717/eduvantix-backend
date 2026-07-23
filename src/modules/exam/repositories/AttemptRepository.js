const prisma = require('../../../prisma');

/**
 * AttemptRepository
 * Handles database operations for student Attempts, ProctoringEvents, and ExamEvents.
 */
class AttemptRepository {
  /**
   * Find attempt by ID.
   * @param {number} id - Attempt ID
   * @param {object} include - Prisma include options
   * @returns {Promise<object|null>}
   */
  async findById(id, include = {}) {
    return prisma.attempt.findUnique({
      where: { id },
      include
    });
  }

  /**
   * Find an active (IN_PROGRESS) attempt for a user on a specific exam.
   * @param {number} userId - Student ID
   * @param {number} examId - Exam ID
   * @returns {Promise<object|null>}
   */
  async findActiveAttempt(userId, examId) {
    return prisma.attempt.findFirst({
      where: {
        userId,
        status: 'IN_PROGRESS',
        examVersion: {
          examId
        }
      },
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
  }

  /**
   * Count attempts made by a user on a specific exam.
   * @param {number} userId - Student ID
   * @param {number} examId - Exam ID
   * @returns {Promise<number>}
   */
  async countAttempts(userId, examId) {
    return prisma.attempt.count({
      where: {
        userId,
        examVersion: {
          examId
        }
      }
    });
  }

  /**
   * Create a new attempt.
   * Enforce transaction and initialize answer skeletons.
   * @param {number} userId - Student ID
   * @param {object} examVersion - Snapshotted version metadata
   * @returns {Promise<object>} Created attempt
   */
  async create(userId, examVersion) {
    return prisma.$transaction(async (tx) => {
      // 1. Create the Attempt record
      const attempt = await tx.attempt.create({
        data: {
          userId,
          examVersionId: examVersion.id,
          status: 'IN_PROGRESS',
          startTime: new Date()
        }
      });

      // 2. Initialize Answer records for all questions in this version
      const answersData = [];
      for (const section of examVersion.sections) {
        for (const question of section.questions) {
          answersData.push({
            attemptId: attempt.id,
            questionId: question.id,
            visited: false,
            flagged: false,
            score: 0.0,
            isGraded: false
          });
        }
      }

      if (answersData.length > 0) {
        await tx.answer.createMany({
          data: answersData
        });
      }

      // 3. Log event
      await tx.examEvent.create({
        data: {
          attemptId: attempt.id,
          userId,
          event: 'ATTEMPT_STARTED',
          metadata: { examId: examVersion.examId, version: examVersion.version }
        }
      });

      return tx.attempt.findUnique({
        where: { id: attempt.id },
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
    });
  }

  /**
   * Update attempt status, score, or timing.
   * @param {number} id - Attempt ID
   * @param {object} updateData - Attempt fields to update
   * @returns {Promise<object>} Updated Attempt
   */
  async update(id, updateData) {
    return prisma.attempt.update({
      where: { id },
      data: updateData
    });
  }

  /**
   * Find attempts of a student (for dashboard/history).
   * @param {number} userId - Student ID
   * @param {number} skip - Offset
   * @param {number} limit - Size
   * @returns {Promise<{attempts: Array, total: number}>}
   */
  async findByUser(userId, skip = 0, limit = 10) {
    const where = { userId };
    const [attempts, total] = await Promise.all([
      prisma.attempt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startTime: 'desc' },
        include: {
          examVersion: {
            select: { examId: true, title: true, maxMarks: true }
          },
          result: true
        }
      }),
      prisma.attempt.count({ where })
    ]);
    return { attempts, total };
  }

  /**
   * List attempts for a specific Exam Version (for grading/results).
   * @param {number} examVersionId - Snap version ID
   * @param {object} filters - Filtering criteria (e.g. status, batchId)
   * @param {number} skip
   * @param {number} limit
   * @returns {Promise<{attempts: Array, total: number}>}
   */
  async findByVersion(examVersionId, filters = {}, skip = 0, limit = 10) {
    const where = {
      examVersionId,
      ...(filters.status && { status: filters.status }),
      ...(filters.userId && { userId: filters.userId })
    };

    const [attempts, total] = await Promise.all([
      prisma.attempt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, username: true, email: true, fullName: true }
          },
          result: true
        }
      }),
      prisma.attempt.count({ where })
    ]);

    return { attempts, total };
  }

  /**
   * Find all attempts that are IN_PROGRESS but past their end time.
   * Used for background scheduler.
   * @returns {Promise<Array>} List of expired attempts
   */
  async findExpiredAttempts() {
    const now = new Date();
    return prisma.attempt.findMany({
      where: {
        status: 'IN_PROGRESS',
        examVersion: {
          endDate: { lt: now } // Exam deadline has passed
        }
      },
      include: {
        examVersion: true
      }
    });
  }

  /**
   * Create a proctoring incident log.
   * @param {number} attemptId - Attempt ID
   * @param {string} event - Incident type (TAB_SWITCH, FULLSCREEN_EXIT, etc.)
   * @param {string} severity - LOW, MEDIUM, HIGH
   * @param {object} [metadata] - Additional details
   * @returns {Promise<object>} Created log entry
   */
  async logProctorEvent(attemptId, event, severity = 'LOW', metadata = null) {
    return prisma.proctoringEvent.create({
      data: {
        attemptId,
        event,
        severity,
        metadata
      }
    });
  }

  /**
   * Create an audit log.
   * @param {number} attemptId - Attempt ID
   * @param {number} userId - Actor ID
   * @param {string} event - Audit type (ANSWER_SAVED, CODE_RUN, etc.)
   * @param {object} [metadata] - Extra details
   * @returns {Promise<object>} Created log entry
   */
  async logExamEvent(attemptId, userId, event, metadata = null) {
    return prisma.examEvent.create({
      data: {
        attemptId,
        userId,
        event,
        metadata
      }
    });
  }
}

module.exports = new AttemptRepository();
