const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { randomUUID } = require('crypto'); // M-1: UUID for workspace isolation
const languageRegistry = require('../../../languageRegistry');
const { createWorkspace, cleanupDir } = require('../../../../utils/cleanup');

// C-2: Strip internal server paths from compiler error messages before sending to client
function sanitizeCompilerOutput(rawStderr, workspaceDir) {
  if (!rawStderr) return '';
  let s = rawStderr;
  // Remove the specific workspace path
  const esc = workspaceDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  s = s.replace(new RegExp(esc.replace(/\\\\/g, '(?:\\\\\\\\|\\/)'), 'g'), '<workspace>');
  // Generic Windows absolute path fallback
  s = s.replace(/[A-Za-z]:\\[\w\\. \-]+/g, '<workspace>');
  // Generic Linux absolute path fallback
  s = s.replace(/\/(?:var|home|opt|usr|tmp)\/[^\s:]*/g, '<workspace>');
  return s;
}

class LocalCompiler {
  /**
   * Compiles source code to a runnable binary or bytecode directory inside structured workspace.
   * @param {string} sourceCode
   * @param {string} language
   * @param {Object} options
   * @returns {Object} CompilationResult
   */
  compile(sourceCode, language, options = {}) {
    // M-1: Use UUID to guarantee no workspace collision under high concurrency
    const submissionId = options.submissionId || `sub_${Date.now()}_${randomUUID()}`;
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

          // C-3: Compile with timeout to prevent infinite TMP/constexpr loops from blocking Node.js
          const compileTimeoutMs = options.compileTimeout || 45000;
          const runRes = spawnSync(compileConf.command, resolvedArgs, {
            stdio: 'pipe',
            timeout: compileTimeoutMs,
            killSignal: 'SIGKILL'
          });

          // C-3: Handle compile timeout
          if (runRes.signal === 'SIGKILL' || (runRes.error && runRes.error.code === 'ETIMEDOUT')) {
            throw new Error('Compilation timed out. Your code may contain excessive template expansion or recursive macros.');
          }
          if (runRes.error) throw runRes.error;

          if (runRes.status !== 0) {
            const rawStderr = runRes.stderr ? runRes.stderr.toString().trim() : `Compilation exited with status: ${runRes.status}`;
            // C-2: Sanitize paths before propagating
            throw new Error(sanitizeCompilerOutput(rawStderr, workspaceDir));
          }

          compileResult.compileTimeMs = Date.now() - start;
        } catch (e) {
          compileResult.success = false;
          // C-2: Ensure paths are sanitized even from catch re-throws
          compileResult.stderr = sanitizeCompilerOutput(e.message, workspaceDir);
          compileResult.compileTimeMs = Date.now() - start;
          // M-2: Clean up workspace on compile failure to prevent disk accumulation
          cleanupDir(workspaceDir).catch(cleanErr => {
            console.warn(`[LocalCompiler] Workspace cleanup failed after compile error: ${cleanErr.message}`);
          });
          compileResult.artifact = null;
        }
      }
    }

    return compileResult;
  }
}

module.exports = new LocalCompiler();
