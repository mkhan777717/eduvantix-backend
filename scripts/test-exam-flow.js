'use strict';

const assert = require('assert');
const prisma = require('../src/prisma');
const ExamService = require('../src/modules/exam/services/ExamService');
const AttemptService = require('../src/modules/exam/services/AttemptService');
const ResultService = require('../src/modules/exam/services/ResultService');
const AnswerService = require('../src/modules/exam/services/AnswerService');
const GradingService = require('../src/modules/exam/services/GradingService');
const CodingWorker = require('../src/modules/exam/services/CodingWorker');

/**
 * End-To-End Exam Module Hardening Test Suite
 */
async function runTests() {
  console.log('==================================================');
  console.log('  STARTING INTEGRATION TESTS FOR EXAM ERP MODULE  ');
  console.log('==================================================');

  // Set up mock users
  let admin, student, instituteId;
  try {
    let inst = await prisma.institute.findFirst();
    if (!inst) {
      inst = await prisma.institute.create({
        data: { name: 'E2E Testing Institute' }
      });
    }
    instituteId = inst.id;

    admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      admin = await prisma.user.create({
        data: { username: 'testadmin', email: 'admin@dmx.com', password: 'hashedpassword', role: 'ADMIN', instituteId }
      });
    } else if (!admin.instituteId) {
      admin = await prisma.user.update({
        where: { id: admin.id },
        data: { instituteId }
      });
    }

    student = await prisma.user.findFirst({ where: { role: 'USER' } });
    if (!student) {
      student = await prisma.user.create({
        data: { username: 'teststudent', email: 'student@dmx.com', password: 'hashedpassword', role: 'USER', instituteId }
      });
    } else if (!student.instituteId) {
      student = await prisma.user.update({
        where: { id: student.id },
        data: { instituteId }
      });
    }
  } catch (err) {
    console.error('Failed to resolve database user mocks:', err.message);
    process.exit(1);
  }

  try {
    // ── TEST 1: Create Draft Exam ───────────────────────────────────────────
    console.log('Running Test 1: Creating Exam Draft...');
    const exam = await ExamService.createExam({
      title: 'E2E Validation Exam',
      description: 'Verifies backend schemas under load tests',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000), // tomorrow
      resultReleasePolicy: 'MANUAL',
      creatorId: admin.id,
      instituteId
    }, {
      password: 'secure_password',
      fullscreenEnforcement: true,
      maxAttempts: 1
    }, ['Answer all coding sections carefully']);

    assert.ok(exam.id, 'Exam ID must be generated');
    assert.strictEqual(exam.status, 'DRAFT', 'Exam initial state must be DRAFT');
    console.log('✔ Test 1 Passed: Exam Draft created successfully.');

    // ── TEST 2: Add Sections and Questions ──────────────────────────────────
    console.log('Running Test 2: Appending Sections & Questions...');
    const sec1 = await ExamService.addSection(
      exam.id,
      'Technical MCQs',
      'Quick check conceptual test',
      'MCQ'
    );

    const mcqQ = await ExamService.createQuestionInSection(sec1.id, {
      title: 'JavaScript Closures',
      text: 'What is a closure in JS?',
      type: 'MCQ',
      marks: 5
    }, {
      options: [
        { text: 'A function bundled together with its lexical environment', isCorrect: true },
        { text: 'A wrapper around async processes', isCorrect: false }
      ]
    });

    const essayQ = await ExamService.createQuestionInSection(sec1.id, {
      title: 'Algorithms Essay',
      text: 'Explain merge sort time complexities.',
      type: 'DESCRIPTIVE',
      marks: 10
    }, {
      descriptive: {
        wordLimit: 500,
        rubric: 'Score on core criteria details'
      }
    });

    assert.strictEqual(mcqQ.type, 'MCQ', 'Question type must match MCQ');
    console.log('✔ Test 2 Passed: Sections and questions appended.');

    // ── TEST 3: Validation Rules and Publish Check ────────────────────────
    console.log('Running Test 3: Validating publish pre-requisites...');
    const pub = await ExamService.publishExam(exam.id, instituteId, admin.id);
    const updatedExam = await prisma.exam.findUnique({ where: { id: exam.id } });
    assert.strictEqual(updatedExam.status, 'PUBLISHED', 'Published exam status must transition to PUBLISHED');
    assert.ok(pub.id, 'ExamVersion snapshot record must be linked');
    console.log('✔ Test 3 Passed: Publish validation constraints succeeded.');

    // ── TEST 4: Student Start Attempt Gateway ──────────────────────────────
    // Grant exam access to student
    await prisma.examAccess.create({
      data: {
        examId: exam.id,
        userId: student.id
      }
    });

    console.log('Running Test 4: Starting Student Attempt...');
    const attempt = await AttemptService.startAttempt(student.id, exam.id, 'secure_password');
    assert.ok(attempt.id, 'Attempt session ID must be generated');
    assert.strictEqual(attempt.status, 'IN_PROGRESS', 'Initial attempt status must be IN_PROGRESS');
    console.log('✔ Test 4 Passed: Student starts attempt gateway.');

    // ── TEST 5: Answer Autosave and Proctor Logging ────────────────────────
    console.log('Running Test 5: Saving Answer options & Proctor logs...');

    // Find the snapshotted version question ID
    const snapQ = await prisma.examVersionQuestion.findFirst({
      where: { originalQuestionId: mcqQ.id }
    });

    const options = await prisma.mCQOption.findMany({ where: { questionId: mcqQ.id } });
    await AnswerService.saveAnswer(attempt.id, student.id, snapQ.id, { visited: true }, [options[0].id]);

    const activeAttempt = await AttemptService.getAttempt(attempt.id, student.id);
    const savedAns = activeAttempt.answers.find(a => a.questionId === snapQ.id);
    assert.ok(savedAns.visited, 'Answer visited flag must toggle to true');
    assert.ok(savedAns.mcqAnswers?.length > 0, 'Saved MCQ options must match input');

    // Proctor log incident check
    await AttemptService.logIncident(attempt.id, student.id, 'FULLSCREEN_LEAVE', 'HIGH', { note: 'Client left window focus' });

    const refreshedAttempt = await prisma.attempt.findUnique({
      where: { id: attempt.id },
      include: { proctorEvents: true }
    });
    assert.strictEqual(refreshedAttempt.proctorEvents.length, 1, 'Proctor logs count must be incremented');
    console.log('✔ Test 5 Passed: Autosaves and proctor incidents saved.');

    // ── TEST 6: Manual Score Recalculation Check ──────────────────────────
    console.log('Running Test 6: Running Grading boundary checks...');

    // Find the snapshotted version descriptive question ID
    const snapEssayQ = await prisma.examVersionQuestion.findFirst({
      where: { originalQuestionId: essayQ.id }
    });

    const refreshedAttemptForGrading = await AttemptService.getAttempt(attempt.id, student.id);
    const essayAns = refreshedAttemptForGrading.answers.find(a => a.questionId === snapEssayQ.id);

    // Save descriptive answer text
    await AnswerService.saveAnswer(attempt.id, student.id, snapEssayQ.id, {
      visited: true,
      descriptiveAnswer: 'Merge sort runs in O(n log n) best and worst case.'
    });

    // Score overflow check: Score must not exceed maxMarks
    try {
      await GradingService.gradeDescriptive(essayAns.id, 15, 'Over-score comments', admin.id);
      assert.fail('Manual score should not exceed maximum question marks');
    } catch (e) {
      assert.strictEqual(e.message, 'INVALID_SCORE_BOUNDS', 'Expected INVALID_SCORE_BOUNDS boundary verification error');
    }
    console.log('✔ Test 6 Passed: Score values boundary limits verified.');

    // ── Clean up E2E records ───────────────────────────────────────────────
    console.log('Cleaning up mock test configurations...');
    await prisma.proctoringEvent.deleteMany({ where: { attemptId: attempt.id } });
    await prisma.answer.deleteMany({ where: { attemptId: attempt.id } });
    await prisma.attempt.deleteMany({ where: { id: attempt.id } });
    await prisma.examVersionQuestion.deleteMany({
      where: {
        section: {
          examVersion: {
            examId: exam.id
          }
        }
      }
    });
    await prisma.examVersionSection.deleteMany({ where: { examVersion: { examId: exam.id } } });
    await prisma.examVersion.deleteMany({ where: { examId: exam.id } });
    await prisma.sectionQuestion.deleteMany({
      where: {
        section: { examId: exam.id }
      }
    });
    await prisma.question.deleteMany({
      where: {
        title: { in: ['JavaScript Closures', 'Algorithms Essay'] }
      }
    });
    await prisma.section.deleteMany({ where: { examId: exam.id } });
    await prisma.exam.deleteMany({ where: { id: exam.id } });

    console.log('\n==================================================');
    console.log('  ALL INTEGRATION TESTS PASSED SUCCESSFULLY!  ');
    console.log('==================================================\n');

  } catch (err) {
    console.error('\nE2E INTEGRATION TEST FAILURE DETECTED:');
    console.error(err);
    process.exit(1);
  }
}

runTests();
