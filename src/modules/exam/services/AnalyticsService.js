const prisma = require('../../../prisma');

/**
 * AnalyticsService
 * Compiles real-time and historical analytics dashboards.
 */
class AnalyticsService {
  /**
   * Fetch or compute current analytical summary of an exam.
   * @param {number} examId - Exam ID
   * @param {number} instituteId - Tenant ID
   * @returns {Promise<object>} Compiled dashboard dataset
   */
  async getExamAnalytics(examId, instituteId) {
    const exam = await prisma.exam.findFirst({
      where: { id: examId, instituteId, deletedAt: null }
    });

    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }

    // 1. Fetch all submitted/completed attempts
    const attempts = await prisma.attempt.findMany({
      where: {
        examVersion: { examId },
        status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] }
      },
      include: {
        answers: true
      }
    });

    if (attempts.length === 0) {
      return {
        examId,
        title: exam.title,
        attemptsCount: 0,
        averageScore: 0,
        medianScore: 0,
        highestScore: 0,
        lowestScore: 0,
        passRate: 0,
        completionRate: 0,
        difficultyStats: {},
        sectionStats: {}
      };
    }

    const scores = attempts.map((a) => a.score).sort((x, y) => x - y);
    const totalAttempts = attempts.length;

    // 2. Calculations
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);
    const averageScore = scores.reduce((sum, s) => sum + s, 0.0) / totalAttempts;
    
    // Median
    const mid = Math.floor(scores.length / 2);
    const medianScore = scores.length % 2 !== 0 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;

    // Pass counts (requires loading the latest publish target version passing criteria)
    const latestVersion = await prisma.examVersion.findFirst({
      where: { examId },
      orderBy: { version: 'desc' }
    });
    
    const passingMarks = latestVersion ? latestVersion.passingMarks : 0.0;
    const passCount = scores.filter((s) => s >= passingMarks).length;
    const passRate = (passCount / totalAttempts) * 100;

    // 3. Section and Difficulty accuracy statistics
    const sectionStats = {};
    const difficultyStats = { EASY: { correct: 0, total: 0 }, MEDIUM: { correct: 0, total: 0 }, HARD: { correct: 0, total: 0 } };

    const versionQuestions = latestVersion
      ? await prisma.examVersionQuestion.findMany({
          where: { section: { examVersionId: latestVersion.id } },
          include: { section: true }
        })
      : [];

    attempts.forEach((attempt) => {
      attempt.answers.forEach((ans) => {
        const question = versionQuestions.find((q) => q.originalQuestionId === ans.questionId || q.id === ans.questionId);
        if (!question) return;

        // Group by Section
        const secTitle = question.section.title;
        if (!sectionStats[secTitle]) {
          sectionStats[secTitle] = { totalPoints: 0, scoredPoints: 0, totalQuestions: 0 };
        }
        sectionStats[secTitle].totalPoints += question.marks;
        sectionStats[secTitle].scoredPoints += ans.score;
        sectionStats[secTitle].totalQuestions += 1;

        // Group by Difficulty
        const diff = question.difficulty; // EASY, MEDIUM, HARD
        if (difficultyStats[diff]) {
          difficultyStats[diff].total += question.marks;
          difficultyStats[diff].correct += ans.score;
        }
      });
    });

    // Save/cache aggregates to DB ExamAnalytics table
    await prisma.examAnalytics.upsert({
      where: { id: examId }, // Assuming 1-to-1 link for caching
      update: {
        averageScore,
        medianScore,
        highestScore,
        lowestScore,
        passRate,
        completionRate: 100.0 // All attempts processed here are submitted/completed
      },
      create: {
        examId,
        averageScore,
        medianScore,
        highestScore,
        lowestScore,
        passRate,
        completionRate: 100.0
      }
    });

    return {
      examId,
      title: exam.title,
      attemptsCount: totalAttempts,
      averageScore,
      medianScore,
      highestScore,
      lowestScore,
      passRate,
      completionRate: 100.0,
      difficultyStats,
      sectionStats
    };
  }

  /**
   * Fetch historical trend metrics for dashboards.
   * @param {string} scopeType - INSTITUTE, BATCH, COURSE, TEACHER
   * @param {number} scopeId - ID
   * @param {string} dateRange - DAILY, WEEKLY, MONTHLY
   * @returns {Promise<Array>} List of historical aggregations
   */
  async getHistoricalTrends(scopeType, scopeId, dateRange = 'WEEKLY') {
    return prisma.examHistoricalAnalytics.findMany({
      where: {
        scopeType,
        scopeId,
        dateRange
      },
      orderBy: { timestamp: 'asc' }
    });
  }
}

module.exports = new AnalyticsService();
