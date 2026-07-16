const { getSignalMessage } = require('../comparator');

class ResultCollector {
  /**
   * Translates raw exit code/signals and resource usage profiles to a structured ExecutionResult.
   * @param {Object} rawData - Standard execution indicators
   * @returns {Object} Structured ExecutionResult conforming to standard contracts
   */
  collect(rawData) {
    const {
      stdout = '',
      stderr = '',
      exitInfo = {}, // { code, signal }
      metrics = {},   // { executionTimeMs, wallClockMs, memoryKb, outputSize }
      backend = 'unknown',
      language = 'unknown',
      compileTimeMs = 0,
      traceId = '',
      limitError = null // e.g. OutputLimitExceededError passed down
    } = rawData;

    const { code = null, signal = null } = exitInfo;
    const {
      executionTimeMs = 0,
      wallClockMs = 0,
      memoryKb = 0,
      outputSize = 0
    } = metrics;

    let status = 'SUCCESS';

    // 1. Resolve limits or runtime errors
    if (limitError) {
      if (limitError.name === 'OutputLimitExceededError') {
        status = 'OUTPUT_LIMIT_EXCEEDED';
      } else if (limitError.name === 'TimeLimitExceededError') {
        status = 'TIME_LIMIT_EXCEEDED';
      } else if (limitError.name === 'MemoryLimitExceededError') {
        status = 'MEMORY_LIMIT_EXCEEDED';
      } else {
        status = 'INTERNAL_ERROR';
      }
    } else if (signal === 'SIGKILL' || signal === 'SIGTERM') {
      // Typically killed on timeout limit exceeded
      status = 'TIME_LIMIT_EXCEEDED';
    } else if (code !== 0 && code !== null) {
      status = 'RUNTIME_ERROR';
    }

    // M-5: Enrich blank stderr with human-readable signal message
    const signalMsg = signal ? getSignalMessage(signal) : null;
    const finalStderr = (stderr && stderr.trim()) ? stderr : (signalMsg || stderr);

    return {
      status,
      stdout,
      stderr: finalStderr,
      exitCode: code,
      signal,
      executionTimeMs,
      wallClockMs,
      memoryKb,
      outputSize,
      backend,
      language,
      compileTimeMs,
      traceId
    };
  }
}

module.exports = new ResultCollector();
