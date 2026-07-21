'use strict';

/**
 * migrateContestSlugs.js
 *
 * One-time migration: generate slugs for all Contest records that have none.
 * Also backfills an empty-string slug (the default added by the schema migration).
 *
 * Run ONCE after applying the Prisma migration:
 *   node src/scripts/migrateContestSlugs.js
 *
 * Safe to re-run: it only updates records where slug === '' or slug IS NULL.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── Slug helpers ───────────────────────────────────────────────────────────────

function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function generateUniqueSlug(base, excludeId) {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await prisma.contest.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

// ── Main migration ─────────────────────────────────────────────────────────────

async function migrate() {
  console.log('=================================================');
  console.log(' Contest Slug Migration');
  console.log('=================================================\n');

  const contests = await prisma.contest.findMany({
    where: {
      OR: [{ slug: '' }, { slug: null }],
    },
    select: { id: true, title: true },
    orderBy: { id: 'asc' },
  });

  if (contests.length === 0) {
    console.log('✅ All contests already have slugs. Nothing to do.\n');
    return;
  }

  console.log(`Found ${contests.length} contest(s) without slugs. Generating...\n`);

  const results = { success: 0, skipped: 0, errors: [] };

  for (const contest of contests) {
    try {
      const base = slugify(contest.title);
      if (!base) {
        console.warn(`  ⚠️  [${contest.id}] Title "${contest.title}" produces an empty slug — skipping.`);
        results.skipped++;
        continue;
      }

      const slug = await generateUniqueSlug(base, contest.id);

      await prisma.contest.update({
        where: { id: contest.id },
        data: { slug },
      });

      console.log(`  ✅ [${contest.id}] "${contest.title}" → "${slug}"`);
      results.success++;
    } catch (err) {
      console.error(`  ❌ [${contest.id}] Failed: ${err.message}`);
      results.errors.push({ id: contest.id, title: contest.title, error: err.message });
    }
  }

  console.log('\n=================================================');
  console.log(` Migration complete`);
  console.log(`   Updated:  ${results.success}`);
  console.log(`   Skipped:  ${results.skipped}`);
  console.log(`   Errors:   ${results.errors.length}`);
  console.log('=================================================\n');

  if (results.errors.length > 0) {
    console.error('Errors:');
    results.errors.forEach((e) => console.error(`  [${e.id}] ${e.title}: ${e.error}`));
    process.exit(1);
  }
}

migrate()
  .catch((err) => {
    console.error('Fatal migration error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
