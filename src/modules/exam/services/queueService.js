'use strict';

const Redis = require('ioredis');

/**
 * QueueService
 * Implements a producer-consumer background worker queue.
 * Backed by Redis (RPUSH / BLPOP) when process.env.REDIS_URL is set.
 * Falls back to an in-memory async worker queue when Redis is unavailable.
 */
class QueueService {
  constructor() {
    this.redisClient = null;
    this.redisSubscriber = null;
    this.isUsingMemory = true;
    this.memoryQueues = {}; // queueName -> array of jobs
    this.memoryWorkers = {}; // queueName -> worker function
    this.activeLoops = {}; // track polling loops

    this.init();
  }

  init() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        console.log('[Queue] Initializing Redis Client...');
        this.redisClient = new Redis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false
        });
        
        this.redisSubscriber = new Redis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false
        });

        this.redisClient.on('connect', () => {
          console.log('[Queue] Redis Producer connected successfully.');
          this.isUsingMemory = false;
        });

        this.redisClient.on('error', (err) => {
          console.warn('[Queue] Redis Connection Error, falling back to memory queue:', err.message);
          this.isUsingMemory = true;
        });
      } catch (err) {
        console.warn('[Queue] Failed to initialize Redis client, using memory queue fallback:', err.message);
        this.isUsingMemory = true;
      }
    } else {
      console.log('[Queue] REDIS_URL not configured. Running in local memory queue mode.');
      this.isUsingMemory = true;
    }
  }

  /**
   * Add a job to the queue.
   * @param {string} queueName - Name of target queue
   * @param {object} jobData - Payload containing execution parameters
   * @returns {Promise<boolean>}
   */
  async enqueue(queueName, jobData) {
    const job = {
      id: `${queueName}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      data: jobData,
      createdAt: new Date().toISOString()
    };

    if (this.isUsingMemory) {
      if (!this.memoryQueues[queueName]) {
        this.memoryQueues[queueName] = [];
      }
      this.memoryQueues[queueName].push(job);
      
      // Trigger execution asynchronously in memory
      this.triggerMemoryWorker(queueName);
      return true;
    } else {
      try {
        await this.redisClient.rpush(queueName, JSON.stringify(job));
        return true;
      } catch (err) {
        console.error('[Queue] Redis enqueue failed, falling back to memory save:', err.message);
        // Fallback save
        if (!this.memoryQueues[queueName]) this.memoryQueues[queueName] = [];
        this.memoryQueues[queueName].push(job);
        this.triggerMemoryWorker(queueName);
        return true;
      }
    }
  }

  /**
   * Register a processing worker for a queue.
   * @param {string} queueName - Name of the queue
   * @param {Function} workerFn - Async function (job) -> void
   */
  async registerWorker(queueName, workerFn) {
    console.log(`[Queue] Registering worker for queue: '${queueName}'`);
    
    if (this.isUsingMemory) {
      this.memoryWorkers[queueName] = workerFn;
      this.triggerMemoryWorker(queueName);
    } else {
      // Start BRPOP loop for Redis queue
      if (this.activeLoops[queueName]) return;
      this.activeLoops[queueName] = true;
      
      // Run block loop
      this.startRedisWorkerLoop(queueName, workerFn);
    }
  }

  /**
   * Execute jobs from the memory queue asynchronously.
   * @param {string} queueName
   */
  async triggerMemoryWorker(queueName) {
    const queue = this.memoryQueues[queueName];
    const worker = this.memoryWorkers[queueName];

    if (!queue || queue.length === 0 || !worker) return;

    // Shift first job
    const job = queue.shift();
    
    // Run worker in background
    setTimeout(async () => {
      try {
        await worker(job);
      } catch (err) {
        console.error(`[Queue] Memory worker error for '${queueName}':`, err);
      } finally {
        // Run next job if exists
        this.triggerMemoryWorker(queueName);
      }
    }, 0);
  }

  /**
   * Polling loop for Redis.
   * @param {string} queueName
   * @param {Function} workerFn
   */
  async startRedisWorkerLoop(queueName, workerFn) {
    while (this.activeLoops[queueName] && !this.isUsingMemory) {
      try {
        // Block-pop a job (BLPOP waits up to 5s if empty)
        const result = await this.redisSubscriber.blpop(queueName, 5);
        if (result && result.length === 2) {
          const jobStr = result[1];
          const job = JSON.parse(jobStr);
          await workerFn(job);
        }
      } catch (err) {
        console.error(`[Queue] Redis Worker loop error for '${queueName}':`, err.message);
        // Sleep a bit before retrying in case Redis went down
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }
}

module.exports = new QueueService();
