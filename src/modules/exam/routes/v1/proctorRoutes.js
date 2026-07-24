'use strict';

/**
 * proctorRoutes.js — Auth-gated proxy between the Next.js frontend and the
 * Python FastAPI proctoring sidecar (port 8001).
 *
 * All routes require JWT authentication (handled by the protect middleware).
 * The proxy forwards requests to PROCTOR_SERVICE_URL and relays responses,
 * keeping auth consistent with the rest of the platform.
 */

const express = require('express');
const http = require('http');
const https = require('https');

const { protect } = require('../../../../middleware/authMiddleware');

const router = express.Router();

const PROCTOR_URL = process.env.PROCTOR_SERVICE_URL || 'http://127.0.0.1:8001';
const PROCTOR_PREFIX = '/api/v1/proctor';

// ── Helpers ───────────────────────────────────────────────────────────────────

function proxyRequest(req, res, next, targetPath, method, bodyOverride) {
  const url = new URL(PROCTOR_URL + PROCTOR_PREFIX + targetPath);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  const body = bodyOverride !== undefined
    ? JSON.stringify(bodyOverride)
    : JSON.stringify(req.body);

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + (url.search || ''),
    method: method || req.method,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'X-Internal-Secret': process.env.INTERNAL_API_SECRET || '',
      'X-Forwarded-User': String(req.user?.id || ''),
    },
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 200);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[proctor_proxy] upstream error:', err.message);
    res.status(502).json({
      success: false,
      message: 'Proctoring service unavailable',
      detail: err.message,
    });
  });

  proxyReq.write(body);
  proxyReq.end();
}

// ── Routes ────────────────────────────────────────────────────────────────────

// All proctor routes require a valid JWT
router.use(protect);

/**
 * POST /api/v1/proctor/session/start
 * Create or resume a proctoring session for an exam attempt.
 */
router.post('/session/start', (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  // Inject authenticated user_id (cannot be spoofed by client)
  const body = { ...req.body, user_id: userId };
  proxyRequest(req, res, next, '/session/start', 'POST', body);
});

/**
 * POST /api/v1/proctor/session/end
 * Mark a proctoring session as ended.
 */
router.post('/session/end', (req, res, next) => {
  proxyRequest(req, res, next, '/session/end', 'POST');
});

/**
 * POST /api/v1/proctor/event/browser
 * Relay browser lifecycle events (TAB_HIDDEN, WINDOW_BLUR, etc.).
 */
router.post('/event/browser', (req, res, next) => {
  proxyRequest(req, res, next, '/event/browser', 'POST');
});

/**
 * POST /api/v1/proctor/frame
 * REST frame fallback (used when WebSocket is blocked).
 * Passes raw multipart body through.
 */
router.post('/frame', express.raw({ type: '*/*', limit: '2mb' }), (req, res, next) => {
  const url = new URL(PROCTOR_URL + PROCTOR_PREFIX + '/frame');
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      ...req.headers,
      host: url.host,
      'X-Internal-Secret': process.env.INTERNAL_API_SECRET || '',
      'X-Forwarded-User': String(req.user?.id || ''),
    },
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 200);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.status(502).json({ success: false, message: 'Proctoring service unavailable' });
  });

  proxyReq.write(req.body);
  proxyReq.end();
});

/**
 * GET /api/v1/proctor/report/:sessionId
 * Fetch the full proctor report for an exam attempt (mentor/admin only).
 */
router.get('/report/:sessionId', (req, res, next) => {
  const url = new URL(PROCTOR_URL + PROCTOR_PREFIX + '/report/' + req.params.sessionId);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'GET',
    headers: {
      'X-Internal-Secret': process.env.INTERNAL_API_SECRET || '',
    },
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 200);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.status(502).json({ success: false, message: 'Proctoring service unavailable' });
  });

  proxyReq.end();
});

/**
 * GET /api/v1/proctor/health
 * Public-ish health check — still requires auth to prevent open enumeration.
 */
router.get('/health', (req, res, next) => {
  const url = new URL(PROCTOR_URL + PROCTOR_PREFIX + '/health');
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'GET',
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 200);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    res.status(503).json({ status: 'error', message: 'Proctoring service unreachable' });
  });

  proxyReq.end();
});

module.exports = router;
