const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const languageRegistry = require('../../../languageRegistry');

class LocalCompiler {
  /**
   * Compiles source code to a runnable binary or bytecode directory.
   * @param {string} sourceCode
   * @param {string} language
   * @param {Object} options
   * @returns {Object} CompilationResult
   */
  compile(sourceCode, language, options = {}) {
    const buildDir = path.join(__dirname, '../../../../../builds');
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }

    const langConfig = languageRegistry.getLanguage(language);
    const fileId = `${language}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Compile inside a dedicated nested subdirectory if the language requires specific filenames
    const useSubdir = !!langConfig.sourceFile;
    const buildSubdir = useSubdir ? path.join(buildDir, fileId) : buildDir;
    if (useSubdir && !fs.existsSync(buildSubdir)) {
      fs.mkdirSync(buildSubdir, { recursive: true });
    }

    const ext = langConfig.extension;
    const srcFilename = langConfig.sourceFile || `${fileId}.${ext}`;
    const srcPath = path.join(buildSubdir, srcFilename);
    fs.writeFileSync(srcPath, sourceCode, 'utf8');

    const artifact = {
      type: langConfig.executionMode === 'compiled' ? 'binary' : 'script',
      location: srcPath,
      metadata: { srcPath, buildSubdir, fileId, sourceFile: srcFilename }
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
          let outPath = srcPath;
          if (langConfig.executionMode === 'compiled') {
            outPath = path.join(buildSubdir, `${fileId}${process.platform === 'win32' ? '.exe' : ''}`);
          }

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

          compileResult.artifact.location = langConfig.executionMode === 'compiled' ? outPath : buildSubdir;
          compileResult.artifact.type = langConfig.executionMode === 'compiled' ? 'binary' : 'bytecode';
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
