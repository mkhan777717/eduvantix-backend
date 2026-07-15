const ProcessManager = require('../../process/ProcessManager');
const ResourceMonitor = require('../../monitors/ResourceMonitor');
const { MemoryLimitExceededError } = require('../../errors/ExecutionError');
const languageRegistry = require('../../../languageRegistry');

class LocalRunner {
  /**
   * Executes artifact locally using system subprocesses.
   * @param {Object} artifact
   * @param {string} language
   * @param {string} input
   * @param {Object} options
   * @returns {Promise<Object>} Process outcomes
   */
  async execute(artifact, language, input, options = {}) {
    const timeoutMs = options.timeout || 3000;
    const memoryLimitKb = options.memoryLimitKb || 256 * 1024; // 256MB Default
    const maxOutputBytes = options.maxOutputBytes || 5 * 1024 * 1024; // 5MB Default

    const langConfig = languageRegistry.getLanguage(language);
    const runConf = langConfig.run;

    const buildSubdir = artifact.metadata?.buildSubdir || '';
    const srcPath = artifact.metadata?.srcPath || '';
    const outPath = artifact.type === 'binary' ? artifact.location : '';

    // Substitution replacements
    let command = runConf.command
      .replace(/{srcPath}/g, srcPath)
      .replace(/{outPath}/g, outPath)
      .replace(/{buildDir}/g, buildSubdir);

    if (command === '{outPath}') {
      command = artifact.location;
    }

    const args = runConf.args.map(arg => {
      return arg
        .replace(/{srcPath}/g, srcPath)
        .replace(/{outPath}/g, outPath)
        .replace(/{buildDir}/g, buildSubdir);
    });

    const child = ProcessManager.spawnProcess(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const monitor = new ResourceMonitor(maxOutputBytes);

    const stdoutBuffer = [];
    const stderrBuffer = [];
    let limitError = null;

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();

    child.stdout.on('data', (data) => {
      stdoutBuffer.push(data);
    });
    child.stderr.on('data', (data) => {
      stderrBuffer.push(data);
    });

    monitor.start(child, (err) => {
      limitError = err;
      ProcessManager.terminateProcessTree(child.pid);
    });

    let exitInfo = {};
    try {
      exitInfo = await ProcessManager.wait(child, timeoutMs);
    } catch (e) {
      if (e.message === 'TIMEOUT') {
        exitInfo = { code: null, signal: 'SIGKILL' };
      } else {
        throw e;
      }
    } finally {
      monitor.stop();
    }

    const stdout = Buffer.concat(stdoutBuffer).toString('utf8');
    const stderr = Buffer.concat(stderrBuffer).toString('utf8');
    const metrics = monitor.getMetrics();

    // Check if memory limit is breached
    if (metrics.memoryKb > memoryLimitKb && !limitError) {
      limitError = new MemoryLimitExceededError(
        `Memory limit exceeded: used ${metrics.memoryKb} KB, limit ${memoryLimitKb} KB`
      );
    }

    return {
      stdout,
      stderr,
      exitInfo,
      metrics,
      limitError
    };
  }
}

module.exports = new LocalRunner();
