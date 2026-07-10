/**
 * evaluation.service.js
 *
 * Rubric-based AI answer evaluation with RAG context.
 *
 * Rubric (total 10 marks):
 *   Technical Correctness  4/10
 *   Completeness           3/10
 *   Technical Terminology  2/10
 *   Communication/Clarity  1/10
 *
 * RAG flow:
 *   StudyMaterial(subject) → excerpt → injected into prompt
 *   → LLM evaluates relative to source material
 *
 * Returns confidence so the frontend can flag uncertain evaluations.
 * Falls back to keyword scoring if Ollama is unavailable.
 */

const { generateJSON, OllamaUnavailableError } = require('./llm.service');

let prisma;
const getPrisma = () => { if (!prisma) prisma = require('../../prisma'); return prisma; };

// ── RAG: fetch study material context ────────────────────────────────
async function getStudyContext(subject, topic) {
  try {
    const db    = getPrisma();
    // Prefer topic-specific material, fall back to any subject material
    const where = { processingStatus: 'COMPLETED', subject };
    const material = await db.studyMaterial.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
      select:  { extractedText: true, title: true }
    });
    if (!material?.extractedText) return null;

    const text = material.extractedText.replace(/\s+/g, ' ').trim();

    // If topic provided, try to find the most relevant window
    let excerpt = text;
    if (topic && topic !== subject) {
      const topicIdx = text.toLowerCase().indexOf(topic.toLowerCase());
      if (topicIdx !== -1) {
        const start = Math.max(0, topicIdx - 200);
        excerpt = text.slice(start, start + 2500);
      } else {
        excerpt = text.slice(0, 2500);
      }
    } else {
      excerpt = text.slice(0, 2500);
    }

    return { title: material.title, excerpt: excerpt + (excerpt.length < text.length ? '…' : '') };
  } catch {
    return null;
  }
}

// ── Rule-based fallback ───────────────────────────────────────────────
function ruleBasedEvaluation(question, answerText) {
  if (!answerText?.trim()) {
    return {
      score: 0, confidence: 1.0,
      strengths: [], weaknesses: ['No answer provided'],
      missingConcepts: [], suggestedRevision: [],
      feedback: 'No answer was provided.', followUp: null, usedFallback: true
    };
  }
  const lower    = answerText.toLowerCase();
  const keywords = (question.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  const matched  = keywords.filter(k => lower.includes(k));
  const missing  = keywords.filter(k => !lower.includes(k));
  const ratio    = keywords.length > 0 ? matched.length / keywords.length : 0;
  let score      = Math.round(ratio * 10);
  if (score === 0 && answerText.trim().length > 10) score = 2;

  return {
    score,
    confidence: 0.6, // rule-based is less certain
    strengths:  matched.length > 0 ? [`Mentioned: ${matched.join(', ')}`] : [],
    weaknesses: missing.length  > 0 ? [`Missing: ${missing.slice(0, 3).join(', ')}`] : [],
    missingConcepts:  missing.slice(0, 3),
    suggestedRevision: missing.length > 0 ? [`Review: ${missing.slice(0, 2).join(', ')}`] : [],
    feedback: score >= 7
      ? `Good answer covering: ${matched.join(', ')}.`
      : `Partial answer. Also cover: ${missing.slice(0, 3).join(', ')}.`,
    followUp: null,
    usedFallback: true
  };
}

// ── AI evaluation ─────────────────────────────────────────────────────
async function evaluateAnswer(question, answerText, subject) {
  const topic   = question.topic || subject;
  const context = await getStudyContext(subject, topic);

  const contextSection = context
    ? `\n## Study Material (Source: "${context.title}" — use as ground truth)\n${context.excerpt}`
    : '\n## Study Material\nNot available — evaluate based on general technical knowledge.';

  const difficulty = question.difficulty || 'MEDIUM';

  const prompt = `You are a strict technical viva examiner. Evaluate the student's answer using the rubric below.

## Context
Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}

## Question
${question.questionText}

## Expected Answer (Reference)
${question.expectedAnswer || 'See study material.'}
${contextSection}

## Student's Answer
${answerText || '[No answer given]'}

## Calibration Examples (use as scoring anchors)
- "var is function-scoped, let/const are block-scoped, const can't be reassigned" → score=5 (mentions basics but misses hoisting, TDZ)
- "var is for strings, let is for numbers" → score=1 (factually wrong)
- Full correct answer covering all aspects with examples → score=9-10

## Scoring Rubric (Total = 10)
| Criterion | Marks |
|-----------|-------|
| Technical Correctness — Factually accurate on ALL key points? | 4 |
| Completeness — ALL key aspects mentioned? | 3 |
| Technical Terminology — Correct terms used precisely? | 2 |
| Communication/Clarity — Clear and structured? | 1 |

## Strict Scoring Rules
- Factually WRONG answer (regardless of confidence): technicalCorrectness = 0–1
- Mentions 1–2 concepts but misses hoisting/TDZ/scope details: completeness = 0–1
- Only award 4 for technicalCorrectness if every factual claim is correct
- Only award 3 for completeness if ALL key concepts from expectedAnswer are covered
- "score" MUST equal rubric sum: technicalCorrectness + completeness + terminology + clarity

Return ONLY a JSON object:
{
  "score": <integer 0-10, MUST equal rubric sum>,
  "confidence": <float 0.0-1.0>,
  "rubric": {
    "technicalCorrectness": <0-4>,
    "completeness": <0-3>,
    "terminology": <0-2>,
    "clarity": <0-1>
  },
  "strengths": [<specific correct points>],
  "weaknesses": [<specific wrong or missing points>],
  "missingConcepts": [<key concepts not mentioned, 1-4 items>],
  "suggestedRevision": [<topics to study, 1-3 items>],
  "feedback": "<2 sentences: what was good, what to improve>",
  "followUp": "<follow-up question or null>"
}`;

  try {
    const start = Date.now();
    const { data, model, elapsed } = await generateJSON(prompt, {
      temperature:    0.1,  // near-deterministic for consistent scores
      top_k:          20,
      repeat_penalty: 1.1,
      maxTokens:      800
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`[EvalService] model=${model} elapsed=${elapsed ?? Date.now()-start}ms score=${data.score} conf=${data.confidence}`);
    }

    // Validate rubric sub-scores
    const rubric = {
      technicalCorrectness: Math.min(4, Math.max(0, Math.round(Number(data.rubric?.technicalCorrectness ?? 0)))),
      completeness:         Math.min(3, Math.max(0, Math.round(Number(data.rubric?.completeness         ?? 0)))),
      terminology:          Math.min(2, Math.max(0, Math.round(Number(data.rubric?.terminology          ?? 0)))),
      clarity:              Math.min(1, Math.max(0, Math.round(Number(data.rubric?.clarity              ?? 0)))),
    };
    // Use rubric sum as authoritative score (guards against LLM miscounting)
    const rubricsSum = rubric.technicalCorrectness + rubric.completeness + rubric.terminology + rubric.clarity;
    const score      = Math.max(0, Math.min(10, rubricsSum || Math.round(Number(data.score) || 0)));
    const confidence = Math.max(0, Math.min(1, parseFloat(data.confidence) || 0.7));

    return {
      score,
      confidence,
      rubric,
      strengths:        Array.isArray(data.strengths)        ? data.strengths.map(String)        : [],
      weaknesses:       Array.isArray(data.weaknesses)       ? data.weaknesses.map(String)       : [],
      missingConcepts:  Array.isArray(data.missingConcepts)  ? data.missingConcepts.map(String)  : [],
      suggestedRevision:Array.isArray(data.suggestedRevision)? data.suggestedRevision.map(String): [],
      feedback:  String(data.feedback  || ''),
      followUp:  data.followUp ? String(data.followUp) : null,
      usedFallback: false,
      usedContext:  !!context,
      model
    };
  } catch (err) {
    const isFallback = err instanceof OllamaUnavailableError;
    if (isFallback) console.warn('[EvalService] Ollama unavailable — rule-based fallback');
    else            console.error('[EvalService] Error:', err.message);
    return { ...ruleBasedEvaluation(question, answerText), usedContext: false };
  }
}

module.exports = { evaluateAnswer, getStudyContext };
