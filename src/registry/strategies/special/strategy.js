const vm = require('vm');

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
      // CRIT-2 Fix: was using new Function() which runs arbitrary DB code in the main process.
      // Now uses vm.runInNewContext with a sealed sandbox — no access to require, process, fs, etc.
      // The validator script must return a boolean (truthy/falsy).
      const sandbox = {
        input: metadata.input || '',
        actual: actualOutput || '',
        expected: expectedOutput || '',
        result: false
      };

      // Wrap script so validator can assign result directly
      const script = new vm.Script(`result = (function(input, actual, expected) { ${metadata.customValidator} })(input, actual, expected);`);
      script.runInNewContext(sandbox, { timeout: 1000 }); // 1 second max for validator

      return !!sandbox.result;
    } catch (e) {
      console.error('[SpecialStrategy] Custom validator script failed:', e.message);
      return false;
    }
  }
}

module.exports = SpecialStrategy;
