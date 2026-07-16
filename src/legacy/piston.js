/**
 * Piston API Integration Service (CommonJS)
 */

const PISTON_LANGUAGES = {
  'CPP': { language: 'cpp', version: '*' },
  'JAVA': { language: 'java', version: '*' },
  'PYTHON': { language: 'python', version: '*' },
  'JAVASCRIPT': { language: 'javascript', version: '*' },
  'GO': { language: 'go', version: '*' },
  'TYPESCRIPT': { language: 'typescript', version: '*' },
  'C': { language: 'c', version: '*' },
  'CSHARP': { language: 'csharp', version: '*' },
  'KOTLIN': { language: 'kotlin', version: '*' },
  'SWIFT': { language: 'swift', version: '*' },
  'RUST': { language: 'rust', version: '*' },
  'RUBY': { language: 'ruby', version: '*' },
  'PHP': { language: 'php', version: '*' },
  'DART': { language: 'dart', version: '*' },
  'SCALA': { language: 'scala', version: '*' },
  'ELIXIR': { language: 'elixir', version: '*' },
  'ERLANG': { language: 'erlang', version: '*' },
  'RACKET': { language: 'racket', version: '*' },
};

/**
 * Executes a single test case using the Piston API
 * @param {string} sourceCode 
 * @param {string} language - JAVASCRIPT, PYTHON, CPP, JAVA
 * @param {string} stdin 
 * @param {string} expectedOutput 
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>}
 */
async function executePistonTestcase(sourceCode, language, stdin, expectedOutput, timeoutMs = 2000) {
  const langConfig = PISTON_LANGUAGES[language.toUpperCase()];
  if (!langConfig) {
    return {
      status: 'COMPILATION_ERROR',
      error: `Unsupported language: ${language}`,
      executionTimeMs: 0,
      memoryKb: 0
    };
  }

  const pistonUrl = process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston';

  // Build files payload (some runtimes look for main.cpp / Main.java)
  let fileName = 'solution';
  if (language.toUpperCase() === 'CPP') fileName = 'main.cpp';
  if (language.toUpperCase() === 'JAVA') fileName = 'Solution.java';
  if (language.toUpperCase() === 'PYTHON') fileName = 'main.py';
  if (language.toUpperCase() === 'JAVASCRIPT') fileName = 'main.js';
  if (language.toUpperCase() === 'GO') fileName = 'main.go';
  if (language.toUpperCase() === 'TYPESCRIPT') fileName = 'main.ts';
  if (language.toUpperCase() === 'C') fileName = 'main.c';
  if (language.toUpperCase() === 'CSHARP') fileName = 'main.cs';
  if (language.toUpperCase() === 'KOTLIN') fileName = 'main.kt';
  if (language.toUpperCase() === 'SWIFT') fileName = 'main.swift';
  if (language.toUpperCase() === 'RUST') fileName = 'main.rs';
  if (language.toUpperCase() === 'RUBY') fileName = 'main.rb';
  if (language.toUpperCase() === 'PHP') fileName = 'main.php';
  if (language.toUpperCase() === 'DART') fileName = 'main.dart';
  if (language.toUpperCase() === 'SCALA') fileName = 'main.scala';
  if (language.toUpperCase() === 'ELIXIR') fileName = 'main.ex';
  if (language.toUpperCase() === 'ERLANG') fileName = 'main.erl';
  if (language.toUpperCase() === 'RACKET') fileName = 'main.rkt';

  const payload = {
    language: langConfig.language,
    version: langConfig.version,
    files: [
      {
        name: fileName,
        content: sourceCode
      }
    ],
    stdin: stdin,
    run_timeout: timeoutMs
  };

  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (process.env.PISTON_API_KEY) {
      headers['Authorization'] = process.env.PISTON_API_KEY;
    }

    const startTime = Date.now();
    const res = await fetch(`${pistonUrl}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const elapsedMs = Date.now() - startTime;

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401) {
        throw new Error(
          `Piston API returned 401 Unauthorized (Whitelist Required). To resolve this, you must either:\n` +
          `  1. Request a whitelist token on Discord from EngineerMan and set PISTON_API_KEY in your backend/.env file,\n` +
          `  2. Host a local Piston instance on Docker and set PISTON_API_URL=http://localhost:2000/api/v2/piston in your backend/.env,\n` +
          `  3. Or change your execution engine by setting CODE_EXECUTION_ENGINE=judge0 and configuring JUDGE0_API_URL in your backend/.env.`
        );
      }
      throw new Error(`Piston API responded with status ${res.status}: ${text}`);
    }

    const data = await res.json();
    
    // Check for compilation errors
    if (data.compile && data.compile.code !== 0) {
      return {
        status: 'COMPILATION_ERROR',
        executionTimeMs: 0,
        memoryKb: 0,
        stdout: '',
        stderr: data.compile.stderr || data.compile.output || 'Compilation Error'
      };
    }

    const runResult = data.run;
    if (!runResult) {
      throw new Error('Piston API returned no execution run data.');
    }

    // Check for Time Limit Exceeded (signal: SIGKILL is sent on timeout)
    if (runResult.signal === 'SIGKILL' || runResult.signal === 'KILL' || elapsedMs >= timeoutMs + 100) {
      return {
        status: 'TIME_LIMIT_EXCEEDED',
        executionTimeMs: Math.max(elapsedMs, timeoutMs),
        memoryKb: 0,
        stdout: runResult.stdout || '',
        stderr: 'Time Limit Exceeded'
      };
    }

    // Check for runtime errors
    if (runResult.code !== 0) {
      return {
        status: 'RUNTIME_ERROR',
        executionTimeMs: elapsedMs,
        memoryKb: 0,
        stdout: runResult.stdout || '',
        stderr: runResult.stderr || runResult.output || `Process exited with code ${runResult.code}`
      };
    }

    return {
      status: 'SUCCESS',
      executionTimeMs: elapsedMs,
      memoryKb: 0,
      stdout: runResult.stdout || '',
      stderr: runResult.stderr || ''
    };
  } catch (err) {
    console.error('Piston Execution failed:', err);
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
  executePistonTestcase
};
