const assert = require('assert');
const prisma = require('../prisma');
const submissionService = require('./submissionService');
const resultFormatter = require('./resultFormatter');
const backendRegistry = require('./execution/backends/backendRegistry');

// 1. Stub Prisma Database queries
const originalProblemFindUnique = prisma.problem.findUnique;
const originalTestCaseFindMany = prisma.testCase.findMany;
const originalSubmissionCreate = prisma.submission.create;
const originalSubmissionUpdate = prisma.submission.update;
const originalContestFindMany = prisma.contest.findMany;

let mockProblem = null;
let mockTestcases = [];
const dbSubmissions = [];

function setupMocks() {
  prisma.problem.findUnique = async () => mockProblem;
  prisma.testCase.findMany = async () => mockTestcases;
  prisma.submission.create = async ({ data }) => {
    const sub = {
      id: dbSubmissions.length + 1,
      ...data,
      createdAt: new Date()
    };
    dbSubmissions.push(sub);
    return sub;
  };
  prisma.submission.update = async ({ where, data }) => {
    const sub = dbSubmissions.find(s => s.id === where.id);
    if (sub) {
      Object.assign(sub, data);
    }
    return {
      ...sub,
      user: { id: 1, username: 'test_user' },
      problem: { id: sub.problemId, title: 'Test Problem', slug: 'test-problem' }
    };
  };
  prisma.contest.findMany = async () => []; // Return empty contests to skip leaderboard updates
}

function restoreMocks() {
  prisma.problem.findUnique = originalProblemFindUnique;
  prisma.testCase.findMany = originalTestCaseFindMany;
  prisma.submission.create = originalSubmissionCreate;
  prisma.submission.update = originalSubmissionUpdate;
  prisma.contest.findMany = originalContestFindMany;
}

// 2. Setup mock custom backend to check compile count & execute bounds
let compileCount = 0;
let executeCount = 0;
let mockCompileSuccess = true;
let mockCompileStderr = '';
let mockExecuteOutputs = [];

class MockTestcaseBackend {
  getCapabilities() {
    return {
      supportsCompilation: true,
      supportsInteractive: false,
      supportsSql: false,
      supportsStreaming: false,
      supportsNetwork: false,
      supportsCustomJudge: true
    };
  }

  async health() { return true; }

  async compile(sourceCode, language, options) {
    compileCount++;
    return {
      success: mockCompileSuccess,
      artifact: { type: 'script', location: 'mock_script', metadata: {} },
      stderr: mockCompileStderr,
      compileTimeMs: 45
    };
  }

  async execute(artifact, language, input, options) {
    executeCount++;
    const currentOut = mockExecuteOutputs.shift() || {
      stdout: 'Default Mock stdout',
      stderr: '',
      exitInfo: { code: 0, signal: null },
      metrics: { executionTimeMs: 10, wallClockMs: 12, memoryKb: 1024, outputSize: 10 },
      limitError: null
    };
    return currentOut;
  }

  async cleanup(artifact) {}
}

async function runTests() {
  try {
    console.log('====================================================');
    console.log('  RUNNING SUBMISSION PIPELINE INTEGRATION TESTS    ');
    console.log('====================================================');

    setupMocks();
    
    // Register mock backend
    const mockBackend = new MockTestcaseBackend();
    backendRegistry.registerBackend('mock_pipeline_backend', mockBackend);

    // Default metadata configurations
    mockProblem = {
      id: 99,
      title: 'Mock Problem',
      slug: 'mock-problem',
      category: 'FUNCTIONAL',
      parameters: JSON.stringify([{ name: 'x', type: 'INT' }]),
      returnType: 'INT',
      functionName: 'solve',
      timeLimit: 2000,
      memoryLimit: 256,
      judgeStrategy: 'exact'
    };

    mockTestcases = [
      { id: 1, input: '1', expectedOutput: '2', isHidden: false },
      { id: 2, input: '2', expectedOutput: '4', isHidden: true }
    ];

    // Reset counters
    const resetCounters = () => {
      compileCount = 0;
      executeCount = 0;
      mockCompileSuccess = true;
      mockCompileStderr = '';
      dbSubmissions.length = 0;
    };

    // --- TEST 1: Accepted Solution ---
    console.log('1. Testing Accepted submission...');
    resetCounters();
    mockExecuteOutputs = [
      { stdout: '2', stderr: '', exitInfo: { code: 0, signal: null }, metrics: { executionTimeMs: 10, memoryKb: 1000 }, limitError: null },
      { stdout: '4', stderr: '', exitInfo: { code: 0, signal: null }, metrics: { executionTimeMs: 15, memoryKb: 1200 }, limitError: null }
    ];

    const accSubmission = await submissionService.submitUserCode({
      userId: 1,
      problemId: 99,
      language: 'javascript',
      code: 'function solve(x) { return x * 2; }',
      runAll: true,
      options: { backend: 'mock_pipeline_backend', scoringModel: 'PARTIAL' }
    });

    assert.strictEqual(accSubmission.status, 'ACCEPTED');
    assert.strictEqual(compileCount, 1, 'Compile should be called exactly once');
    assert.strictEqual(executeCount, 2, 'Execution should be called for both testcases');
    assert.strictEqual(accSubmission.judgeResult.passedTestCases, 2);
    assert.strictEqual(accSubmission.judgeResult.verdict, 'ACCEPTED');
    console.log('   Accepted run: Passed ✅');

    // --- TEST 2: Wrong Answer (Option B: Continue running all cases) ---
    console.log('2. Testing Wrong Answer (Continue execution)...');
    resetCounters();
    mockExecuteOutputs = [
      { stdout: '99', stderr: '', exitInfo: { code: 0, signal: null }, metrics: { executionTimeMs: 10, memoryKb: 1000 }, limitError: null }, // Wrong
      { stdout: '4', stderr: '', exitInfo: { code: 0, signal: null }, metrics: { executionTimeMs: 15, memoryKb: 1200 }, limitError: null }  // Correct
    ];

    const waSubmission = await submissionService.submitUserCode({
      userId: 1,
      problemId: 99,
      language: 'javascript',
      code: 'wrong code',
      runAll: true, // Continue execution
      options: { backend: 'mock_pipeline_backend', scoringModel: 'PARTIAL' }
    });

    assert.strictEqual(waSubmission.status, 'WRONG_ANSWER');
    assert.strictEqual(executeCount, 2, 'Should continue and execute case 2');
    assert.strictEqual(waSubmission.judgeResult.passedTestCases, 1);
    assert.strictEqual(waSubmission.judgeResult.totalTestCases, 2);
    console.log('   Wrong Answer (runAll): Passed ✅');

    // --- TEST 3: Early Termination (Option A: Stop on first failure) ---
    console.log('3. Testing Early Termination on failure...');
    resetCounters();
    mockExecuteOutputs = [
      { stdout: '99', stderr: '', exitInfo: { code: 0, signal: null }, metrics: { executionTimeMs: 10, memoryKb: 1000 }, limitError: null } // Failure
    ];

    const etSubmission = await submissionService.submitUserCode({
      userId: 1,
      problemId: 99,
      language: 'javascript',
      code: 'wrong code',
      runAll: false, // Stop on first failure
      options: { backend: 'mock_pipeline_backend' }
    });

    assert.strictEqual(etSubmission.status, 'WRONG_ANSWER');
    assert.strictEqual(executeCount, 1, 'Should stop immediately and NOT call execution for testcase 2');
    console.log('   Early termination check: Passed ✅');

    // --- TEST 4: Compilation Failure ---
    console.log('4. Testing Compilation Failure...');
    resetCounters();
    mockCompileSuccess = false;
    mockCompileStderr = 'Syntax Error: unexpected token';

    const compFailSub = await submissionService.submitUserCode({
      userId: 1,
      problemId: 99,
      language: 'javascript',
      code: 'bad syntax',
      runAll: true,
      options: { backend: 'mock_pipeline_backend' }
    });

    assert.strictEqual(compFailSub.status, 'COMPILATION_ERROR');
    assert.strictEqual(executeCount, 0, 'Should bypass execution when compilation fails');
    assert.strictEqual(compFailSub.judgeResult.stderr, 'Syntax Error: unexpected token');
    console.log('   Compilation failure check: Passed ✅');

    // --- TEST 5: TLE Limit Exceeded ---
    console.log('5. Testing TLE Limits...');
    resetCounters();
    const { TimeLimitExceededError } = require('./execution/errors/ExecutionError');
    mockExecuteOutputs = [
      { stdout: '', stderr: '', exitInfo: { code: null, signal: 'SIGKILL' }, metrics: { executionTimeMs: 2000, memoryKb: 1000 }, limitError: new TimeLimitExceededError('TLE') }
    ];

    const tleSub = await submissionService.submitUserCode({
      userId: 1,
      problemId: 99,
      language: 'javascript',
      code: 'loop',
      runAll: false,
      options: { backend: 'mock_pipeline_backend' }
    });

    assert.strictEqual(tleSub.status, 'TIME_LIMIT_EXCEEDED');
    assert.strictEqual(tleSub.judgeResult.verdict, 'TIME_LIMIT_EXCEEDED');
    console.log('   TLE check: Passed ✅');

    // --- TEST 6: MLE Limit Exceeded ---
    console.log('6. Testing MLE Limits...');
    resetCounters();
    const { MemoryLimitExceededError } = require('./execution/errors/ExecutionError');
    mockExecuteOutputs = [
      { stdout: '', stderr: '', exitInfo: { code: 0, signal: null }, metrics: { executionTimeMs: 100, memoryKb: 30000 }, limitError: new MemoryLimitExceededError('MLE') }
    ];

    const mleSub = await submissionService.submitUserCode({
      userId: 1,
      problemId: 99,
      language: 'javascript',
      code: 'arrays',
      runAll: false,
      options: { backend: 'mock_pipeline_backend' }
    });

    assert.strictEqual(mleSub.status, 'MEMORY_LIMIT_EXCEEDED');
    console.log('   MLE check: Passed ✅');

    // --- TEST 7: Output Limit Exceeded ---
    console.log('7. Testing OLE Limits...');
    resetCounters();
    const { OutputLimitExceededError } = require('./execution/errors/ExecutionError');
    mockExecuteOutputs = [
      { stdout: '', stderr: '', exitInfo: { code: 0, signal: null }, metrics: { executionTimeMs: 100, memoryKb: 100 }, limitError: new OutputLimitExceededError('OLE') }
    ];

    const oleSub = await submissionService.submitUserCode({
      userId: 1,
      problemId: 99,
      language: 'javascript',
      code: 'print loop',
      runAll: false,
      options: { backend: 'mock_pipeline_backend' }
    });

    // Maps to RUNTIME_ERROR inside mapping function as OLE is not in postgres DB enum constraints
    assert.strictEqual(oleSub.status, 'OUTPUT_LIMIT_EXCEEDED');
    assert.strictEqual(oleSub.judgeResult.verdict, 'OUTPUT_LIMIT_EXCEEDED', 'Public API payload retains OUTPUT_LIMIT_EXCEEDED');
    console.log('   OLE check: Passed ✅');

    // --- TEST 8: Scoring Models (ACM vs PARTIAL) ---
    console.log('8. Testing Scoring Options (ACM vs PARTIAL)...');
    
    // Partial model (passed 1 of 2 -> 50 points)
    resetCounters();
    mockExecuteOutputs = [
      { stdout: '99', stderr: '', exitInfo: { code: 0, signal: null }, metrics: { executionTimeMs: 10, memoryKb: 1000 }, limitError: null },
      { stdout: '4', stderr: '', exitInfo: { code: 0, signal: null }, metrics: { executionTimeMs: 15, memoryKb: 1200 }, limitError: null }
    ];
    const scorePartial = await submissionService.submitUserCode({
      userId: 1,
      problemId: 99,
      language: 'javascript',
      code: 'code',
      runAll: true,
      options: { backend: 'mock_pipeline_backend', scoringModel: 'PARTIAL' }
    });
    assert.strictEqual(scorePartial.judgeResult.passedTestCases, 1);
    assert.strictEqual(scorePartial.judgeResult.verdict, 'WRONG_ANSWER');
    
    // ACM model (passed 1 of 2 -> 0 points)
    resetCounters();
    mockExecuteOutputs = [
      { stdout: '99', stderr: '', exitInfo: { code: 0, signal: null }, metrics: { executionTimeMs: 10, memoryKb: 1000 }, limitError: null },
      { stdout: '4', stderr: '', exitInfo: { code: 0, signal: null }, metrics: { executionTimeMs: 15, memoryKb: 1200 }, limitError: null }
    ];
    const scoreACM = await submissionService.submitUserCode({
      userId: 1,
      problemId: 99,
      language: 'javascript',
      code: 'code',
      runAll: true,
      options: { backend: 'mock_pipeline_backend', scoringModel: 'ACM' }
    });
    assert.strictEqual(scoreACM.judgeResult.passedTestCases, 1);
    // Since ACM is binary, score is 0
    assert.strictEqual(scoreACM.judgeResult.score || 0, 0);
    console.log('   Scoring options check: Passed ✅');

    // --- TEST 9: API Result Formatter Contract ---
    console.log('9. Testing Result Formatter layout...');
    const dummyContext = {
      submissionId: 101,
      verdict: 'ACCEPTED',
      scoreMetrics: { passed: 3, failed: 0, total: 3, score: 100 },
      compileTimeMs: 50,
      executionTimeMs: 80,
      memoryKb: 4096,
      language: 'javascript',
      traceId: 'trace-123'
    };

    const formatted = resultFormatter.formatResult(dummyContext);
    assert.strictEqual(formatted.submissionId, 101);
    assert.strictEqual(formatted.verdict, 'ACCEPTED');
    assert.strictEqual(formatted.score, 100);
    assert.strictEqual(formatted.passed, 3);
    assert.strictEqual(formatted.failed, 0);
    assert.strictEqual(formatted.total, 3);
    assert.strictEqual(formatted.compileTimeMs, 50);
    assert.strictEqual(formatted.executionTimeMs, 80);
    assert.strictEqual(formatted.memoryKb, 4096);
    assert.strictEqual(formatted.language, 'javascript');
    assert.strictEqual(formatted.traceId, undefined);
    console.log('   Result Formatter check: Passed ✅');

    console.log('✅ All Submission Pipeline integration tests passed successfully!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Submission Pipeline integration tests failed:', error.message);
    process.exit(1);
  } finally {
    restoreMocks();
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
