const { checkHealth, getConfig } = require('../lib/ai/llm.service');
const path = require('path');
const fs   = require('fs');

/** GET /api/ai/settings */
const getSettings = async (req, res, next) => {
  try {
    const cfg    = getConfig();
    const health = await checkHealth();
    res.json({
      success: true,
      settings: {
        model:          cfg.model,
        endpoint:       cfg.endpoint,
        timeout:        cfg.timeout,
        enabled:        cfg.enabled,
        temperature:    cfg.temperature,
        top_p:          cfg.top_p,
        top_k:          cfg.top_k,
        repeat_penalty: cfg.repeat_penalty,
        num_predict:    cfg.num_predict,
      },
      health
    });
  } catch (err) { next(err); }
};

/** POST /api/ai/settings */
const updateSettings = async (req, res, next) => {
  try {
    const { model, endpoint, timeout, enabled, temperature, top_p, top_k, repeat_penalty, num_predict } = req.body;
    const envPath = path.join(__dirname, '../../.env');
    let envContent = fs.readFileSync(envPath, 'utf8');

    const setEnv = (key, val) => {
      const line  = `${key}=${val}`;
      const regex = new RegExp(`^${key}=.*$`, 'm');
      envContent = regex.test(envContent)
        ? envContent.replace(regex, line)
        : envContent + `\n${line}`;
      process.env[key] = String(val);
    };

    if (model          !== undefined) setEnv('OLLAMA_MODEL',         model);
    if (endpoint       !== undefined) setEnv('OLLAMA_ENDPOINT',      endpoint);
    if (timeout        !== undefined) setEnv('OLLAMA_TIMEOUT_MS',    timeout);
    if (enabled        !== undefined) setEnv('AI_ENABLED',           String(enabled));
    if (temperature    !== undefined) setEnv('OLLAMA_TEMPERATURE',   temperature);
    if (top_p          !== undefined) setEnv('OLLAMA_TOP_P',         top_p);
    if (top_k          !== undefined) setEnv('OLLAMA_TOP_K',         top_k);
    if (repeat_penalty !== undefined) setEnv('OLLAMA_REPEAT_PENALTY',repeat_penalty);
    if (num_predict    !== undefined) setEnv('OLLAMA_NUM_PREDICT',   num_predict);

    fs.writeFileSync(envPath, envContent);

    const health = await checkHealth();
    res.json({ success: true, message: 'Settings saved.', health });
  } catch (err) { next(err); }
};

/** POST /api/ai/test */
const testConnection = async (req, res, next) => {
  try {
    const health = await checkHealth();
    const msg = health.available
      ? `Ollama running · "${health.model}" ${health.modelAvailable ? 'ready' : 'NOT pulled — run: ollama pull ' + health.model}`
      : `Ollama not reachable at ${health.endpoint} — run: ollama serve`;
    res.json({ success: health.available && health.modelAvailable, message: msg, health });
  } catch (err) { next(err); }
};

module.exports = { getSettings, updateSettings, testConnection };
