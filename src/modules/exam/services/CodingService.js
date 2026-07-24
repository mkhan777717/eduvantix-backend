const prisma = require('../../../prisma');
const attemptRepository = require('../repositories/AttemptRepository');
const answerRepository = require('../repositories/AnswerRepository');
const queueService = require('./queueService');

/**
 * CodingService
 * Orchestrates queuing logic for code runs and submissions.
 */
class CodingService {
  /**
   * Enqueue a "Run Code" request.
   * Runs only sample test cases. Unlimited attempts.
   * @param {number} userId - Student ID
   * @param {number} attemptId - Attempt ID
   * @param {number} questionId - Version Question ID
   * @param {string} code - Submitted source code text
   * @param {string} language - JAVASCRIPT, PYTHON, CPP, JAVA, GO
   * @returns {Promise<{jobId: string}>} Queue Job metadata
   */
  async runCode(userId, attemptId, questionId, code, language) {
    const attempt = await attemptRepository.findById(attemptId);
    if (!attempt || attempt.userId !== userId) {
      throw new Error('FORBIDDEN_ATTEMPT_ACCESS');
    }

    if (attempt.status !== 'IN_PROGRESS') {
      throw new Error('ATTEMPT_ALREADY_SUBMITTED');
    }

    const answer = await answerRepository.findByQuestion(attemptId, questionId);
    if (!answer) {
      throw new Error('ANSWER_RECORD_NOT_FOUND');
    }

    const question = answer.question;
    if (question.type !== 'CODING') {
      throw new Error('NOT_A_CODING_QUESTION');
    }

    const codingDetails = question.codingDetails; // Snap Json
    if (!codingDetails || !codingDetails.testCases) {
      throw new Error('CODING_DETAILS_MISSING');
    }

    // Filter only sample test cases for "Run Code"
    const sampleCases = codingDetails.testCases.filter((tc) => tc.isSample);

    const jobId = `run_${attemptId}_${questionId}_${Date.now()}`;

    // Queue job payload
    const jobPayload = {
      jobId,
      type: 'RUN',
      userId,
      attemptId,
      questionId,
      answerId: answer.id,
      code,
      language,
      timeLimit: codingDetails.timeLimit || 2000,
      memoryLimit: codingDetails.memoryLimit || 256,
      testCases: sampleCases
    };

    // Audit logs
    await attemptRepository.logExamEvent(attemptId, userId, 'CODE_RUN_QUEUED', { questionId, jobId });

    await queueService.enqueue('coding_run', jobPayload);

    return { jobId };
  }

  /**
   * Enqueue a "Submit Code" request.
   * Runs all test cases (hidden + visible), calculates grading score.
   * @param {number} userId - Student ID
   * @param {number} attemptId - Attempt ID
   * @param {number} questionId - Version Question ID
   * @param {string} code - Submitted source code text
   * @param {string} language - JAVASCRIPT, PYTHON, CPP, JAVA, GO
   * @returns {Promise<{jobId: string}>} Queue Job metadata
   */
  async submitCode(userId, attemptId, questionId, code, language) {
    const attempt = await attemptRepository.findById(attemptId);
    if (!attempt || attempt.userId !== userId) {
      throw new Error('FORBIDDEN_ATTEMPT_ACCESS');
    }

    if (attempt.status !== 'IN_PROGRESS') {
      throw new Error('ATTEMPT_ALREADY_SUBMITTED');
    }

    const answer = await answerRepository.findByQuestion(attemptId, questionId);
    if (!answer) {
      throw new Error('ANSWER_RECORD_NOT_FOUND');
    }

    const question = answer.question;
    if (question.type !== 'CODING') {
      throw new Error('NOT_A_CODING_QUESTION');
    }

    const codingDetails = question.codingDetails; // Snap Json
    if (!codingDetails || !codingDetails.testCases) {
      throw new Error('CODING_DETAILS_MISSING');
    }

    // Update Answer workspace immediately in database (acts as a backup/save)
    await answerRepository.save(answer.id, {
      codingCode: code,
      codingLanguage: language
    });

    const jobId = `submit_${attemptId}_${questionId}_${Date.now()}`;

    // Queue job payload (runs hidden + visible test cases)
    const jobPayload = {
      jobId,
      type: 'SUBMIT',
      userId,
      attemptId,
      questionId,
      answerId: answer.id,
      code,
      language,
      maxMarks: question.marks,
      timeLimit: codingDetails.timeLimit || 2000,
      memoryLimit: codingDetails.memoryLimit || 256,
      testCases: codingDetails.testCases // All test cases
    };

    // Audit logs
    await attemptRepository.logExamEvent(attemptId, userId, 'CODE_SUBMIT_QUEUED', { questionId, jobId });

    await queueService.enqueue('coding_submit', jobPayload);

    return { jobId };
  }

  /**
   * Store job execution result for polling retrieval.
   * @param {string} jobId
   * @param {object} payload
   */
  storeResult(jobId, payload) {
    if (!this.resultsCache) {
      this.resultsCache = new Map();
    }
    this.resultsCache.set(jobId, {
      ...payload,
      timestamp: Date.now()
    });

    // Cleanup old cached results (> 10 mins)
    if (this.resultsCache.size > 100) {
      const now = Date.now();
      for (const [k, v] of this.resultsCache.entries()) {
        if (now - v.timestamp > 600000) {
          this.resultsCache.delete(k);
        }
      }
    }
  }

  /**
   * Retrieve job execution result by jobId or attemptId+questionId.
   * @param {string} jobId
   * @returns {object|null}
   */
  getResult(jobId) {
    if (!this.resultsCache) return null;
    return this.resultsCache.get(jobId) || null;
  }
}

module.exports = new CodingService();
