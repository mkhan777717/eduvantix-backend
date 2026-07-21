'use strict';

/**
 * resolverCache.js
 *
 * In-process TTL cache for slug → DB record lookups.
 * Eliminates repeated DB round-trips for the same slug within a short window.
 *
 * In production with multiple processes, replace this with a shared Redis cache
 * by setting REDIS_URL in environment — the ResolverRegistry will use ioredis
 * automatically when REDIS_URL is present.
 */

const DEFAULT_TTL_MS = 60_000; // 60 seconds

class ResolverCache {
  constructor(ttlMs = DEFAULT_TTL_MS) {
    this._store = new Map();
    this._ttl = ttlMs;
  }

  _key(resourceType, identifier) {
    return `${resourceType}:${identifier}`;
  }

  get(resourceType, identifier) {
    const key = this._key(resourceType, identifier);
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(resourceType, identifier, value) {
    const key = this._key(resourceType, identifier);
    this._store.set(key, {
      value,
      expiresAt: Date.now() + this._ttl,
    });
  }

  invalidate(resourceType, identifier) {
    const key = this._key(resourceType, identifier);
    this._store.delete(key);
  }

  /**
   * Purge all entries for a resource type (e.g. after a bulk update).
   */
  invalidateAll(resourceType) {
    const prefix = `${resourceType}:`;
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }

  /** Periodic cleanup of expired entries to prevent memory leaks. */
  startAutoCleanup(intervalMs = 120_000) {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this._store.entries()) {
        if (now > entry.expiresAt) this._store.delete(key);
      }
    }, intervalMs).unref(); // .unref() so the timer does not block process exit
  }
}

// Singleton shared across the application
const cache = new ResolverCache();
cache.startAutoCleanup();

module.exports = cache;
