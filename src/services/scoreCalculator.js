class ScoreCalculator {
  /**
   * Computes score, percentage, and passed/failed aggregates.
   * @param {Array} testcaseResults - Evaluated results
   * @param {Object} options - Options containing scoring model
   * @returns {Object} Score details { passed, failed, total, score, percentage }
   */
  calculateScore(testcaseResults = [], options = {}) {
    const total = testcaseResults.length;
    if (total === 0) {
      return { passed: 0, failed: 0, total: 0, score: 0, percentage: 0 };
    }

    const passed = testcaseResults.filter(r => r.isPassed).length;
    const failed = total - passed;
    const maxScore = options.maxScore !== undefined ? options.maxScore : 100;
    const model = (options.scoringModel || 'PARTIAL').toUpperCase();

    let score = 0;

    switch (model) {
      case 'FULL':
      case 'ACM':
        // Binary pass/fail scoring: Must pass all testcases to get any points
        score = (passed === total) ? maxScore : 0;
        break;

      case 'IOI':
      case 'PARTIAL':
      default:
        // Proportional score based on passed ratio
        score = Math.round((passed / total) * maxScore);
        break;
    }

    const percentage = Math.round((passed / total) * 100);

    return {
      passed,
      failed,
      total,
      score,
      percentage
    };
  }
}

module.exports = new ScoreCalculator();
