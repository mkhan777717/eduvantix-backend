const { executePistonTestcase } = require('../../../../legacy/piston');

class PistonRunner {
  /**
   * Executes source code by sending REST requests to the remote Piston API.
   */
  async execute(artifact, language, input, options = {}) {
    const sourceCode = artifact.metadata.sourceCode;
    const timeout = options.timeout || 3000;
    
    // Call the legacy piston API execution helper
    const res = await executePistonTestcase(sourceCode, language, input, '', timeout);
    
    let exitCode = 0;
    if (res.status === 'RUNTIME_ERROR') exitCode = 1;
    if (res.status === 'COMPILATION_ERROR') exitCode = 1;
    
    let limitError = null;
    if (res.status === 'TIME_LIMIT_EXCEEDED') {
      const err = new Error('Time Limit Exceeded');
      err.code = 'ETIMEDOUT';
      limitError = err;
    } else if (res.status === 'INTERNAL_ERROR') {
      const err = new Error(res.stderr || 'Internal execution failure');
      err.name = 'InternalError';
      limitError = err;
    }

    return {
      stdout: res.stdout || '',
      stderr: res.stderr || '',
      exitInfo: { code: exitCode, signal: res.status === 'TIME_LIMIT_EXCEEDED' ? 'SIGKILL' : null },
      metrics: {
        executionTimeMs: res.executionTimeMs || 0,
        wallClockMs: res.executionTimeMs || 0,
        memoryKb: res.memoryKb || 0,
        outputSize: (res.stdout || '').length
      },
      limitError
    };
  }
}

module.exports = new PistonRunner();
