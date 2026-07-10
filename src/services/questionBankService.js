const prisma = require('../prisma');

const VALID_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];

/**
 * Create a new question. Prevents duplicates within the same subject.
 */
const createQuestion = async ({ questionText, subject, topic, difficulty, expectedAnswer, keywords, instituteId }) => {
  if (!questionText?.trim()) throw new Error("Question text is required.");
  if (!subject?.trim()) throw new Error("Subject is required.");
  if (!difficulty || !VALID_DIFFICULTIES.includes(difficulty)) throw new Error("Difficulty must be EASY, MEDIUM, or HARD.");

  // Duplicate check within same subject
  const existing = await prisma.vivaQuestion.findFirst({
    where: { questionText: questionText.trim(), subject: subject.trim(), instituteId }
  });
  if (existing) throw new Error("A question with this text already exists for this subject.");

  return prisma.vivaQuestion.create({
    data: {
      questionText: questionText.trim(),
      subject: subject.trim(),
      topic: topic?.trim() || "",
      difficulty,
      expectedAnswer: expectedAnswer?.trim() || "",
      keywords: keywords?.trim() || "",
      instituteId
    }
  });
};

const getQuestions = async ({ subject, topic, difficulty, search, instituteId } = {}) => {
  const where = {};
  if (instituteId !== undefined) {
    if (instituteId === null) {
      where.instituteId = null;
    } else {
      where.OR = [
        { instituteId: null },
        { instituteId }
      ];
    }
  }

  if (subject) where.subject = subject;
  if (topic) where.topic = { contains: topic, mode: 'insensitive' };
  if (difficulty && VALID_DIFFICULTIES.includes(difficulty)) where.difficulty = difficulty;
  if (search) {
    where.questionText = { contains: search, mode: 'insensitive' };
  }

  return prisma.vivaQuestion.findMany({
    where,
    orderBy: [{ subject: 'asc' }, { difficulty: 'asc' }, { createdAt: 'desc' }]
  });
};

/**
 * Get a single question by ID.
 */
const getQuestionById = async (id) => {
  const q = await prisma.vivaQuestion.findUnique({ where: { id } });
  if (!q) throw new Error("Question not found.");
  return q;
};

/**
 * Update a question by ID.
 */
const updateQuestion = async (id, { questionText, subject, topic, difficulty, expectedAnswer, keywords }) => {
  const existing = await prisma.vivaQuestion.findUnique({ where: { id } });
  if (!existing) throw new Error("Question not found.");

  if (difficulty && !VALID_DIFFICULTIES.includes(difficulty)) throw new Error("Difficulty must be EASY, MEDIUM, or HARD.");

  // Duplicate check (excluding self)
  if (questionText || subject) {
    const newText = questionText?.trim() ?? existing.questionText;
    const newSubject = subject?.trim() ?? existing.subject;
    const dup = await prisma.vivaQuestion.findFirst({
      where: { questionText: newText, subject: newSubject, instituteId: existing.instituteId, NOT: { id } }
    });
    if (dup) throw new Error("A question with this text already exists for this subject.");
  }

  return prisma.vivaQuestion.update({
    where: { id },
    data: {
      ...(questionText !== undefined && { questionText: questionText.trim() }),
      ...(subject !== undefined && { subject: subject.trim() }),
      ...(topic !== undefined && { topic: topic.trim() }),
      ...(difficulty !== undefined && { difficulty }),
      ...(expectedAnswer !== undefined && { expectedAnswer: expectedAnswer.trim() }),
      ...(keywords !== undefined && { keywords: keywords.trim() })
    }
  });
};

/**
 * Delete a question by ID.
 */
const deleteQuestion = async (id) => {
  const existing = await prisma.vivaQuestion.findUnique({ where: { id } });
  if (!existing) throw new Error("Question not found.");
  await prisma.vivaQuestion.delete({ where: { id } });
  return { deleted: true, id };
};

/**
 * Get distinct subjects.
 */
const getSubjects = async (instituteId) => {
  const where = {};
  if (instituteId !== undefined) {
    if (instituteId === null) {
      where.instituteId = null;
    } else {
      where.OR = [
        { instituteId: null },
        { instituteId }
      ];
    }
  }

  const rows = await prisma.vivaQuestion.findMany({
    where,
    select: { subject: true },
    distinct: ['subject'],
    orderBy: { subject: 'asc' }
  });
  return rows.map(r => r.subject);
};

/**
 * Get distinct topics, optionally filtered by subject.
 */
const getTopics = async (subject, instituteId) => {
  const where = {};
  if (instituteId !== undefined) {
    if (instituteId === null) {
      where.instituteId = null;
    } else {
      where.OR = [
        { instituteId: null },
        { instituteId }
      ];
    }
  }

  if (subject) where.subject = subject;
  const rows = await prisma.vivaQuestion.findMany({
    select: { topic: true },
    where: { ...where, topic: { not: "" } },
    distinct: ['topic'],
    orderBy: { topic: 'asc' }
  });
  return rows.map(r => r.topic);
};

module.exports = {
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  getSubjects,
  getTopics
};
