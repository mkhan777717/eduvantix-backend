const backendRegistry = require('./backends/backendRegistry');
const resultCollector = require('./resultCollector');
const languageRegistry = require('../languageRegistry');

class ExecutionEngine {
  /**
   * Compiles and executes code using the active pluggable backend adapter.
   * @param {string} language
   * @param {string} sourceCode
   * @param {string} input
   * @param {Object} options
   * @returns {Promise<Object>} ExecutionResult
   */
  async executeCode(language, sourceCode, input = '', options = {}) {
    const traceId = options.traceId || `trace_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const submissionId = options.submissionId || `sub_${Date.now()}`;
    const lang = language.toLowerCase();

    // 1. Resolve target execution backend
    const backendId = options.backend || process.env.CODE_EXECUTION_BACKEND || 'local';
    const backend = backendRegistry.getBackend(backendId);

    const logPrefix = `[Trace: ${traceId}] [Submission: ${submissionId}] [Backend: ${backendId}] [Lang: ${lang}]`;
    console.log(`${logPrefix} Submission Received`);

    // Validate backend capabilities if required
    const capabilities = backend.getCapabilities();
    const langConfig = languageRegistry.getLanguage(lang);
    
    if (langConfig.needsCompile && !capabilities.supportsCompilation) {
      throw new Error(`Target backend '${backendId}' does not support compilation required by '${language}'.`);
    }

    let compilationResult = null;
    let compileTimeMs = 0;

    // 2. Compilation Phase
    console.log(`${logPrefix} Compilation Started`);
    const compileStart = Date.now();
    try {
      compilationResult = await backend.compile(sourceCode, lang, options);
      compileTimeMs = Date.now() - compileStart;
      console.log(`${logPrefix} Compilation Finished`);
    } catch (err) {
      console.error(`${logPrefix} Compilation Failed:`, err);
      console.log(`${logPrefix} Cleanup Completed`);
      return resultCollector.collect({
        stdout: '',
        stderr: err.message,
        exitInfo: { code: 1, signal: null },
        metrics: {},
        backend: backendId,
        language: lang,
        compileTimeMs,
        traceId,
        limitError: err
      });
    }

    // Handle compilation failure
    if (!compilationResult.success) {
      console.log(`${logPrefix} Cleanup Completed`);
      return resultCollector.collect({
        stdout: '',
        stderr: compilationResult.stderr,
        exitInfo: { code: 1, signal: null },
        metrics: {},
        backend: backendId,
        language: lang,
        compileTimeMs: compilationResult.compileTimeMs,
        traceId,
        limitError: null
      });
    }

    // 3. Execution Phase
    console.log(`${logPrefix} Execution Started`);
    let runnerOut = {};
    try {
      runnerOut = await backend.execute(compilationResult.artifact, lang, input, options);
      console.log(`${logPrefix} Execution Finished`);
    } catch (err) {
      console.error(`${logPrefix} Execution Failed:`, err);
      runnerOut = {
        stdout: '',
        stderr: err.message,
        exitInfo: { code: 1, signal: null },
        metrics: {},
        limitError: err
      };
    }

    // 4. Cleanup Workspace
    try {
      await backend.cleanup(compilationResult.artifact);
      console.log(`${logPrefix} Cleanup Completed`);
    } catch (cleanupErr) {
      console.warn(`${logPrefix} Warning: Cleanup failed:`, cleanupErr.message);
    }

    // 5. Gather metrics and return final ExecutionResult
    const executionResult = resultCollector.collect({
      stdout: runnerOut.stdout,
      stderr: runnerOut.stderr,
      exitInfo: runnerOut.exitInfo,
      metrics: runnerOut.metrics,
      backend: backendId,
      language: lang,
      compileTimeMs: compilationResult.compileTimeMs,
      traceId,
      limitError: runnerOut.limitError
    });

    console.log(`${logPrefix} ExecutionResult Returned`);
    return executionResult;
  }

  async compile(sourceCode, language, options = {}) {
    const backendId = options.backend || process.env.CODE_EXECUTION_BACKEND || 'local';
    const backend = backendRegistry.getBackend(backendId);
    return backend.compile(sourceCode, language.toLowerCase(), options);
  }

  async execute(artifact, language, input, options = {}) {
    const backendId = options.backend || process.env.CODE_EXECUTION_BACKEND || 'local';
    const backend = backendRegistry.getBackend(backendId);
    return backend.execute(artifact, language.toLowerCase(), input, options);
  }

  async cleanup(artifact, options = {}) {
    const backendId = options.backend || process.env.CODE_EXECUTION_BACKEND || 'local';
    const backend = backendRegistry.getBackend(backendId);
    return backend.cleanup(artifact);
  }
}

module.exports = new ExecutionEngine();
