class SpecialStrategy {
  getName() {
    return 'special';
  }

  supports(problemMetadata) {
    return true;
  }

  validateConfiguration() {
    return true;
  }

  judge(expectedOutput, actualOutput, metadata) {
    if (!metadata || !metadata.customValidator) {
      // Default fallback: strict match
      return (expectedOutput || '').trim() === (actualOutput || '').trim();
    }

    try {
      // Instantiate validation checker dynamically
      // Expects: validator(input, actual, expected) returning a boolean
      const validator = new Function('input', 'actual', 'expected', metadata.customValidator);
      const input = metadata.input || '';
      return !!validator(input, actualOutput, expectedOutput);
    } catch (e) {
      console.error('Custom Special Judge script failed to run:', e);
      return false;
    }
  }
}

module.exports = SpecialStrategy;
