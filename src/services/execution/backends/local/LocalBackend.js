const fs = require('fs');
const ExecutionBackend = require('../ExecutionBackend');
const LocalCompiler = require('./LocalCompiler');
const LocalRunner = require('./LocalRunner');

class LocalBackend extends ExecutionBackend {
  getCapabilities() {
    return {
      supportsCompilation: true,
      supportsInteractive: false,
      supportsSql: false,
      supportsStreaming: false,
      supportsNetwork: false,
      supportsCustomJudge: true
    };
  }

  async compile(sourceCode, language, options = {}) {
    return LocalCompiler.compile(sourceCode, language, options);
  }

  async execute(artifact, language, input, options = {}) {
    return LocalRunner.execute(artifact, language, input, options);
  }

  async cleanup(artifact) {
    if (!artifact || !artifact.metadata || !artifact.metadata.workspaceDir) return;
    const { cleanupWorkspace } = require('../../../../utils/cleanup');
    try {
      await cleanupWorkspace(artifact.metadata.workspaceDir);
    } catch (e) {
      console.warn(`[LocalBackend] Cleanup failed:`, e.message);
    }
  }

  async health() {
    return true;
  }
}

module.exports = LocalBackend;
