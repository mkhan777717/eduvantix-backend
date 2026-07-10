/**
 * transcriptCorrectionService.js
 *
 * AI-powered speech transcript correction for the Viva system.
 *
 * Pipeline:
 *   Raw browser SpeechRecognition transcript
 *   → LLM corrects technical vocabulary errors only
 *   → Returns corrected transcript (never changes student's intended meaning)
 *
 * Design goals:
 *   1. Future-compatible — accepts any raw transcript string regardless of source
 *      (browser SpeechRecognition, Whisper, Faster-Whisper, etc.)
 *   2. Fast — uses low maxTokens and temperature=0 to minimise latency (~1-2s)
 *   3. Safe — always falls back to raw transcript if AI fails or is disabled
 *   4. Honest — never answers the question; only fixes mishears
 */

const { generate, OllamaUnavailableError } = require('../lib/ai/llm.service');

// ── Config ────────────────────────────────────────────────────────────
const isEnabled = () =>
  process.env.AI_TRANSCRIPT_CORRECTION !== 'false' &&
  process.env.AI_ENABLED !== 'false';

const isTechVocabEnabled = () =>
  process.env.TECHNICAL_VOCAB_ENABLED !== 'false';

// ── Subject-specific technical vocabulary ────────────────────────────
// These are common technical terms that browser ASR frequently mishears.
// They are injected into the correction prompt as hints.
const SUBJECT_VOCAB = {
  'JavaScript': [
    'var', 'let', 'const', 'closure', 'prototype', 'hoisting', 'async', 'await',
    'Promise', 'callback', 'event loop', 'microtask', 'macrotask', 'scope',
    'temporal dead zone', 'destructuring', 'spread', 'rest', 'arrow function',
    'this', 'bind', 'call', 'apply', 'module', 'CommonJS', 'ESM', 'webpack',
    'babel', 'transpile', 'polyfill', 'DOM', 'virtual DOM', 'reconciliation',
    'useState', 'useEffect', 'hook', 'component', 'JSX', 'props', 'state',
    'immutable', 'mutable', 'object', 'array', 'map', 'filter', 'reduce',
  ],
  'Python': [
    'list', 'tuple', 'dict', 'set', 'generator', 'iterator', 'decorator',
    'lambda', 'comprehension', 'yield', 'class', 'self', 'init', 'dunder',
    'GIL', 'global interpreter lock', 'asyncio', 'coroutine', 'virtual environment',
    'pip', 'pandas', 'numpy', 'Django', 'Flask', 'pytest', 'type hint',
  ],
  'DBMS': [
    'ACID', 'atomicity', 'consistency', 'isolation', 'durability', 'transaction',
    'rollback', 'commit', 'deadlock', 'normalization', 'denormalization',
    'primary key', 'foreign key', 'index', 'B-tree', 'hash index',
    'SQL', 'NoSQL', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'GROUP BY', 'HAVING',
    'stored procedure', 'trigger', 'view', 'schema', 'entity', 'relation',
  ],
  'Computer Networks': [
    'TCP', 'UDP', 'IP', 'HTTP', 'HTTPS', 'DNS', 'DHCP', 'ARP', 'NAT',
    'subnet', 'CIDR', 'routing', 'switching', 'OSI', 'TCP/IP', 'handshake',
    'SYN', 'ACK', 'FIN', 'packet', 'frame', 'bandwidth', 'latency', 'throughput',
    'firewall', 'VPN', 'SSL', 'TLS', 'socket', 'port', 'congestion control',
    'flow control', 'sliding window', 'CRC', 'checksum',
  ],
};

/**
 * Build the LLM correction prompt.
 * The prompt is deliberately minimal to maximise speed and reduce hallucination risk.
 *
 * @param {string} questionText   – The current viva question
 * @param {string} rawTranscript  – What the browser SpeechRecognition captured
 * @param {string} subject        – e.g. "JavaScript"
 * @param {string[]} vocab        – Technical terms relevant to this subject
 * @returns {string}
 */
function buildPrompt(questionText, rawTranscript, subject, vocab) {
  const vocabSection = isTechVocabEnabled() && vocab.length > 0
    ? `\n## Technical Vocabulary (${subject})\nPrefer these exact terms over similar-sounding words:\n${vocab.join(', ')}`
    : '';

  return `You are a speech transcript corrector for a technical viva examination.

## Strict Rules — violating any rule makes this correction invalid
1. Fix ONLY words clearly misheard by the speech recogniser (wrong phonetics, not wrong knowledge).
2. Do NOT add concepts, definitions, or information the student did not say.
3. Do NOT answer the question yourself.
4. Do NOT rewrite, paraphrase, or restructure sentences.
5. Do NOT fix factual mistakes — if the student said something technically wrong, keep it wrong.
6. Preserve the student's vocabulary, grammar style, and sentence structure.
7. If the transcript needs no fixing, return it exactly as-is.
8. Return ONLY the corrected transcript. No labels, no quotes, no explanation.

## Viva Question (context only — to identify likely technical terms)
${questionText}
${vocabSection}

## Raw Transcript to Correct
${rawTranscript}

Corrected transcript:`;
}

/**
 * Correct a raw speech transcript using the local LLM.
 *
 * @param {object} params
 * @param {string} params.questionText   – The current viva question
 * @param {string} params.rawTranscript  – Raw text from browser SpeechRecognition / Whisper
 * @param {string} params.subject        – Subject name, e.g. "JavaScript"
 * @param {string} [params.expectedAnswer] – Optional: used only for vocab extraction
 * @returns {Promise<{
 *   correctedTranscript: string,
 *   rawTranscript: string,
 *   correctionApplied: boolean,
 *   usedAI: boolean,
 *   error?: string
 * }>}
 */
async function correctTranscript({ questionText, rawTranscript, subject, expectedAnswer }) {
  const raw = (rawTranscript || '').trim();

  // Bail out immediately if disabled, empty, or very short
  if (!isEnabled() || !raw || raw.length < 5) {
    return {
      correctedTranscript: raw,
      rawTranscript: raw,
      correctionApplied: false,
      usedAI: false,
    };
  }

  const vocab = SUBJECT_VOCAB[subject] || [];

  if (process.env.NODE_ENV === 'development') {
    console.log('[TranscriptCorrection] Raw:', raw);
  }

  try {
    const prompt = buildPrompt(questionText, raw, subject, vocab);
    const result = await generate(prompt, {
      temperature: 0.0,    // deterministic — we want factual corrections, not creative
      maxTokens: 512,      // keep it fast; transcripts are rarely > 200 words
    });

    const corrected = result.text.trim();

    if (process.env.NODE_ENV === 'development') {
      console.log('[TranscriptCorrection] Corrected:', corrected);
    }

    const correctionApplied = corrected.toLowerCase() !== raw.toLowerCase();

    return {
      correctedTranscript: corrected || raw,
      rawTranscript: raw,
      correctionApplied,
      usedAI: true,
    };
  } catch (err) {
    // Always fall back — never block the student from submitting
    const isAiDown = err instanceof OllamaUnavailableError || err?.isAiUnavailable;
    if (process.env.NODE_ENV === 'development') {
      console.warn('[TranscriptCorrection] Fallback to raw transcript. Reason:', err.message);
    }
    return {
      correctedTranscript: raw,
      rawTranscript: raw,
      correctionApplied: false,
      usedAI: false,
      error: isAiDown ? 'AI unavailable' : err.message,
    };
  }
}

module.exports = { correctTranscript, SUBJECT_VOCAB };
