const assert = require('assert');
const typeRegistry = require('./typeRegistry');
const languageRegistry = require('./languageRegistry');
const driverRegistry = require('./driverRegistry');
const dependencyResolver = require('./dependencyResolver');
const runtimeResolver = require('./runtimeResolver');
const templateRenderer = require('./templateRenderer');
const wrapperValidator = require('./wrapperValidator');
const assemblyEngine = require('./assemblyEngine');

function runTests() {
  try {
    console.log('====================================================');
    console.log('  RUNNING CODE ASSEMBLY ENGINE UNIT TESTS          ');
    console.log('====================================================');

    // Make sure registries are loaded
    typeRegistry.refresh();
    languageRegistry.reload();
    driverRegistry.reload();

    // 1. Test Primitive Problem Assembly (CPP, Python, JS)
    console.log('1. Testing Primitive Problem (Two Sum)...');
    const primMeta = {
      category: 'FUNCTIONAL',
      parameters: [
        { name: 'nums', type: 'ARRAY_INT' },
        { name: 'target', type: 'INT' }
      ],
      returnType: 'ARRAY_INT',
      functionName: 'twoSum'
    };
    const cppUserCode = 'class Solution { public: vector<int> twoSum(vector<int>& nums, int target) { return nums; } };';
    
    // C++ Primitive Wrapper Test
    const cppCode = assemblyEngine.assembleCode('cpp', cppUserCode, primMeta);
    assert.ok(cppCode.includes('#include <iostream>'), 'Should contain standard headers');
    assert.ok(cppCode.includes('Solution solver;'), 'Should instantiate Solution');
    assert.ok(cppCode.includes('twoSum(nums, target)'), 'Should invoke solve function');
    assert.ok(cppCode.includes('parseVectorInt'), 'Should include vector parsing');
    assert.ok(!cppCode.includes('TreeNode'), 'Should NOT include Tree Node headers');
    
    // Python Primitive Wrapper Test
    const pyCode = assemblyEngine.assembleCode('python', 'def twoSum(self, nums, target): return nums', primMeta);
    assert.ok(pyCode.includes('import sys'), 'Should import sys');
    assert.ok(pyCode.includes('json.loads'), 'Should parse JSON arrays');
    
    // JS Primitive Wrapper Test
    const jsCode = assemblyEngine.assembleCode('javascript', 'function twoSum(nums, target) { return nums; }', primMeta);
    assert.ok(jsCode.includes('JSON.parse'), 'Should parse JSON arrays');
    console.log('   Primitive assembly: Passed ✅');

    // 2. Test TreeNode Problem Assembly (Structural inlining)
    console.log('2. Testing TreeNode Problem (Same Tree)...');
    const treeMeta = {
      category: 'FUNCTIONAL',
      parameters: [
        { name: 'p', type: 'TreeNode' },
        { name: 'q', type: 'TreeNode' }
      ],
      returnType: 'BOOLEAN',
      functionName: 'isSameTree'
    };
    const treeCppCode = assemblyEngine.assembleCode('cpp', '// user tree solution', treeMeta);
    assert.ok(treeCppCode.includes('struct TreeNode'), 'Should inline TreeNode structure');
    assert.ok(treeCppCode.includes('deserializeTree'), 'Should inline deserializeTree');
    assert.ok(treeCppCode.includes('freeTree(p);'), 'Should clean up memory allocation p');
    assert.ok(treeCppCode.includes('freeTree(q);'), 'Should clean up memory allocation q');
    console.log('   TreeNode assembly: Passed ✅');

    // 3. Test ListNode Problem Assembly
    console.log('3. Testing ListNode Problem...');
    const listMeta = {
      category: 'FUNCTIONAL',
      parameters: [{ name: 'head', type: 'ListNode' }],
      returnType: 'ListNode',
      functionName: 'solve'
    };
    const listPyCode = assemblyEngine.assembleCode('python', '# python solve', listMeta);
    assert.ok(listPyCode.includes('class ListNode:'), 'Should inline python ListNode class');
    console.log('   ListNode assembly: Passed ✅');

    // 4. Test GraphNode Problem Assembly
    console.log('4. Testing GraphNode Problem...');
    const graphMeta = {
      category: 'FUNCTIONAL',
      parameters: [{ name: 'node', type: 'GraphNode' }],
      returnType: 'GraphNode',
      functionName: 'solve'
    };
    const graphJsCode = assemblyEngine.assembleCode('javascript', '// js solve', graphMeta);
    assert.ok(graphJsCode.includes('class Node'), 'Should inline JavaScript Node class');
    console.log('   GraphNode assembly: Passed ✅');

    // 5. Test Duplicate Runtime Imports Deduplication
    console.log('5. Testing Duplicate Runtime Deduplication...');
    // treeMeta has 2 TreeNodes (p and q). Assert that 'struct TreeNode' is declared exactly once in C++.
    const firstOccur = treeCppCode.indexOf('struct TreeNode');
    const lastOccur = treeCppCode.lastIndexOf('struct TreeNode');
    assert.strictEqual(firstOccur, lastOccur, 'TreeNode class should only be inlined exactly once');
    console.log('   Duplicate runtimes deduplication: Passed ✅');

    // 6. Test Error Boundaries (Unsupported language)
    console.log('6. Testing Unsupported Language boundary...');
    assert.throws(() => {
      assemblyEngine.assembleCode('rust_lang', '// dummy code', primMeta);
    }, /Unsupported language/, 'Should throw if language is not registered');
    console.log('   Unsupported language check: Passed ✅');

    // 7. Test Missing template boundary
    console.log('7. Testing Missing Template boundary...');
    assert.throws(() => {
      assemblyEngine.assembleCode('cpp', '// dummy code', { category: 'SQL_PROBLEM', parameters: [], returnType: 'INT' });
    }, /Driver template for category/, 'Should throw if driver template is missing');
    console.log('   Missing template check: Passed ✅');

    // 8. Test Invalid Placeholder (Unresolved tags check)
    console.log('8. Testing Validator Placeholder check...');
    // Feeding raw unresolved placeholder string
    assert.throws(() => {
      wrapperValidator.validate('int main() { return 0; } // {{MISSING_VAR}}');
    }, /Unresolved/, 'Should throw if unresolved placeholder remains');
    console.log('   Validator placeholder checks: Passed ✅');

    // 9. Test Robust main() detection in User Code
    console.log('9. Testing robust main() detection in User Code...');
    const withMainC = `
      // This is a test comment with main()
      /* Another comment main() */
      char* test_str = "int main() { ... }";
      int main() {
          return 0;
      }
    `;
    const assembledWithMain = assemblyEngine.assembleCode('c', withMainC, primMeta);
    assert.ok(!assembledWithMain.includes('nums = readIntArray();'), 'Should NOT generate wrapper main body if user has main()');
    assert.ok(assembledWithMain.includes('int main() {'), 'Should contain the user\'s own main()');
    console.log('   Robust main() detection: Passed ✅');

    // 10. Golden snapshot test for C wrapper
    console.log('10. Running C wrapper golden snapshot test...');
    const goldenMeta = {
      category: 'FUNCTIONAL',
      parameters: [
        { name: 'nums', type: 'ARRAY_INT' },
        { name: 'target', type: 'INT' }
      ],
      returnType: 'ARRAY_INT',
      functionName: 'twoSum'
    };
    const userCode = 'struct VectorInt twoSum(struct VectorInt nums, int target) { return nums; }';
    const generatedC = assemblyEngine.assembleCode('c', userCode, goldenMeta);

    // Normalize newlines and trim
    const normalizedGen = generatedC.replace(/\r\n/g, '\n').trim();
    assert.ok(normalizedGen.includes('struct VectorInt nums = readIntArray();'), 'Snapshot mismatch: parameter reading');
    assert.ok(normalizedGen.includes('int target = readInt();'), 'Snapshot mismatch: parameter reading');
    assert.ok(normalizedGen.includes('struct VectorInt result = twoSum(nums, target);'), 'Snapshot mismatch: user call');
    assert.ok(normalizedGen.includes('printf("%s\\n", serializeVectorInt(result));'), 'Snapshot mismatch: serialization');
    assert.ok(normalizedGen.includes('freeVectorInt(nums);'), 'Snapshot mismatch: memory cleanup');
    assert.ok(normalizedGen.includes('freeVectorInt(result);'), 'Snapshot mismatch: memory cleanup');
    assert.ok(normalizedGen.includes('int main() {'), 'Snapshot mismatch: main wrapper');
    console.log('   Golden C snapshot test: Passed ✅');

    console.log('✅ All Code Assembly Engine tests passed successfully!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Code Assembly Engine tests failed:', error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
