'use strict';

/**
 * securityLogger.js
 *
 * Structured JSON logger for every unauthorized resource access attempt.
 * Writes to stdout (picked up by your log aggregator) and a local file.
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../logs/security.log');

// Ensure logs directory exists
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Log an unauthorized access attempt.
 *
 * @param {Object} params
 * @param {Object|null} params.user         - req.user (may be null for unauthenticated)
 * @param {string}      params.resource     - 'problem' | 'contest' | 'viva' | ...
 * @param {string}      params.identifier   - The slug or identifier that was attempted
 * @param {string}      params.reason       - Denial reason code (e.g. 'NOT_AUTHENTICATED')
 * @param {Object}      params.req          - Express request object
 */
function logUnauthorizedAttempt({ user, resource, identifier, reason, req }) {
  const entry = {
    event: 'UNAUTHORIZED_ACCESS',
    timestamp: new Date().toISOString(),
    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    userId: user?.id ?? null,
    userRole: user?.role ?? null,
    resource,
    identifier,
    reason,
    method: req.method,
    path: req.originalUrl,
    userAgent: req.headers['user-agent'] ?? null,
  };

  const line = JSON.stringify(entry);

  // stdout — picked up by PM2 / Docker / cloud log aggregators
  console.warn('[SECURITY]', line);

  // local append-only log file (rotate externally via logrotate/PM2)
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (_) {
    // Non-fatal: log write failure must never crash the request handler
  }
}

/**
 * Log a rate-limit breach event.
 */
function logRateLimitBreach({ req, limiterName }) {
  const entry = {
    event: 'RATE_LIMIT_BREACH',
    timestamp: new Date().toISOString(),
    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    limiter: limiterName,
    method: req.method,
    path: req.originalUrl,
  };

  const line = JSON.stringify(entry);
  console.warn('[SECURITY]', line);

  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (_) {}
}

module.exports = { logUnauthorizedAttempt, logRateLimitBreach };
