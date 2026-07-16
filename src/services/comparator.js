/**
 * Output comparison strategies for the Online Judge.
 */

/**
 * H-9: Normalize boolean representations so 'True'/'False' (Python) match 'true'/'false' (JSON).
 * Also maps '1'/'0' to true/false for boolean contexts.
 */
const normalizeBool = (token) => {
  const lower = token.toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') return 'true';
  if (lower === 'false' || lower === '0' || lower === 'no') return 'false';
  return token;
};

/**
 * Token-by-token comparison with boolean normalization.
 * H-9: Applies normalizeBool so 'True' == 'true', '1' == 'true', etc.
 */
const compareTokens = (actual, expected) => {
  const actualTokens = actual.trim().split(/\s+/).filter(Boolean).map(normalizeBool);
  const expectedTokens = expected.trim().split(/\s+/).filter(Boolean).map(normalizeBool);

  if (actualTokens.length !== expectedTokens.length) return false;

  for (let i = 0; i < actualTokens.length; i++) {
    if (actualTokens[i] !== expectedTokens[i]) return false;
  }
  return true;
};

/**
 * Strict line-by-line comparison.
 * Normalizes line endings to \n, trims trailing spaces per line,
 * and verifies line counts and order match exactly.
 */
const compareStrict = (actual, expected) => {
  const normalizeLines = (s) =>
    s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(l => l.trimEnd());

  const actualLines = normalizeLines(actual);
  const expectedLines = normalizeLines(expected);

  // Remove trailing empty lines for robustness
  while (actualLines.length > 0 && actualLines[actualLines.length - 1] === '') actualLines.pop();
  while (expectedLines.length > 0 && expectedLines[expectedLines.length - 1] === '') expectedLines.pop();

  if (actualLines.length !== expectedLines.length) return false;
  for (let i = 0; i < actualLines.length; i++) {
    if (actualLines[i] !== expectedLines[i]) return false;
  }
  return true;
};

/**
 * Floating point comparison with epsilon tolerance.
 */
const compareFloat = (actual, expected, epsilon = 1e-6) => {
  const actualTokens = actual.trim().split(/\s+/).filter(Boolean);
  const expectedTokens = expected.trim().split(/\s+/).filter(Boolean);

  if (actualTokens.length !== expectedTokens.length) return false;

  for (let i = 0; i < actualTokens.length; i++) {
    const actVal = parseFloat(actualTokens[i]);
    const expVal = parseFloat(expectedTokens[i]);

    if (isNaN(actVal) || isNaN(expVal)) {
      if (actualTokens[i] !== expectedTokens[i]) return false;
    } else {
      if (Math.abs(actVal - expVal) > epsilon) return false;
    }
  }
  return true;
};

/**
 * L-5: Order-insensitive comparison for problems like Two Sum or Letter Combinations.
 * Sorts both outputs before comparing, so [1,0] == [0,1].
 */
const compareOrderInsensitive = (actual, expected) => {
  try {
    const parseArr = (str) => {
      str = str.trim();
      try {
        const p = JSON.parse(str);
        if (Array.isArray(p)) return p.map(String).map(normalizeBool).sort();
      } catch (_) {}
      return str.split(/\s+/).filter(Boolean).map(normalizeBool).sort();
    };
    const a = parseArr(actual);
    const e = parseArr(expected);
    if (a.length !== e.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== e[i]) return false;
    }
    return true;
  } catch (_) {
    return compareTokens(actual, expected);
  }
};

/**
 * L-5: Set comparison for unordered unique element problems like findAnagrams.
 */
const compareSet = (actual, expected) => {
  const toSet = (str) => new Set(str.trim().split(/\s+/).filter(Boolean).map(normalizeBool));
  const a = toSet(actual);
  const e = toSet(expected);
  if (a.size !== e.size) return false;
  for (const v of a) { if (!e.has(v)) return false; }
  return true;
};

/**
 * M-5: Maps OS signals to human-readable runtime error messages.
 */
const SIGNAL_MESSAGES = {
  SIGSEGV: 'Segmentation fault (memory access violation)',
  SIGFPE:  'Floating point exception (division by zero or overflow)',
  SIGABRT: 'Aborted (assertion failure or abort() called)',
  SIGBUS:  'Bus error (memory alignment issue)',
  SIGILL:  'Illegal instruction',
};

const getSignalMessage = (signal) => SIGNAL_MESSAGES[signal] || null;

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
    case 'order_insensitive':
      return compareOrderInsensitive(actual, expected);
    case 'set':
      return compareSet(actual, expected);
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
  compareOrderInsensitive,
  compareSet,
  getSignalMessage,
  SIGNAL_MESSAGES,
};


