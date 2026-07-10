/**
 * benchmark.js — AI Evaluation Accuracy Benchmark
 *
 * Usage:
 *   node src/lib/ai/benchmark.js
 *   node src/lib/ai/benchmark.js --model gemma2
 *   node src/lib/ai/benchmark.js --model phi3 --model gemma2   (compare)
 *
 * Tests evaluation quality across three answer tiers:
 *   Excellent  → expected score 8–10
 *   Partial    → expected score 4–7
 *   Incorrect  → expected score 0–3
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { evaluateAnswer } = require('./evaluation.service');

// ── Benchmark Dataset ────────────────────────────────────────────────
const DATASET = [
  // ── JavaScript: closures ────────────────────────────────────────
  {
    id: 'js-closure-excellent',
    tier: 'excellent',
    expectedRange: [8, 10],
    question: {
      questionText: 'Explain what a closure is in JavaScript and give a use case.',
      expectedAnswer: 'A closure is a function that retains access to its lexical scope even after the outer function has returned. Use cases include data encapsulation, factory functions, and maintaining state in callbacks.',
      keywords: 'lexical, scope, outer, function, closure, retain, access, encapsulation, state',
      difficulty: 'MEDIUM',
      topic: 'Closures'
    },
    answer: 'A closure is a function that has access to its outer function\'s scope even after the outer function has returned. This is because JavaScript functions maintain a reference to their lexical environment. A common use case is data privacy — you can create private variables by returning a function from another function. For example, a counter function that only exposes increment and get methods while keeping the count variable private.'
  },
  {
    id: 'js-closure-partial',
    tier: 'partial',
    expectedRange: [4, 7],
    question: {
      questionText: 'Explain what a closure is in JavaScript and give a use case.',
      expectedAnswer: 'A closure is a function that retains access to its lexical scope even after the outer function has returned. Use cases include data encapsulation, factory functions, and maintaining state in callbacks.',
      keywords: 'lexical, scope, outer, function, closure, retain, access, encapsulation, state',
      difficulty: 'MEDIUM',
      topic: 'Closures'
    },
    answer: 'A closure is when a function remembers variables from where it was created. It is used when you want to keep some data private. I think it is related to scope in JavaScript.'
  },
  {
    id: 'js-closure-incorrect',
    tier: 'incorrect',
    expectedRange: [0, 3],
    question: {
      questionText: 'Explain what a closure is in JavaScript and give a use case.',
      expectedAnswer: 'A closure is a function that retains access to its lexical scope even after the outer function has returned.',
      keywords: 'lexical, scope, outer, function, closure, retain, access',
      difficulty: 'MEDIUM',
      topic: 'Closures'
    },
    answer: 'Closure is a way to close the browser window. You can use window.close() to implement it.'
  },

  // ── JavaScript: var/let/const ────────────────────────────────────
  {
    id: 'js-varletconst-excellent',
    tier: 'excellent',
    expectedRange: [8, 10],
    question: {
      questionText: 'What are the differences between var, let, and const in JavaScript?',
      expectedAnswer: 'var is function-scoped and hoisted. let and const are block-scoped and not accessible before declaration (temporal dead zone). const cannot be reassigned after declaration.',
      keywords: 'scope, hoist, block, reassign, var, let, const, temporal dead zone, function-scoped',
      difficulty: 'EASY',
      topic: 'Scope & Variables'
    },
    answer: 'var is function-scoped and gets hoisted to the top of its function with an initial value of undefined. let and const are both block-scoped, meaning they are only accessible within the block they are declared in. They are also hoisted but remain in the temporal dead zone until their declaration is reached, so accessing them before declaration throws a ReferenceError. The key difference between let and const is that const cannot be reassigned, though objects declared with const can still be mutated.'
  },
  {
    id: 'js-varletconst-partial',
    tier: 'partial',
    expectedRange: [4, 7],
    question: {
      questionText: 'What are the differences between var, let, and const in JavaScript?',
      expectedAnswer: 'var is function-scoped and hoisted. let and const are block-scoped.',
      keywords: 'scope, hoist, block, reassign, var, let, const',
      difficulty: 'EASY',
      topic: 'Scope & Variables'
    },
    answer: 'var can be reassigned and redeclared. let can be reassigned but not redeclared. const cannot be reassigned. They all declare variables but have different scoping rules.'
  },
  {
    id: 'js-varletconst-incorrect',
    tier: 'incorrect',
    expectedRange: [0, 3],
    question: {
      questionText: 'What are the differences between var, let, and const in JavaScript?',
      expectedAnswer: 'var is function-scoped, let and const are block-scoped.',
      keywords: 'scope, hoist, block, var, let, const',
      difficulty: 'EASY',
      topic: 'Scope & Variables'
    },
    answer: 'var is for strings, let is for numbers, and const is for boolean values in JavaScript.'
  },

  // ── DBMS: ACID ───────────────────────────────────────────────────
  {
    id: 'dbms-acid-excellent',
    tier: 'excellent',
    expectedRange: [8, 10],
    question: {
      questionText: 'Explain the ACID properties in database management systems.',
      expectedAnswer: 'ACID: Atomicity (all or nothing), Consistency (valid state), Isolation (concurrent independence), Durability (persists after failure).',
      keywords: 'atomicity, consistency, isolation, durability, transaction, rollback, commit',
      difficulty: 'MEDIUM',
      topic: 'Transactions'
    },
    answer: 'ACID stands for Atomicity, Consistency, Isolation, and Durability. Atomicity means a transaction is all-or-nothing — if any part fails, the entire transaction is rolled back. Consistency ensures the database moves from one valid state to another, maintaining all defined rules. Isolation means concurrent transactions execute as if they were sequential, preventing dirty reads and phantom reads. Durability guarantees that once a transaction is committed, it persists even in the case of system failure, typically through write-ahead logging.'
  },
  {
    id: 'dbms-acid-incorrect',
    tier: 'incorrect',
    expectedRange: [0, 3],
    question: {
      questionText: 'Explain the ACID properties in database management systems.',
      expectedAnswer: 'ACID: Atomicity, Consistency, Isolation, Durability.',
      keywords: 'atomicity, consistency, isolation, durability',
      difficulty: 'MEDIUM',
      topic: 'Transactions'
    },
    answer: 'ACID is a type of database software like MySQL or PostgreSQL. It is used to store data efficiently.'
  },
];

// ── Runner ────────────────────────────────────────────────────────────
async function runBenchmark(modelName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  BENCHMARK: ${modelName || process.env.OLLAMA_MODEL || 'phi3'}`);
  console.log(`${'='.repeat(60)}\n`);

  if (modelName) process.env.OLLAMA_MODEL = modelName;

  const results = [];
  let passed = 0, total = DATASET.length;

  for (const sample of DATASET) {
    process.stdout.write(`  [${sample.tier.toUpperCase().padEnd(9)}] ${sample.id.padEnd(30)} `);
    const start = Date.now();

    try {
      const eval_ = await evaluateAnswer(sample.question, sample.answer, 'JavaScript');
      const elapsed = Date.now() - start;
      const [lo, hi] = sample.expectedRange;
      const inRange = eval_.score >= lo && eval_.score <= hi;
      const usedAI = !eval_.usedFallback;

      if (inRange) passed++;

      const icon = inRange ? '✓' : '✗';
      const aiLabel = usedAI ? `[AI ${eval_.model?.split(':')[0] || ''}]` : '[FALLBACK]';
      console.log(`${icon} score=${eval_.score} expected=${lo}-${hi} conf=${((eval_.confidence||0)*100).toFixed(0)}% ${elapsed}ms ${aiLabel}`);

      results.push({ ...sample, actualScore: eval_.score, inRange, elapsed, usedAI, confidence: eval_.confidence });
    } catch (err) {
      console.log(`✗ ERROR: ${err.message}`);
      results.push({ ...sample, actualScore: -1, inRange: false, elapsed: Date.now() - start, error: err.message });
    }
  }

  // Summary
  const accuracy = ((passed / total) * 100).toFixed(0);
  const avgElapsed = Math.round(results.filter(r => r.elapsed).reduce((s, r) => s + r.elapsed, 0) / results.length);
  const avgConf = results.filter(r => r.confidence != null).reduce((s, r) => s + r.confidence, 0) / results.filter(r => r.confidence != null).length;

  console.log(`\n  Results: ${passed}/${total} in expected range  (${accuracy}% accuracy)`);
  console.log(`  Avg latency: ${avgElapsed}ms`);
  console.log(`  Avg confidence: ${(avgConf * 100).toFixed(0)}%`);

  // Tier breakdown
  const tiers = ['excellent', 'partial', 'incorrect'];
  tiers.forEach(tier => {
    const tierResults = results.filter(r => r.tier === tier);
    const tierPassed  = tierResults.filter(r => r.inRange).length;
    console.log(`  ${tier.padEnd(12)}: ${tierPassed}/${tierResults.length}`);
  });

  console.log('');
  return { model: modelName || process.env.OLLAMA_MODEL, accuracy: parseInt(accuracy), passed, total, avgElapsed, avgConf };
}

async function main() {
  const args = process.argv.slice(2);
  const models = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) models.push(args[++i]);
  }

  if (models.length === 0) {
    // Run with current model from .env
    await runBenchmark(null);
  } else if (models.length === 1) {
    await runBenchmark(models[0]);
  } else {
    // Compare multiple models
    const comparisons = [];
    for (const m of models) {
      const r = await runBenchmark(m);
      comparisons.push(r);
    }

    console.log('\n' + '='.repeat(60));
    console.log('  MODEL COMPARISON');
    console.log('='.repeat(60));
    console.log(`  ${'Model'.padEnd(20)} ${'Accuracy'.padEnd(12)} ${'Latency'.padEnd(12)} Confidence`);
    console.log('  ' + '-'.repeat(56));
    comparisons.forEach(c => {
      console.log(`  ${c.model.padEnd(20)} ${(c.accuracy + '%').padEnd(12)} ${(c.avgElapsed + 'ms').padEnd(12)} ${(c.avgConf * 100).toFixed(0)}%`);
    });

    const best = comparisons.reduce((a, b) => a.accuracy >= b.accuracy ? a : b);
    console.log(`\n  ★ Best accuracy: ${best.model} (${best.accuracy}%)`);
    const fastest = comparisons.reduce((a, b) => a.avgElapsed <= b.avgElapsed ? a : b);
    console.log(`  ⚡ Fastest: ${fastest.model} (${fastest.avgElapsed}ms avg)\n`);
  }
}

main().catch(console.error);
