const prisma = require('../../../prisma');
const answerRepository = require('../repositories/AnswerRepository');
const attemptRepository = require('../repositories/AttemptRepository');
const resultRepository = require('../repositories/ResultRepository');

/**
 * GradingService
 * Implements logic for descriptive answer manual grading, coding scores, and score aggregate updates.
 */
class GradingService {
  /**
   * Assign a manual score to a descriptive answer.
   * Recalculates total attempt score and releases results if no pending items remain.
   * @param {number} answerId - Answer ID
   * @param {number} score - Manually awarded score
   * @param {string} comments - Review feedback comments
   * @param {number} gradedById - Mentor ID performing grading
   * @returns {Promise<object>} Created ManualGrade
   */
  async gradeDescriptive(answerId, score, comments, gradedById, extraMeta = {}) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch answer, checking bounds
      let answer = null;
      if (answerId && answerId > 0) {
        answer = await tx.answer.findUnique({
          where: { id: answerId },
          include: {
            question: true,
            attempt: {
              include: {
                examVersion: true,
                answers: true
              }
            }
          }
        });
      }

      if (!answer && extraMeta?.attemptId && extraMeta?.questionId) {
        answer = await tx.answer.findFirst({
          where: {
            attemptId: extraMeta.attemptId,
            questionId: extraMeta.questionId
          },
          include: {
            question: true,
            attempt: {
              include: {
                examVersion: true,
                answers: true
              }
            }
          }
        });

        if (!answer) {
          answer = await tx.answer.create({
            data: {
              attemptId: extraMeta.attemptId,
              questionId: extraMeta.questionId,
              score: 0,
              isGraded: false
            },
            include: {
              question: true,
              attempt: {
                include: {
                  examVersion: true,
                  answers: true
                }
              }
            }
          });
        }
      }

      if (!answer) {
        throw new Error('ANSWER_RECORD_NOT_FOUND');
      }

      const maxQuestionMarks = answer.question?.marks || 10;
      if (score < 0 || score > maxQuestionMarks) {
        throw new Error('INVALID_SCORE_BOUNDS');
      }

      // 2. Save manual grade and update answer score / graded status
      const manualGrade = await tx.manualGrade.upsert({
        where: { answerId: answer.id },
        update: {
          score,
          comments,
          gradedById,
          updatedAt: new Date()
        },
        create: {
          answerId: answer.id,
          score,
          comments,
          gradedById
        }
      });

      await tx.answer.update({
        where: { id: answer.id },
        data: {
          score,
          isGraded: true
        }
      });

      // 3. Check if all other answers in the attempt are now graded
      const otherAnswers = await tx.answer.findMany({
        where: { attemptId: answer.attemptId }
      });

      const allGraded = otherAnswers.every((a) => a.id === answerId ? true : a.isGraded);
      const totalScore = otherAnswers.reduce((sum, a) => {
        const val = a.id === answerId ? score : a.score;
        return sum + val;
      }, 0.0);

      const examVersion = answer.attempt.examVersion;
      const percentage = examVersion.maxMarks > 0 ? (totalScore / examVersion.maxMarks) * 100 : 0.0;
      const passed = totalScore >= examVersion.passingMarks;

      // 4. If all answers are graded, update the attempt status to SUBMITTED (clearing UNDER_REVIEW)
      let attemptStatus = answer.attempt.status;
      if (allGraded && attemptStatus === 'UNDER_REVIEW') {
        attemptStatus = 'SUBMITTED';
      }

      await tx.attempt.update({
        where: { id: answer.attemptId },
        data: {
          score: totalScore,
          status: attemptStatus
        }
      });

      // 5. Update processed Result table entry
      // If immediate or after deadline and deadline passed, release result.
      const releasePolicy = examVersion.resultReleasePolicy;
      let shouldPublish = false;
      
      if (allGraded) {
        shouldPublish = true;
      }

      await tx.examResult.upsert({
        where: { attemptId: answer.attemptId },
        update: {
          score: totalScore,
          totalMarks: examVersion.maxMarks,
          percentage,
          passed,
          published: shouldPublish,
          updatedAt: new Date()
        },
        create: {
          attemptId: answer.attemptId,
          score: totalScore,
          totalMarks: examVersion.maxMarks,
          percentage,
          passed,
          published: shouldPublish
        }
      });

      // Log grading audit event
      await tx.examEvent.create({
        data: {
          attemptId: answer.attemptId,
          userId: gradedById,
          event: 'GRADE_UPDATED',
          metadata: { answerId, score, comments, allGraded }
        }
      });

      return manualGrade;
    });
  }

  /**
   * Save a grading result for a coding submission (called by background execution queue worker).
   * @param {number} answerId - Answer ID
   * @param {number} passedCount - Passed test cases count
   * @param {number} totalCount - Total executed test cases count
   * @param {number} maxMarks - Maximum marks for the question
   * @returns {Promise<object>} Updated Answer record
   */
  async gradeCodingResult(answerId, passedCount, totalCount, maxMarks) {
    const score = totalCount > 0 ? (passedCount / totalCount) * maxMarks : 0.0;

    return prisma.answer.update({
      where: { id: answerId },
      data: {
        score,
        isGraded: true
      }
    });
  }
}

module.exports = new GradingService();
