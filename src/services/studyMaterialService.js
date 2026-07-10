const path = require('path');
const fs = require('fs');
const prisma = require('../prisma');
const { generateQuestions } = require('./questionGenerationService');

// pdf-parse v2 API: new PDFParse({ data: buffer }).getText()
let PDFParseClass;
const getPDFParseClass = () => {
  if (!PDFParseClass) PDFParseClass = require('pdf-parse').PDFParse;
  return PDFParseClass;
};

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'study-materials');

/** List all study materials, newest first. */
const listMaterials = async (instituteId) => {
  if (instituteId === undefined || instituteId === null) {
    return [];
  }

  return prisma.studyMaterial.findMany({
    where: { instituteId },
    orderBy: { createdAt: 'desc' }
  });
};

/** Get a single material by ID. */
const getMaterial = async (id) => {
  const m = await prisma.studyMaterial.findUnique({ where: { id } });
  if (!m) throw new Error('Study material not found.');
  return m;
};

/**
 * Save upload metadata to DB. Actual file is already on disk (via multer).
 * Triggers async extraction immediately.
 */
const createMaterial = async ({ title, subject, fileName, filePath, uploadedById, instituteId }) => {
  const material = await prisma.studyMaterial.create({
    data: {
      title: title.trim(),
      subject: subject.trim(),
      fileName,
      filePath,
      uploadedById,
      processingStatus: 'UPLOADED',
      instituteId
    }
  });
  // Fire-and-forget extraction so the HTTP response is instant
  extractTextAsync(material.id, filePath).catch(err =>
    console.error(`[StudyMaterial] extraction failed for ${material.id}:`, err.message)
  );
  return material;
};

/**
 * Extract text from PDF, update DB record.
 */
const extractTextAsync = async (materialId, filePath) => {
  await prisma.studyMaterial.update({
    where: { id: materialId },
    data: { processingStatus: 'PROCESSING' }
  });
  try {
    const buffer = fs.readFileSync(filePath);
    const PDFParse = getPDFParseClass();
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text || '';
    await prisma.studyMaterial.update({
      where: { id: materialId },
      data: { extractedText: text, processingStatus: 'COMPLETED' }
    });
    console.log(`[StudyMaterial] Extracted ${text.length} chars from material ${materialId}`);
  } catch (err) {
    await prisma.studyMaterial.update({
      where: { id: materialId },
      data: { processingStatus: 'FAILED' }
    }).catch(() => {});
    throw err;
  }
};

/**
 * Re-trigger extraction for a FAILED or UPLOADED material.
 */
const retryExtraction = async (id) => {
  const m = await getMaterial(id);
  if (m.processingStatus === 'COMPLETED') return m;
  await extractTextAsync(m.id, m.filePath);
  return prisma.studyMaterial.findUnique({ where: { id } });
};

/**
 * Generate questions from a material's extracted text.
 * Returns generated question drafts (NOT saved to DB yet — user reviews first).
 */
const generateFromMaterial = async (id, count = 10, existingQuestions = []) => {
  const m = await getMaterial(id);
  if (m.processingStatus !== 'COMPLETED') {
    throw new Error(`Material is not ready yet (status: ${m.processingStatus}). Please wait for processing to complete.`);
  }
  if (!m.extractedText || m.extractedText.trim().length < 50) {
    throw new Error('No text could be extracted from this document.');
  }
  return generateQuestions(m.extractedText, m.subject, count, existingQuestions);
};

/**
 * Save selected/reviewed questions to the VivaQuestion table (Question Bank).
 * Returns the saved records.
 */
const saveQuestionsToBank = async (questions, instituteId) => {
  if (!questions || questions.length === 0) throw new Error('No questions provided.');
  const saved = [];
  for (const q of questions) {
    if (!q.questionText?.trim() || !q.subject?.trim()) continue;
    // Skip duplicates silently
    const existing = await prisma.vivaQuestion.findFirst({
      where: { questionText: q.questionText.trim(), subject: q.subject.trim(), instituteId }
    });
    if (existing) { saved.push(existing); continue; }
    const created = await prisma.vivaQuestion.create({
      data: {
        questionText: q.questionText.trim(),
        subject: q.subject.trim(),
        topic: q.topic?.trim() || '',
        difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(q.difficulty) ? q.difficulty : 'EASY',
        expectedAnswer: q.expectedAnswer?.trim() || '',
        keywords: q.keywords?.trim() || '',
        instituteId
      }
    });
    saved.push(created);
  }
  return saved;
};

/** Delete a material record and its file from disk. */
const deleteMaterial = async (id) => {
  const m = await getMaterial(id);
  await prisma.studyMaterial.delete({ where: { id } });
  try { if (fs.existsSync(m.filePath)) fs.unlinkSync(m.filePath); } catch { /* ignore */ }
  return { deleted: true, id };
};

module.exports = {
  listMaterials,
  getMaterial,
  createMaterial,
  retryExtraction,
  generateFromMaterial,
  saveQuestionsToBank,
  deleteMaterial,
  UPLOADS_DIR
};
