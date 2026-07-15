const fs = require('fs');
const path = require('path');
const languageRegistry = require('./languageRegistry');

class DriverRegistry {
  constructor() {
    this.driversDir = path.join(__dirname, '../registry/drivers');
    this.cache = new Map(); // Key: "category:language", Value: template string
    this.categories = new Set();
    this.languages = new Set();
    this.loadAllDrivers();
  }

  /**
   * Scans src/registry/drivers/{language}/{category}_v1.template dynamically.
   */
  loadAllDrivers() {
    try {
      if (!fs.existsSync(this.driversDir)) {
        return;
      }

      const langDirs = fs.readdirSync(this.driversDir);
      for (const langDir of langDirs) {
        const langPath = path.join(this.driversDir, langDir);
        
        if (fs.statSync(langPath).isDirectory()) {
          const langId = langDir.toLowerCase();

          // Validate that the language is supported in the LanguageRegistry
          if (!languageRegistry.hasLanguage(langId)) {
            throw new Error(`Driver template validation failed: language directory '${langDir}' is not registered in the LanguageRegistry.`);
          }

          const templateFiles = fs.readdirSync(langPath);
          for (const file of templateFiles) {
            if (file.endsWith('_v1.template')) {
              // Parse category (e.g. class_design_v1.template -> CLASS_DESIGN)
              const category = file.replace('_v1.template', '').toUpperCase();
              this.categories.add(category);

              const filePath = path.join(langPath, file);
              const templateContent = fs.readFileSync(filePath, 'utf8');

              // Strict validation: templates must not be empty
              if (!templateContent || templateContent.trim() === '') {
                throw new Error(`Driver template validation failed: template file '${langDir}/${file}' is empty.`);
              }

              const cacheKey = this.buildKey(category, langId);
              this.cache.set(cacheKey, templateContent);
              this.languages.add(langId);
            }
          }
        }
      }
    } catch (error) {
      console.error('Fatal: Failed to load driver templates:', error);
      throw error;
    }
  }

  buildKey(category, language) {
    return `${category.toLowerCase()}:${language.toLowerCase()}`;
  }

  clearCache() {
    this.cache.clear();
    this.categories.clear();
    this.languages.clear();
  }

  reload() {
    this.clearCache();
    this.loadAllDrivers();
  }

  getSupportedCategories() {
    return Array.from(this.categories);
  }

  getSupportedLanguages() {
    return Array.from(this.languages).map(l => l.toLowerCase());
  }

  hasDriver(category, language) {
    if (!category || !language) return false;
    return this.cache.has(this.buildKey(category, language));
  }

  getDriver(category, language) {
    if (!category || !language) {
      throw new Error('Category and Language are required to get driver.');
    }
    const key = this.buildKey(category, language);
    if (!this.cache.has(key)) {
      throw new Error(`Driver template for category '${category}' and language '${language}' is not registered.`);
    }
    return this.cache.get(key);
  }
}

module.exports = new DriverRegistry();
