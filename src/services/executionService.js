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
 * Checks if a command/executable is available on the machine's PATH.
 */
const commandExists = (cmd) => new Promise((resolve) => {
  const { spawn } = require('child_process');
  try {
    const child = spawn(cmd, [], { stdio: 'ignore' });
    let finished = false;
    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      resolve(err.code !== 'ENOENT');
    });
    setTimeout(() => {
      if (finished) return;
      finished = true;
      try { child.kill('SIGKILL'); } catch (e) {}
      resolve(true);
    }, 50);
    child.on('close', () => {
      if (finished) return;
      finished = true;
      resolve(true);
    });
  } catch (e) {
    resolve(false);
  }
});

/**
 * Generic compile+run setup for new languages.
 * Returns { cmd, args } if ready to execute locally, { error } on compile failure, or { usePiston: true } to fall back to Piston.
 */
const setupNewLanguage = async (language, code, tempDir, isWin) => {
  const lang = language.toUpperCase();

  const tryCompile = (cmd, args) => new Promise((resolve) => {
    const { spawn: sp } = require('child_process');
    const child = sp(cmd, args, { cwd: tempDir });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', (err) => resolve({ success: false, notFound: true, error: err.message }));
    child.on('close', (code) => resolve({ success: code === 0, error: stderr }));
  });

  if (lang === 'TYPESCRIPT') {
    const tsNode = process.env.TS_NODE_PATH || 'ts-node';
    const exists = await commandExists(tsNode);
    if (!exists) return { error: "TypeScript execution engine (ts-node) is not installed on this server." };
    const fileName = 'main.ts';
    writeTempFile(tempDir, fileName, code);
    return { cmd: tsNode, args: [path.join(tempDir, fileName)] };
  }

  if (lang === 'C') {
    const srcFile = 'main.c';
    const exeName = isWin ? 'main.exe' : 'main.out';
    writeTempFile(tempDir, srcFile, code);
    const gcc = process.env.GCC_PATH || 'gcc';
    const res = await tryCompile(gcc, ['-O2', '-o', path.join(tempDir, exeName), path.join(tempDir, srcFile), '-lm']);
    if (res.notFound) return { error: "C compiler (gcc) is not installed on this server." };
    if (!res.success) return { error: res.error };
    return { cmd: path.join(tempDir, exeName), args: [] };
  }

  if (lang === 'RUST') {
    const srcFile = 'main.rs';
    const exeName = isWin ? 'main.exe' : 'main.out';
    writeTempFile(tempDir, srcFile, code);
    const rustc = process.env.RUSTC_PATH || 'rustc';
    const res = await tryCompile(rustc, ['-o', path.join(tempDir, exeName), path.join(tempDir, srcFile)]);
    if (res.notFound) return { error: "Rust compiler (rustc) is not installed on this server." };
    if (!res.success) return { error: res.error };
    return { cmd: path.join(tempDir, exeName), args: [] };
  }

  if (lang === 'KOTLIN') {
    const srcFile = 'main.kt';
    const jarFile = path.join(tempDir, 'main.jar');
    writeTempFile(tempDir, srcFile, code);
    const kotlinc = process.env.KOTLINC_PATH || 'kotlinc';
    const res = await tryCompile(kotlinc, [path.join(tempDir, srcFile), '-include-runtime', '-d', jarFile]);
    if (res.notFound) return { error: "Kotlin compiler (kotlinc) is not installed on this server." };
    if (!res.success) return { error: res.error };
    return { cmd: process.env.JAVA_PATH || 'java', args: ['-jar', jarFile] };
  }

  if (lang === 'SCALA') {
    const srcFile = 'main.scala';
    writeTempFile(tempDir, srcFile, code);
    const scalac = process.env.SCALAC_PATH || 'scalac';
    const res = await tryCompile(scalac, ['-d', tempDir, path.join(tempDir, srcFile)]);
    if (res.notFound) return { error: "Scala compiler (scalac) is not installed on this server." };
    if (!res.success) return { error: res.error };
    return { cmd: process.env.SCALA_PATH || 'scala', args: ['-cp', tempDir, 'Solution'] };
  }

  if (lang === 'ERLANG') {
    const srcFile = 'main.erl';
    writeTempFile(tempDir, srcFile, code);
    const erlc = process.env.ERLC_PATH || 'erlc';
    const res = await tryCompile(erlc, ['-o', tempDir, path.join(tempDir, srcFile)]);
    if (res.notFound) return { error: "Erlang compiler (erlc) is not installed on this server." };
    if (!res.success) return { error: res.error };
    return { cmd: process.env.ERL_PATH || 'erl', args: ['-noshell', '-pa', tempDir, '-s', 'main', 'main', '-s', 'init', 'stop'] };
  }

  // Interpreted languages
  const interpreters = {
    RUBY:   { env: 'RUBY_PATH',          bin: 'ruby',          file: 'main.rb' },
    PHP:    { env: 'PHP_PATH',            bin: 'php',           file: 'main.php' },
    DART:   { env: 'DART_PATH',           bin: 'dart',          file: 'main.dart' },
    SWIFT:  { env: 'SWIFT_PATH',          bin: 'swift',         file: 'main.swift' },
    ELIXIR: { env: 'ELIXIR_PATH',         bin: 'elixir',        file: 'main.ex' },
    RACKET: { env: 'RACKET_PATH',         bin: 'racket',        file: 'main.rkt' },
    CSHARP: { env: 'DOTNET_SCRIPT_PATH',  bin: 'dotnet-script', file: 'main.cs' },
  };

  const info = interpreters[lang];
  if (info) {
    const cmd = process.env[info.env] || info.bin;
    const exists = await commandExists(cmd);
    if (!exists) return { error: `${info.bin} execution runtime is not installed on this server.` };
    writeTempFile(tempDir, info.file, code);
    return { cmd, args: [path.join(tempDir, info.file)] };
  }

  return { error: `Unsupported execution engine logic for local execution: ${lang}` };
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
    // Per-language timeouts (ms) — JVM languages need extra time for startup on VPS
    const getTimeoutLimit = (lang) => {
      const l = lang.toUpperCase();
      if (l === 'CPP' || l === 'C') return parseInt(process.env.TIMEOUT_CPP || '5000');
      if (l === 'JAVA') return parseInt(process.env.TIMEOUT_JAVA || '12000');
      if (l === 'KOTLIN' || l === 'SCALA') return parseInt(process.env.TIMEOUT_JVM || '15000');
      if (l === 'JAVASCRIPT' || l === 'PYTHON' || l === 'GO') return parseInt(process.env.TIMEOUT_SCRIPT || '8000');
      return parseInt(process.env.TIMEOUT_DEFAULT || '10000');
    };
    const timeoutLimit = getTimeoutLimit(language);

    if (language === 'JAVASCRIPT') {
      const fileName = 'solution.js';
      writeTempFile(tempDir, fileName, code);
      runCmd = process.env.NODE_PATH || 'node';
      runArgs = [fileName];
    } else if (language === 'PYTHON') {
      const fileName = 'solution.py';
      writeTempFile(tempDir, fileName, code);
      // On Linux/VPS 'python' is not available — use 'python3'
      runCmd = process.env.PYTHON_PATH || (isWindows ? 'python' : 'python3');
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
      const srcFile = 'Main.java';
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
      runArgs = ['-cp', '.', 'Main'];
    } else {
      // Handle remaining languages: TypeScript, C, C#, Kotlin, Swift, Rust, Ruby, PHP, Dart, Scala, Elixir, Erlang, Racket
      const compileAndRun = await setupNewLanguage(language, code, tempDir, isWindows);
      if (compileAndRun.error) {
        return { status: 'COMPILATION_ERROR', executionTime: 0, error: compileAndRun.error };
      }
      runCmd = compileAndRun.cmd;
      runArgs = compileAndRun.args;
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
    // Per-language timeouts (ms) — JVM languages need extra time for startup on VPS
    const getTimeoutLimit = (lang) => {
      const l = lang.toUpperCase();
      if (l === 'CPP' || l === 'C') return parseInt(process.env.TIMEOUT_CPP || '5000');
      if (l === 'JAVA') return parseInt(process.env.TIMEOUT_JAVA || '12000');
      if (l === 'KOTLIN' || l === 'SCALA') return parseInt(process.env.TIMEOUT_JVM || '15000');
      if (l === 'JAVASCRIPT' || l === 'PYTHON' || l === 'GO') return parseInt(process.env.TIMEOUT_SCRIPT || '8000');
      return parseInt(process.env.TIMEOUT_DEFAULT || '10000');
    };
    const timeoutLimit = getTimeoutLimit(language);

    if (language === 'JAVASCRIPT') {
      const fileName = 'solution.js';
      writeTempFile(tempDir, fileName, code);
      runCmd = process.env.NODE_PATH || 'node';
      runArgs = [fileName];
    } else if (language === 'PYTHON') {
      const fileName = 'solution.py';
      writeTempFile(tempDir, fileName, code);
      // On Linux/VPS 'python' is not available — use 'python3'
      runCmd = process.env.PYTHON_PATH || (isWindows ? 'python' : 'python3');
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
      const srcFile = 'Main.java';
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
      runArgs = ['-cp', '.', 'Main'];
    } else {
      // Handle remaining languages via setupNewLanguage (tries local execution)
      const compileAndRun = await setupNewLanguage(language, code, tempDir, isWindows);
      if (compileAndRun.error) {
        return { status: 'COMPILATION_ERROR', executionTime: 0, output: '', error: compileAndRun.error };
      }
      runCmd = compileAndRun.cmd;
      runArgs = compileAndRun.args;
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
