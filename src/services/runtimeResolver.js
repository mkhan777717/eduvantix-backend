const fs = require('fs');
const path = require('path');

class RuntimeResolver {
  constructor() {
    this.runtimeDir = path.join(__dirname, '../runtime');
    this.manifestCache = new Map(); // Key: "structure:version", Value: manifest JSON
  }

  /**
   * Clears in-memory manifest cache
   */
  clearCache() {
    this.manifestCache.clear();
  }

  /**
   * Resolves a runtime file path and reads its content.
   * @param {string} structure - e.g. "tree", "list", "graph"
   * @param {string} version - e.g. "v1"
   * @param {string} language - e.g. "cpp", "python", "javascript"
   * @returns {Object} { filePath, content, manifest }
   */
  resolveRuntime(structure, version, language) {
    if (!structure || !version || !language) {
      throw new Error('Structure, version, and language are required to resolve a runtime library.');
    }

    const structKey = structure.toLowerCase();
    const verKey = version.toLowerCase();
    const langKey = language.toLowerCase();
    const cacheKey = `${structKey}:${verKey}`;

    let manifest;
    if (this.manifestCache.has(cacheKey)) {
      manifest = this.manifestCache.get(cacheKey);
    } else {
      const manifestPath = path.join(this.runtimeDir, structKey, verKey, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error(`Runtime library '${structure}' version '${version}' not found. Check that it is registered in the runtime directory.`);
      }

      try {
        const raw = fs.readFileSync(manifestPath, 'utf8');
        manifest = JSON.parse(raw);
        this.manifestCache.set(cacheKey, manifest);
      } catch (e) {
        throw new Error(`Failed to parse runtime manifest for '${structure}' '${version}': ${e.message}`);
      }
    }

    // Resolve file mapping from manifest
    if (!manifest.files || !manifest.files[langKey]) {
      throw new Error(`Runtime manifest for '${structure}' '${version}' does not map a file for language '${language}'.`);
    }

    const relativeFilePath = manifest.files[langKey];
    const absolutePath = path.join(this.runtimeDir, structKey, verKey, relativeFilePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Runtime library '${structure}' version '${version}' source file is missing. Check the runtime directory integrity.`);
    }

    const content = fs.readFileSync(absolutePath, 'utf8');

    return {
      filePath: absolutePath,
      content,
      manifest
    };
  }
}

module.exports = new RuntimeResolver();
