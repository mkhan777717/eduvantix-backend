/**
 * llm.service.js — Central Ollama client.
 *
 * ALL AI calls in the system must go through this module.
 * Swap provider: replace `callOllama` with any function that accepts
 * (prompt, opts) and returns { text }. Nothing else changes.
 *
 * Sampling parameters are read from env so every call is configurable
 * without touching code.
 */

const http  = require('http');
const https = require('https');

// ── Config ────────────────────────────────────────────────────────────
const getConfig = () => ({
  endpoint:      process.env.OLLAMA_ENDPOINT      || 'http://localhost:11434',
  model:         process.env.OLLAMA_MODEL         || 'phi3',
  timeout:       parseInt(process.env.OLLAMA_TIMEOUT_MS  || '60000'),
  enabled:       process.env.AI_ENABLED !== 'false',
  // Sampling defaults — all overridable per-call via opts
  temperature:   parseFloat(process.env.OLLAMA_TEMPERATURE    || '0.1'),
  top_p:         parseFloat(process.env.OLLAMA_TOP_P          || '0.9'),
  top_k:         parseInt(  process.env.OLLAMA_TOP_K          || '20'),
  repeat_penalty:parseFloat(process.env.OLLAMA_REPEAT_PENALTY || '1.1'),
  num_predict:   parseInt(  process.env.OLLAMA_NUM_PREDICT    || '1024'),
});

// ── Dev logger ────────────────────────────────────────────────────────
function devLog(label, data) {
  if (process.env.NODE_ENV !== 'development') return;
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[AI ${ts}] ${label}`, typeof data === 'string' ? data.slice(0, 300) : data);
}

/**
 * Check if Ollama is reachable + model is pulled.
 */
async function checkHealth() {
  const { endpoint, model } = getConfig();
  try {
    const res  = await rawRequest('GET', `${endpoint}/api/tags`, null, 5000);
    const data = JSON.parse(res);
    const models        = (data.models || []).map(m => m.name);
    const modelAvailable = models.some(m => m.startsWith(model));
    return { available: true, model, modelAvailable, models, endpoint };
  } catch (err) {
    return { available: false, model, endpoint, error: err.message };
  }
}

/**
 * Core text generation.
 * opts can override any sampling parameter from getConfig().
 */
async function generate(prompt, opts = {}) {
  const cfg = getConfig();
  if (!cfg.enabled) throw new OllamaUnavailableError('AI is disabled (AI_ENABLED=false).');

  const model = opts.model || cfg.model;

  const ollamaOpts = {
    temperature:    opts.temperature    ?? cfg.temperature,
    top_p:          opts.top_p          ?? cfg.top_p,
    top_k:          opts.top_k          ?? cfg.top_k,
    repeat_penalty: opts.repeat_penalty ?? cfg.repeat_penalty,
    num_predict:    opts.maxTokens      ?? opts.num_predict ?? cfg.num_predict,
  };

  const body = JSON.stringify({ model, prompt, stream: false, options: ollamaOpts });

  const start = Date.now();
  devLog('PROMPT →', `[${model}] ${prompt}`);

  try {
    const raw  = await rawRequest('POST', `${cfg.endpoint}/api/generate`, body, cfg.timeout);
    const data = JSON.parse(raw);
    if (!data.response) throw new Error('Empty response from Ollama.');

    const elapsed = Date.now() - start;
    devLog('RESPONSE ←', `[${elapsed}ms] ${data.response}`);

    return { text: data.response.trim(), model: data.model || model, tokens: data.eval_count, elapsed };
  } catch (err) {
    if (err instanceof OllamaUnavailableError) throw err;
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('connect'))
      throw new OllamaUnavailableError(`Ollama not running at ${cfg.endpoint}. Run: ollama serve`);
    if (err.message?.includes('timeout'))
      throw new OllamaUnavailableError(`Ollama timed out after ${cfg.timeout}ms. Model may still be loading.`);
    throw new OllamaUnavailableError(`Ollama error: ${err.message}`);
  }
}

/**
 * Generate and parse a strict JSON response.
 * Strips markdown fences, finds JSON boundaries, retries once on parse failure.
 */
async function generateJSON(prompt, opts = {}) {
  const wrappedPrompt = `${prompt}

CRITICAL: Respond with ONLY a valid JSON object. No markdown, no code fences, no text before or after. Raw JSON only.`;

  // Use near-zero temperature for JSON — hallucination ruins parsing
  const result = await generate(wrappedPrompt, { ...opts, temperature: opts.temperature ?? 0.05 });

  function extractJSON(text) {
    let t = text
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')
      .trim();
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s !== -1 && e > s) t = t.slice(s, e + 1);
    // Remove trailing commas before closing braces/brackets
    t = t.replace(/,\s*([\]}])/g, '$1');
    return t;
  }

  try {
    return { data: JSON.parse(extractJSON(result.text)), model: result.model, elapsed: result.elapsed };
  } catch {
    devLog('JSON parse failed, retrying at temp=0', '');
    const retry = await generate(
      `You must return ONLY a JSON object, nothing else.\n\n${prompt}`,
      { ...opts, temperature: 0.0 }
    );
    return { data: JSON.parse(extractJSON(retry.text)), model: retry.model, elapsed: retry.elapsed };
  }
}

// ── Error class ───────────────────────────────────────────────────────
class OllamaUnavailableError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'OllamaUnavailableError';
    this.isAiUnavailable = true;
  }
}

// ── Raw HTTP (no external deps) ───────────────────────────────────────
function rawRequest(method, url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const opts   = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers:  body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}
    };
    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request timeout after ${timeoutMs}ms`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { generate, generateJSON, checkHealth, getConfig, OllamaUnavailableError };
