'use strict';

const prisma = require('../../../prisma');
const queueService = require('./queueService');
const socketService = require('../../../services/socketService');
const codingService = require('./CodingService');

// Integrated Code Execution Engine, Assembly Engine, & Judge Strategies
const executionEngine = require('../../../services/execution/executionEngine');
const assemblyEngine = require('../../../services/assemblyEngine');
const judgeStrategyRegistry = require('../../../services/judgeStrategyRegistry');

function injectSmartAutoShim(language, code) {
  const lang = (language || '').toUpperCase();
  if (lang === 'PYTHON') {
    if ((code.includes('def ') || code.includes('class Solution')) && !code.includes("__name__ == '__main__'")) {
      const pyShim = `

# --- Auto Driver Wrapper ---
if __name__ == '__main__':
    import sys, json, ast, inspect
    try:
        raw_in = sys.stdin.read().strip()
        if raw_in:
            funcs = [obj for name, obj in list(globals().items()) 
                     if inspect.isfunction(obj) and obj.__module__ == '__main__' and not name.startswith('_')]
            if funcs:
                target_func = funcs[-1]
                def _parse_raw_args(raw_text):
                    if not raw_text: return []
                    raw_clean = raw_text.strip()
                    try:
                        val = ast.literal_eval(f"({raw_clean})")
                        if isinstance(val, tuple): return list(val)
                        return [val]
                    except Exception: pass
                    args = []
                    for line in raw_clean.splitlines():
                        line = line.strip()
                        if not line: continue
                        try:
                            val = ast.literal_eval(f"({line})")
                            if isinstance(val, tuple): args.extend(list(val)); continue
                            else: args.append(val); continue
                        except Exception: pass
                        try: args.append(ast.literal_eval(line)); continue
                        except Exception: pass
                        for p in line.split():
                            p = p.strip(',')
                            if p:
                                try: args.append(ast.literal_eval(p))
                                except Exception: args.append(p)
                    return args
                parsed_args = _parse_raw_args(raw_in)
                sig_params = len(inspect.signature(target_func).parameters)
                while len(parsed_args) < sig_params:
                    parsed_args.append(None)
                res = target_func(*parsed_args)
                if res is not None:
                    if isinstance(res, (list, dict, bool, int, float, str)):
                        print(json.dumps(res))
                    else:
                        print(res)
    except Exception:
        pass
`;
      return code + pyShim;
    }
  } else if (lang === 'JAVASCRIPT') {
    if ((code.includes('function ') || code.includes('=>')) && !code.includes('process.stdin')) {
      const jsShim = `

// --- Auto Driver Wrapper ---
if (typeof process !== 'undefined' && process.stdin) {
  let __rawInput = '';
  process.stdin.on('data', chunk => { __rawInput += chunk; });
  process.stdin.on('end', () => {
    __rawInput = __rawInput.trim();
    if (!__rawInput) return;
    try {
      let candidateFunc = null;
      if (typeof solve === 'function') candidateFunc = solve;
      else if (typeof twoSum === 'function') candidateFunc = twoSum;
      else {
        const globalKeys = Object.keys(global);
        for (let i = globalKeys.length - 1; i >= 0; i--) {
          if (typeof global[globalKeys[i]] === 'function' && !['fetch','setTimeout','clearTimeout','setInterval','clearInterval','queueMicrotask'].includes(globalKeys[i])) {
            candidateFunc = global[globalKeys[i]];
            break;
          }
        }
      }
      if (candidateFunc) {
        let args = [];
        try {
          let parsed = JSON.parse(\`[\${__rawInput}]\`);
          args = Array.isArray(parsed) ? parsed : [parsed];
        } catch(e) {
          args = [__rawInput];
        }
        const res = candidateFunc(...args);
        if (res !== undefined) {
          console.log(typeof res === 'object' ? JSON.stringify(res) : res);
        }
      }
    } catch(e) {}
  });
}
`;
      return code + jsShim;
    }
  }
  return code;
}

/**
 * CodingWorker
 * Polling background daemon that consumes compilation tasks and runs sandboxed execution engines.
 */
class CodingWorker {
  constructor() {
    this.isPolling = false;
  }

  /**
   * Spins up worker handlers for all coding queue channels.
   */
  start() {
    if (this.isPolling) return;
    this.isPolling = true;

    console.log('[CodingWorker] Polling worker active on queues: coding_run, coding_submit, code_execution');

    const workerFn = async (rawJob) => {
      try {
        await this.processJob(rawJob);
      } catch (err) {
        console.error('[CodingWorker] Failed to process coding execution job:', err.message);
      }
    };

    queueService.registerWorker('coding_run', workerFn);
    queueService.registerWorker('coding_submit', workerFn);
    queueService.registerWorker('code_execution', workerFn);
  }

  /**
   * Formats code inputs, wraps drivers via AssemblyEngine or injectSmartAutoShim, and runs compile checks.
   */
  async processJob(rawJob) {
    // Unwrap Redis / Memory job envelope if present
    const job = rawJob?.data || rawJob || {};
    let { userId, attemptId, questionId, code, language } = job;

    if (!userId || !attemptId || !questionId) {
      console.warn('[CodingWorker] Skipping invalid job payload (missing parameters):', job);
      return;
    }

    const jobType = job.jobType || (job.type === 'RUN' ? 'RUN_CODE' : job.type === 'SUBMIT' ? 'SUBMIT_CODE' : 'RUN_CODE');
    console.log(`[CodingWorker] Processing ${jobType} for user ${userId}, attempt ${attemptId}, question ${questionId}`);

    // Broadcast queue update (compiling state)
    socketService.broadcastCodingResult(userId, {
      attemptId,
      questionId,
      status: 'PROCESSING',
      message: `Compiling & executing ${language} in sandboxed zone...`
    });

    try {
      // 1. Fetch Question details (support both ExamVersionQuestion and base Question)
      let questionTitle = null;
      let questionDetails = null;

      const versionQuestion = await prisma.examVersionQuestion.findUnique({
        where: { id: questionId }
      }).catch(() => null);

      if (versionQuestion) {
        questionTitle = versionQuestion.title;
        questionDetails = versionQuestion.codingDetails || {};
      } else {
        const question = await prisma.question.findUnique({
          where: { id: questionId },
          include: {
            codingQuestion: {
              include: { testCases: true }
            }
          }
        }).catch(() => null);

        if (question) {
          questionTitle = question.title;
          questionDetails = question.codingQuestion || {};
        }
      }

      let testCases = job.testCases;
      let marks = job.maxMarks || 10;
      let judgeStrategyId = questionDetails?.judgeStrategy || 'tokens';
      let timeLimitMs = questionDetails?.timeLimit || job.timeLimit || 3000;

      if (!testCases || testCases.length === 0) {
        const allTestCases = questionDetails?.testCases || [];
        testCases = (jobType === 'RUN_CODE')
          ? allTestCases.filter((tc) => tc.isSample)
          : allTestCases;
      }

      if (!testCases || testCases.length === 0) {
        throw new Error('No evaluatable test cases defined for this problem');
      }

      // 2. Resolve Problem Spec for Assembly Engine (Driver Wrapping)
      let problemMeta = null;
      if (questionTitle) {
        try {
          const cleanTitle = questionTitle.split(' - ')[0].trim();
          const foundProblem = await prisma.problem.findFirst({
            where: {
              OR: [
                { title: { equals: questionTitle, mode: 'insensitive' } },
                { title: { equals: cleanTitle, mode: 'insensitive' } },
                { title: { contains: cleanTitle, mode: 'insensitive' } }
              ]
            }
          });

          if (foundProblem && foundProblem.functionName) {
            problemMeta = {
              category: foundProblem.category || 'FUNCTIONAL',
              functionName: foundProblem.functionName,
              returnType: foundProblem.returnType || 'INT',
              parameters: typeof foundProblem.parameters === 'string' ? JSON.parse(foundProblem.parameters) : (foundProblem.parameters || []),
              methods: typeof foundProblem.methods === 'string' ? JSON.parse(foundProblem.methods) : (foundProblem.methods || [])
            };
            if (foundProblem.judgeStrategy) {
              judgeStrategyId = foundProblem.judgeStrategy;
            }
          }
        } catch (e) {
          console.warn('[CodingWorker] Could not resolve problem metadata for assembly:', e.message);
        }
      }

      // 3. Assemble User Code with Driver Boilerplate wrapper or Smart Auto-Shim
      let userCode = code || '';
      if (typeof userCode === 'string' && userCode.trim().startsWith('{')) {
        const trimmed = userCode.trim();
        if (trimmed.includes('}') && (trimmed.includes('"Python"') || trimmed.includes('"python"') || trimmed.includes('"javascript"'))) {
          const braceEnd = trimmed.indexOf('}');
          if (braceEnd !== -1) {
            userCode = trimmed.substring(braceEnd + 1).trim();
          }
        }
      }
      code = userCode;

      let codeToRun = code;
      if (problemMeta) {
        try {
          codeToRun = assemblyEngine.assembleCode(language, code, problemMeta);
        } catch (asmErr) {
          console.warn('[CodingWorker] Assembly engine skipped, using auto-shim fallback:', asmErr.message);
          codeToRun = injectSmartAutoShim(language, code);
        }
      } else {
        codeToRun = injectSmartAutoShim(language, code);
      }

      // 4. Resolve judge strategy
      let judgeStrategy;
      try {
        judgeStrategy = judgeStrategyRegistry.getStrategy(judgeStrategyId);
      } catch (e) {
        judgeStrategy = judgeStrategyRegistry.getStrategy('tokens');
      }

      const results = [];
      let passedCount = 0;
      let totalWeight = 0;
      let earnedWeight = 0;
      let compilationStderr = null;

      // 5. Execute each test case using ExecutionEngine
      for (const tc of testCases) {
        let runResult;
        try {
          runResult = await executionEngine.executeCode(language, codeToRun, tc.input || '', {
            timeLimit: timeLimitMs,
            submissionId: `exam_${attemptId}_${questionId}_${tc.id}`
          });
        } catch (execError) {
          runResult = {
            stdout: '',
            stderr: execError.message,
            exitInfo: { code: 1, signal: null },
            metrics: {}
          };
        }

        const rawStdout = runResult.stdout || '';
        const rawStderr = runResult.stderr || '';

        if (runResult.exitInfo?.code !== 0 && rawStderr && !compilationStderr) {
          compilationStderr = rawStderr;
        }

        // Judge actual vs expected using configured strategy
        const exitCode = runResult.exitCode !== undefined ? runResult.exitCode : (runResult.exitInfo?.code ?? 1);
        const isSuccessExit = exitCode === 0 && !runResult.limitError;
        const passed = isSuccessExit && judgeStrategy.judge(tc.expectedOutput || '', rawStdout);

        if (passed) passedCount++;
        const weight = tc.weight || 1;
        totalWeight += weight;
        if (passed) earnedWeight += weight;

        results.push({
          id: tc.id,
          isSample: tc.isSample,
          input: tc.isSample ? tc.input : undefined,
          expectedOutput: tc.isSample ? tc.expectedOutput : undefined,
          actualOutput: tc.isSample ? rawStdout.trim() : undefined,
          passed,
          stderr: rawStderr || null,
          error: !passed ? (rawStderr || (runResult.limitError ? String(runResult.limitError) : 'Wrong Answer')) : null,
          executionTime: runResult.metrics?.wallTimeMs || runResult.metrics?.cpuTimeMs || 0
        });
      }

      const overallPass = passedCount === testCases.length;
      const finalScore = (jobType === 'SUBMIT_CODE' || jobType === 'SUBMIT') && totalWeight > 0
        ? (earnedWeight / totalWeight) * marks
        : 0.0;

      // 6. Save database results if final submission
      if (jobType === 'SUBMIT_CODE' || jobType === 'SUBMIT') {
        await prisma.$transaction(async (tx) => {
          const answer = await tx.answer.findFirst({
            where: { attemptId, questionId }
          });

          if (answer) {
            await tx.answer.update({
              where: { id: answer.id },
              data: {
                codingCode: code,
                codingLanguage: language,
                score: finalScore,
                isGraded: true,
                visited: true
              }
            });
          }

          const allAnswers = await tx.answer.findMany({
            where: { attemptId }
          });
          const newTotalScore = allAnswers.reduce((sum, a) => sum + (a.score || 0), 0);

          await tx.attempt.update({
            where: { id: attemptId },
            data: { score: newTotalScore }
          });
        });
      }

      // 7. Cache & Broadcast WebSocket result back to student workspace
      const resultPayload = {
        attemptId,
        questionId,
        status: 'FINISHED',
        jobType,
        passedCount,
        totalCount: testCases.length,
        overallPass,
        score: finalScore,
        stderr: compilationStderr,
        results
      };

      if (job.jobId) {
        codingService.storeResult(job.jobId, resultPayload);
      }
      socketService.broadcastCodingResult(userId, resultPayload);

    } catch (error) {
      console.error('[CodingWorker] Job execution failed:', error.message);
      const failPayload = {
        attemptId,
        questionId,
        status: 'FAILED',
        error: error.message
      };
      if (job.jobId) {
        codingService.storeResult(job.jobId, failPayload);
      }
      socketService.broadcastCodingResult(userId, failPayload);
    }
  }

  /**
   * Fallback runner helper utilizing ExecutionEngine.
   */
  async runSandbox(code, language, input, timeLimitMs) {
    try {
      const runRes = await executionEngine.executeCode(language, code, input || '', {
        timeLimit: timeLimitMs || 3000
      });
      return {
        stdout: runRes.stdout || '',
        stderr: runRes.stderr || '',
        exitCode: runRes.exitInfo?.code || 0,
        time: runRes.metrics?.wallTimeMs || 0
      };
    } catch (err) {
      return { stdout: '', stderr: err.message, exitCode: 1, time: 0 };
    }
  }
}

module.exports = new CodingWorker();
