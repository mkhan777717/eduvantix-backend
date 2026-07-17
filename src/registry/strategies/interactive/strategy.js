class InteractiveStrategy {
  getName() {
    return 'interactive';
  }

  supports(problemMetadata) {
    return problemMetadata && problemMetadata.category === 'INTERACTIVE';
  }

  validateConfiguration() {
    return true;
  }

  judge(expectedOutput, actualOutput, metadata) {
    // CRIT-1 Fix: Was unconditionally returning true (auto-accepting everything).
    // Full interactive judging requires a two-process pipe architecture (user process <-> judge process).
    // Until that is implemented, fall back to exact string comparison so submissions are not falsely accepted.
    // TODO: Replace with real interactive judge executor when INTERACTIVE problems are live.
    const expected = (expectedOutput || '').trim();
    const actual = (actualOutput || '').trim();
    return expected === actual;
  }
}

module.exports = InteractiveStrategy;
