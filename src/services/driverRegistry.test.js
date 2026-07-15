const assert = require('assert');
const fs = require('fs');
const path = require('path');
const languageRegistry = require('./languageRegistry');
const driverRegistry = require('./driverRegistry');

function runTests() {
  try {
    console.log('====================================================');
    console.log('  RUNNING LANGUAGE & DRIVER REGISTRY UNIT TESTS    ');
    console.log('====================================================');

    // 1. Validate Language Registry Loading & Retrieval
    assert.strictEqual(languageRegistry.hasLanguage('cpp'), true);
    assert.strictEqual(languageRegistry.hasLanguage('python'), true);
    assert.strictEqual(languageRegistry.hasLanguage('javascript'), true);
    assert.strictEqual(languageRegistry.hasLanguage('unsupported_lang'), false);

    const cppLang = languageRegistry.getLanguage('cpp');
    assert.strictEqual(cppLang.extension, 'cpp');
    assert.strictEqual(cppLang.needsCompile, true);
    assert.strictEqual(cppLang.compileCmd, 'g++ -O3 -std=c++17 {srcPath} -o {outPath}');
    assert.strictEqual(cppLang.runCmd, '{outPath}');

    const pythonLang = languageRegistry.getLanguage('python');
    assert.strictEqual(pythonLang.extension, 'py');
    assert.strictEqual(pythonLang.needsCompile, false);
    assert.strictEqual(pythonLang.compileCmd, null);
    assert.strictEqual(pythonLang.runCmd, 'python3 {srcPath}');

    // 2. Validate Driver Registry Loading & Retrieval
    assert.strictEqual(driverRegistry.hasDriver('FUNCTIONAL', 'cpp'), true);
    assert.strictEqual(driverRegistry.hasDriver('FUNCTIONAL', 'python'), true);
    assert.strictEqual(driverRegistry.hasDriver('CLASS_DESIGN', 'javascript'), true);
    assert.strictEqual(driverRegistry.hasDriver('INTERACTIVE', 'cpp'), true);
    assert.strictEqual(driverRegistry.hasDriver('UNKNOWN_CATEGORY', 'cpp'), false);
    assert.strictEqual(driverRegistry.hasDriver('FUNCTIONAL', 'unknown_lang'), false);

    const cppFunctionalDriver = driverRegistry.getDriver('FUNCTIONAL', 'cpp');
    assert.ok(cppFunctionalDriver.includes('{{USER_CODE}}'), 'Template should contain USER_CODE placeholder');
    assert.ok(cppFunctionalDriver.includes('{{MAIN}}'), 'Template should contain MAIN placeholder');

    // 3. Test list lookups
    const categories = driverRegistry.getSupportedCategories();
    assert.ok(categories.includes('FUNCTIONAL'));
    assert.ok(categories.includes('CLASS_DESIGN'));
    assert.ok(categories.includes('INTERACTIVE'));

    const languages = driverRegistry.getSupportedLanguages();
    assert.ok(languages.includes('cpp'));
    assert.ok(languages.includes('python'));
    assert.ok(languages.includes('javascript'));

    // 4. Test error boundaries
    assert.throws(() => {
      driverRegistry.getDriver('UNKNOWN_CATEGORY', 'cpp');
    }, /is not registered/, 'Should throw if category is not registered');

    assert.throws(() => {
      driverRegistry.getDriver('FUNCTIONAL', 'unknown_language');
    }, /is not registered/, 'Should throw if language driver is not registered');

    assert.throws(() => {
      languageRegistry.getLanguage('unknown_language');
    }, /is not registered/, 'Should throw if language is not registered');

    // 5. Test config validations (Fail-Fast Verification)
    const malformedLangConfig = {
      language: '',
      version: '1.0',
      extension: 'tst',
      sourceFile: 'main.tst',
      executionMode: 'interpreted',
      run: { command: 'test', args: [] },
      supports: { functional: true },
      runtimeLibraries: [],
      docker: { image: 'test:1.0' }
    };
    assert.throws(() => {
      languageRegistry.validateConfig('malformed.json', malformedLangConfig);
    }, /'language' string is required/, 'Should fail language validation if name is empty');

    const missingCompileCmdConfig = {
      language: 'compileTest',
      version: '1.0',
      extension: 'tst',
      sourceFile: 'main.tst',
      executionMode: 'compiled',
      run: { command: 'test', args: [] },
      supports: { functional: true },
      runtimeLibraries: [],
      docker: { image: 'test:1.0' }
    };
    assert.throws(() => {
      languageRegistry.validateConfig('missingCompile.json', missingCompileCmdConfig);
    }, /structured 'compile' object is required/, 'Should fail validation if compile is missing for compiled lang');

    // 6. Reload & Clear cache testing
    driverRegistry.reload();
    assert.strictEqual(driverRegistry.hasDriver('FUNCTIONAL', 'cpp'), true, 'Should still resolve driver after reload');

    console.log('✅ Language and Driver Registry unit tests passed successfully!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Language and Driver Registry unit tests failed:', error.stack);
    process.exit(1);
  }
}

// Run the script if executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
