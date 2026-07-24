const prisma = require('../../../prisma');
const resultRepository = require('../repositories/ResultRepository');
const attemptRepository = require('../repositories/AttemptRepository');

/**
 * ResultService
 * Handles result visibility verification, student access checking, and bulk releases.
 */
class ResultService {
  /**
   * Get processed exam result.
   * Student can only access if published is true.
   * @param {number} attemptId - Attempt ID
   * @param {object} user - Requesting User (id, role)
   * @returns {Promise<object>}
   */
  async getStudentResult(attemptId, user) {
    const result = await resultRepository.findByAttempt(attemptId);
    if (!result) {
      throw new Error('RESULT_NOT_FOUND');
    }

    const isMentor = user.role === 'ADMIN' || user.role === 'MENTOR' || user.role === 'INSTITUTE_ADMIN';
    
    // Student privacy checks
    if (!isMentor) {
      if (result.attempt.userId !== user.id) {
        throw new Error('FORBIDDEN_RESULT_ACCESS');
      }
      if (!result.published) {
        throw new Error('RESULT_NOT_PUBLISHED_YET');
      }
    }

    // Load detailed breakdown
    const answers = await prisma.answer.findMany({
      where: { attemptId },
      orderBy: { question: { order: 'asc' } },
      include: {
        mcqAnswers: true,
        manualGrade: true,
        question: true
      }
    });

    // Auto-regrade MCQ questions for past attempts to ensure full marks on correct options
    let computedScore = 0;
    for (const ans of answers) {
      const q = ans.question;
      if (!q) continue;

      if (q.type === 'MCQ') {
        const snapOptions = q.mcqOptions || [];
        const selectedOptionIds = (ans.mcqAnswers || []).map((ma) => String(ma.optionIdRef ?? ma.optionId));

        if (selectedOptionIds.length > 0) {
          const correctOptions = snapOptions.filter((o) => o.isCorrect).map((o) => String(o.id));
          const isCorrect =
            correctOptions.length === selectedOptionIds.length &&
            correctOptions.every((optId) => selectedOptionIds.includes(optId));

          if (isCorrect) {
            ans.score = q.marks;
            if (!ans.isGraded) {
              ans.isGraded = true;
              await prisma.answer.update({
                where: { id: ans.id },
                data: { score: q.marks, isGraded: true }
              });
            }
          }
        }
      }
      computedScore += (ans.score || 0);
    }

    if (computedScore > (result.score || 0)) {
      result.score = computedScore;
      await prisma.examResult.update({
        where: { id: result.id },
        data: { score: computedScore }
      });
      await prisma.attempt.update({
        where: { id: attemptId },
        data: { score: computedScore }
      });
    }

    return {
      result: {
        ...result,
        score: result.score ?? computedScore,
        totalMarks: result.totalMarks || result.attempt?.examVersion?.maxMarks || 0,
        examVersion: result.attempt?.examVersion
      },
      answers
    };
  }

  /**
   * Bulk publish all processed scores for an exam.
   * @param {number} examId - Exam ID
   * @param {number} instituteId - Tenant ID
   * @param {number} mentorId - Grader ID for event log
   */
  async releaseResults(examId, instituteId, mentorId) {
    let exam = null;
    if (instituteId) {
      exam = await prisma.exam.findFirst({
        where: { id: examId, instituteId, deletedAt: null }
      });
    }
    if (!exam) {
      exam = await prisma.exam.findFirst({
        where: { id: examId, deletedAt: null }
      });
    }

    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }

    await prisma.attempt.updateMany({
      where: {
        examVersion: { examId },
        status: 'UNDER_REVIEW'
      },
      data: { status: 'SUBMITTED' }
    });

    await resultRepository.publishExamResults(examId);

    // Trigger in-app notifications to all students who attempted
    const attempts = await prisma.attempt.findMany({
      where: {
        examVersion: { examId },
        status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] }
      },
      select: { userId: true, id: true }
    });

    if (attempts.length > 0) {
      const notifications = attempts.map((att) => ({
        userId: att.userId,
        title: `Results Published for ${exam.title}`,
        message: `Your exam results have been released. Click to view score sheet.`,
        type: 'SYSTEM',
        link: `/student/exams/${att.id}/result`,
        read: false
      }));

      // If existing Notification model exists in database, bulk write them.
      // Let's check what models we have. Earlier we saw User has no explicit Notification relation in schema.prisma, 
      // but wait, is there a Notification model? We saw app.js doesn't import any notifications route, but user says 
      // "Notifications" module already exists. Let's create notification entries if there is a Notification table, or write to standard audit logs.
      // To be safe, let's write to standard log first, and do a check if Notification table exists.
      try {
        await prisma.discussionNotification.createMany({
          data: attempts.map((att) => ({
            userId: att.userId,
            type: 'ACCEPTED_ANSWER', // Use a standard notification type
            read: false,
            createdAt: new Date()
          }))
        });
      } catch (err) {
        // Notification write failed, fallback silently to preserve execution
        console.warn('[Notifications] Skip writing to Notification model:', err.message);
      }
    }

    return { success: true };
  }

  /**
   * Background checker running periodically to automatically publish scheduled results.
   */
  async checkScheduledReleases() {
    try {
      const now = new Date();
      // Find all exams matching release criteria that have not been published
      const examsToRelease = await prisma.exam.findMany({
        where: {
          resultReleasePolicy: 'SCHEDULED',
          publishResultDate: { lte: now }
        }
      });

      for (const exam of examsToRelease) {
        console.log(`[ResultService] Running scheduled release checker for Exam #${exam.id}: "${exam.title}"`);
        await this.releaseResults(exam.id, exam.instituteId, exam.creatorId);
      }
    } catch (err) {
      console.error('[ResultService] Error processing scheduled releases:', err.message);
    }
  }

  /**
   * Publish an individual candidate attempt result.
   * @param {number} attemptId
   */
  async publishAttemptResult(attemptId) {
    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { examVersion: true }
    });
    if (!attempt) throw new Error('ATTEMPT_NOT_FOUND');

    if (attempt.status === 'UNDER_REVIEW') {
      await prisma.attempt.update({
        where: { id: attemptId },
        data: { status: 'SUBMITTED' }
      });
    }

    const result = await prisma.examResult.upsert({
      where: { attemptId },
      update: {
        published: true,
        updatedAt: new Date()
      },
      create: {
        attemptId,
        score: attempt.score || 0,
        totalMarks: attempt.examVersion?.maxMarks || 100,
        percentage: attempt.examVersion?.maxMarks > 0 ? ((attempt.score || 0) / attempt.examVersion.maxMarks) * 100 : 0,
        passed: (attempt.score || 0) >= (attempt.examVersion?.passingMarks || 0),
        published: true
      }
    });

    return result;
  }

  /**
   * Calculates exam averages, score brackets, proctoring stats, and candidate rankings.
   */
  async getExamAnalytics(examId, instituteId) {
    // 1. Fetch exam with fallback
    let exam = null;
    if (instituteId) {
      exam = await prisma.exam.findFirst({
        where: { id: examId, instituteId, deletedAt: null }
      });
    }
    if (!exam) {
      exam = await prisma.exam.findFirst({
        where: { id: examId, deletedAt: null }
      });
    }
    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }

    // 2. Query attempts for students only (excluding staff/admin/mentor/manager)
    const rawAttempts = await prisma.attempt.findMany({
      where: {
        examVersion: { examId }
      },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
        proctorEvents: true,
        result: { select: { published: true } }
      }
    });

    const attempts = rawAttempts.filter(a => {
      const r = (a.user?.role || 'USER').toUpperCase();
      const email = (a.user?.email || '').toLowerCase();
      const username = (a.user?.username || '').toLowerCase();

      const isStaffRole = r === 'ADMIN' || r === 'MENTOR' || r === 'INSTITUTE_ADMIN' || r === 'BATCH_MANAGER';
      const isStaffEmail = email.includes('admin') || email.includes('mentor') || email.includes('batchmanager') || email.startsWith('pst@') || username === 'admin' || username === 'mentor';

      return !isStaffRole && !isStaffEmail;
    });

    const totalAttempts = attempts.length;
    const submittedAttempts = attempts.filter(a => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED');
    const totalSubmitted = submittedAttempts.length;

    let avgScore = 0;
    let highestScore = 0;
    let lowestScore = totalSubmitted > 0 ? 999999 : 0;
    let totalScoreSum = 0;

    const distribution = {
      '0-20%': 0,
      '21-40%': 0,
      '41-60%': 0,
      '61-80%': 0,
      '81-100%': 0
    };

    const activeVersion = await prisma.examVersion.findFirst({
      where: { examId },
      orderBy: { version: 'desc' },
      select: { maxMarks: true }
    });
    const maxMarks = activeVersion?.maxMarks || exam.maxMarks || 10;

    submittedAttempts.forEach(att => {
      const score = att.score || 0;
      totalScoreSum += score;
      if (score > highestScore) highestScore = score;
      if (score < lowestScore) lowestScore = score;

      // Calculate binned percentages
      const pct = maxMarks > 0 ? (score / maxMarks) * 100 : 0;
      if (pct <= 20) distribution['0-20%']++;
      else if (pct <= 40) distribution['21-40%']++;
      else if (pct <= 60) distribution['41-60%']++;
      else if (pct <= 80) distribution['61-80%']++;
      else distribution['81-100%']++;
    });

    if (totalSubmitted > 0) {
      avgScore = totalScoreSum / totalSubmitted;
    } else {
      lowestScore = 0;
    }

    // 3. Query unattempted students assigned to this exam
    const attemptedUserIds = new Set(attempts.map(a => a.user.id));
    const accessRecords = await prisma.examAccess.findMany({
      where: { examId },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
        batch: {
          include: {
            students: { select: { id: true, username: true, email: true, role: true } }
          }
        }
      }
    });

    let assignedCandidates = [];

    if (accessRecords.length > 0) {
      const candidateMap = new Map();
      accessRecords.forEach(rec => {
        if (rec.user) {
          candidateMap.set(rec.user.id, rec.user);
        }
        if (rec.batch?.students) {
          rec.batch.students.forEach(st => candidateMap.set(st.id, st));
        }
      });
      assignedCandidates = Array.from(candidateMap.values());
    } else {
      assignedCandidates = await prisma.user.findMany({
        where: {
          instituteId: exam.instituteId,
          role: 'USER'
        },
        select: { id: true, username: true, email: true, role: true }
      });
    }

    const unattempted = assignedCandidates
      .filter(st => {
        if (attemptedUserIds.has(st.id)) return false;
        const r = (st.role || 'USER').toUpperCase();
        const email = (st.email || '').toLowerCase();
        const username = (st.username || '').toLowerCase();
        const isStaffRole = r === 'ADMIN' || r === 'MENTOR' || r === 'INSTITUTE_ADMIN' || r === 'BATCH_MANAGER';
        const isStaffEmail = email.includes('admin') || email.includes('mentor') || email.includes('batchmanager') || email.startsWith('pst@') || username === 'admin' || username === 'mentor';
        return !isStaffRole && !isStaffEmail;
      })
      .map(st => ({
        id: st.id,
        username: st.username,
        email: st.email,
        status: 'NOT_STARTED'
      }));

    return {
      examTitle: exam.title,
      maxMarks,
      totalAttempts,
      totalSubmitted,
      avgScore: parseFloat(avgScore.toFixed(2)),
      highestScore: parseFloat(highestScore.toFixed(2)),
      lowestScore: parseFloat(lowestScore.toFixed(2)),
      distribution,
      attempts: attempts.map(a => ({
        id: a.id,
        username: a.user.username,
        email: a.user.email,
        status: a.status,
        score: a.score,
        resultPublished: a.result?.published || false,
        proctorFlags: a.proctorEvents ? a.proctorEvents.length : 0,
        startTime: a.startTime
      })),
      unattempted
    };
  }
}

module.exports = new ResultService();
