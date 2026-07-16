class ResultFormatter {
  /**
   * Formats the submission pipeline context variables into the public API response layout.
   * @param {Object} context - SubmissionContext
   * @returns {Object} Public API layout
   */
  formatResult(context) {
    if (!context) {
      throw new Error('SubmissionContext is required for formatting.');
    }

    const {
      submissionId = null,
      finalVerdict = 'INTERNAL_ERROR',
      verdict = null,
      scoreMetrics = {},
      compileTimeMs = 0,
      executionTimeMs = 0,
      memoryKb = 0,
      language = 'unknown',
      traceId = ''
    } = context;

    const resolvedVerdict = verdict || finalVerdict;

    const {
      passed = 0,
      failed = 0,
      total = 0,
      score = 0
    } = scoreMetrics || {};

    // L-3: Explicit field whitelist — never include traceId, workspaceDir, assembledSource, or artifact in response
    return {
      submissionId,
      verdict: resolvedVerdict,
      score,
      passed,
      failed,
      total,
      compileTimeMs,
      executionTimeMs,
      memoryKb,
      language
      // traceId intentionally excluded from public response
    };
  }
}

module.exports = new ResultFormatter();
