'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = require('../src/prisma');

async function main() {
  console.log('[CONTEST_FIX] Ensuring all Contest table columns exist...');

  try {
    // Ensure Visibility enum type exists
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'PRIVATE', 'UNLISTED', 'HIDDEN', 'DRAFT');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Add missing columns to Contest table idempotently
    const columns = [
      `ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "slug" TEXT;`,
      `ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC';`,
      `ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "description" TEXT;`,
      `ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "category" TEXT;`,
      `ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "creatorId" INT;`,
      `ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "instituteId" INT;`,
    ];

    for (const sql of columns) {
      try {
        await prisma.$executeRawUnsafe(sql);
        console.log('✓ Executed:', sql);
      } catch (e) {
        console.log('⊘ Skipped/already exists:', e.message);
      }
    }

    // Populate missing slugs
    await prisma.$executeRawUnsafe(`
      UPDATE "Contest"
      SET "slug" = COALESCE(
        NULLIF(LOWER(REGEXP_REPLACE(REGEXP_REPLACE("title", '[^a-zA-Z0-9 -]', '', 'g'), '\s+', '-', 'g')), ''),
        'contest-' || "id"
      )
      WHERE "slug" IS NULL OR "slug" = '';
    `);
    console.log('✓ Populated contest slugs');

    // Create indexes idempotently
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE UNIQUE INDEX "Contest_slug_key" ON "Contest"("slug");
        EXCEPTION WHEN duplicate_object THEN NULL;
        WHEN OTHERS THEN NULL;
        END $$;
      `);
      console.log('✓ Unique index on Contest(slug)');
    } catch (_) {}

    try {
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Contest_slug_idx" ON "Contest"("slug");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Contest_visibility_idx" ON "Contest"("visibility");`);
      console.log('✓ Indexes on Contest slug & visibility');
    } catch (_) {}

    console.log('[CONTEST_FIX] Contest table fixes applied successfully!');
  } catch (err) {
    console.error('[CONTEST_FIX] Error applying fixes:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
