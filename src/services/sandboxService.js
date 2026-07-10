const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createTempDir, writeTempFile, cleanupDir } = require('../utils/cleanup');
const { LANGUAGE_CONFIG } = require('./languageConfig');

const isWindows = process.platform === 'win32';
let isDockerAvailableCache = null;

/**
 * Checks if Docker is available and running on the host system.
 */
const checkDockerAvailability = () => {
  return new Promise((resolve) => {
    if (isDockerAvailableCache !== null) {
      return resolve(isDockerAvailableCache);
    }
    exec('docker ps', (err) => {
      if (err) {
        console.warn('Docker daemon not found or not running. Falling back to local execution. Error:', err.message);
        isDockerAvailableCache = false;
      } else {
        console.log('Docker daemon detected. Sandboxed execution enabled.');
        isDockerAvailableCache = true;
      }
      resolve(isDockerAvailableCache);
    });
  });
};

/**
 * Periodically sweeps and removes any leaked sandbox containers if the Node process crashed mid-judging.
 */
const cleanupZombieContainers = async () => {
  try {
    exec('docker ps -a --filter "name=synapse_judge_" --format "{{.Names}}"', (err, stdout) => {
      if (err) return;
      const names = stdout.trim().split('\n').filter(Boolean);
      for (const name of names) {
        console.log(`Cleaning up zombie container: ${name}`);
        // Force kill and remove
        exec(`docker kill ${name}`, () => {
          exec(`docker rm ${name}`);
        });
      }
    });
  } catch (e) {
    console.error('Failed to cleanup zombie containers:', e);
  }
};

// Run cleanup sweep once on initialization
checkDockerAvailability().then((available) => {
  if (available) {
    cleanupZombieContainers();
  }
});

/**
 * Runs a process with timeout and input piping, returning execution metrics.
 */
const runProcess = (cmd, args, stdinInput = '', timeoutMs = 2000, containerName = null) => {
  return new Promise((resolve) => {
    let resolved = false;
    const child = spawn(cmd, args);

    let stdout = '';
    let stderr = '';
    const startTime = process.hrtime.bigint();

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;

        const handleTimeoutFinish = () => {
          resolve({
            status: 'TIME_LIMIT_EXCEEDED',
            executionTimeMs: timeoutMs,
            stdout,
            stderr: 'Time Limit Exceeded',
            code: 137,
          });
        };

        // If running in Docker, explicitly run "docker kill" to stop the container process
        if (containerName) {
          exec(`docker kill ${containerName}`, () => {
            child.kill('SIGKILL');
            handleTimeoutFinish();
          });
        } else {
          // Local fallback timeout kill
          if (isWindows) {
            spawn('taskkill', ['/pid', child.pid, '/f', '/t']).on('close', handleTimeoutFinish);
          } else {
            child.kill('SIGKILL');
            handleTimeoutFinish();
          }
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
          status: 'INTERNAL_ERROR',
          executionTimeMs: 0,
          stdout,
          stderr: err.message,
          code: null,
        });
      }
    });

    child.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);

        const endTime = process.hrtime.bigint();
        const diffMs = Math.round(Number(endTime - startTime) / 1e6);

        // Docker OOM exits with 137 or has specific OOM error
        if (code === 137) {
          resolve({
            status: 'MEMORY_LIMIT_EXCEEDED',
            executionTimeMs: diffMs,
            stdout,
            stderr: stderr || 'Memory Limit Exceeded',
            code,
          });
        } else if (code !== 0) {
          resolve({
            status: 'RUNTIME_ERROR',
            executionTimeMs: diffMs,
            stdout,
            stderr,
            code,
          });
        } else {
          resolve({
            status: 'SUCCESS',
            executionTimeMs: diffMs,
            stdout,
            stderr,
            code,
          });
        }
      }
    });

    // Pipe stdin and close it
    if (stdinInput) {
      try {
        child.stdin.write(stdinInput);
      } catch (err) {
        console.error('Failed writing to child stdin:', err);
      }
    }
    child.stdin.end();
  });
};

/**
 * Core sandboxed execution function.
 * Handles temporary directory creation, code compilation, and testcase running.
 */
const runInSandbox = async (language, code, problemConfig, testCases, options = {}) => {
  const langKey = language.toLowerCase();
  const config = LANGUAGE_CONFIG[langKey];
  if (!config) {
    return {
      verdict: 'INTERNAL_ERROR',
      error: `Unsupported language: ${language}`,
    };
  }

  const useDocker = await checkDockerAvailability();
  const submissionId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const tempDir = createTempDir(submissionId);
  const hostDir = path.resolve(tempDir).replace(/\\/g, '/');

  // Limits
  const timeoutMs = problemConfig.timeout || 2000;
  const memoryLimitMb = problemConfig.memoryLimit || 256;
  const runAll = !!options.runAll;

  try {
    // 1. Write the source code
    const srcFile = config.sourceFile;
    writeTempFile(tempDir, srcFile, code);

    // 2. Compilation Step (for compiled languages C++ & Java)
    if (config.needsCompile) {
      let compileRes;

      if (useDocker) {
        const compileCmd = config.compileCmd(`/sandbox/${srcFile}`, `/sandbox/main.out`);
        // Mount as read-write to allow compilation output files to write to host temp directory
        const dockerArgs = [
          'run', '--rm',
          '-v', `${hostDir}:/sandbox:rw`,
          config.image,
          'sh', '-c', compileCmd
        ];
        compileRes = await runProcess('docker', dockerArgs, '', 15000); // 15s compilation timeout
      } else {
        // Local compilation fallback
        if (langKey === 'cpp') {
          const exeName = isWindows ? 'main.exe' : 'main.out';
          const localCompileArgs = ['-O2', '-o', path.join(tempDir, exeName), path.join(tempDir, srcFile)];
          const gxxCmd = process.env.GXX_PATH || 'g++';
          compileRes = await runProcess(gxxCmd, localCompileArgs, '', 15000);
        } else if (langKey === 'java') {
          const localCompileArgs = [path.join(tempDir, srcFile)];
          const javacCmd = process.env.JAVAC_PATH || 'javac';
          compileRes = await runProcess(javacCmd, localCompileArgs, '', 15000);
        } else if (langKey === 'go') {
          const exeName = isWindows ? 'main.exe' : 'main';
          const localCompileArgs = ['build', '-o', path.join(tempDir, exeName), path.join(tempDir, srcFile)];
          const goCmd = process.env.GO_PATH || 'go';
          compileRes = await runProcess(goCmd, localCompileArgs, '', 15000);
        }
      }

      if (compileRes.status !== 'SUCCESS') {
        return {
          verdict: 'COMPILATION_ERROR',
          stderr: compileRes.stderr || 'Compilation failed',
          passedTestCases: 0,
          totalTestCases: testCases.length,
          executionTimeMs: 0,
          memoryKb: 0,
        };
      }
    }

    // 3. Execution Step per Test Case
    const results = [];
    let maxExecutionTime = 0;
    let failedTestCase = null;
    let verdict = 'ACCEPTED';
    let passedCount = 0;

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const tcIndex = i + 1;
      const containerName = `synapse_judge_${submissionId}_tc${tcIndex}`;
      let runRes;

      if (useDocker) {
        const runCmd = config.needsCompile
          ? (['cpp', 'go'].includes(langKey) ? config.runCmd('/sandbox/main.out') : config.runCmd())
          : config.runCmd(`/sandbox/${srcFile}`);

        // Mount user code read-only, configure constraints
        const dockerArgs = [
          'run', '--rm',
          '-i', // Allow stdin piping
          '--name', containerName,
          '--network', 'none', // Network isolation
          '--memory', `${memoryLimitMb}m`, // Memory limit
          '--cpus', '0.5', // CPU limit
          '--pids-limit', '64', // Process limit
          '--read-only', // Read-only root filesystem
          '--tmpfs', '/tmp', // Temp filesystem for system usage
          '-v', `${hostDir}:/sandbox:ro`, // Read-only mount of user binaries
          config.image,
          'sh', '-c', runCmd
        ];

        runRes = await runProcess('docker', dockerArgs, tc.input, timeoutMs, containerName);
      } else {
        // Local execution fallback
        let localCmd = '';
        let localArgs = [];

        if (langKey === 'cpp') {
          const exeName = isWindows ? 'main.exe' : 'main.out';
          localCmd = path.join(tempDir, exeName);
        } else if (langKey === 'java') {
          localCmd = process.env.JAVA_PATH || 'java';
          localArgs = ['-cp', tempDir, 'Main'];
        } else if (langKey === 'python') {
          localCmd = process.env.PYTHON_PATH || (isWindows ? 'python' : 'python3');
          localArgs = [path.join(tempDir, srcFile)];
        } else if (langKey === 'javascript') {
          localCmd = process.env.NODE_PATH || 'node';
          localArgs = [path.join(tempDir, srcFile)];
        } else if (langKey === 'go') {
          const exeName = isWindows ? 'main.exe' : 'main';
          localCmd = path.join(tempDir, exeName);
        }

        runRes = await runProcess(localCmd, localArgs, tc.input, timeoutMs);
      }

      // Check results
      const elapsed = runRes.executionTimeMs;
      maxExecutionTime = Math.max(maxExecutionTime, elapsed);

      const tcResult = {
        index: tcIndex,
        status: runRes.status,
        executionTimeMs: elapsed,
        stdout: runRes.stdout,
        stderr: runRes.stderr,
      };

      if (runRes.status === 'SUCCESS') {
        results.push(tcResult);
      } else {
        // Execution failed (TLE, OOM, Runtime Error)
        let tcVerdict = 'RUNTIME_ERROR';
        if (runRes.status === 'TIME_LIMIT_EXCEEDED') tcVerdict = 'TIME_LIMIT_EXCEEDED';
        else if (runRes.status === 'MEMORY_LIMIT_EXCEEDED') tcVerdict = 'MEMORY_LIMIT_EXCEEDED';
        else if (runRes.status === 'INTERNAL_ERROR') tcVerdict = 'INTERNAL_ERROR';

        verdict = tcVerdict;
        failedTestCase = tcIndex;
        results.push({ ...tcResult, status: tcVerdict });

        if (!runAll) {
          break; // Stop at first failing test case
        }
      }
    }

    // Calculate passed test cases count
    passedCount = results.filter(r => r.status === 'SUCCESS').length;

    return {
      verdict,
      results,
      failedTestCase,
      passedTestCases: passedCount,
      totalTestCases: testCases.length,
      executionTimeMs: maxExecutionTime,
      memoryKb: 0, // Fallback/default placeholder
    };
  } catch (error) {
    console.error('Sandbox execution failure:', error);
    return {
      verdict: 'INTERNAL_ERROR',
      stderr: error.message,
      passedTestCases: 0,
      totalTestCases: testCases.length,
      executionTimeMs: 0,
      memoryKb: 0,
    };
  } finally {
    // Delete temporary file folder
    await cleanupDir(tempDir);
  }
};

module.exports = {
  runInSandbox,
  checkDockerAvailability,
};
