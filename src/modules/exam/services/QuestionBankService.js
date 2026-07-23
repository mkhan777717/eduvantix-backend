const prisma = require('../../../prisma');
const questionBankRepository = require('../repositories/QuestionBankRepository');
const questionRepository = require('../repositories/QuestionRepository');

/**
 * QuestionBankService
 * Manages QuestionBanks and processes Excel/CSV bulk import/export.
 */
class QuestionBankService {
  /**
   * Get a question bank by ID.
   * @param {number} id - Bank ID
   * @param {number} instituteId - Tenant ID
   * @returns {Promise<object>}
   */
  async getBank(id, instituteId) {
    const bank = await questionBankRepository.findById(id, instituteId);
    if (!bank) {
      throw new Error('QUESTION_BANK_NOT_FOUND');
    }
    return bank;
  }

  /**
   * List all banks.
   * @param {number} instituteId - Tenant ID
   * @param {number} skip
   * @param {number} limit
   * @returns {Promise<object>}
   */
  async listBanks(instituteId, skip, limit) {
    return questionBankRepository.findAll(instituteId, skip, limit);
  }

  /**
   * Create a new folder bank.
   * @param {object} data - title, description, instituteId, creatorId
   * @returns {Promise<object>}
   */
  async createBank(data) {
    return questionBankRepository.create(data);
  }

  /**
   * Update question bank folder details.
   * @param {number} id - Bank ID
   * @param {number} instituteId - Tenant ID
   * @param {object} data - title, description
   * @returns {Promise<object>}
   */
  async updateBank(id, instituteId, data) {
    return questionBankRepository.update(id, instituteId, data);
  }

  /**
   * Delete folder.
   */
  async deleteBank(id, instituteId, deletedById) {
    return questionBankRepository.delete(id, instituteId, deletedById);
  }

  /**
   * Process bulk import of questions from parsed JSON/CSV payload.
   * @param {number} questionBankId - Associated bank
   * @param {Array<object>} questionList - Parsed question list
   * @returns {Promise<{successCount: number, errors: Array}>}
   */
  async importQuestions(questionBankId, questionList) {
    const errors = [];
    let successCount = 0;

    for (let index = 0; index < questionList.length; index++) {
      const q = questionList[index];
      try {
        // Validation checks
        if (!q.title || !q.text || !q.type) {
          throw new Error('Missing title, text, or type');
        }

        const validTypes = ['MCQ', 'DESCRIPTIVE', 'CODING'];
        if (!validTypes.includes(q.type)) {
          throw new Error(`Invalid type: ${q.type}`);
        }

        const qData = {
          title: q.title,
          text: q.text,
          type: q.type,
          marks: q.marks ? parseFloat(q.marks) : 1.0,
          negativeMarks: q.negativeMarks ? parseFloat(q.negativeMarks) : 0.0,
          explanation: q.explanation,
          difficulty: q.difficulty || 'EASY'
        };

        const details = {
          tags: q.tags || []
        };

        // Construct nested objects based on question type
        if (q.type === 'MCQ') {
          if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
            throw new Error('MCQs require at least 2 options');
          }
          details.options = q.options.map((opt) => ({
            text: opt.text,
            isCorrect: opt.isCorrect === true || opt.isCorrect === 'true'
          }));
        } else if (q.type === 'CODING') {
          details.coding = {
            constraints: q.constraints,
            inputFormat: q.inputFormat,
            outputFormat: q.outputFormat,
            starterCode: q.starterCode || {},
            timeLimit: q.timeLimit ? parseInt(q.timeLimit, 10) : 2000,
            memoryLimit: q.memoryLimit ? parseInt(q.memoryLimit, 10) : 256,
            testCases: q.testCases || []
          };
        } else if (q.type === 'DESCRIPTIVE') {
          details.descriptive = {
            wordLimit: q.wordLimit ? parseInt(q.wordLimit, 10) : null,
            charLimit: q.charLimit ? parseInt(q.charLimit, 10) : null,
            rubric: q.rubric,
            sampleAnswer: q.sampleAnswer,
            allowFileUpload: q.allowFileUpload === true || q.allowFileUpload === 'true',
            maxFileSize: q.maxFileSize ? parseInt(q.maxFileSize, 10) : 5,
            allowedExtensions: q.allowedExtensions || []
          };
        }

        // Execute save
        await questionRepository.create(qData, details, questionBankId);
        successCount++;
      } catch (err) {
        errors.push({
          row: index + 1,
          title: q.title || 'Untitled',
          message: err.message
        });
      }
    }

    return {
      successCount,
      errors
    };
  }

  /**
   * Export all questions in a question bank.
   * @param {number} questionBankId - Question Bank ID
   * @returns {Promise<Array>} List of full questions with options / codes / limits
   */
  async exportQuestions(questionBankId) {
    const mappings = await prisma.questionBankQuestion.findMany({
      where: { questionBankId },
      include: {
        question: {
          include: {
            options: true,
            codingQuestion: { include: { testCases: true } },
            descriptiveQuestion: true,
            tags: { include: { tag: true } }
          }
        }
      }
    });

    return mappings.map((m) => {
      const q = m.question;
      return {
        id: q.id,
        title: q.title,
        text: q.text,
        type: q.type,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        explanation: q.explanation,
        difficulty: q.difficulty,
        tags: q.tags.map((t) => t.tag.name),
        options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, order: o.order })),
        coding: q.codingQuestion ? {
          constraints: q.codingQuestion.constraints,
          inputFormat: q.codingQuestion.inputFormat,
          outputFormat: q.codingQuestion.outputFormat,
          starterCode: q.codingQuestion.starterCode,
          timeLimit: q.codingQuestion.timeLimit,
          memoryLimit: q.codingQuestion.memoryLimit,
          testCases: q.codingQuestion.testCases.map((tc) => ({ input: tc.input, expectedOutput: tc.expectedOutput, isSample: tc.isSample, weight: tc.weight }))
        } : null,
        descriptive: q.descriptiveQuestion ? {
          wordLimit: q.descriptiveQuestion.wordLimit,
          charLimit: q.descriptiveQuestion.charLimit,
          rubric: q.descriptiveQuestion.rubric,
          sampleAnswer: q.descriptiveQuestion.sampleAnswer,
          allowFileUpload: q.descriptiveQuestion.allowFileUpload,
          maxFileSize: q.descriptiveQuestion.maxFileSize,
          allowedExtensions: q.descriptiveQuestion.allowedExtensions
        } : null
      };
    });
  }
}

module.exports = new QuestionBankService();
