'use strict';

/**
 * rateLimiter.js
 *
 * Production-grade rate limiting with `express-rate-limit` v7.
 *
 * Store strategy:
 *   - REDIS_URL present in env → shared Redis store via ioredis (multi-process safe)
 *   - Otherwise → in-memory store (suitable for single-process / dev)
 *
 * Limiters:
 *   apiLimiter          — 200 req / 15 min / IP  (applied globally)
 *   authLimiter         — 10  req / 15 min / IP  (login, register)
 *   submissionLimiter   — 20  req / 1  min / IP  (code execution)
 *   invalidAccessLimiter— 30  req / 5  min / IP  (triggered by resolvers on deny)
 */

const rateLimit = require('express-rate-limit');
const { logRateLimitBreach } = require('../utils/securityLogger');

// ── Shared handler called whenever a limit is exceeded ───────────────────────

function onLimitReached(req, res, options) {
  logRateLimitBreach({ req, limiterName: options.name ?? 'unknown' });
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please slow down and try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(options.windowMs / 1000),
  });
}

// ── Optional Redis store (only when REDIS_URL is configured) ──────────────────

function buildStore(name) {
  if (!process.env.REDIS_URL) return undefined; // fall back to memory store

  try {
    const Redis = require('ioredis');
    const client = new Redis(process.env.REDIS_URL, {
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    client.on('error', (err) => {
      console.warn(`[RateLimit] Redis error for limiter '${name}':`, err.message);
    });

    // express-rate-limit v7 requires a Store-compatible object
    const hits = new Map(); // fallback while redis is reconnecting

    return {
      async increment(key) {
        try {
          const multi = client.multi();
          const redisKey = `rl:${name}:${key}`;
          multi.incr(redisKey);
          multi.pttl(redisKey);
          const [[, totalHits], [, ttlMs]] = await multi.exec();
          if (ttlMs < 0) {
            // Key just created by this increment — set TTL
            await client.pexpire(redisKey, this.windowMs ?? 900_000);
          }
          return { totalHits, resetTime: new Date(Date.now() + (ttlMs < 0 ? this.windowMs : ttlMs)) };
        } catch {
          // Redis unavailable → fallback to memory
          const c = (hits.get(key) ?? 0) + 1;
          hits.set(key, c);
          return { totalHits: c, resetTime: new Date(Date.now() + (this.windowMs ?? 900_000)) };
        }
      },
      async decrement(key) {
        try {
          await client.decr(`rl:${name}:${key}`);
        } catch { }
      },
      async resetKey(key) {
        try {
          await client.del(`rl:${name}:${key}`);
        } catch { }
        hits.delete(key);
      },
    };
  } catch (err) {
    console.warn('[RateLimit] ioredis not available, using memory store:', err.message);
    return undefined;
  }
}

// ── Limiter factory ───────────────────────────────────────────────────────────

function makeLimiter({ name, windowMs, max, skipSuccessfulRequests = false }) {
  const store = buildStore(name);
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    store,
    handler: (req, res, next, options) => onLimitReached(req, res, { ...options, name }),
    keyGenerator: (req) => {
      // Key by IP; add user ID when available for finer-grained control
      const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      const uid = req.user?.id ?? 'anon';
      return `${ip}:${uid}`;
    },
  });
}

// ── Public limiters ───────────────────────────────────────────────────────────

const apiLimiter = makeLimiter({
  name: 'api',
  windowMs: 15 * 60 * 1000, // 15 min
  max: 300,
});

const authLimiter = makeLimiter({
  name: 'auth',
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  skipSuccessfulRequests: false, // count both success and fail
});

const submissionLimiter = makeLimiter({
  name: 'submission',
  windowMs: 60 * 1000,  // 1 min
  max: 20,
});

/**
 * invalidAccessLimiter — call this manually inside resolver deny handlers.
 * Usage: attach as middleware AFTER the resolver on routes prone to enumeration.
 */
const invalidAccessLimiter = makeLimiter({
  name: 'invalid_access',
  windowMs: 5 * 60 * 1000, // 5 min
  max: 30,
  skipSuccessfulRequests: true, // only count failed (denied) requests
});

const discussionLimiter = makeLimiter({
  name: 'discussion',
  windowMs: 60 * 1000, // 1 min
  max: 5,
});

const commentLimiter = makeLimiter({
  name: 'comment',
  windowMs: 60 * 1000, // 1 min
  max: 20,
});

const voteLimiter = makeLimiter({
  name: 'vote',
  windowMs: 60 * 1000, // 1 min
  max: 50,
});

const mentionLimiter = makeLimiter({
  name: 'mention',
  windowMs: 60 * 1000, // 1 min
  max: 10,
});

const reportLimiter = makeLimiter({
  name: 'report',
  windowMs: 5 * 60 * 1000, // 5 min
  max: 5,
});

module.exports = {
  apiLimiter,
  authLimiter,
  submissionLimiter,
  invalidAccessLimiter,
  discussionLimiter,
  commentLimiter,
  voteLimiter,
  mentionLimiter,
  reportLimiter,
};

