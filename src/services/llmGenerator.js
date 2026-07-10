/**
 * llmGenerator.js — LLM-powered viva question generation.
 *
 * Generates one question at a time to avoid local CPU timeouts.
 * Includes server-side quality filtering to discard hallucinated/duplicate results.
 */

const { generateJSON, OllamaUnavailableError } = require('../lib/ai/llm.service');

const QUESTION_TYPES = [
  { type: 'Definition',      description: 'Ask the student to define a concept or term from the material.' },
  { type: 'Conceptual',      description: 'Ask the student to explain how something works or why it exists.' },
  { type: 'Comparison',      description: 'Ask the student to compare two concepts (e.g. X vs Y).' },
  { type: 'Scenario-Based',  description: 'Present a realistic scenario and ask what happens or what they would do.' },
  { type: 'Application',     description: 'Ask how a concept is applied to solve a real problem.' },
  { type: 'Coding-Oriented', description: 'Ask to write, trace, or reason about a code snippet related to the topic.' },
];

/**
 * Quality filter: returns true if the question is usable.
 * Catches hallucinations (e.g. "What is What"), duplicates, and very short questions.
 */
function isGoodQuestion(questionText, seenSet) {
  if (!questionText || typeof questionText !== 'string') return false;
  const q = questionText.trim();
  if (q.length < 20) return false;

  // Reject hallucinations: any meaningful word repeated 3+ times in the same question
  const wordCount = {};
  for (const w of q.toLowerCase().split(/\s+/)) {
    if (w.length > 3) wordCount[w] = (wordCount[w] || 0) + 1;
  }
  if (Object.values(wordCount).some(c => c >= 3)) return false;

  // Reject near-duplicates of already accepted questions
  const norm = q.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 80);
  for (const seen of seenSet) {
    const qWords = new Set(norm.split(' ').filter(w => w.length > 3));
    const sWords = new Set(seen.split(' ').filter(w => w.length > 3));
    if (qWords.size > 0 && [...qWords].filter(w => sWords.has(w)).length / qWords.size > 0.75) return false;
  }

  return true;
}

async function llmGenerator(text, subject, count, existingQuestions = []) {
  // existingQuestions is an array of question text strings from the frontend
  const contextText = text.length > 4500 ? text.slice(0, 4500) + '...' : text;
  const maxCount = Math.min(count, 30);

  // Seed seenSet with existing questions so we never repeat them
  const seenSet = new Set(
    existingQuestions.map(q => String(q).toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 80))
  );
  const generatedQuestions = [];

  console.log('[LLMGenerator] Starting generation for ' + maxCount + ' questions...');

  let existingSection = '';
  if (existingQuestions.length > 0) {
    const lines = existingQuestions.map(q => '- ' + String(q)).join('\n');
    existingSection = '\n\n## Already Generated - Do NOT Repeat These Topics\n' + lines + '\n';
  }

  const typeList = QUESTION_TYPES.map(t => t.type).join(', ');

  const prompt = 'You are an expert technical examiner creating viva questions for "' + subject + '".\n\n' +
    '## Study Material\n' + contextText + '\n' + existingSection + '\n' +
    '## Task\n' +
    'Generate exactly ' + maxCount + ' unique and specific technical viva question(s) based ONLY on the study material above.\n\n' +
    'Rules:\n' +
    '- Each question MUST test a specific concept clearly stated in the material.\n' +
    '- Ask specific, meaningful questions about mechanisms, trade-offs, or code behavior.\n' +
    '- DO NOT ask trivial or generic questions.\n' +
    '- Vary difficulty: EASY, MEDIUM, HARD.\n' +
    '- Use question types: ' + typeList + '.\n' +
    '- expectedAnswer: 1 precise sentence from the material.\n' +
    '- keywords: 5-8 key terms (comma-separated).\n\n' +
    'Return ONLY a valid JSON object. No markdown. No explanation. Raw JSON only:\n' +
    '{\n  "questions": [\n    {\n' +
    '      "questionText": "...",\n' +
    '      "type": "...",\n' +
    '      "subject": "' + subject + '",\n' +
    '      "topic": "<specific sub-topic>",\n' +
    '      "difficulty": "<EASY or MEDIUM or HARD>",\n' +
    '      "expectedAnswer": "...",\n' +
    '      "keywords": "..."\n' +
    '    }\n  ]\n}';


  try {
    const { data } = await generateJSON(prompt, { temperature: 0.7, maxTokens: 2048 });

    if (data && Array.isArray(data.questions)) {
      for (const q of data.questions) {
        if (!q || !q.questionText) continue;

        const questionText = String(q.questionText).trim();

        if (!isGoodQuestion(questionText, seenSet)) {
          console.warn('[LLMGenerator] Rejected: "' + questionText.slice(0, 80) + '"');
          continue;
        }

        const norm = questionText.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 80);
        seenSet.add(norm);

        generatedQuestions.push({
          questionText,
          type:           QUESTION_TYPES.find(t => t.type === q.type) ? q.type : 'Conceptual',
          subject:        String(q.subject || subject).trim(),
          topic:          String(q.topic || 'General').trim(),
          difficulty:     ['EASY', 'MEDIUM', 'HARD'].includes(String(q.difficulty).toUpperCase())
                            ? String(q.difficulty).toUpperCase() : 'MEDIUM',
          expectedAnswer: String(q.expectedAnswer || '').trim(),
          keywords:       String(q.keywords || '').trim(),
        });

        if (generatedQuestions.length >= maxCount) break;
      }
    }
  } catch (err) {
    if (err.isAiUnavailable || err.name === 'OllamaUnavailableError') throw err;
    console.error('[LLMGenerator] Generation failed:', err.message);
  }

  if (generatedQuestions.length === 0) {
    throw new Error('AI question generation failed or returned no usable questions.');
  }

  console.log('[LLMGenerator] Done. Accepted ' + generatedQuestions.length + '/' + maxCount + ' questions.');
  return generatedQuestions;
}

module.exports = { llmGenerator };
