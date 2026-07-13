const { spawn } = require('child_process');
const path = require('path');
const { createTempDir, writeTempFile, cleanupDir } = require('../utils/cleanup');

const isWindows = process.platform === 'win32';

/**
 * Compiles C++ code to an executable
 */
const compileCpp = (srcFile, exeName, tempDir) => {
  return new Promise((resolve) => {
    const gxxCmd = process.env.GXX_PATH || 'g++';
    // Compile with optimization flag
    const child = spawn(gxxCmd, ['-O3', srcFile, '-o', exeName], { cwd: tempDir });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      resolve({
        success: false,
        error: `Failed to invoke g++ compiler. Please ensure MinGW or equivalent is installed and in system PATH. Details: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: stderr || `Compilation failed with exit code ${code}`,
        });
      } else {
        resolve({ success: true });
      }
    });
  });
};

/**
 * Compiles Go code to an executable
 */
const compileGo = (srcFile, exeName, tempDir) => {
  return new Promise((resolve) => {
    const goCmd = process.env.GO_PATH || 'go';
    const child = spawn(goCmd, ['build', '-o', exeName, srcFile], { cwd: tempDir });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      resolve({
        success: false,
        error: `Failed to invoke Go compiler. Please ensure Go is installed and in system PATH. Details: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: stderr || `Go compilation failed with exit code ${code}`,
        });
      } else {
        resolve({ success: true });
      }
    });
  });
};


/**
 * Compiles Java code
 */
const compileJava = (srcFile, tempDir) => {
  return new Promise((resolve) => {
    const javacCmd = process.env.JAVAC_PATH || 'javac';
    const child = spawn(javacCmd, [srcFile], { cwd: tempDir });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      resolve({
        success: false,
        error: `Failed to invoke Java compiler (javac). Please ensure JDK is installed and javac is in system PATH. Details: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: stderr || `Java compilation failed with exit code ${code}`,
        });
      } else {
        resolve({ success: true });
      }
    });
  });
};



/**
 * Runs a command with arguments, pipes stdin, and enforces a timeout limit
 */
const runProcess = (cmd, args, tempDir, input, timeoutMs) => {
  return new Promise((resolve) => {
    let resolved = false;
    const child = spawn(cmd, args, { cwd: tempDir });

    let stdout = '';
    let stderr = '';
    const startTime = process.hrtime.bigint();

    // Enforce execution timeout
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;

        const finishTimeout = () => {
          resolve({
            status: 'TIME_LIMIT_EXCEEDED',
            executionTime: timeoutMs,
            error: 'Time Limit Exceeded',
          });
        };

        try {
          // Send SIGKILL or taskkill on Windows to ensure termination
          if (isWindows) {
            const killer = spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
            killer.on('close', finishTimeout);
            killer.on('error', (err) => {
              console.error('taskkill error:', err);
              finishTimeout();
            });
          } else {
            child.kill('SIGKILL');
            finishTimeout();
          }
        } catch (e) {
          console.error('Failed to kill process:', e);
          finishTimeout();
        }
      }
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({
          status: 'RUNTIME_ERROR',
          executionTime: 0,
          error: err.message,
        });
      }
    });

    child.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);

        const endTime = process.hrtime.bigint();
        const diffNs = endTime - startTime;
        const executionTimeMs = Math.round(Number(diffNs) / 1e6);

        if (code !== 0) {
          resolve({
            status: 'RUNTIME_ERROR',
            executionTime: executionTimeMs,
            error: stderr || `Process exited with code ${code}`,
          });
        } else {
          resolve({
            status: 'SUCCESS',
            executionTime: executionTimeMs,
            output: stdout,
          });
        }
      }
    });

    // Write input to stdin and close it
    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
};

/**
 * Trims trailing spaces and aligns newlines for cross-platform comparison
 */
const compareOutputs = (actual, expected) => {
  const normalize = (str) =>
    str
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim()
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line !== '');

  const actualLines = normalize(actual);
  const expectedLines = normalize(expected);

  if (actualLines.length !== expectedLines.length) return false;

  for (let i = 0; i < actualLines.length; i++) {
    if (actualLines[i] !== expectedLines[i]) return false;
  }
  return true;
};

/**
 * Main execution service to run user code against test cases
 * @param {string} language - JAVASCRIPT, PYTHON, CPP
 * @param {string} code - User solution code
 * @param {Array} testCases - Array of test case objects ({ input, expectedOutput })
 * @returns {Promise<Object>} Execution result: { status, executionTime, error }
 */
const executeCode = async (language, code, testCases) => {
  // Generate a unique submission ID for temporary directory
  const uniqueId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const tempDir = createTempDir(uniqueId);

  let status = 'ACCEPTED';
  let maxExecutionTime = 0;
  let executionError = null;

  try {
    let runCmd = '';
    let runArgs = [];
    const timeoutLimit = language === 'CPP' ? 1500 : 3000; // Timeouts: 1.5s for C++, 3s for interpreted

    if (language === 'JAVASCRIPT') {
      const fileName = 'solution.js';
      writeTempFile(tempDir, fileName, code);
      runCmd = process.env.NODE_PATH || 'node';
      runArgs = [fileName];
    } else if (language === 'PYTHON') {
      const fileName = 'solution.py';
      writeTempFile(tempDir, fileName, code);
      runCmd = process.env.PYTHON_PATH || 'python';
      runArgs = [fileName];
    } else if (language === 'CPP') {
      const srcFile = 'solution.cpp';
      const exeName = isWindows ? 'solution.exe' : 'solution.out';
      writeTempFile(tempDir, srcFile, code);

      // Compile C++ source code
      const compileResult = await compileCpp(srcFile, exeName, tempDir);
      if (!compileResult.success) {
        return {
          status: 'COMPILATION_ERROR',
          executionTime: 0,
          error: compileResult.error,
        };
      }

      runCmd = path.join(tempDir, exeName);
      runArgs = [];
    } else if (language === 'GO') {
      const srcFile = 'main.go';
      const exeName = isWindows ? 'main.exe' : 'main';
      writeTempFile(tempDir, srcFile, code);

      // Compile Go source
      const compileResult = await compileGo(srcFile, exeName, tempDir);
      if (!compileResult.success) {
        return {
          status: 'COMPILATION_ERROR',
          executionTime: 0,
          error: compileResult.error,
        };
      }

      runCmd = path.join(tempDir, exeName);
      runArgs = [];
    } else if (language === 'JAVA') {
      const srcFile = 'Solution.java';
      writeTempFile(tempDir, srcFile, code);

      // Compile Java source
      const compileResult = await compileJava(srcFile, tempDir);
      if (!compileResult.success) {
        return {
          status: 'COMPILATION_ERROR',
          executionTime: 0,
          error: compileResult.error,
        };
      }

      runCmd = process.env.JAVA_PATH || 'java';
      runArgs = ['-cp', '.', 'Solution'];
    } else {
      return {
        status: 'COMPILATION_ERROR',
        executionTime: 0,
        error: `Unsupported language: ${language}`,
      };
    }

    // Run execution against all test cases sequentially
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const result = await runProcess(runCmd, runArgs, tempDir, tc.input, timeoutLimit);

      if (result.status === 'TIME_LIMIT_EXCEEDED') {
        return {
          status: 'TIME_LIMIT_EXCEEDED',
          executionTime: result.executionTime,
          error: `Testcase ${i + 1} timed out.`,
        };
      }

      if (result.status === 'RUNTIME_ERROR') {
        return {
          status: 'RUNTIME_ERROR',
          executionTime: result.executionTime,
          error: `Runtime Error at Testcase ${i + 1}: ${result.error}`,
        };
      }

      // Success, check output
      maxExecutionTime = Math.max(maxExecutionTime, result.executionTime);
      const isCorrect = compareOutputs(result.output, tc.expectedOutput);

      if (!isCorrect) {
        return {
          status: 'WRONG_ANSWER',
          executionTime: maxExecutionTime,
          error: `Wrong Answer at Testcase ${i + 1}.`,
        };
      }
    }

    return {
      status: 'ACCEPTED',
      executionTime: maxExecutionTime,
      error: null,
    };
  } catch (error) {
    return {
      status: 'RUNTIME_ERROR',
      executionTime: 0,
      error: error.message || 'Internal Execution Error',
    };
  } finally {
    // Ensure file cleanup occurs
    await cleanupDir(tempDir);
  }
};

/**
 * Runs user code once with custom input and returns execution result
 * @param {string} language - JAVASCRIPT, PYTHON, CPP
 * @param {string} code - User solution code
 * @param {string} input - Custom input
 * @returns {Promise<Object>} Execution result: { status, executionTime, output, error }
 */
const runCustomCode = async (language, code, input) => {
  const engine = process.env.CODE_EXECUTION_ENGINE || 'local';
  if (engine.toLowerCase() === 'judge0') {
    const { executeTestcase } = require('./judge0');
    const res = await executeTestcase(code, language, input, '', 3000);
    return {
      status: res.status === 'SUCCESS' ? 'SUCCESS' : res.status,
      executionTime: res.executionTimeMs,
      output: res.stdout,
      error: res.stderr || res.error,
    };
  } else if (engine.toLowerCase() === 'piston') {
    const { executePistonTestcase } = require('./piston');
    const res = await executePistonTestcase(code, language, input, '', 3000);
    return {
      status: res.status === 'SUCCESS' ? 'SUCCESS' : res.status,
      executionTime: res.executionTimeMs,
      output: res.stdout,
      error: res.stderr || res.error,
    };
  }

  const { runInSandbox, checkDockerAvailability } = require('./sandboxService');
  const useDocker = await checkDockerAvailability();
  if (useDocker) {
    const sandboxRes = await runInSandbox(language, code, { timeout: 3000, memoryLimit: 256 }, [{ input: input || '', expectedOutput: '' }], { runAll: true });
    const firstResult = sandboxRes.results?.[0] || {};
    
    let status = 'SUCCESS';
    if (sandboxRes.verdict === 'COMPILATION_ERROR') status = 'COMPILATION_ERROR';
    else if (sandboxRes.verdict === 'INTERNAL_ERROR') status = 'INTERNAL_ERROR';
    else if (firstResult.status === 'TIME_LIMIT_EXCEEDED') status = 'TIME_LIMIT_EXCEEDED';
    else if (firstResult.status === 'RUNTIME_ERROR') status = 'RUNTIME_ERROR';
    else if (firstResult.status === 'MEMORY_LIMIT_EXCEEDED') status = 'MEMORY_LIMIT_EXCEEDED';

    return {
      status: status,
      executionTime: sandboxRes.executionTimeMs || 0,
      output: firstResult.stdout || '',
      error: firstResult.stderr || sandboxRes.stderr || '',
    };
  }

  const uniqueId = `${Date.now()}_custom_${Math.floor(Math.random() * 10000)}`;
  const tempDir = createTempDir(uniqueId);

  try {
    let runCmd = '';
    let runArgs = [];
    const timeoutLimit = language === 'CPP' ? 1500 : 3000;

    if (language === 'JAVASCRIPT') {
      const fileName = 'solution.js';
      writeTempFile(tempDir, fileName, code);
      runCmd = process.env.NODE_PATH || 'node';
      runArgs = [fileName];
    } else if (language === 'PYTHON') {
      const fileName = 'solution.py';
      writeTempFile(tempDir, fileName, code);
      runCmd = process.env.PYTHON_PATH || 'python';
      runArgs = [fileName];
    } else if (language === 'CPP') {
      const srcFile = 'solution.cpp';
      const exeName = isWindows ? 'solution.exe' : 'solution.out';
      writeTempFile(tempDir, srcFile, code);

      const compileResult = await compileCpp(srcFile, exeName, tempDir);
      if (!compileResult.success) {
        return {
          status: 'COMPILATION_ERROR',
          executionTime: 0,
          error: compileResult.error,
        };
      }

      runCmd = path.join(tempDir, exeName);
      runArgs = [];
    } else if (language === 'GO') {
      const srcFile = 'solution.go';
      const exeName = isWindows ? 'solution.exe' : 'solution';
      writeTempFile(tempDir, srcFile, code);

      const compileResult = await compileGo(srcFile, exeName, tempDir);
      if (!compileResult.success) {
        return {
          status: 'COMPILATION_ERROR',
          executionTime: 0,
          error: compileResult.error,
        };
      }

      runCmd = path.join(tempDir, exeName);
      runArgs = [];
    } else if (language === 'JAVA') {
      const srcFile = 'Solution.java';
      writeTempFile(tempDir, srcFile, code);

      // Compile Java source
      const compileResult = await compileJava(srcFile, tempDir);
      if (!compileResult.success) {
        return {
          status: 'COMPILATION_ERROR',
          executionTime: 0,
          error: compileResult.error,
        };
      }

      runCmd = process.env.JAVA_PATH || 'java';
      runArgs = ['-cp', '.', 'Solution'];
    } else {
      return {
        status: 'COMPILATION_ERROR',
        executionTime: 0,
        error: `Unsupported language: ${language}`,
      };
    }

    const result = await runProcess(runCmd, runArgs, tempDir, input, timeoutLimit);
    return {
      status: result.status,
      executionTime: result.executionTime,
      output: result.output,
      error: result.error,
    };
  } catch (error) {
    return {
      status: 'RUNTIME_ERROR',
      executionTime: 0,
      error: error.message || 'Internal Execution Error',
    };
  } finally {
    await cleanupDir(tempDir);
  }
};

module.exports = {
  executeCode,
  runCustomCode,
};
