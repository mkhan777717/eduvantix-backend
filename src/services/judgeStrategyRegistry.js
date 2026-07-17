const fs = require('fs');
const path = require('path');

class JudgeStrategyRegistry {
  constructor() {
    this.strategiesDir = path.join(__dirname, '../registry/strategies');
    this.cache = new Map(); // Key: strategyId (lowercase), Value: instantiated strategy object
    this.manifests = new Map(); // Key: strategyId, Value: manifest JSON
    this.loadAllStrategies();
  }

  /**
   * Scans strategies/ folder, parses manifests, instantiates strategies, and runs validations.
   */
  loadAllStrategies() {
    try {
      if (!fs.existsSync(this.strategiesDir)) {
        return;
      }

      const dirs = fs.readdirSync(this.strategiesDir);
      for (const dirName of dirs) {
        const strategyPath = path.join(this.strategiesDir, dirName);
        if (fs.statSync(strategyPath).isDirectory()) {
          const manifestPath = path.join(strategyPath, 'manifest.json');
          const scriptPath = path.join(strategyPath, 'strategy.js');

          // 1. Assert file exists (Fail Fast)
          if (!fs.existsSync(manifestPath)) {
            throw new Error(`Strategy validation failed in '${dirName}': missing 'manifest.json'.`);
          }
          if (!fs.existsSync(scriptPath)) {
            throw new Error(`Strategy validation failed in '${dirName}': missing 'strategy.js'.`);
          }

          // 2. Parse and validate manifest schema
          let manifest;
          try {
            const rawManifest = fs.readFileSync(manifestPath, 'utf8');
            manifest = JSON.parse(rawManifest);
          } catch (e) {
            throw new Error(`Strategy validation failed in '${dirName}': 'manifest.json' is malformed JSON.`);
          }

          this.validateManifest(dirName, manifest);

          const strategyId = manifest.id.toLowerCase();
          
          // 3. Prevent duplicate strategy IDs
          if (this.cache.has(strategyId)) {
            throw new Error(`Strategy validation failed in '${dirName}': duplicate strategy ID '${manifest.id}' already registered.`);
          }

          // 4. Instantiate and validate class interface
          const StrategyClass = require(scriptPath);
          let strategyInstance;
          try {
            strategyInstance = new StrategyClass();
          } catch (e) {
            throw new Error(`Strategy validation failed in '${dirName}': failed to instantiate strategy class. Error: ${e.message}`);
          }

          this.validateInterface(dirName, strategyInstance);

          this.cache.set(strategyId, strategyInstance);
          this.manifests.set(strategyId, manifest);
        }
      }
    } catch (error) {
      console.error('Fatal: Failed to load judge strategy registry:', error);
      throw error;
    }
  }

  /**
   * Validates manifest structure
   */
  validateManifest(dirName, manifest) {
    if (!manifest.id || typeof manifest.id !== 'string' || manifest.id.trim() === '') {
      throw new Error(`Strategy validation failed in '${dirName}': 'id' string is required in manifest.`);
    }
    if (!manifest.version || typeof manifest.version !== 'string' || manifest.version.trim() === '') {
      throw new Error(`Strategy validation failed in '${dirName}': 'version' string is required in manifest.`);
    }
    if (!Array.isArray(manifest.supports)) {
      throw new Error(`Strategy validation failed in '${dirName}': 'supports' array is required in manifest.`);
    }
  }

  /**
   * Asserts strategy class conforms to base interface methods
   */
  validateInterface(dirName, instance) {
    const requiredMethods = ['getName', 'supports', 'validateConfiguration', 'judge'];
    for (const method of requiredMethods) {
      if (typeof instance[method] !== 'function') {
        throw new Error(`Strategy validation failed in '${dirName}': strategy class is missing required function '${method}()'.`);
      }
    }
  }

  clearCache() {
    this.cache.clear();
    this.manifests.clear();
  }

  /**
   * Re-reads strategies synchronously. Double-buffered for thread safety.
   */
  reload() {
    const newRegistry = new JudgeStrategyRegistry();
    this.cache = newRegistry.cache;
    this.manifests = newRegistry.manifests;
  }

  /**
   * Explicit validation check wrapper.
   */
  validate() {
    return true;
  }

  hasStrategy(id) {
    if (!id) return false;
    return this.cache.has(id.toLowerCase());
  }

  getAllStrategies() {
    return Array.from(this.manifests.values());
  }

  getSupportedStrategies() {
    return Array.from(this.cache.keys());
  }

  /**
   * Retrieves specific strategy class instance.
   */
  getStrategy(id) {
    if (!id) {
      throw new Error('Strategy ID is required.');
    }
    let key = id.toLowerCase();
    if (key === 'tokens') {
      key = 'token';
    }
    if (!this.cache.has(key)) {
      const available = this.getSupportedStrategies().join(', ');
      throw new Error(`Unknown judge strategy "${id}". Available: [${available}]`);
    }
    return this.cache.get(key);
  }
}

module.exports = new JudgeStrategyRegistry();
