/**
 * Output comparison strategies for the Online Judge.
 */

/**
 * Token-by-token comparison.
 * Splits both outputs by any whitespace, comparing token-by-token.
 * Ignores differences in leading/trailing whitespaces, line count, and line endings.
 */
const compareTokens = (actual, expected) => {
  const actualTokens = actual.trim().split(/\s+/).filter(Boolean);
  const expectedTokens = expected.trim().split(/\s+/).filter(Boolean);

  if (actualTokens.length !== expectedTokens.length) return false;

  for (let i = 0; i < actualTokens.length; i++) {
    if (actualTokens[i] !== expectedTokens[i]) return false;
  }
  return true;
};

/**
 * Strict line-by-line comparison.
 * Normalizes line endings to \n, trims trailing spaces of each line,
 * and verifies that line counts and order match exactly.
 */
const compareStrict = (actual, expected) => {
  const actualLines = actual.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(line => line.trimEnd());
  const expectedLines = expected.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(line => line.trimEnd());

  // Remove trailing empty lines for robustness
  while (actualLines.length > 0 && actualLines[actualLines.length - 1] === '') {
    actualLines.pop();
  }
  while (expectedLines.length > 0 && expectedLines[expectedLines.length - 1] === '') {
    expectedLines.pop();
  }

  if (actualLines.length !== expectedLines.length) return false;

  for (let i = 0; i < actualLines.length; i++) {
    if (actualLines[i] !== expectedLines[i]) return false;
  }
  return true;
};

/**
 * Floating point comparison.
 * Splitting by whitespace like tokens, but attempts to parse each token as a float.
 * If both tokens are numbers, compares them within a delta threshold (epsilon).
 * Otherwise falls back to strict string comparison.
 */
const compareFloat = (actual, expected, epsilon = 1e-6) => {
  const actualTokens = actual.trim().split(/\s+/).filter(Boolean);
  const expectedTokens = expected.trim().split(/\s+/).filter(Boolean);

  if (actualTokens.length !== expectedTokens.length) return false;

  for (let i = 0; i < actualTokens.length; i++) {
    const actVal = parseFloat(actualTokens[i]);
    const expVal = parseFloat(expectedTokens[i]);

    if (isNaN(actVal) || isNaN(expVal)) {
      // Fallback to exact match for non-numeric tokens
      if (actualTokens[i] !== expectedTokens[i]) return false;
    } else {
      if (Math.abs(actVal - expVal) > epsilon) return false;
    }
  }
  return true;
};

/**
 * Main dispatcher to compare outputs based on strategy.
 */
const compareOutputs = (actual, expected, strategy = 'tokens', epsilon = 1e-6) => {
  if (!actual || !expected) {
    return (actual || '').trim() === (expected || '').trim();
  }

  switch (strategy) {
    case 'strict':
      return compareStrict(actual, expected);
    case 'float':
      return compareFloat(actual, expected, epsilon);
    case 'tokens':
    default:
      return compareTokens(actual, expected);
  }
};

module.exports = {
  compareOutputs,
  compareTokens,
  compareStrict,
  compareFloat,
};
