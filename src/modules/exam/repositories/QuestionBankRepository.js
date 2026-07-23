const prisma = require('../../../prisma');

/**
 * QuestionBankRepository
 * Handles database operations for QuestionBank folders and question associations.
 */
class QuestionBankRepository {
  /**
   * Find a question bank by ID.
   * Excludes soft-deleted records.
   * @param {number} id - Question Bank ID
   * @param {number} instituteId - Tenant ID
   * @returns {Promise<object|null>}
   */
  async findById(id, instituteId) {
    return prisma.questionBank.findFirst({
      where: {
        id,
        instituteId,
        deletedAt: null
      },
      include: {
        creator: {
          select: { id: true, username: true, email: true, fullName: true }
        }
      }
    });
  }

  /**
   * Find all question banks for an institute.
   * Excludes soft-deleted records.
   * @param {number} instituteId - Tenant ID
   * @param {number} [skip=0]
   * @param {number} [limit=10]
   * @returns {Promise<{banks: Array, total: number}>}
   */
  async findAll(instituteId, skip = 0, limit = 10) {
    const where = {
      instituteId,
      deletedAt: null
    };

    const [banks, total] = await Promise.all([
      prisma.questionBank.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { questions: true }
          }
        }
      }),
      prisma.questionBank.count({ where })
    ]);

    return { banks, total };
  }

  /**
   * Create a new question bank.
   * @param {object} data - title, description, instituteId, creatorId
   * @returns {Promise<object>} Created QuestionBank
   */
  async create(data) {
    return prisma.questionBank.create({
      data
    });
  }

  /**
   * Update a question bank's metadata.
   * @param {number} id - Bank ID
   * @param {number} instituteId - Tenant ID
   * @param {object} data - Fields to update (title, description)
   * @returns {Promise<object>} Updated QuestionBank
   */
  async update(id, instituteId, data) {
    return prisma.questionBank.update({
      where: { id, instituteId },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Soft-delete a question bank.
   * @param {number} id - Bank ID
   * @param {number} instituteId - Tenant ID
   * @param {number} deletedById - User ID
   * @returns {Promise<object>} Soft-deleted QuestionBank
   */
  async delete(id, instituteId, deletedById) {
    return prisma.$transaction(async (tx) => {
      // 1. Soft delete the bank record itself
      const bank = await tx.questionBank.update({
        where: { id, instituteId },
        data: {
          deletedAt: new Date(),
          deletedById
        }
      });

      // We do not delete mapped questions from Question table, we keep them in case they're referenced in exams.
      // But we can clean up bank mapping if required. Here we preserve references.
      return bank;
    });
  }

  /**
   * Map an existing question to a question bank.
   * @param {number} questionId - Question ID
   * @param {number} questionBankId - Question Bank ID
   * @returns {Promise<object>} Mapping record
   */
  async mapQuestion(questionId, questionBankId) {
    return prisma.questionBankQuestion.upsert({
      where: {
        questionId_questionBankId: { questionId, questionBankId }
      },
      update: {},
      create: {
        questionId,
        questionBankId
      }
    });
  }

  /**
   * Unmap a question from a question bank.
   * @param {number} questionId - Question ID
   * @param {number} questionBankId - Question Bank ID
   * @returns {Promise<object>} Delete response
   */
  async unmapQuestion(questionId, questionBankId) {
    return prisma.questionBankQuestion.delete({
      where: {
        questionId_questionBankId: { questionId, questionBankId }
      }
    });
  }
}

module.exports = new QuestionBankRepository();
