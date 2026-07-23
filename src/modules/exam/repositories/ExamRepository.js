const prisma = require('../../../prisma');

/**
 * ExamRepository
 * Handles database operations for Exam, ExamSetting, ExamInstruction, and ExamVersion.
 */
class ExamRepository {
  /**
   * Find an exam by ID.
   * Excludes soft-deleted records.
   * @param {number} id - Exam ID
   * @param {number} instituteId - Tenant ID
   * @param {object} include - Prisma include options
   * @returns {Promise<object|null>}
   */
  async findById(id, instituteId, include = {}) {
    const where = {
      id,
      deletedAt: null,
      ...(instituteId ? { instituteId } : {})
    };
    const exam = await prisma.exam.findFirst({
      where,
      include
    });

    if (!exam && instituteId) {
      // Fallback query for super admin or cross-tenant access
      return prisma.exam.findFirst({
        where: { id, deletedAt: null },
        include
      });
    }

    return exam;
  }

  /**
   * List exams with filters.
   * Excludes soft-deleted records.
   * @param {object} params - Filter options
   * @param {number} [params.instituteId] - Tenant ID
   * @param {string} [params.status] - ExamStatus filter
   * @param {number} [params.creatorId] - Creator User ID
   * @param {number} [params.skip=0] - Pagination offset
   * @param {number} [params.limit=10] - Pagination limit
   * @returns {Promise<{exams: Array, total: number}>}
   */
  async findAll({ instituteId, status, creatorId, skip = 0, limit = 10 }) {
    const where = {
      deletedAt: null,
      ...(instituteId && { instituteId }),
      ...(status && { status }),
      ...(creatorId && { creatorId })
    };

    const [exams, total] = await Promise.all([
      prisma.exam.findMany({
        where,
        skip: parseInt(skip, 10),
        take: parseInt(limit, 10),
        orderBy: { createdAt: 'desc' },
        include: {
          creator: {
            select: { id: true, username: true, email: true, fullName: true }
          },
          settings: true
        }
      }),
      prisma.exam.count({ where })
    ]);

    return { exams, total };
  }

  /**
   * Create a new exam with settings in a transaction.
   * @param {object} examData - Core exam fields
   * @param {object} settingsData - Settings configuration fields
   * @param {Array<string>} [instructions=[]] - Array of instruction texts
   * @returns {Promise<object>} Created Exam object
   */
  async create(examData, settingsData, instructions = []) {
    return prisma.$transaction(async (tx) => {
      const exam = await tx.exam.create({
        data: {
          ...examData,
          settings: {
            create: settingsData
          },
          instructions: {
            create: instructions.map((text, index) => ({
              text,
              order: index
            }))
          }
        },
        include: {
          settings: true,
          instructions: true
        }
      });
      return exam;
    });
  }

  /**
   * Update exam fields with optimistic locking.
   * @param {number} id - Exam ID
   * @param {number} instituteId - Tenant ID
   * @param {number} currentVersion - Current version in database
   * @param {object} examUpdate - Exam fields to update
   * @param {object} [settingsUpdate] - Settings fields to update (optional)
   * @returns {Promise<object>} Updated exam
   * @throws {Error} Optimistic locking conflict error
   */
  async update(id, instituteId, currentVersion, examUpdate, settingsUpdate) {
    return prisma.$transaction(async (tx) => {
      // 1. Verify and update Exam with optimistic lock version check
      const updateResult = await tx.exam.updateMany({
        where: {
          id,
          instituteId,
          version: currentVersion,
          deletedAt: null
        },
        data: {
          ...examUpdate,
          version: { increment: 1 }
        }
      });

      if (updateResult.count === 0) {
        throw new Error('VERSION_CONFLICT');
      }

      // 2. Update settings if provided
      if (settingsUpdate) {
        await tx.examSetting.update({
          where: { examId: id },
          data: settingsUpdate
        });
      }

      // Return updated exam
      return tx.exam.findUnique({
        where: { id },
        include: {
          settings: true,
          instructions: true
        }
      });
    });
  }

  /**
   * Update instructions list (replaces old instructions with new list).
   * @param {number} examId - Exam ID
   * @param {Array<string>} instructions - New instruction texts
   * @returns {Promise<Array>} New instructions list
   */
  async updateInstructions(examId, instructions) {
    return prisma.$transaction(async (tx) => {
      await tx.examInstruction.deleteMany({
        where: { examId }
      });

      if (instructions.length > 0) {
        await tx.examInstruction.createMany({
          data: instructions.map((text, index) => ({
            examId,
            text,
            order: index
          }))
        });
      }

      return tx.examInstruction.findMany({
        where: { examId },
        orderBy: { order: 'asc' }
      });
    });
  }

  /**
   * Soft-delete an exam.
   * @param {number} id - Exam ID
   * @param {number} instituteId - Tenant ID
   * @param {number} deletedById - User ID performing delete
   * @returns {Promise<object>} Soft-deleted Exam
   */
  async delete(id, instituteId, deletedById) {
    return prisma.exam.update({
      where: { id, instituteId },
      data: {
        deletedAt: new Date(),
        deletedById
      }
    });
  }

  /**
   * Create an ExamAccess entry for a User or Batch.
   * @param {number} examId - Exam ID
   * @param {number|null} batchId - Batch ID
   * @param {number|null} userId - User ID
   * @returns {Promise<object>} Access entry
   */
  async createAccess(examId, batchId = null, userId = null) {
    return prisma.examAccess.create({
      data: {
        examId,
        batchId,
        userId
      }
    });
  }

  /**
   * Remove ExamAccess entries.
   * @param {number} examId - Exam ID
   * @param {number|null} batchId - Batch ID
   * @param {number|null} userId - User ID
   * @returns {Promise<object>} Delete response
   */
  async removeAccess(examId, batchId = null, userId = null) {
    return prisma.examAccess.deleteMany({
      where: {
        examId,
        ...(batchId && { batchId }),
        ...(userId && { userId })
      }
    });
  }

  /**
   * Find snapshotted ExamVersion by version number.
   * @param {number} examId - Exam ID
   * @param {number} version - Snapshot version number
   * @returns {Promise<object|null>} Exam version snapshot
   */
  async findVersion(examId, version) {
    return prisma.examVersion.findUnique({
      where: {
        examId_version: { examId, version }
      },
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
    });
  }

  /**
   * Find ExamVersion by version ID directly.
   * @param {number} examVersionId - ID of the version snap
   * @returns {Promise<object|null>}
   */
  async findVersionById(examVersionId) {
    return prisma.examVersion.findUnique({
      where: { id: examVersionId },
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
    });
  }

  /**
   * Save an immutable version snapshot.
   * @param {object} snapshotData - Snap fields
   * @returns {Promise<object>} Created version object
   */
  async createVersionSnapshot(snapshotData) {
    return prisma.examVersion.create({
      data: snapshotData,
      include: {
        sections: {
          include: {
            questions: true
          }
        }
      }
    });
  }
}

module.exports = new ExamRepository();
