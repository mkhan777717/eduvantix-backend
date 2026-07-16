const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const languageRegistry = require('../../../languageRegistry');
const { createWorkspace } = require('../../../../utils/cleanup');

class LocalCompiler {
  /**
   * Compiles source code to a runnable binary or bytecode directory inside structured workspace.
   * @param {string} sourceCode
   * @param {string} language
   * @param {Object} options
   * @returns {Object} CompilationResult
   */
  compile(sourceCode, language, options = {}) {
    const submissionId = options.submissionId || `sub_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const workspaceDir = createWorkspace(submissionId);

    const langConfig = languageRegistry.getLanguage(language);
    const buildSubdir = path.join(workspaceDir, 'build');
    const srcSubdir = path.join(workspaceDir, 'source');

    const ext = langConfig.extension;
    const srcFilename = langConfig.sourceFile || `main.${ext}`;
    const srcPath = path.join(srcSubdir, srcFilename);
    fs.writeFileSync(srcPath, sourceCode, 'utf8');

    let outPath = srcPath;
    if (langConfig.executionMode === 'compiled') {
      const isWin = process.platform === 'win32';
      const exeName = language.toLowerCase() === 'go'
        ? (isWin ? 'main.exe' : 'main')
        : (isWin ? 'main.exe' : 'main.out');
      outPath = path.join(buildSubdir, exeName);
    } else if (langConfig.executionMode === 'bytecode') {
      outPath = buildSubdir;
    }

    const artifact = {
      type: langConfig.executionMode === 'compiled' ? 'binary' : (langConfig.executionMode === 'bytecode' ? 'bytecode' : 'script'),
      location: langConfig.executionMode === 'compiled' ? outPath : (langConfig.executionMode === 'bytecode' ? buildSubdir : srcPath),
      metadata: { srcPath, buildSubdir, workspaceDir, sourceFile: srcFilename }
    };

    const compileResult = {
      success: true,
      artifact,
      stderr: '',
      compileTimeMs: 0
    };

    if (langConfig.executionMode === 'compiled' || langConfig.executionMode === 'bytecode') {
      const compileConf = langConfig.compile;
      if (compileConf) {
        const start = Date.now();
        try {
          // Resolve compiler args with absolute path mapping replacements
          const resolvedArgs = compileConf.args.map(arg => {
            return arg
              .replace(/{srcPath}/g, srcPath)
              .replace(/{outPath}/g, outPath)
              .replace(/{buildDir}/g, buildSubdir);
          });

          // Compile using spawnSync (safe from injection)
          const runRes = spawnSync(compileConf.command, resolvedArgs, { stdio: 'pipe' });

          if (runRes.status !== 0) {
            throw new Error(runRes.stderr ? runRes.stderr.toString().trim() : `Compilation exited with non-zero status: ${runRes.status}`);
          }

          compileResult.compileTimeMs = Date.now() - start;
        } catch (e) {
          compileResult.success = false;
          compileResult.stderr = e.message;
          compileResult.compileTimeMs = Date.now() - start;
        }
      }
    }

    return compileResult;
  }
}

module.exports = new LocalCompiler();
