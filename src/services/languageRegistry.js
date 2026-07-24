const fs = require('fs');
const path = require('path');

class LanguageRegistry {
  constructor() {
    this.languagesDir = path.join(__dirname, '../registry/languages');
    this.driversDir = path.join(__dirname, '../registry/drivers');
    this.runtimeDir = path.join(__dirname, '../runtime');
    this.cache = new Map();
    this.loadAllLanguages();
  }

  /**
   * Loads and validates all language configuration JSON files on startup.
   */
  loadAllLanguages() {
    try {
      if (!fs.existsSync(this.languagesDir)) {
        return;
      }
      const files = fs.readdirSync(this.languagesDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.languagesDir, file);
          const rawData = fs.readFileSync(filePath, 'utf8');
          const config = JSON.parse(rawData);

          // Validation (Fail Fast)
          this.validateConfig(file, config);

          const langId = config.language.toLowerCase();
          this.cache.set(langId, config);
        }
      }

      // Late validation: Assert directories exist for all loaded languages
      this.validateTemplateAndRuntimes();

    } catch (error) {
      console.error('Fatal: Failed to load language registry:', error);
      throw error;
    }
  }

  /**
   * Strictly validates language schema fields against the structured schema.
   */
  validateConfig(filename, config) {
    if (!config.language || typeof config.language !== 'string' || config.language.trim() === '') {
      throw new Error(`Language config validation failed in '${filename}': 'language' string is required.`);
    }
    if (!config.version || typeof config.version !== 'string' || config.version.trim() === '') {
      throw new Error(`Language config validation failed in '${filename}': 'version' string is required.`);
    }
    if (!config.extension || typeof config.extension !== 'string' || config.extension.trim() === '') {
      throw new Error(`Language config validation failed in '${filename}': 'extension' string is required.`);
    }
    if (!config.sourceFile || typeof config.sourceFile !== 'string' || config.sourceFile.trim() === '') {
      throw new Error(`Language config validation failed in '${filename}': 'sourceFile' is required.`);
    }

    const validModes = ['compiled', 'interpreted', 'bytecode'];
    if (!validModes.includes(config.executionMode)) {
      throw new Error(`Language config validation failed in '${filename}': 'executionMode' must be one of: ${validModes.join(', ')}.`);
    }

    // Validate structured 'run' config
    if (!config.run || typeof config.run !== 'object') {
      throw new Error(`Language config validation failed in '${filename}': structured 'run' object is required.`);
    }
    if (!config.run.command || typeof config.run.command !== 'string') {
      throw new Error(`Language config validation failed in '${filename}': 'run.command' string is required.`);
    }
    if (!Array.isArray(config.run.args)) {
      throw new Error(`Language config validation failed in '${filename}': 'run.args' array is required.`);
    }

    // Validate structured 'compile' config if mode is compiled or bytecode
    if (config.executionMode === 'compiled' || config.executionMode === 'bytecode') {
      if (!config.compile || typeof config.compile !== 'object') {
        throw new Error(`Language config validation failed in '${filename}': structured 'compile' object is required for executionMode: ${config.executionMode}.`);
      }
      if (!config.compile.command || typeof config.compile.command !== 'string') {
        throw new Error(`Language config validation failed in '${filename}': 'compile.command' string is required.`);
      }
      if (!Array.isArray(config.compile.args)) {
        throw new Error(`Language config validation failed in '${filename}': 'compile.args' array is required.`);
      }
    }

    // Validate 'supports' capabilities mapping
    if (!config.supports || typeof config.supports !== 'object') {
      throw new Error(`Language config validation failed in '${filename}': 'supports' capabilities object is required.`);
    }

    // Validate 'runtimeLibraries' array
    if (!Array.isArray(config.runtimeLibraries)) {
      throw new Error(`Language config validation failed in '${filename}': 'runtimeLibraries' array is required.`);
    }

    // Validate 'docker' images setup
    if (!config.docker || typeof config.docker !== 'object') {
      throw new Error(`Language config validation failed in '${filename}': 'docker' configurations block is required.`);
    }
    if (!config.docker.image || typeof config.docker.image !== 'string') {
      throw new Error(`Language config validation failed in '${filename}': 'docker.image' version-pinned tag is required.`);
    }

    // Validate dynamic code generation templates
    const templateFields = [
      'dbLanguage',
      'imports',
      'inputVarTemplate',
      'parameterReadTemplate',
      'executionCallTemplate',
      'executionCallVoidTemplate',
      'printTemplate',
      'mainBodyTemplate'
    ];
    for (const field of templateFields) {
      if (typeof config[field] !== 'string') {
        throw new Error(`Language config validation failed in '${filename}': '${field}' string property is required.`);
      }
    }
    if (!Array.isArray(config.runtimeLibraryCleanupRegexes)) {
      throw new Error(`Language config validation failed in '${filename}': 'runtimeLibraryCleanupRegexes' array is required.`);
    }
  }

  /**
   * Asserts driver templates and runtime directories exist on startup.
   */
  validateTemplateAndRuntimes() {
    for (const [langId, config] of this.cache.entries()) {
      const langDir = path.join(this.driversDir, langId);
      
      // 1. Validate functional driver template exists on disk
      const funcTemplate = path.join(langDir, 'functional_v1.template');
      if (!fs.existsSync(funcTemplate)) {
        throw new Error(`Startup Sanity Check failed for language '${langId}': functional template driver is missing at: ${funcTemplate}`);
      }

      // 2. Validate class design driver template exists on disk
      const classTemplate = path.join(langDir, 'class_design_v1.template');
      if (!fs.existsSync(classTemplate)) {
        throw new Error(`Startup Sanity Check failed for language '${langId}': class design template driver is missing at: ${classTemplate}`);
      }

      // 3. Validate runtime structural libraries exist on disk
      for (const lib of config.runtimeLibraries) {
        const libPath = path.join(this.runtimeDir, lib, 'v1', langId);
        if (!fs.existsSync(libPath)) {
          throw new Error(`Startup Sanity Check failed for language '${langId}': runtime library directory for '${lib}' is missing at: ${libPath}`);
        }
      }
    }
  }

  reload() {
    const newRegistry = new LanguageRegistry();
    this.cache = newRegistry.cache;
  }

  hasLanguage(id) {
    if (!id) return false;
    return this.cache.has(id.toLowerCase());
  }

  getLanguage(id) {
    if (!id) {
      throw new Error('Language ID is required.');
    }
    if (process.env.NODE_ENV !== 'production') {
      this.loadAllLanguages();
    }
    const key = id.toLowerCase();
    if (!this.cache.has(key)) {
      throw new Error(`Language '${id}' is not registered.`);
    }
    const config = this.cache.get(key);

    // Fallback getters for legacy compatibility
    const needsCompile = config.executionMode === 'compiled' || config.executionMode === 'bytecode';
    
    let compileCmd = null;
    if (config.compile) {
      compileCmd = [config.compile.command, ...config.compile.args].join(' ');
    }
    
    const runCmd = [config.run.command, ...config.run.args].join(' ');

    return {
      ...config,
      needsCompile,
      compileCmd,
      runCmd
    };
  }

  getExtension(id) {
    return this.getLanguage(id).extension;
  }
}

module.exports = new LanguageRegistry();
