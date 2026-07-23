const prisma = require('../../../prisma');
const attemptRepository = require('../repositories/AttemptRepository');
const examRepository = require('../repositories/ExamRepository');

/**
 * AttemptService
 * Enforces business constraints around starting, resuming, submitting, and auditing exam attempts.
 */
class AttemptService {
  /**
   * Start or resume a student's attempt.
   * Enforces timing windows, passwords, access restrictions, and attempt caps.
   * @param {number} userId - Student ID
   * @param {number} examId - Exam ID
   * @param {string} [password] - Exam settings entry password
   * @returns {Promise<object>} Started or resumed Attempt
   */
  async startAttempt(userId, examId, password = null) {
    // 1. Get Exam and locate its current published version snapshot
    const exam = await prisma.exam.findFirst({
      where: { id: examId, deletedAt: null },
      include: { settings: true }
    });

    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }

    if (exam.status !== 'PUBLISHED') {
      throw new Error('EXAM_NOT_AVAILABLE');
    }

    if (!exam.currentVersionId) {
      throw new Error('EXAM_NO_ACTIVE_VERSION');
    }

    const examVersion = await examRepository.findVersionById(exam.currentVersionId);
    if (!examVersion) {
      throw new Error('VERSION_NOT_FOUND');
    }

    // 2. Validate timing window (Check Exam table primary rescheduled dates or version dates)
    const now = new Date();
    const effectiveStart = exam.startDate ? new Date(exam.startDate) : new Date(examVersion.startDate);
    const effectiveEnd = exam.endDate ? new Date(exam.endDate) : new Date(examVersion.endDate);

    if (now < effectiveStart) {
      throw new Error('EXAM_NOT_STARTED');
    }
    if (now > effectiveEnd) {
      throw new Error('EXAM_EXPIRED');
    }

    // 3. Verify access permissions (User-specific or Batch-specific)
    const totalAccessRecords = await prisma.examAccess.count({
      where: { examId }
    });

    if (totalAccessRecords > 0) {
      const accessCount = await prisma.examAccess.count({
        where: {
          examId,
          OR: [
            { userId },
            {
              batch: {
                students: {
                  some: { id: userId }
                }
              }
            }
          ]
        }
      });

      if (accessCount === 0) {
        throw new Error('UNAUTHORIZED_EXAM_ACCESS');
      }
    }

    // 4. Verify password if password restriction is active
    if (exam.settings?.password && exam.settings.password !== password) {
      // If student has an active in-progress attempt, bypass password validation (resume scenario)
      const existingActive = await attemptRepository.findActiveAttempt(userId, examId);
      if (!existingActive) {
        throw new Error('INVALID_EXAM_PASSWORD');
      }
    }

    // 5. Check if student has an active IN_PROGRESS attempt (Resume logic)
    const activeAttempt = await attemptRepository.findActiveAttempt(userId, examId);
    if (activeAttempt) {
      // Log resume event
      await attemptRepository.logExamEvent(activeAttempt.id, userId, 'ATTEMPT_RESUMED');
      return this.getAttempt(activeAttempt.id, userId);
    }

    // 6. Enforce max attempts limit
    const attemptsMade = await attemptRepository.countAttempts(userId, examId);
    if (exam.settings?.multipleAttempts === false || !exam.settings?.multipleAttempts) {
      if (attemptsMade >= 1) {
        throw new Error('MAX_ATTEMPTS_EXCEEDED');
      }
    } else if (exam.settings?.maxAttempts && attemptsMade >= exam.settings.maxAttempts) {
      throw new Error('MAX_ATTEMPTS_EXCEEDED');
    }

    // 7. Initialize new attempt (with answer skeletons inside transactions)
    return attemptRepository.create(userId, examVersion);
  }

  /**
   * Get attempt by ID. Verifies student identity to prevent cross-student access leaks.
   * @param {number} attemptId - Attempt ID
   * @param {number} userId - Requesting User ID
   * @returns {Promise<object>}
   */
  async getAttempt(attemptId, userId) {
    const attempt = await attemptRepository.findById(attemptId, {
      examVersion: {
        include: {
          sections: {
            orderBy: { order: 'asc' },
            include: { questions: { orderBy: { order: 'asc' } } }
          }
        }
      },
      answers: {
        orderBy: { questionId: 'asc' },
        include: { mcqAnswers: true }
      }
    });

    if (!attempt) {
      throw new Error('ATTEMPT_NOT_FOUND');
    }

    // Prevent access if student attempt does not belong to the requesting user
    if (attempt.userId !== userId) {
      throw new Error('FORBIDDEN_ATTEMPT_ACCESS');
    }

    return attempt;
  }

  /**
   * Submit an active exam attempt.
   * Enforces instant grading for MCQ questions.
   * @param {number} attemptId - Attempt ID
   * @param {number} userId - Actor ID (User ID or system ID)
   * @param {boolean} [isAutoSubmit=false] - Triggered by timer expiration daemon
   * @returns {Promise<object>} Processed result summary
   */
  async submitAttempt(attemptId, userId, isAutoSubmit = false) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch Attempt
      const attempt = await tx.attempt.findUnique({
        where: { id: attemptId },
        include: {
          examVersion: true,
          answers: {
            include: {
              mcqAnswers: true
            }
          }
        }
      });

      if (!attempt) {
        throw new Error('ATTEMPT_NOT_FOUND');
      }

      if (attempt.status !== 'IN_PROGRESS') {
        throw new Error('ATTEMPT_ALREADY_SUBMITTED');
      }

      // Check ownership unless background system cron jobs are running the auto-submit
      if (!isAutoSubmit && attempt.userId !== userId) {
        throw new Error('FORBIDDEN_ATTEMPT_ACCESS');
      }

      // 2. Fetch version questions to check correct answers
      const versionQuestions = await tx.examVersionQuestion.findMany({
        where: {
          section: {
            examVersionId: attempt.examVersionId
          }
        }
      });

      let finalScore = 0;
      let totalMaxMarks = attempt.examVersion.maxMarks;
      let hasDescriptive = false;

      // 3. Process answers and auto-grade MCQs
      for (const answer of attempt.answers) {
        const question = versionQuestions.find((q) => q.id === answer.questionId);
        if (!question) continue;

        if (question.type === 'MCQ') {
          // MCQ Auto-Grading
          const snapOptions = question.mcqOptions || []; // Array snapshot [{ id, text, isCorrect, order }]
          const selectedOptionIds = answer.mcqAnswers.map((ma) => ma.optionIdRef ?? ma.optionId);

          if (selectedOptionIds.length === 0) {
            // Unanswered MCQ
            await tx.answer.update({
              where: { id: answer.id },
              data: { score: 0.0, isGraded: true }
            });
            continue;
          }

          // Evaluate correctness using String comparison so number vs string ID mismatches never fail grading
          const correctOptions = snapOptions.filter((o) => o.isCorrect).map((o) => String(o.id));
          const selectedOptionStrIds = selectedOptionIds.map((id) => String(id));
          const isCorrect =
            correctOptions.length === selectedOptionStrIds.length &&
            correctOptions.every((optId) => selectedOptionStrIds.includes(optId));

          let answerScore = 0.0;
          if (isCorrect) {
            answerScore = question.marks;
          } else {
            // Apply negative marks if negative marking is enabled in settings snapshot
            const negativeMarkingActive = attempt.examVersion.settingsSnapshot?.negativeMarking;
            if (negativeMarkingActive && question.negativeMarks) {
              answerScore = -Math.abs(question.negativeMarks);
            }
          }

          finalScore += answerScore;

          await tx.answer.update({
            where: { id: answer.id },
            data: {
              score: answerScore,
              isGraded: true
            }
          });
        } else if (question.type === 'CODING') {
          // Coding scores are already accumulated via code submissions.
          // Sum up current score.
          finalScore += answer.score;
        } else if (question.type === 'DESCRIPTIVE') {
          hasDescriptive = true;
          // Descriptive answers require manual grading. They are not marked graded yet.
          await tx.answer.update({
            where: { id: answer.id },
            data: {
              isGraded: false // explicitly require grading
            }
          });
        }
      }

      // 4. Determine final attempt status
      const nextStatus = isAutoSubmit ? 'AUTO_SUBMITTED' : 'SUBMITTED';
      const finalAttemptStatus = hasDescriptive ? 'UNDER_REVIEW' : nextStatus;

      // Update attempt
      await tx.attempt.update({
        where: { id: attempt.id },
        data: {
          status: finalAttemptStatus,
          endTime: new Date(),
          score: finalScore
        }
      });

      // 5. Build/Update Result table entry if no descriptive questions exist
      // If there are descriptive questions, results release stays blocked under review.
      const percentage = totalMaxMarks > 0 ? (finalScore / totalMaxMarks) * 100 : 0;
      const passed = finalScore >= attempt.examVersion.passingMarks;

      const isImmediateRelease = attempt.examVersion.resultReleasePolicy === 'IMMEDIATE';
      const resultPublished = !hasDescriptive && isImmediateRelease;

      const examResult = await tx.examResult.upsert({
        where: { attemptId: attempt.id },
        update: {
          totalMarks: totalMaxMarks,
          score: finalScore,
          percentage,
          passed,
          published: resultPublished
        },
        create: {
          attemptId: attempt.id,
          totalMarks: totalMaxMarks,
          score: finalScore,
          percentage,
          passed,
          published: resultPublished
        }
      });

      // 6. Log event
      await tx.examEvent.create({
        data: {
          attemptId: attempt.id,
          userId: attempt.userId,
          event: isAutoSubmit ? 'TIMEOUT' : 'SUBMIT',
          metadata: { score: finalScore, status: finalAttemptStatus }
        }
      });

      return {
        attemptId: attempt.id,
        status: finalAttemptStatus,
        score: finalScore,
        result: examResult
      };
    });
  }

  /**
   * Log anti-cheating signals.
   * @param {number} attemptId - Attempt ID
   * @param {number} userId - Student ID
   * @param {string} event - E.g. TAB_SWITCH, COPY_PASTE
   * @param {string} severity - LOW, MEDIUM, HIGH
   * @param {object} [metadata]
   */
  async logIncident(attemptId, userId, event, severity = 'LOW', metadata = null) {
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

    // 1. Write ProctoringEvent row
    await attemptRepository.logProctorEvent(attemptId, event, severity, metadata);

    // 2. Write audit log
    await attemptRepository.logExamEvent(attemptId, userId, 'PROCTOR_INCIDENT', { event, severity });

    return { success: true };
  }
}

module.exports = new AttemptService();
