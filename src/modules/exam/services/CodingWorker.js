'use strict';

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const prisma = require('../../../prisma');
const queueService = require('./queueService');
const socketService = require('../../../services/socketService');

// Create temp sandbox dir inside workspace
const SANDBOX_DIR = path.join(__dirname, '..', '..', '..', '..', 'sandbox');
if (!fs.existsSync(SANDBOX_DIR)) {
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

/**
 * CodingWorker
 * Polling background daemon that consumes compilation tasks and runs sandbox executions.
 */
class CodingWorker {
  constructor() {
    this.isPolling = false;
    this.useDocker = false;
  }

  /**
   * Spins up the worker polling loop.
   */
  start() {
    if (this.isPolling) return;
    this.isPolling = true;

    // Auto-detect Docker sandbox environments
    exec('docker ps', (err) => {
      if (!err) {
        this.useDocker = true;
        console.log('[CodingWorker] Isolated Docker container sandbox active.');
      } else {
        this.useDocker = false;
        console.log('[CodingWorker] Docker sandbox offline. Running with child_process execution fallback.');
      }
    });

    console.log('[CodingWorker] Polling queue active on channel: code_execution');

    queueService.registerWorker('code_execution', async (job) => {
      try {
        await this.processJob(job);
      } catch (err) {
        console.error('[CodingWorker] Failed to process coding execution job:', err.message);
      }
    });
  }

  /**
   * Formats code inputs and runs compile checks.
   */
  async processJob(job) {
    const { jobType, userId, attemptId, questionId, code, language } = job;
    console.log(`[CodingWorker] Processing ${jobType} for user ${userId}, attempt ${attemptId}, question ${questionId}`);

    // Broadcast queue update (compiling state)
    socketService.broadcastCodingResult(userId, {
      attemptId,
      questionId,
      status: 'PROCESSING',
      message: 'Compiling code in sandboxed zone...'
    });

    try {
      // 1. Fetch Question details
      const question = await prisma.question.findUnique({
        where: { id: questionId },
        include: {
          codingQuestion: {
            include: { testCases: true }
          }
        }
      });

      if (!question || !question.codingQuestion) {
        throw new Error('Coding question configurations not found');
      }

      // 2. Filter test cases
      const allTestCases = question.codingQuestion.testCases;
      const testCases = jobType === 'RUN_CODE'
        ? allTestCases.filter((tc) => tc.isSample)
        : allTestCases;

      if (testCases.length === 0) {
        throw new Error('No evaluatable test cases defined for this phase');
      }

      const results = [];
      let passedCount = 0;
      let totalWeight = 0;
      let earnedWeight = 0;

      // 3. Execute each test case sequentially inside child process sandbox
      for (const tc of testCases) {
        const run = await this.runSandbox(code, language, tc.input, question.codingQuestion.timeLimit);
        
        // Clean outputs for matches
        const cleanedActual = run.stdout.trim().replace(/\r/g, '');
        const cleanedExpected = tc.expectedOutput.trim().replace(/\r/g, '');
        const passed = run.exitCode === 0 && cleanedActual === cleanedExpected;

        if (passed) passedCount++;
        totalWeight += tc.weight;
        if (passed) earnedWeight += tc.weight;

        results.push({
          id: tc.id,
          isSample: tc.isSample,
          input: tc.isSample ? tc.input : undefined, // Hide hidden inputs from logs
          expectedOutput: tc.isSample ? tc.expectedOutput : undefined,
          actualOutput: tc.isSample ? cleanedActual : undefined,
          passed,
          error: run.stderr || (run.exitCode !== 0 ? `Execution returned exit code: ${run.exitCode}` : null),
          executionTime: run.time
        });
      }

      const overallPass = passedCount === testCases.length;
      
      // Calculate mark proportion score
      const maxMarks = question.marks;
      const finalScore = jobType === 'SUBMIT_CODE' && totalWeight > 0
        ? (earnedWeight / totalWeight) * maxMarks
        : 0.0;

      // 4. Save to database if final submit code
      if (jobType === 'SUBMIT_CODE') {
        await prisma.$transaction(async (tx) => {
          // Update Answer table
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

          // Recalculate Attempt totals
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

      // 5. Emit WebSocket completion outcome
      socketService.broadcastCodingResult(userId, {
        attemptId,
        questionId,
        status: 'FINISHED',
        jobType,
        passedCount,
        totalCount: testCases.length,
        overallPass,
        score: finalScore,
        results
      });

    } catch (error) {
      console.error('[CodingWorker] Job execution failed:', error.message);
      socketService.broadcastCodingResult(userId, {
        attemptId,
        questionId,
        status: 'FAILED',
        error: error.message
      });
    }
  }

  /**
   * Evaluates student code inside a sandboxed child process environment.
   */
  runSandbox(code, language, input, timeLimitMs) {
    return new Promise((resolve) => {
      const ext = language === 'PYTHON' ? 'py' : language === 'JAVASCRIPT' ? 'js' : 'txt';
      const filename = `sandbox_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
      const filepath = path.join(SANDBOX_DIR, filename);

      // Write source code file
      fs.writeFileSync(filepath, code, 'utf-8');

      // Command configuration mapping
      let cmd = '';
      if (this.useDocker) {
        const hostDir = SANDBOX_DIR.replace(/\\/g, '/');
        const containerPath = `/sandbox/${filename}`;
        if (language === 'PYTHON') {
          cmd = `docker run --rm -v "${hostDir}:/sandbox" -i --network none --memory 256m --cpus 0.5 python:3.9-slim python "${containerPath}"`;
        } else if (language === 'JAVASCRIPT') {
          cmd = `docker run --rm -v "${hostDir}:/sandbox" -i --network none --memory 256m --cpus 0.5 node:18-alpine node "${containerPath}"`;
        } else {
          return resolve({ stdout: '', stderr: 'Unsupported language compiler', exitCode: 1, time: 0 });
        }
      } else {
        if (language === 'PYTHON') {
          cmd = `python "${filepath}"`;
        } else if (language === 'JAVASCRIPT') {
          cmd = `node "${filepath}"`;
        } else {
          return resolve({ stdout: '', stderr: 'Unsupported language compiler', exitCode: 1, time: 0 });
        }
      }

      const start = Date.now();

      // Execute with timeout limits
      const child = exec(cmd, { timeout: timeLimitMs }, (error, stdout, stderr) => {
        const time = Date.now() - start;
        
        // Delete code file
        try {
          fs.unlinkSync(filepath);
        } catch (e) {}

        if (error) {
          return resolve({
            stdout: stdout || '',
            stderr: error.killed ? 'TIME_LIMIT_EXCEEDED' : (stderr || error.message),
            exitCode: error.code || 1,
            time
          });
        }

        resolve({
          stdout,
          stderr: stderr || '',
          exitCode: 0,
          time
        });
      });

      // Write stdin parameters
      if (input && child.stdin) {
        try {
          child.stdin.write(input);
          child.stdin.end();
        } catch (e) {
          console.error('[CodingWorker] Stdin write fail:', e.message);
        }
      }
    });
  }
}

module.exports = new CodingWorker();
