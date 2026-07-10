const prisma = require('../prisma');
const { evaluateAnswer: aiEvaluate } = require('../lib/ai/evaluation.service');
const { generateSessionSummary }     = require('../lib/ai/summary.service');

/**
 * Ensures there are default questions in the database for a few subjects.
 */
const seedQuestionsIfNeeded = async () => {
  const count = await prisma.vivaQuestion.count();
  if (count > 0) return;

  const defaultQuestions = [
    // JavaScript
    {
      subject: "JavaScript",
      questionText: "What are the differences between var, let, and const in JavaScript?",
      expectedAnswer: "var is function-scoped and hoisted. let and const are block-scoped, hoisted but in temporal dead zone, and const cannot be reassigned.",
      keywords: "scope, hoist, block, reassign, var, let, const",
      difficulty: "EASY"
    },
    {
      subject: "JavaScript",
      questionText: "Explain the concept of closures in JavaScript and provide a common use case.",
      expectedAnswer: "A closure is a function that remembers its outer variables even after the outer function has returned. Common use cases include data privacy (encapsulation) or maintaining state in callbacks.",
      keywords: "lexical, scope, outer, function, preserve, private, variable, state, closure",
      difficulty: "MEDIUM"
    },
    {
      subject: "JavaScript",
      questionText: "How does the JavaScript Event Loop work?",
      expectedAnswer: "JavaScript is single-threaded. The event loop handles asynchronous callbacks by pushing them to the callback queue (or microtask queue) and running them when the call stack is empty.",
      keywords: "single-threaded, stack, queue, microtask, macrotask, callback, asynchronous, blocking, event loop",
      difficulty: "HARD"
    },
    // Python
    {
      subject: "Python",
      questionText: "What is the difference between list and tuple in Python?",
      expectedAnswer: "Lists are mutable, meaning they can be changed after creation. Tuples are immutable, meaning they cannot be changed. Lists use brackets [], tuples use parentheses ().",
      keywords: "mutable, immutable, bracket, parentheses, change, memory, performance, list, tuple",
      difficulty: "EASY"
    },
    {
      subject: "Python",
      questionText: "What are decorators in Python and how do you use them?",
      expectedAnswer: "A decorator is a function that takes another function as an argument, extends its behavior without modifying it, and returns the modified function. They are prefixed with @.",
      keywords: "wrapper, modify, function, argument, syntax, prefix, @, metadata, decorator",
      difficulty: "MEDIUM"
    },
    // DBMS
    {
      subject: "DBMS",
      questionText: "Explain the ACID properties in database management systems.",
      expectedAnswer: "ACID stands for Atomicity (all or nothing), Consistency (preserves database rules), Isolation (transactions don't interfere), and Durability (transactions persist after system failure).",
      keywords: "atomicity, consistency, isolation, durability, transaction, rollback, commit, persist, acid",
      difficulty: "MEDIUM"
    },
    // Computer Networks
    {
      subject: "Computer Networks",
      questionText: "What is the difference between TCP and UDP protocols?",
      expectedAnswer: "TCP is connection-oriented, reliable, guarantees packet ordering, and uses congestion control. UDP is connectionless, fast, unreliable, and has low overhead.",
      keywords: "connection, reliable, order, speed, congestion, overhead, handshake, tcp, udp",
      difficulty: "EASY"
    }
  ];

  await prisma.vivaQuestion.createMany({ data: defaultQuestions });
  console.log("Seeded Viva Questions.");
};

/**
 * Evaluates the answer based on keywords matching.
 */
const evaluateAnswer = (question, answerText) => {
  if (!answerText || answerText.trim() === "") {
    return {
      score: 0,
      feedback: "No answer provided. Please try to answer the question to receive feedback."
    };
  }

  const normalizedAnswer = answerText.toLowerCase();
  const keywords = question.keywords.split(',').map(kw => kw.trim().toLowerCase());
  const matchedKeywords = keywords.filter(kw => normalizedAnswer.includes(kw));
  const missingKeywords = keywords.filter(kw => !normalizedAnswer.includes(kw));

  let matchRatio = keywords.length > 0 ? matchedKeywords.length / keywords.length : 0;
  let score = Math.round(matchRatio * 10);
  if (score === 0 && answerText.trim().length > 10) score = 2;

  let feedback = "";
  if (score >= 8) {
    feedback = `Excellent answer! You correctly mentioned key concepts such as ${matchedKeywords.join(', ')}. Your understanding of the topic is very strong.`;
  } else if (score >= 5) {
    feedback = `Good job! You mentioned important terms like ${matchedKeywords.join(', ')}. To improve, you could expand on concepts like ${missingKeywords.slice(0, 3).join(', ')}.`;
  } else if (score >= 2) {
    feedback = `Partial answer. You touched upon ${matchedKeywords.length > 0 ? matchedKeywords.join(', ') : 'some aspects'}, but missed core elements. Try explaining more about ${missingKeywords.join(', ')}.`;
  } else {
    feedback = `Your answer did not match key concepts for this topic. Be sure to study and mention terms like ${keywords.slice(0, 4).join(', ')} next time.`;
  }

  return { score, feedback };
};

/**
 * Starts a new Viva Session.
 * Supports optional difficulty filter and numQuestions cap.
 * DB columns: id, userId, subject, status, score, feedback, createdAt, updatedAt
 */
const startVivaSession = async (userId, vivaId) => {
  const studentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { instituteId: true }
  });
  const studentInstId = studentUser?.instituteId;
  if (!studentInstId) {
    throw new Error("Student must belong to an institute.");
  }

  const viva = await prisma.viva.findUnique({
    where: { id: vivaId },
    include: { questions: true }
  });

  if (!viva) {
    throw new Error("Viva not found.");
  }

  if (viva.instituteId !== studentInstId) {
    throw new Error("Unauthorized: This Viva belongs to a different institute.");
  }

  const existingSession = await prisma.vivaSession.findFirst({
    where: { userId, vivaId }
  });
  if (existingSession) {
    throw new Error("You have already attempted this Viva session.");
  }

  const now = new Date();
  if (now < viva.startTime) {
    throw new Error("This Viva has not started yet.");
  }
  if (viva.endTime && now > viva.endTime) {
    throw new Error("This Viva has already ended.");
  }

  const questions = viva.questions;
  if (questions.length === 0) {
    throw new Error("This Viva has no questions.");
  }

  const session = await prisma.vivaSession.create({
    data: {
      userId,
      subject: viva.subject,
      status: "IN_PROGRESS",
      vivaId: viva.id
    }
  });

  const firstQuestion = questions[0];

  return {
    sessionId: session.id,
    nextQuestion: {
      id: firstQuestion.id,
      questionText: firstQuestion.questionText
    },
    selectedQuestionIds: questions.map(q => q.id),
    progress: { current: 1, total: questions.length },
    isCompleted: false
  };
};

/**
 * Submits an answer for the active session, evaluates it, and gets next question.
 * selectedQuestionIds: ordered array of question IDs chosen at session start (optional).
 * DB VivaAnswer columns: id, sessionId, questionId (required), answerText, score, feedback, createdAt
 */
const submitAnswer = async (userId, sessionId, questionText, studentAnswer, selectedQuestionIds) => {
  const session = await prisma.vivaSession.findUnique({
    where: { id: sessionId },
    include: { vivaAnswers: true }
  });

  if (!session) throw new Error("Session not found");
  if (session.userId !== userId) throw new Error("Unauthorized access to session");
  if (session.status === "COMPLETED" || session.status === "ABORTED") throw new Error("Session already finished");

  const question = await prisma.vivaQuestion.findFirst({ where: { questionText } });
  if (!question) throw new Error("Question not found");

  const existingAnswer = session.vivaAnswers.find(a => a.questionId === question.id);
  if (existingAnswer) throw new Error("Question already answered");

  // ── AI Evaluation (with rule-based fallback) ──────────────────────
  const evaluation = await aiEvaluate(question, studentAnswer, session.subject);

  await prisma.vivaAnswer.create({
    data: {
      sessionId,
      questionId:        question.id,
      answerText:        studentAnswer,
      score:             evaluation.score,
      confidence:        evaluation.confidence ?? null,
      feedback:          evaluation.feedback,
      strengths:         evaluation.strengths?.length         ? JSON.stringify(evaluation.strengths)         : null,
      weaknesses:        evaluation.weaknesses?.length        ? JSON.stringify(evaluation.weaknesses)        : null,
      missingConcepts:   evaluation.missingConcepts?.length   ? JSON.stringify(evaluation.missingConcepts)   : null,
      suggestedRevision: evaluation.suggestedRevision?.length ? JSON.stringify(evaluation.suggestedRevision) : null,
      rubric:            evaluation.rubric                    ? JSON.stringify(evaluation.rubric)             : null,
      followUp:          evaluation.followUp || null
    }
  });

  const allAnswers = await prisma.vivaAnswer.findMany({ where: { sessionId } });
  const answeredIds = allAnswers.map(a => a.questionId);

  // Use selectedQuestionIds if provided (respects difficulty/numQuestions selection)
  let nextQuestion = null;
  let total;

  if (selectedQuestionIds && selectedQuestionIds.length > 0) {
    const remainingIds = selectedQuestionIds.filter(id => !answeredIds.includes(id));
    total = selectedQuestionIds.length;
    if (remainingIds.length > 0) {
      nextQuestion = await prisma.vivaQuestion.findUnique({ where: { id: remainingIds[0] } });
    }
  } else {
    // Fallback: use all questions for subject
    total = await prisma.vivaQuestion.count({ where: { subject: session.subject } });
    nextQuestion = await prisma.vivaQuestion.findFirst({
      where: { subject: session.subject, id: { notIn: answeredIds } }
    });
  }

  return {
    answer: {
      score:             evaluation.score,
      confidence:        evaluation.confidence   ?? null,
      rubric:            evaluation.rubric        ?? null,
      feedback:          evaluation.feedback,
      strengths:         evaluation.strengths         || [],
      weaknesses:        evaluation.weaknesses        || [],
      missingConcepts:   evaluation.missingConcepts   || [],
      suggestedRevision: evaluation.suggestedRevision || [],
      followUp:          evaluation.followUp   || null,
      usedAI:            !evaluation.usedFallback,
      usedContext:       evaluation.usedContext ?? false
    },
    nextQuestion: nextQuestion
      ? { id: nextQuestion.id, questionText: nextQuestion.questionText }
      : null,
    progress: { current: allAnswers.length + (nextQuestion ? 1 : 0), total },
    isCompleted: !nextQuestion
  };
};

/**
 * Complete a session and calculate final score.
 * DB VivaSession columns for update: status, score, feedback (no totalScore/completedAt)
 */
const completeSession = async (userId, sessionId) => {
  const session = await prisma.vivaSession.findUnique({
    where: { id: sessionId },
    include: { vivaAnswers: { include: { question: true } } }
  });

  if (!session) throw new Error("Session not found");
  if (session.userId !== userId) throw new Error("Unauthorized");
  if (session.status === "COMPLETED") return normalizeSession(session);

  const totalQCount = await prisma.vivaQuestion.count({ where: { subject: session.subject } });
  const rawScore = session.vivaAnswers.reduce((sum, a) => sum + a.score, 0);
  const maxScore = session.vivaAnswers.length * 10; // use answered count, not total
  const finalScorePercentage = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;

  // ── Generate AI session summary ───────────────────────────────────
  const answersForSummary = session.vivaAnswers.map(a => ({
    questionText:      a.question?.questionText || '',
    answerText:        a.answerText,
    score:             a.score,
    strengths:         tryParseJSON(a.strengths),
    weaknesses:        tryParseJSON(a.weaknesses),
    missingConcepts:   tryParseJSON(a.missingConcepts)
  }));

  const summaryObj = await generateSessionSummary(session, answersForSummary);

  let overallFeedback = summaryObj?.overallRemark || '';
  if (!overallFeedback) {
    if (finalScorePercentage >= 80) overallFeedback = "Outstanding performance! You have a deep understanding of this subject.";
    else if (finalScorePercentage >= 50) overallFeedback = "Good effort! You know the basics but could brush up on a few details.";
    else overallFeedback = "You might need to review this subject again. Focus on the core concepts.";
  }

  const updatedSession = await prisma.vivaSession.update({
    where: { id: sessionId },
    data: {
      status:    "COMPLETED",
      score:     finalScorePercentage,
      feedback:  overallFeedback,
      aiSummary: summaryObj ? JSON.stringify(summaryObj) : null
    }
  });

  return normalizeSession(updatedSession);
};

/**
 * Retrieves details of a single session with answers.
 * Normalizes DB field names to what the frontend expects.
 */
const getSessionDetails = async (userId, sessionId) => {
  const session = await prisma.vivaSession.findUnique({
    where: { id: sessionId },
    include: { vivaAnswers: { include: { question: true } } }
  });

  if (!session) throw new Error("Session not found");
  if (session.userId !== userId) throw new Error("Unauthorized");

  return normalizeSession(session);
};

/**
 * Retrieves history of all sessions for user.
 */
const getUserSessions = async (userId) => {
  const sessions = await prisma.vivaSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });

  return sessions.map(normalizeSession);
};

/**
 * Expose available subjects
 */
const getSubjects = async () => {
  await seedQuestionsIfNeeded();
  const questions = await prisma.vivaQuestion.findMany({
    select: { subject: true },
    distinct: ['subject']
  });
  return questions.map(q => q.subject);
};

/**
 * Normalizes DB field names to what the frontend expects.
 * DB uses: score, createdAt, answerText, strengths/weaknesses (JSON strings)
 * Frontend expects: totalScore, startedAt, completedAt, totalQuestions, studentAnswer
 */
const normalizeSession = (session) => {
  const normalized = {
    ...session,
    totalScore:  session.score ?? 0,
    startedAt:   session.createdAt,
    completedAt: session.status === "COMPLETED" ? session.updatedAt : null,
    aiSummary:   tryParseJSON(session.aiSummary)
  };

  if (session.vivaAnswers) {
    normalized.vivaAnswers = session.vivaAnswers.map(a => ({
      ...a,
      studentAnswer:     a.answerText,
      questionText:      a.question?.questionText ?? '',
      strengths:         tryParseJSON(a.strengths)         || [],
      weaknesses:        tryParseJSON(a.weaknesses)        || [],
      missingConcepts:   tryParseJSON(a.missingConcepts)   || [],
      suggestedRevision: tryParseJSON(a.suggestedRevision) || [],
      rubric:            tryParseJSON(a.rubric)            || null,
    }));
    normalized.totalQuestions = normalized.vivaAnswers.length || undefined;
  }

  return normalized;
};

function tryParseJSON(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

module.exports = {
  seedQuestionsIfNeeded,
  startVivaSession,
  submitAnswer,
  completeSession,
  getSessionDetails,
  getUserSessions,
  getSubjects
};
