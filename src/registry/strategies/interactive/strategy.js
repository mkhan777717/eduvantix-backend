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
    // Placeholder implementation for interactive judge stream comparisons
    console.log('[InteractiveStrategy] Comparing interactive queries (Placeholder)');
    return true;
  }
}

module.exports = InteractiveStrategy;
