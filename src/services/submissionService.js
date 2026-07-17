const prisma = require('../prisma');
const languageRegistry = require('./languageRegistry');
const problemLoader = require('./problemLoader');
const testcaseLoader = require('./testcaseLoader');
const assemblyEngine = require('./assemblyEngine');
const executionEngine = require('./execution/executionEngine');
const judgeStrategyRegistry = require('./judgeStrategyRegistry');
const verdictService = require('./verdictService');
const scoreCalculator = require('./scoreCalculator');
const resultFormatter = require('./resultFormatter');
const { broadcastLiveSubmission, broadcastLeaderboardUpdate } = require('./socketService');

// State transition definitions
const ALLOWED_TRANSITIONS = {
  'PENDING': ['ASSEMBLING', 'FAILED'],
  'ASSEMBLING': ['COMPILING', 'FAILED'],
  'COMPILING': ['RUNNING', 'FAILED'],
  'RUNNING': ['JUDGING', 'COMPLETED', 'FAILED'],
  'JUDGING': ['RUNNING', 'COMPLETED', 'FAILED']
};

class PipelineHooks {
  constructor() {
    this.hooks = {
      beforeCompile: [],
      afterCompile: [],
      beforeExecution: [],
      afterExecution: [],
      beforeJudge: [],
      afterJudge: [],
      beforePersist: [],
      afterPersist: []
    };
  }

  register(hookName, callback) {
    if (this.hooks[hookName]) {
      this.hooks[hookName].push(callback);
    }
  }

  async trigger(hookName, context) {
    if (this.hooks[hookName]) {
      for (const cb of this.hooks[hookName]) {
        try {
          await cb(context);
        } catch (e) {
          console.error(`Hook error in ${hookName}:`, e);
        }
      }
    }
  }
}

/**
 * Normalizes language inputs matching Prisma schema enums.
 */
function normalizeDbLanguage(language) {
  const lang = language.toLowerCase();
  try {
    const config = languageRegistry.getLanguage(lang);
    if (config && config.dbLanguage) {
      return config.dbLanguage;
    }
  } catch (e) {
    // H-5: Don't silently map unknown languages to CPP
    console.warn(`[normalizeDbLanguage] Unknown language '${language}', storing raw uppercase.`);
  }
  // Return the language uppercased as a best-effort rather than lying and saying CPP
  return language.toUpperCase();
}

/**
 * Safely maps judge verdicts to Postgres DB status constraints.
 */
function mapVerdictToDbStatus(verdict) {
  const dbEnumVerdicts = [
    'ACCEPTED',
    'WRONG_ANSWER',
    'RUNTIME_ERROR',
    'COMPILATION_ERROR',
    'TIME_LIMIT_EXCEEDED',
    'PENDING',
    'MEMORY_LIMIT_EXCEEDED',
    'OUTPUT_LIMIT_EXCEEDED', // H-6: Now mapped correctly
    'INTERNAL_ERROR'
  ];
  if (dbEnumVerdicts.includes(verdict)) {
    return verdict;
  }
  // Safe fallback for any unmapped future statuses
  return 'RUNTIME_ERROR';
}

const submitUserCode = async ({ userId, problemId, language, code, runAll = false, options = {} }) => {
  const traceId = options.traceId || `trace_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  // 1. Initialize Pipeline Context
  const context = {
    submissionId: null,
    userId,
    problemId,
    language,
    code,
    traceId,
    state: 'PENDING',
    problemMeta: null,
    testcases: [],
    assembledSource: '',
    artifact: null,
    testcaseResults: [],
    finalVerdict: null,
    scoreMetrics: null,
    compileTimeMs: 0,
    executionTimeMs: 0,
    memoryKb: 0
  };

  const transitionTo = (newState) => {
    const current = context.state;
    if (ALLOWED_TRANSITIONS[current] && !ALLOWED_TRANSITIONS[current].includes(newState)) {
      console.warn(`Invalid state transition requested: ${current} -> ${newState}`);
    }
    context.state = newState;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Submission: ${context.submissionId || 'Pending'}] [State: ${newState}]`);
    }
  };

  const hooks = new PipelineHooks();
  // Register basic log hooks
  hooks.register('beforeCompile', (ctx) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Trace: ${ctx.traceId}] Compilation hook triggered`);
    }
  });
  hooks.register('afterCompile', (ctx) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Trace: ${ctx.traceId}] Compilation finished hook triggered`);
    }
  });

  let compileResult = null;
  const backendId = options.backend || process.env.CODE_EXECUTION_BACKEND || 'local';

  try {
    // 2. Load Problem specs & Testcases
    context.problemMeta = await problemLoader.loadProblem(problemId);
    context.testcases = await testcaseLoader.load(problemId);

    // 3. Persist PENDING submission record to database
    const dbLangName = normalizeDbLanguage(language);
    const pendingSubmission = await prisma.submission.create({
      data: {
        userId,
        problemId,
        language: dbLangName,
        code,
        status: 'PENDING',
        executionTime: 0
      }
    });

    context.submissionId = pendingSubmission.id;

    // 4. Assemble Code
    transitionTo('ASSEMBLING');
    context.assembledSource = assemblyEngine.assembleCode(language, code, context.problemMeta);

    // 5. Compile Code (Only Once)
    transitionTo('COMPILING');
    await hooks.trigger('beforeCompile', context);
    
    const compileOptions = {
      backend: backendId,
      timeout: context.problemMeta.limits.timeout,
      memoryLimitKb: context.problemMeta.limits.memoryLimitKb
    };

    compileResult = await executionEngine.compile(context.assembledSource, language, compileOptions);
    context.compileTimeMs = compileResult.compileTimeMs;
    await hooks.trigger('afterCompile', context);

    if (!compileResult.success) {
      context.finalVerdict = 'COMPILATION_ERROR';
      transitionTo('FAILED');
    } else {
      context.artifact = compileResult.artifact;

      // 6. Run & Judge Testcases (Loop)
      transitionTo('RUNNING');
      await hooks.trigger('beforeExecution', context);

      const strategy = judgeStrategyRegistry.getStrategy(context.problemMeta.judgeStrategy);
      const earlyTerm = options.earlyTermination !== undefined ? options.earlyTermination : !runAll;

      for (const testcase of context.testcases) {
        // Execute testcase
        const execOptions = {
          backend: backendId,
          timeout: context.problemMeta.limits.timeout,
          memoryLimitKb: context.problemMeta.limits.memoryLimitKb
        };

        const runnerOut = await executionEngine.execute(context.artifact, language, testcase.input, execOptions);
        
        transitionTo('JUDGING');
        await hooks.trigger('beforeJudge', context);

        const isPassed = strategy.judge(testcase.expectedOutput, runnerOut.stdout, context.problemMeta.metadata);
        await hooks.trigger('afterJudge', context);

        const tcStatus = runnerOut.limitError
          ? resultCollectorStatus(runnerOut.limitError)
          : ((runnerOut.exitInfo?.code !== 0 && runnerOut.exitInfo?.code !== null) ? 'RUNTIME_ERROR' : 'SUCCESS');

        const judgeResult = {
          testcaseId: testcase.id,
          isPassed: isPassed && tcStatus === 'SUCCESS',
          status: tcStatus === 'SUCCESS' && !isPassed ? 'WRONG_ANSWER' : tcStatus,
          executionTimeMs: runnerOut.metrics.executionTimeMs || 0,
          memoryKb: runnerOut.metrics.memoryKb || 0
        };

        context.testcaseResults.push(judgeResult);
        context.executionTimeMs += judgeResult.executionTimeMs;
        context.memoryKb = Math.max(context.memoryKb, judgeResult.memoryKb);

        // Transition back to running state if loop continues
        transitionTo('RUNNING');

        // Early termination on failure
        if (earlyTerm && !judgeResult.isPassed) {
          break;
        }
      }

      await hooks.trigger('afterExecution', context);
      
      // Cleanup executable artifact
      try {
        await executionEngine.cleanup(context.artifact, { backend: backendId });
      } catch (e) {
        console.warn(`Tear down failed for artifact:`, e.message);
      }

      // 7. Calculate final score and verdict statuses
      context.finalVerdict = verdictService.getFinalVerdict(context.testcaseResults, true);
      // MED-4: Prefer the problem's DB-declared scoring model over client-supplied option
      const resolvedScoringModel = context.problemMeta.scoringModel || options.scoringModel || 'PARTIAL';
      context.scoreMetrics = scoreCalculator.calculateScore(context.testcaseResults, {
        scoringModel: resolvedScoringModel
      });


      transitionTo('COMPLETED');
    }

  } catch (err) {
    console.error(`[Submission Pipeline] INTERNAL_ERROR for userId=${userId} problemId=${problemId} lang=${language}:`, err.message);
    console.error(err.stack);
    context.finalVerdict = 'INTERNAL_ERROR';
    transitionTo('FAILED');
    
    // Attempt artifact cleanup if initialized
    if (context.artifact) {
      try {
        await executionEngine.cleanup(context.artifact, { backend: backendId });
      } catch (_) {}
    }
  }

  // 8. Format final response
  if (!context.scoreMetrics) {
    context.scoreMetrics = scoreCalculator.calculateScore(context.testcaseResults, {
      scoringModel: options.scoringModel || 'PARTIAL'
    });
  }
  
  const finalResultPayload = resultFormatter.formatResult(context);

  // 9. Persist final results to DB
  await hooks.trigger('beforePersist', context);
  const dbStatus = mapVerdictToDbStatus(finalResultPayload.verdict);

  const updatedSubmission = await prisma.submission.update({
    where: { id: context.submissionId },
    data: {
      status: dbStatus,
      executionTime: finalResultPayload.executionTimeMs
    },
    include: {
      user: { select: { id: true, username: true } },
      problem: { select: { id: true, title: true, slug: true } }
    }
  });

  // Attach raw judgeResult block to database submission object for controller mapping
  updatedSubmission.judgeResult = {
    verdict: finalResultPayload.verdict,
    failedTestCase: context.testcaseResults.find(r => !r.isPassed)?.testcaseId || null,
    totalTestCases: context.testcases.length,
    passedTestCases: finalResultPayload.passed,
    executionTimeMs: finalResultPayload.executionTimeMs,
    memoryKb: finalResultPayload.memoryKb,
    stderr: compileResult && !compileResult.success ? compileResult.stderr : ''
  };

  await hooks.trigger('afterPersist', context);

  // 10. Broadcast socket notifications and updates
  try {
    broadcastLiveSubmission(updatedSubmission);
  } catch (e) {
    console.warn('Socket broadcast failed:', e.message);
  }

  // 11. Handle Leaderboard / Contest updates
  try {
    await updateContestLeaderboard(userId, problemId);
  } catch (e) {
    console.warn('Leaderboard update failed:', e.message);
  }

  return updatedSubmission;
};

/**
 * Standardizes result statuses mapping.
 */
function resultCollectorStatus(limitError) {
  if (limitError.name === 'OutputLimitExceededError') return 'OUTPUT_LIMIT_EXCEEDED';
  if (limitError.name === 'TimeLimitExceededError') return 'TIME_LIMIT_EXCEEDED';
  if (limitError.name === 'MemoryLimitExceededError') return 'MEMORY_LIMIT_EXCEEDED';
  return 'INTERNAL_ERROR';
}

/**
 * Keeps full backwards compatibility with active contest updates.
 */
async function updateContestLeaderboard(userId, problemId) {
  const now = new Date();
  const activeContests = await prisma.contest.findMany({
    where: {
      contestProblems: {
        some: { problemId: problemId }
      },
      startTime: { lte: now },
      endTime: { gte: now }
    },
    include: {
      contestProblems: true
    }
  });

  for (const contest of activeContests) {
    const participation = await prisma.contestParticipation.findUnique({
      where: {
        userId_contestId: { userId, contestId: contest.id }
      }
    });

    if (participation) {
      const problemIds = contest.contestProblems.map(cp => cp.problemId);

      const userAcceptedSubmissions = await prisma.submission.findMany({
        where: {
          userId,
          problemId: { in: problemIds },
          status: 'ACCEPTED',
          createdAt: {
            gte: contest.startTime,
            lte: contest.endTime
          }
        }
      });

      const solvedProblemIds = new Set(userAcceptedSubmissions.map(s => s.problemId));
      let totalScore = 0;
      solvedProblemIds.forEach(pId => {
        const cp = contest.contestProblems.find(item => item.problemId === pId);
        totalScore += cp ? cp.points : 100;
      });

      await prisma.contestParticipation.update({
        where: { id: participation.id },
        data: { score: totalScore }
      });

      await broadcastLeaderboardUpdate(contest.id);
    }
  }
}

module.exports = {
  submitUserCode
};
