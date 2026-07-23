const prisma = require('../../../prisma');

/**
 * QuestionRepository
 * Handles CRUD operations for Questions (MCQ, Descriptive, Coding) and bank mapping.
 */
class QuestionRepository {
  /**
   * Find a question by ID with nested details.
   * @param {number} id - Question ID
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    return prisma.question.findFirst({
      where: { id, deletedAt: null },
      include: {
        options: { orderBy: { order: 'asc' } },
        codingQuestion: {
          include: { testCases: true }
        },
        descriptiveQuestion: true,
        tags: { include: { tag: true } }
      }
    });
  }

  /**
   * List questions with search, difficulty, tag, and bank filters.
   * @param {object} params - Filter options
   * @param {number} [params.questionBankId] - Filter by specific question bank
   * @param {string} [params.search] - Search text inside title/body
   * @param {string} [params.difficulty] - EASY, MEDIUM, HARD
   * @param {string} [params.type] - MCQ, DESCRIPTIVE, CODING
   * @param {string} [params.tag] - Tag name
   * @param {number} [params.skip=0]
   * @param {number} [params.limit=10]
   * @returns {Promise<{questions: Array, total: number}>}
   */
  async findAll({ questionBankId, search, difficulty, type, tag, skip = 0, limit = 10 }) {
    const where = {
      deletedAt: null,
      ...(difficulty && { difficulty }),
      ...(type && { type }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { text: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(questionBankId && {
        banks: {
          some: { questionBankId }
        }
      }),
      ...(tag && {
        tags: {
          some: {
            tag: { name: { equals: tag, mode: 'insensitive' } }
          }
        }
      })
    };

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        skip: parseInt(skip, 10),
        take: parseInt(limit, 10),
        orderBy: { createdAt: 'desc' },
        include: {
          options: { orderBy: { order: 'asc' } },
          codingQuestion: {
            select: { timeLimit: true, memoryLimit: true }
          },
          descriptiveQuestion: {
            select: { wordLimit: true }
          },
          tags: { include: { tag: true } }
        }
      }),
      prisma.question.count({ where })
    ]);

    return { questions, total };
  }

  /**
   * Create a Question and associate it with a QuestionBank (inside a Prisma transaction).
   * @param {object} questionData - Core fields
   * @param {object} details - Nested options, test cases, or limits
   * @param {number} questionBankId - Associated QuestionBank
   * @returns {Promise<object>} Created Question
   */
  async create(questionData, details, questionBankId) {
    return prisma.$transaction(async (tx) => {
      // 1. Create base question
      const question = await tx.question.create({
        data: {
          title: questionData.title,
          text: questionData.text,
          type: questionData.type,
          marks: questionData.marks || 1,
          negativeMarks: questionData.negativeMarks || 0,
          explanation: questionData.explanation,
          difficulty: questionData.difficulty || 'EASY'
        }
      });

      // 2. Associate with Question Bank
      await tx.questionBankQuestion.create({
        data: {
          questionId: question.id,
          questionBankId
        }
      });

      // 3. Create type-specific details
      if (questionData.type === 'MCQ' && details.options) {
        await tx.mcqOption.createMany({
          data: details.options.map((opt, index) => ({
            questionId: question.id,
            text: opt.text,
            isCorrect: opt.isCorrect || false,
            order: opt.order ?? index
          }))
        });
      } else if (questionData.type === 'CODING' && details.coding) {
        const codingQ = await tx.codingQuestion.create({
          data: {
            questionId: question.id,
            constraints: details.coding.constraints,
            inputFormat: details.coding.inputFormat,
            outputFormat: details.coding.outputFormat,
            starterCode: details.coding.starterCode,
            timeLimit: details.coding.timeLimit || 2000,
            memoryLimit: details.coding.memoryLimit || 256
          }
        });

        if (details.coding.testCases && details.coding.testCases.length > 0) {
          await tx.codingTestCase.createMany({
            data: details.coding.testCases.map((tc) => ({
              codingQuestionId: codingQ.id,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              isSample: tc.isSample || false,
              weight: tc.weight || 100.0
            }))
          });
        }
      } else if (questionData.type === 'DESCRIPTIVE' && details.descriptive) {
        await tx.descriptiveQuestion.create({
          data: {
            questionId: question.id,
            wordLimit: details.descriptive.wordLimit,
            charLimit: details.descriptive.charLimit,
            rubric: details.descriptive.rubric,
            sampleAnswer: details.descriptive.sampleAnswer,
            allowFileUpload: details.descriptive.allowFileUpload || false,
            maxFileSize: details.descriptive.maxFileSize || 5,
            allowedExtensions: details.descriptive.allowedExtensions || []
          }
        });
      }

      // 4. Attach tags if provided
      if (details.tags && details.tags.length > 0) {
        for (const tagName of details.tags) {
          let tag = await tx.questionTag.findUnique({ where: { name: tagName } });
          if (!tag) {
            tag = await tx.questionTag.create({ data: { name: tagName } });
          }
          await tx.questionTagMap.create({
            data: { questionId: question.id, tagId: tag.id }
          });
        }
      }

      return tx.question.findUnique({
        where: { id: question.id },
        include: {
          options: true,
          codingQuestion: { include: { testCases: true } },
          descriptiveQuestion: true,
          tags: { include: { tag: true } }
        }
      });
    });
  }

  /**
   * Update question details with optimistic locking.
   * @param {number} id - Question ID
   * @param {number} currentVersion - Expected current version
   * @param {object} questionData - Core fields
   * @param {object} details - Nested updates (options, coding, descriptive)
   * @returns {Promise<object>} Updated question
   */
  async update(id, currentVersion, questionData, details) {
    return prisma.$transaction(async (tx) => {
      // 1. Perform base update with optimistic lock check
      const updateResult = await tx.question.updateMany({
        where: {
          id,
          version: currentVersion,
          deletedAt: null
        },
        data: {
          title: questionData.title,
          text: questionData.text,
          marks: questionData.marks,
          negativeMarks: questionData.negativeMarks,
          explanation: questionData.explanation,
          difficulty: questionData.difficulty,
          version: { increment: 1 }
        }
      });

      if (updateResult.count === 0) {
        throw new Error('VERSION_CONFLICT');
      }

      // 2. Perform detail updates
      if (questionData.type === 'MCQ' && details.options) {
        // Simple replace options strategy
        await tx.mcqOption.deleteMany({ where: { questionId: id } });
        await tx.mcqOption.createMany({
          data: details.options.map((opt, index) => ({
            questionId: id,
            text: opt.text,
            isCorrect: opt.isCorrect,
            order: opt.order ?? index
          }))
        });
      } else if (questionData.type === 'CODING' && details.coding) {
        const codingQ = await tx.codingQuestion.upsert({
          where: { questionId: id },
          update: {
            constraints: details.coding.constraints,
            inputFormat: details.coding.inputFormat,
            outputFormat: details.coding.outputFormat,
            starterCode: details.coding.starterCode,
            timeLimit: details.coding.timeLimit,
            memoryLimit: details.coding.memoryLimit
          },
          create: {
            questionId: id,
            constraints: details.coding.constraints,
            inputFormat: details.coding.inputFormat,
            outputFormat: details.coding.outputFormat,
            starterCode: details.coding.starterCode,
            timeLimit: details.coding.timeLimit || 2000,
            memoryLimit: details.coding.memoryLimit || 256
          }
        });

        if (details.coding.testCases) {
          await tx.codingTestCase.deleteMany({ where: { codingQuestionId: codingQ.id } });
          await tx.codingTestCase.createMany({
            data: details.coding.testCases.map((tc) => ({
              codingQuestionId: codingQ.id,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              isSample: tc.isSample,
              weight: tc.weight
            }))
          });
        }
      } else if (questionData.type === 'DESCRIPTIVE' && details.descriptive) {
        await tx.descriptiveQuestion.upsert({
          where: { questionId: id },
          update: {
            wordLimit: details.descriptive.wordLimit,
            charLimit: details.descriptive.charLimit,
            rubric: details.descriptive.rubric,
            sampleAnswer: details.descriptive.sampleAnswer,
            allowFileUpload: details.descriptive.allowFileUpload,
            maxFileSize: details.descriptive.maxFileSize,
            allowedExtensions: details.descriptive.allowedExtensions
          },
          create: {
            questionId: id,
            wordLimit: details.descriptive.wordLimit,
            charLimit: details.descriptive.charLimit,
            rubric: details.descriptive.rubric,
            sampleAnswer: details.descriptive.sampleAnswer,
            allowFileUpload: details.descriptive.allowFileUpload || false,
            maxFileSize: details.descriptive.maxFileSize || 5,
            allowedExtensions: details.descriptive.allowedExtensions || []
          }
        });
      }

      // 3. Update tags if provided
      if (details.tags) {
        await tx.questionTagMap.deleteMany({ where: { questionId: id } });
        for (const tagName of details.tags) {
          let tag = await tx.questionTag.findUnique({ where: { name: tagName } });
          if (!tag) {
            tag = await tx.questionTag.create({ data: { name: tagName } });
          }
          await tx.questionTagMap.create({
            data: { questionId: id, tagId: tag.id }
          });
        }
      }

      return tx.question.findUnique({
        where: { id },
        include: {
          options: true,
          codingQuestion: { include: { testCases: true } },
          descriptiveQuestion: true,
          tags: { include: { tag: true } }
        }
      });
    });
  }

  /**
   * Soft-delete a question.
   * @param {number} id - Question ID
   * @param {number} deletedById - User ID
   * @returns {Promise<object>} Soft deleted question
   */
  async delete(id, deletedById) {
    return prisma.question.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById
      }
    });
  }
}

module.exports = new QuestionRepository();
