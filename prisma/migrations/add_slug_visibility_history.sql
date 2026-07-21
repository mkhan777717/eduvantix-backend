-- ============================================================
-- Migration: add_slug_visibility_history
-- Generated: 2026-07-20
--
-- Applies to: PostgreSQL (eduvantix)
-- Run this script once against your database, then run:
--   node src/scripts/migrateContestSlugs.js
-- to backfill Contest slugs from titles.
-- ============================================================

-- 1. Create Visibility enum
DO $$ BEGIN
  CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'PRIVATE', 'DRAFT', 'HIDDEN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Add visibility to Problem (default PUBLIC so existing records are unaffected)
ALTER TABLE "Problem"
  ADD COLUMN IF NOT EXISTS "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC';

-- 3. Add slug + visibility to Contest
--    Slug defaults to '' so existing rows don't violate NOT NULL;
--    run migrateContestSlugs.js immediately after to backfill real slugs.
ALTER TABLE "Contest"
  ADD COLUMN IF NOT EXISTS "slug"       TEXT         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC';

-- 4. Create unique constraint on Contest.slug (deferred: allows bulk update before enforce)
--    We use a partial unique index that skips the empty-string default during migration.
CREATE UNIQUE INDEX IF NOT EXISTS "Contest_slug_key"
  ON "Contest"("slug")
  WHERE "slug" <> '';

-- 5. ProblemSlugHistory
CREATE TABLE IF NOT EXISTS "ProblemSlugHistory" (
  "id"        SERIAL       PRIMARY KEY,
  "slug"      TEXT         NOT NULL,
  "problemId" INTEGER      NOT NULL,
  "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "ProblemSlugHistory_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ProblemSlugHistory_slug_idx" ON "ProblemSlugHistory"("slug");

-- 6. ContestSlugHistory
CREATE TABLE IF NOT EXISTS "ContestSlugHistory" (
  "id"        SERIAL       PRIMARY KEY,
  "slug"      TEXT         NOT NULL,
  "contestId" INTEGER      NOT NULL,
  "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "ContestSlugHistory_contestId_fkey"
    FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ContestSlugHistory_slug_idx" ON "ContestSlugHistory"("slug");

-- 7. Performance indexes on slug columns
CREATE INDEX IF NOT EXISTS "Problem_slug_idx"       ON "Problem"("slug");
CREATE INDEX IF NOT EXISTS "Problem_visibility_idx"  ON "Problem"("visibility");
CREATE INDEX IF NOT EXISTS "Contest_slug_idx"        ON "Contest"("slug");
CREATE INDEX IF NOT EXISTS "Contest_visibility_idx"  ON "Contest"("visibility");

-- Done. Run migrateContestSlugs.js next.
