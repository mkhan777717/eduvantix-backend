/**
 * Judge0 API Integration Service (CommonJS)
 */

// Language mappings for Judge0 (using standard ID values)
const JUDGE0_LANGUAGES = {
  'CPP': 105,        // C++ (GCC 13.2.0)
  'JAVA': 91,        // Java (OpenJDK 17.0.8)
  'PYTHON': 100,     // Python (3.11.2)
  'JAVASCRIPT': 93,  // JavaScript (Node.js 18.15.0)
};

/**
 * Standardize output by trimming trailing whitespaces and carriage returns
 */
function normalizeOutput(str) {
  if (!str) return '';
  return str
    .toString()
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line !== '')
    .join('\n')
    .trim();
}

/**
 * Executes a single test case using the Judge0 API
 * @param {string} sourceCode 
 * @param {string} language - JAVASCRIPT, PYTHON, CPP, JAVA
 * @param {string} stdin 
 * @param {string} expectedOutput 
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>}
 */
async function executeTestcase(sourceCode, language, stdin, expectedOutput, timeoutMs = 2000) {
  const languageId = JUDGE0_LANGUAGES[language.toUpperCase()];
  if (!languageId) {
    return {
      status: 'COMPILATION_ERROR',
      error: `Unsupported language: ${language}`,
      executionTimeMs: 0,
      memoryKb: 0
    };
  }

  const judge0Url = process.env.JUDGE0_API_URL || 'http://127.0.0.1:2358';
  const apiKey = process.env.JUDGE0_API_KEY; // Optional for RapidAPI or auth-secured endpoints

  const headers = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['X-RapidAPI-Key'] = apiKey;
    headers['X-RapidAPI-Host'] = process.env.JUDGE0_API_HOST || 'judge0-extra-clean.p.rapidapi.com';
  }


  // Request body
  const payload = {
    source_code: sourceCode,
    language_id: languageId,
    stdin: stdin,
    expected_output: expectedOutput,
    cpu_time_limit: (timeoutMs / 1000).toFixed(1), // seconds
  };

  try {
    // Submit using synchronous wait mode
    const res = await fetch(`${judge0Url}/submissions?wait=true&base64_encoded=false`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Judge0 API responded with status ${res.status}: ${text}`);
    }

    const data = await res.json();
    
    // Parse result
    const stdout = data.stdout || '';
    const stderr = data.stderr || '';
    const compileOutput = data.compile_output || '';
    const executionTimeMs = Math.round((parseFloat(data.time) || 0) * 1000);
    const memoryKb = parseInt(data.memory) || 0;
    const judge0StatusId = data.status?.id;

    // Status ID mappings:
    // 3: Accepted
    // 4: Wrong Answer
    // 5: Time Limit Exceeded
    // 6: Compilation Error
    // 7-12: Runtime Error
    if (judge0StatusId === 3 || judge0StatusId === 4) {
      return {
        status: 'SUCCESS', // Comparator will verify outputs
        executionTimeMs,
        memoryKb,
        stdout,
        stderr
      };
    } else if (judge0StatusId === 5) {
      return {
        status: 'TIME_LIMIT_EXCEEDED',
        executionTimeMs,
        memoryKb,
        stdout,
        stderr: 'Time Limit Exceeded'
      };
    } else if (judge0StatusId === 6) {
      return {
        status: 'COMPILATION_ERROR',
        executionTimeMs: 0,
        memoryKb: 0,
        stdout,
        stderr: compileOutput || 'Compilation Error'
      };
    } else {
      // 7 to 12 are runtime exceptions
      return {
        status: 'RUNTIME_ERROR',
        executionTimeMs,
        memoryKb,
        stdout,
        stderr: stderr || compileOutput || `Runtime error (status code ${judge0StatusId})`
      };
    }
  } catch (err) {
    console.error('Judge0 Execution failed:', err);
    return {
      status: 'INTERNAL_ERROR',
      executionTimeMs: 0,
      memoryKb: 0,
      stdout: '',
      stderr: err.message || 'Internal execution failure'
    };
  }
}

module.exports = {
  executeTestcase,
  normalizeOutput
};
