/**
 * QuestionGenerationService
 *
 * Architecture: Strategy pattern.
 * The public API (generateQuestions) is the same regardless of the generator in use.
 * Swap `ruleBasedGenerator` for an `llmGenerator` in the future by changing the
 * single line at the bottom — the rest of the system stays unchanged.
 *
 * Current strategy: Rule-Based Generator
 * Future strategy:  Local LLM (Ollama / llama.cpp) — just implement the same
 *                   async generateQuestions(text, subject, count) signature.
 */

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Split raw text into clean, meaningful sentences.
 */
function extractSentences(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 40 && s.length < 600 && /[a-zA-Z]{4,}/.test(s));
}

/**
 * Naively infer a topic from a sentence using keyword clusters.
 */
const TOPIC_CLUSTERS = [
  { topic: 'Memory Management', words: ['heap', 'stack', 'memory', 'allocation', 'garbage', 'pointer', 'reference'] },
  { topic: 'Concurrency', words: ['thread', 'concurrent', 'synchroniz', 'mutex', 'deadlock', 'race condition', 'parallel', 'async'] },
  { topic: 'Data Structures', words: ['array', 'linked list', 'tree', 'graph', 'hash', 'queue', 'stack', 'binary'] },
  { topic: 'Algorithms', words: ['sort', 'search', 'recursion', 'dynamic programming', 'greedy', 'complexity', 'O(n)'] },
  { topic: 'OOP', words: ['class', 'object', 'inherit', 'polymorphism', 'encapsulat', 'abstraction', 'interface'] },
  { topic: 'Networking', words: ['tcp', 'udp', 'http', 'protocol', 'socket', 'port', 'packet', 'routing', 'dns'] },
  { topic: 'Databases', words: ['sql', 'query', 'index', 'transaction', 'acid', 'normaliz', 'relation', 'schema'] },
  { topic: 'Security', words: ['encrypt', 'hash', 'auth', 'token', 'vulnerab', 'injection', 'ssl', 'tls'] },
  { topic: 'Functions', words: ['function', 'method', 'return', 'parameter', 'argument', 'callback', 'closure', 'arrow'] },
  { topic: 'Scope & Variables', words: ['scope', 'variable', 'hoisting', 'let', 'const', 'var', 'global', 'local'] },
];

function inferTopic(sentence, subject) {
  const lower = sentence.toLowerCase();
  for (const cluster of TOPIC_CLUSTERS) {
    if (cluster.words.some(w => lower.includes(w))) return cluster.topic;
  }
  return subject;
}

/**
 * Score sentence richness to prefer informative content.
 */
function scoreSentence(s) {
  let score = 0;
  const l = s.toLowerCase();
  if (/\bis\b|\bare\b|\bmeans\b|\brefers to\b|\bdefined as\b/.test(l)) score += 3;  // definitions
  if (/\bbecause\b|\bdue to\b|\bsince\b|\btherefore\b/.test(l)) score += 2;          // causal
  if (/\bdifference\b|\bcompare\b|\bvs\b|\bversus\b|\bunlike\b/.test(l)) score += 3; // comparisons
  if (/\badvantage\b|\bdisadvantage\b|\bbenefit\b|\bdrawback\b/.test(l)) score += 2;
  if (/\bexample\b|\binstance\b|\bsuch as\b/.test(l)) score += 1;
  if (s.length > 100) score += 1;
  return score;
}

// ── Question templates ────────────────────────────────────────────────

const QUESTION_PATTERNS = [
  // Definitions
  {
    match: s => /\bis\b|\bare\b|\bmeans\b|\brefers to\b|\bdefined as\b/i.test(s),
    difficulty: 'EASY',
    generate: (s, subject) => {
      const noun = extractKeyNoun(s);
      return noun ? `What is ${noun} in the context of ${subject}?` : null;
    }
  },
  // Why/causal
  {
    match: s => /\bbecause\b|\bdue to\b|\bsince\b|\btherefore\b|\bresults in\b/i.test(s),
    difficulty: 'MEDIUM',
    generate: (s, subject) => {
      const noun = extractKeyNoun(s);
      return noun ? `Why is ${noun} important in ${subject}?` : null;
    }
  },
  // Compare
  {
    match: s => /\bdifference\b|\bcompare\b|\bvs\b|\bversus\b|\bunlike\b|\bwhereas\b/i.test(s),
    difficulty: 'MEDIUM',
    generate: (s) => {
      const match = s.match(/(\w[\w\s]{2,20})\s+(?:vs|versus|and|or)\s+([\w\s]{2,20})/i);
      if (match) return `What is the difference between ${match[1].trim()} and ${match[2].trim()}?`;
      return null;
    }
  },
  // Advantages / disadvantages
  {
    match: s => /\badvantage\b|\bbenefit\b|\bpros\b/i.test(s),
    difficulty: 'MEDIUM',
    generate: (s, subject) => {
      const noun = extractKeyNoun(s);
      return noun ? `What are the advantages of ${noun} in ${subject}?` : null;
    }
  },
  {
    match: s => /\bdisadvantage\b|\bdrawback\b|\blimitation\b|\bcons\b/i.test(s),
    difficulty: 'HARD',
    generate: (s, subject) => {
      const noun = extractKeyNoun(s);
      return noun ? `What are the limitations or drawbacks of ${noun}?` : null;
    }
  },
  // How/process
  {
    match: s => /\bworks\b|\bprocess\b|\bstep\b|\bphase\b|\boperat/i.test(s),
    difficulty: 'MEDIUM',
    generate: (s, subject) => {
      const noun = extractKeyNoun(s);
      return noun ? `How does ${noun} work in ${subject}?` : null;
    }
  },
  // Purpose/usage
  {
    match: s => /\bused\b|\bpurpose\b|\bapplication\b|\busage\b|\bapplied\b/i.test(s),
    difficulty: 'EASY',
    generate: (s, subject) => {
      const noun = extractKeyNoun(s);
      return noun ? `What is the purpose of ${noun} in ${subject}?` : null;
    }
  },
  // Explain
  {
    match: s => s.length > 80,
    difficulty: 'HARD',
    generate: (s, subject) => {
      const noun = extractKeyNoun(s);
      return noun ? `Explain the concept of ${noun} in ${subject}.` : null;
    }
  },
];

/**
 * Extract the most meaningful noun phrase from a sentence.
 * Uses simple heuristics: first capitalized term or first noun-like phrase.
 */
function extractKeyNoun(sentence) {
  // Try: "X is ..." or "X are ..." → X is the subject
  const defMatch = sentence.match(/^([A-Z][a-zA-Z\s]{2,30})\s+(?:is|are|was|were)\b/);
  if (defMatch) return defMatch[1].trim();

  // Try first capitalized multi-word phrase
  const capMatch = sentence.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Za-z]+){0,3})\b/);
  if (capMatch) return capMatch[1].trim();

  // Fallback: first noun-like word (3+ chars, not stopwords)
  const stopwords = new Set(['the', 'this', 'that', 'these', 'those', 'they', 'with', 'from', 'when', 'where', 'which', 'while', 'both', 'each', 'such', 'also', 'some', 'many', 'most', 'more', 'very', 'just', 'have', 'been', 'will', 'can', 'may', 'its', 'their', 'our', 'your']);
  const words = sentence.split(/\s+/).map(w => w.replace(/[^a-zA-Z]/g, ''));
  const noun = words.find(w => w.length >= 4 && !stopwords.has(w.toLowerCase()));
  return noun || null;
}

/**
 * Extract scoring keywords from a sentence (nouns & technical terms).
 */
function extractKeywords(sentence) {
  const stopwords = new Set(['the', 'this', 'that', 'with', 'from', 'when', 'where', 'which', 'while', 'both', 'each', 'such', 'also', 'some', 'many', 'most', 'more', 'very', 'just', 'have', 'been', 'will', 'can', 'may', 'its', 'their', 'into', 'onto', 'upon', 'over', 'under', 'through', 'about', 'between', 'among']);
  return [...new Set(
    sentence.toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !stopwords.has(w))
  )].slice(0, 8).join(', ');
}

// ── Rule-Based Generator (current strategy) ──────────────────────────

/**
 * @param {string} text       - Extracted text from the PDF
 * @param {string} subject    - Subject name
 * @param {number} count      - Desired number of questions
 * @returns {Array<{questionText, subject, topic, difficulty, expectedAnswer, keywords}>}
 */
async function ruleBasedGenerator(text, subject, count) {
  const sentences = extractSentences(text);
  if (sentences.length === 0) return [];

  // Score and sort — highest quality sentences first
  const scored = sentences
    .map(s => ({ s, score: scoreSentence(s) }))
    .sort((a, b) => b.score - a.score);

  const generated = [];
  const seenQuestions = new Set();
  const usedSentences = new Set();

  for (const { s } of scored) {
    if (generated.length >= count) break;
    if (usedSentences.has(s)) continue;

    for (const pattern of QUESTION_PATTERNS) {
      if (generated.length >= count) break;
      if (!pattern.match(s)) continue;

      const questionText = pattern.generate(s, subject);
      if (!questionText || seenQuestions.has(questionText.toLowerCase())) continue;

      seenQuestions.add(questionText.toLowerCase());
      usedSentences.add(s);

      generated.push({
        questionText,
        subject,
        topic: inferTopic(s, subject),
        difficulty: pattern.difficulty,
        expectedAnswer: s.slice(0, 500), // source sentence as model answer
        keywords: extractKeywords(s)
      });
      break; // one question per sentence
    }
  }

  return generated;
}

const { llmGenerator } = require('./llmGenerator');
const { OllamaUnavailableError } = require('../lib/ai/llm.service');

// ── Public API ────────────────────────────────────────────────────────

/**
 * The single entry point for question generation.
 * Uses local LLM via llmGenerator, falls back to rule-based on AI unavailability.
 */
async function generateQuestions(text, subject, count = 10) {
  if (!text || text.trim().length < 50) {
    throw new Error('Extracted text is too short to generate questions.');
  }

  let questions = [];
  const maxCount = Math.min(count, 30);

  try {
    // Attempt LLM generation
    questions = await llmGenerator(text, subject, maxCount);
  } catch (err) {
    if (err instanceof OllamaUnavailableError) {
      console.warn('[AI] Ollama unavailable, using rule-based fallback for question generation:', err.message);
      questions = await ruleBasedGenerator(text, subject, maxCount);
    } else {
      console.error('[AI] AI generation failed, using rule-based fallback:', err.message);
      questions = await ruleBasedGenerator(text, subject, maxCount);
    }
  }

  if (questions.length === 0) {
    throw new Error('Could not generate questions from the provided content. Try a more detailed document.');
  }
  
  return questions;
}

module.exports = { generateQuestions };
