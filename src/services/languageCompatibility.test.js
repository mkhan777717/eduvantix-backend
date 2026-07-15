const assert = require('assert');
const assemblyEngine = require('./assemblyEngine');
const localCompiler = require('./execution/backends/local/LocalCompiler');
const localRunner = require('./execution/backends/local/LocalRunner');

// User code solutions for all supported languages
const solutions = {
  twoSum: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [
        { name: 'nums', type: 'ARRAY_INT' },
        { name: 'target', type: 'INT' }
      ],
      returnType: 'ARRAY_INT',
      functionName: 'twoSum'
    },
    inputs: [
      '[2,7,11,15]\n9\n',
      '[3,2,4]\n6\n'
    ],
    expected: [
      '[0,1]\n',
      '[1,2]\n'
    ],
    code: {
      cpp: `
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        for(int i = 0; i < nums.size(); i++) {
            for(int j = i + 1; j < nums.size(); j++) {
                if(nums[i] + nums[j] == target) return {i, j};
            }
        }
        return {};
    }
};`,
      python: `
class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        for i in range(len(nums)):
            for j in range(i + 1, len(nums)):
                if nums[i] + nums[j] == target:
                    return [i, j]
        return []`,
      javascript: `
function twoSum(nums, target) {
    for(let i = 0; i < nums.length; i++) {
        for(let j = i + 1; j < nums.length; j++) {
            if(nums[i] + nums[j] === target) return [i, j];
        }
    }
    return [];
}`,
      java: `
class Solution {
    public int[] twoSum(int[] nums, int target) {
        for(int i = 0; i < nums.length; i++) {
            for(int j = i + 1; j < nums.length; j++) {
                if(nums[i] + nums[j] == target) return new int[]{i, j};
            }
        }
        return new int[0];
    }
}`,
      go: `
func twoSum(nums []int, target int) []int {
    for i := 0; i < len(nums); i++ {
        for j := i + 1; j < len(nums); j++ {
            if nums[i] + nums[j] == target {
                return []int{i, j}
            }
        }
    }
    return []int{}
}`,
      c: `
struct VectorInt twoSum(struct VectorInt nums, int target) {
    struct VectorInt res = { NULL, 0 };
    for(int i = 0; i < nums.size; i++) {
        for(int j = i + 1; j < nums.size; j++) {
            if(nums.data[i] + nums.data[j] == target) {
                res.data = (int*)malloc(2 * sizeof(int));
                res.data[0] = i;
                res.data[1] = j;
                res.size = 2;
                return res;
            }
        }
    }
    return res;
}`
    }
  },
  sameTree: {
    meta: {
      category: 'FUNCTIONAL',
      parameters: [
        { name: 'p', type: 'TreeNode' },
        { name: 'q', type: 'TreeNode' }
      ],
      returnType: 'BOOLEAN',
      functionName: 'isSameTree'
    },
    inputs: [
      '[1,2,3]\n[1,2,3]\n',
      '[1,2]\n[1,null,2]\n'
    ],
    expected: [
      'true\n',
      'false\n'
    ],
    code: {
      cpp: `
class Solution {
public:
    bool isSameTree(TreeNode* p, TreeNode* q) {
        if (!p && !q) return true;
        if (!p || !q) return false;
        return p->val == q->val && isSameTree(p->left, q->left) && isSameTree(p->right, q->right);
    }
};`,
      python: `
class Solution:
    def isSameTree(self, p: Optional[TreeNode], q: Optional[TreeNode]) -> bool:
        if not p and not q:
            return True
        if not p or not q:
            return False
        return p.val == q.val and self.isSameTree(p.left, q.left) and self.isSameTree(p.right, q.right)`,
      javascript: `
function isSameTree(p, q) {
    if (!p && !q) return true;
    if (!p || !q) return false;
    return p.val === q.val && isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
}`,
      java: `
class Solution {
    public boolean isSameTree(TreeNode p, TreeNode q) {
        if (p == null && q == null) return true;
        if (p == null || q == null) return false;
        return p.val == q.val && isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
    }
}`,
      go: `
func isSameTree(p *TreeNode, q *TreeNode) bool {
    if p == nil && q == nil {
        return true
    }
    if p == nil || q == nil {
        return false
    }
    return p.Val == q.Val && isSameTree(p.Left, q.Left) && isSameTree(p.Right, q.Right)
}`,
      c: `
bool isSameTree(struct TreeNode* p, struct TreeNode* q) {
    if (!p && !q) return true;
    if (!p || !q) return false;
    return p->val == q->val && isSameTree(p->left, q->left) && isSameTree(p->right, q->right);
}`
    }
  }
};

async function runMatrix() {
  console.log('====================================================');
  console.log('  RUNNING LANGUAGE COMPATIBILITY TEST MATRIX        ');
  console.log('====================================================');

  const targetLanguages = ['cpp', 'python', 'javascript', 'java', 'go', 'c'];

  for (const lang of targetLanguages) {
    console.log(`\nTesting language: [${lang.toUpperCase()}]`);

    for (const [probName, probSpec] of Object.entries(solutions)) {
      console.log(` - Problem: ${probName}`);
      const userCode = probSpec.code[lang];
      if (!userCode) {
        console.log(`   ⚠️ Skipped (no code registered)`);
        continue;
      }

      // 1. Code Assembly
      let assembledCode;
      try {
        assembledCode = assemblyEngine.assembleCode(lang, userCode, probSpec.meta);
      } catch (e) {
        console.error(`   ❌ Assembly failed:`, e.stack);
        process.exit(1);
      }

      // 2. Compilation
      let compileRes = localCompiler.compile(assembledCode, lang);
      if (!compileRes.success) {
        console.error(`   ❌ Compilation failed:`, compileRes.stderr);
        process.exit(1);
      }

      // 3. Execution on multiple test inputs
      for (let idx = 0; idx < probSpec.inputs.length; idx++) {
        const input = probSpec.inputs[idx];
        const expectedOutput = probSpec.expected[idx];

        let runRes;
        try {
          runRes = await localRunner.execute(compileRes.artifact, lang, input);
        } catch (e) {
          console.error(`   ❌ Runner Execution failed:`, e.stack);
          process.exit(1);
        }

        if (runRes.limitError) {
          console.error(`   ❌ Exec Limit Error:`, runRes.limitError.message);
          console.error(`      Full runRes:`, JSON.stringify(runRes, null, 2));
          process.exit(1);
        }

        if (runRes.exitInfo.code !== 0) {
          console.error(`   ❌ Exit issue: Code=${runRes.exitInfo.code}, Signal=${runRes.exitInfo.signal}`);
          console.error(`      Stdout:`, runRes.stdout);
          console.error(`      Stderr:`, runRes.stderr);
          console.error(`      Full runRes:`, JSON.stringify(runRes, null, 2));
          process.exit(1);
        }

        // Standardize newline formatting of stdout
        const stdoutClean = runRes.stdout.replace(/\r\n/g, '\n');
        try {
          assert.strictEqual(stdoutClean, expectedOutput);
          console.log(`   ✅ Testcase ${idx + 1} passed`);
        } catch (err) {
          console.error(`   ❌ Testcase ${idx + 1} mismatch!`);
          console.error(`      Expected: "${expectedOutput.replace('\n', '\\n')}"`);
          console.error(`      Got:      "${stdoutClean.replace('\n', '\\n')}"`);
          console.error(`      Stderr:   "${runRes.stderr}"`);
          process.exit(1);
        }
      }
    }
  }

  console.log('\n====================================================');
  console.log('✅ ALL LANGUAGES COMPATIBILITY MATRIX PASSED!');
  console.log('====================================================');
}

runMatrix().catch(e => {
  console.error('Fatal Matrix Failure:', e);
  process.exit(1);
});
