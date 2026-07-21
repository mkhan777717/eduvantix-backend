const assert = require('assert');
const typeRegistry = require('./typeRegistry');

function runTests() {
  try {
    console.log('====================================================');
    console.log('  RUNNING TYPE REGISTRY UNIT TESTS                 ');
    console.log('====================================================');

    // 1. Assert exists checks
    assert.strictEqual(typeRegistry.hasType('INT'), true);
    assert.strictEqual(typeRegistry.hasType('int'), true, 'Registry search should be case-insensitive');
    assert.strictEqual(typeRegistry.hasType('STRING'), true);
    assert.strictEqual(typeRegistry.hasType('FLOAT'), true);
    assert.strictEqual(typeRegistry.hasType('BOOLEAN'), true);
    assert.strictEqual(typeRegistry.hasType('ARRAY_INT'), true);
    assert.strictEqual(typeRegistry.hasType('UNKNOWN_TYPE'), false);

    // 2. Assert list fetch
    const types = typeRegistry.getAllTypes();
    assert.ok(types.includes('INT'), 'Type list should contain INT');
    assert.ok(types.includes('ARRAY_INT'), 'Type list should contain ARRAY_INT');

    // 3. Assert primitive definitions (INT - CPP)
    const intCpp = typeRegistry.getType('INT', 'cpp');
    assert.strictEqual(intCpp.typeName, 'int');
    assert.strictEqual(intCpp.deserialize, 'stoi({varName})');
    assert.strictEqual(intCpp.serialize, 'to_string({varName})');
    assert.strictEqual(intCpp.library, null);
    assert.strictEqual(intCpp.cleanup, null);

    // 4. Assert collection definitions (ARRAY_INT - Python)
    const arrPython = typeRegistry.getType('ARRAY_INT', 'python');
    assert.strictEqual(arrPython.typeName, 'list[int]');
    assert.strictEqual(arrPython.deserialize, "([int(x) for x in ({varName}).strip().replace('[','').replace(']','').replace(',',' ').split()] if not ({varName}).strip().startswith('[') else json.loads({varName}))");
    assert.strictEqual(arrPython.serialize, "json.dumps({varName}, separators=(',', ':'))");
    assert.strictEqual(arrPython.library, null);

    // 5. Assert complex dependencies (ARRAY_INT - CPP)
    const arrCpp = typeRegistry.getType('ARRAY_INT', 'cpp');
    assert.strictEqual(arrCpp.typeName, 'vector<int>');
    assert.strictEqual(arrCpp.library, 'list/v1/cpp/list.hpp');
    assert.strictEqual(arrCpp.deserialize, 'parseVectorInt({varName})');

    // 6. Assert error throwing mechanisms
    assert.throws(() => {
      typeRegistry.getType('NON_EXISTENT_TYPE', 'cpp');
    }, /is not registered/, 'Should throw if type is missing');

    assert.throws(() => {
      typeRegistry.getType('INT', 'unsupported_language');
    }, /has no configuration defined/, 'Should throw if language is missing');

    console.log('✅ All Type Registry unit tests passed successfully!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Type Registry unit tests failed:', error.message);
    process.exit(1);
  }
}

// Run the script if executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
