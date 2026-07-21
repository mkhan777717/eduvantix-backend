/**
 * apply-discussion-migration.js
 *
 * Applies Discussion Forum schema additions using the same Prisma client
 * the application uses (Neon cloud DB in development, local in production).
 *
 * This script is fully idempotent — safe to run multiple times.
 * Run:  node prisma/apply-discussion-migration.js
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Use the application's Prisma singleton (handles Neon fallback in dev)
const prisma = require('../src/prisma/index.js');

async function main() {
  console.log('[MIGRATION] Applying Discussion Forum schema additions...\n');

  // Verify connection first
  try {
    const result = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    console.log(`[MIGRATION] Connected to database: ${result[0].db}\n`);
  } catch (e) {
    console.error('[MIGRATION] Cannot connect to database:', e.message);
    process.exit(1);
  }

  const statements = [
    // ─── Enums ────────────────────────────────────────────────────────────────
    `DO $$ BEGIN
      CREATE TYPE "DiscussionCategory" AS ENUM (
        'GENERAL','PROBLEM','CONTEST','VIVA','COURSE','ASSIGNMENT','QUIZ','ANNOUNCEMENT',
        'INTERVIEW','CAREER','HELP','BUG_REPORT','FEATURE_REQUEST','OFF_TOPIC'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    `DO $$ BEGIN
      CREATE TYPE "VoteTarget" AS ENUM ('DISCUSSION','COMMENT');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    `DO $$ BEGIN
      CREATE TYPE "ReportReason" AS ENUM ('SPAM','HARASSMENT','INAPPROPRIATE','OFF_TOPIC','OTHER');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    `DO $$ BEGIN
      CREATE TYPE "DiscussNotifType" AS ENUM (
        'REPLY','MENTION','VOTE_MILESTONE','ACCEPTED_ANSWER','PINNED','LOCKED','UNLOCKED',
        'THREAD_MOVED','THREAD_REOPENED','FOLLOWED_TAG_NEW_POST','MODERATOR_ACTION','TEACHER_REPLY'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    `DO $$ BEGIN
      CREATE TYPE "AuditAction" AS ENUM (
        'PIN','UNPIN','LOCK','UNLOCK','DELETE','RESTORE','MOVE',
        'ACCEPT_ANSWER','REJECT_REPORT','RESOLVE_REPORT','SHADOW_BAN'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    // ─── Discussion ───────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "Discussion" (
      "id"                SERIAL PRIMARY KEY,
      "slug"              TEXT NOT NULL,
      "title"             TEXT NOT NULL,
      "body"              TEXT NOT NULL,
      "bodyTsv"           TSVECTOR,
      "category"          "DiscussionCategory" NOT NULL DEFAULT 'GENERAL',
      "authorId"          INT NOT NULL,
      "problemId"         INT,
      "contestId"         INT,
      "vivaId"            INT,
      "instituteId"       INT,
      "courseIdRef"       INT,
      "assignmentIdRef"   INT,
      "quizIdRef"         INT,
      "isPinned"          BOOLEAN NOT NULL DEFAULT false,
      "isLocked"          BOOLEAN NOT NULL DEFAULT false,
      "acceptedCommentId" INT,
      "score"             INT NOT NULL DEFAULT 0,
      "hotScore"          DOUBLE PRECISION NOT NULL DEFAULT 0,
      "viewCount"         INT NOT NULL DEFAULT 0,
      "replyCount"        INT NOT NULL DEFAULT 0,
      "upvoteCount"       INT NOT NULL DEFAULT 0,
      "downvoteCount"     INT NOT NULL DEFAULT 0,
      "bookmarkCount"     INT NOT NULL DEFAULT 0,
      "shareCount"        INT NOT NULL DEFAULT 0,
      "reportCount"       INT NOT NULL DEFAULT 0,
      "deletedAt"         TIMESTAMPTZ,
      "deletedById"       INT,
      "deleteReason"      TEXT,
      "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    `ALTER TABLE "Discussion" ADD COLUMN IF NOT EXISTS "upvoteCount" INT NOT NULL DEFAULT 0`,
    `ALTER TABLE "Discussion" ADD COLUMN IF NOT EXISTS "downvoteCount" INT NOT NULL DEFAULT 0`,
    `ALTER TABLE "Discussion" ADD COLUMN IF NOT EXISTS "bookmarkCount" INT NOT NULL DEFAULT 0`,
    `ALTER TABLE "Discussion" ADD COLUMN IF NOT EXISTS "shareCount" INT NOT NULL DEFAULT 0`,
    `ALTER TABLE "Discussion" ADD COLUMN IF NOT EXISTS "reportCount" INT NOT NULL DEFAULT 0`,

    `DO $$ BEGIN ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_slug_unique" UNIQUE ("slug"); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_acceptedCommentId_unique" UNIQUE ("acceptedCommentId"); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_vivaId_fkey" FOREIGN KEY ("vivaId") REFERENCES "Viva"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    `CREATE INDEX IF NOT EXISTS "Discussion_slug_idx"      ON "Discussion"("slug")`,
    `CREATE INDEX IF NOT EXISTS "Discussion_category_idx"  ON "Discussion"("category")`,
    `CREATE INDEX IF NOT EXISTS "Discussion_authorId_idx"  ON "Discussion"("authorId")`,
    `CREATE INDEX IF NOT EXISTS "Discussion_createdAt_idx" ON "Discussion"("createdAt")`,
    `CREATE INDEX IF NOT EXISTS "Discussion_hotScore_idx"  ON "Discussion"("hotScore")`,
    `CREATE INDEX IF NOT EXISTS "Discussion_score_idx"     ON "Discussion"("score")`,
    `CREATE INDEX IF NOT EXISTS "Discussion_problemId_idx" ON "Discussion"("problemId")`,
    `CREATE INDEX IF NOT EXISTS "Discussion_contestId_idx" ON "Discussion"("contestId")`,
    `CREATE INDEX IF NOT EXISTS "Discussion_vivaId_idx"    ON "Discussion"("vivaId")`,
    `CREATE INDEX IF NOT EXISTS "Discussion_deletedAt_idx" ON "Discussion"("deletedAt")`,
    `CREATE INDEX IF NOT EXISTS "Discussion_bodyTsv_idx"   ON "Discussion" USING GIN("bodyTsv")`,

    `CREATE OR REPLACE FUNCTION discussion_tsv_trigger() RETURNS TRIGGER AS $fn$
    BEGIN
      NEW."bodyTsv" := to_tsvector('english', coalesce(NEW."title",'') || ' ' || coalesce(NEW."body",''));
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql`,

    `DROP TRIGGER IF EXISTS discussion_tsv_update ON "Discussion"`,
    `CREATE TRIGGER discussion_tsv_update BEFORE INSERT OR UPDATE ON "Discussion" FOR EACH ROW EXECUTE FUNCTION discussion_tsv_trigger()`,

    // ─── Comment ──────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "Comment" (
      "id"              SERIAL PRIMARY KEY,
      "slug"            TEXT NOT NULL,
      "body"            TEXT NOT NULL,
      "bodyTsv"         TSVECTOR,
      "depth"           INT NOT NULL DEFAULT 0,
      "authorId"        INT NOT NULL,
      "discussionId"    INT NOT NULL,
      "parentCommentId" INT,
      "score"           INT NOT NULL DEFAULT 0,
      "replyCount"      INT NOT NULL DEFAULT 0,
      "deletedAt"       TIMESTAMPTZ,
      "deletedById"     INT,
      "deleteReason"    TEXT,
      "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    `DO $$ BEGIN ALTER TABLE "Comment" ADD CONSTRAINT "Comment_slug_unique" UNIQUE ("slug"); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Comment" ADD CONSTRAINT "Comment_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Comment" ADD CONSTRAINT "Comment_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    `CREATE INDEX IF NOT EXISTS "Comment_discussionId_idx"    ON "Comment"("discussionId")`,
    `CREATE INDEX IF NOT EXISTS "Comment_authorId_idx"        ON "Comment"("authorId")`,
    `CREATE INDEX IF NOT EXISTS "Comment_parentCommentId_idx" ON "Comment"("parentCommentId")`,
    `CREATE INDEX IF NOT EXISTS "Comment_createdAt_idx"       ON "Comment"("createdAt")`,
    `CREATE INDEX IF NOT EXISTS "Comment_deletedAt_idx"       ON "Comment"("deletedAt")`,
    `CREATE INDEX IF NOT EXISTS "Comment_bodyTsv_idx"         ON "Comment" USING GIN("bodyTsv")`,

    `CREATE OR REPLACE FUNCTION comment_tsv_trigger() RETURNS TRIGGER AS $fn$
    BEGIN
      NEW."bodyTsv" := to_tsvector('english', coalesce(NEW."body",''));
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql`,

    `DROP TRIGGER IF EXISTS comment_tsv_update ON "Comment"`,
    `CREATE TRIGGER comment_tsv_update BEFORE INSERT OR UPDATE ON "Comment" FOR EACH ROW EXECUTE FUNCTION comment_tsv_trigger()`,

    // acceptedComment FK (after Comment table exists)
    `DO $$ BEGIN ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_acceptedCommentId_fkey" FOREIGN KEY ("acceptedCommentId") REFERENCES "Comment"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    // ─── DiscussionVote ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "DiscussionVote" (
      "id"           SERIAL PRIMARY KEY,
      "userId"       INT NOT NULL,
      "targetType"   "VoteTarget" NOT NULL,
      "targetId"     INT NOT NULL,
      "value"        INT NOT NULL,
      "discussionId" INT,
      "commentId"    INT,
      "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `DO $$ BEGIN ALTER TABLE "DiscussionVote" ADD CONSTRAINT "DiscussionVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionVote" ADD CONSTRAINT "DiscussionVote_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionVote" ADD CONSTRAINT "DiscussionVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionVote" ADD CONSTRAINT "DiscussionVote_unique" UNIQUE ("userId","targetType","targetId"); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "DiscussionVote_target_idx" ON "DiscussionVote"("targetType","targetId")`,

    // ─── Tags ─────────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "DiscussionTag" (
      "id"          SERIAL PRIMARY KEY,
      "name"        TEXT NOT NULL,
      "slug"        TEXT NOT NULL,
      "description" TEXT,
      "usageCount"  INT NOT NULL DEFAULT 0,
      "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `DO $$ BEGIN ALTER TABLE "DiscussionTag" ADD CONSTRAINT "DiscussionTag_name_unique" UNIQUE ("name"); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionTag" ADD CONSTRAINT "DiscussionTag_slug_unique" UNIQUE ("slug"); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "DiscussionTag_slug_idx"       ON "DiscussionTag"("slug")`,
    `CREATE INDEX IF NOT EXISTS "DiscussionTag_usageCount_idx" ON "DiscussionTag"("usageCount")`,

    `CREATE TABLE IF NOT EXISTS "DiscussionTagMap" (
      "discussionId" INT NOT NULL, "tagId" INT NOT NULL, PRIMARY KEY ("discussionId","tagId")
    )`,
    `DO $$ BEGIN ALTER TABLE "DiscussionTagMap" ADD CONSTRAINT "DiscussionTagMap_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionTagMap" ADD CONSTRAINT "DiscussionTagMap_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "DiscussionTag"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    `CREATE TABLE IF NOT EXISTS "TagFollower" (
      "userId" INT NOT NULL, "tagId" INT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY ("userId","tagId")
    )`,
    `DO $$ BEGIN ALTER TABLE "TagFollower" ADD CONSTRAINT "TagFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "TagFollower" ADD CONSTRAINT "TagFollower_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "DiscussionTag"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    // ─── Bookmarks ────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "BookmarkFolder" (
      "id" SERIAL PRIMARY KEY, "userId" INT NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `DO $$ BEGIN ALTER TABLE "BookmarkFolder" ADD CONSTRAINT "BookmarkFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "BookmarkFolder" ADD CONSTRAINT "BookmarkFolder_userId_name_unique" UNIQUE ("userId","name"); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "BookmarkFolder_userId_idx" ON "BookmarkFolder"("userId")`,

    `CREATE TABLE IF NOT EXISTS "Bookmark" (
      "id" SERIAL PRIMARY KEY, "userId" INT NOT NULL, "discussionId" INT NOT NULL, "folderId" INT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `DO $$ BEGIN ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "BookmarkFolder"("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_discussionId_unique" UNIQUE ("userId","discussionId"); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "Bookmark_userId_idx" ON "Bookmark"("userId")`,

    // ─── DiscussionFollower ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "DiscussionFollower" (
      "userId" INT NOT NULL, "discussionId" INT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY ("userId","discussionId")
    )`,
    `DO $$ BEGIN ALTER TABLE "DiscussionFollower" ADD CONSTRAINT "DiscussionFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionFollower" ADD CONSTRAINT "DiscussionFollower_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "DiscussionFollower_userId_idx" ON "DiscussionFollower"("userId")`,

    // ─── Mention ──────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "Mention" (
      "id" SERIAL PRIMARY KEY, "mentionedUserId" INT, "isGroupMention" BOOLEAN NOT NULL DEFAULT false,
      "groupRole" TEXT, "createdById" INT NOT NULL, "discussionId" INT, "commentId" INT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `DO $$ BEGIN ALTER TABLE "Mention" ADD CONSTRAINT "Mention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Mention" ADD CONSTRAINT "Mention_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Mention" ADD CONSTRAINT "Mention_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "Mention" ADD CONSTRAINT "Mention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "Mention_mentionedUserId_idx" ON "Mention"("mentionedUserId")`,
    `CREATE INDEX IF NOT EXISTS "Mention_discussionId_idx"    ON "Mention"("discussionId")`,

    // ─── DiscussionReport ──────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "DiscussionReport" (
      "id" SERIAL PRIMARY KEY, "reporterId" INT NOT NULL, "discussionId" INT, "commentId" INT,
      "reason" "ReportReason" NOT NULL, "body" TEXT, "resolvedAt" TIMESTAMPTZ,
      "resolvedById" INT, "resolution" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `DO $$ BEGIN ALTER TABLE "DiscussionReport" ADD CONSTRAINT "DiscussionReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionReport" ADD CONSTRAINT "DiscussionReport_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionReport" ADD CONSTRAINT "DiscussionReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "DiscussionReport_discussionId_idx" ON "DiscussionReport"("discussionId")`,
    `CREATE INDEX IF NOT EXISTS "DiscussionReport_resolvedAt_idx"   ON "DiscussionReport"("resolvedAt")`,

    // ─── DiscussionView ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "DiscussionView" (
      "id" SERIAL PRIMARY KEY, "discussionId" INT NOT NULL, "userId" INT,
      "ipHash" TEXT, "userAgentHash" TEXT, "sessionId" TEXT,
      "firstViewedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "lastViewedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `DO $$ BEGIN ALTER TABLE "DiscussionView" ADD CONSTRAINT "DiscussionView_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionView" ADD CONSTRAINT "DiscussionView_userId_discussionId_unique" UNIQUE ("userId","discussionId"); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "DiscussionView_discussionId_idx" ON "DiscussionView"("discussionId")`,

    // ─── DiscussionHistory ─────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "DiscussionHistory" (
      "id" SERIAL PRIMARY KEY, "discussionId" INT, "commentId" INT, "editedById" INT NOT NULL,
      "version" INT NOT NULL DEFAULT 1, "oldTitle" TEXT, "oldBody" TEXT NOT NULL,
      "newTitle" TEXT, "newBody" TEXT NOT NULL, "editedReason" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `DO $$ BEGIN ALTER TABLE "DiscussionHistory" ADD CONSTRAINT "DiscussionHistory_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionHistory" ADD CONSTRAINT "DiscussionHistory_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionHistory" ADD CONSTRAINT "DiscussionHistory_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "DiscussionHistory_discussionId_idx" ON "DiscussionHistory"("discussionId")`,
    `CREATE INDEX IF NOT EXISTS "DiscussionHistory_commentId_idx"    ON "DiscussionHistory"("commentId")`,

    // ─── DiscussionAuditLog ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "DiscussionAuditLog" (
      "id" SERIAL PRIMARY KEY, "action" "AuditAction" NOT NULL, "actorId" INT NOT NULL,
      "discussionId" INT, "commentId" INT, "targetUserId" INT, "metadata" JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `DO $$ BEGIN ALTER TABLE "DiscussionAuditLog" ADD CONSTRAINT "DiscussionAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionAuditLog" ADD CONSTRAINT "DiscussionAuditLog_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "DiscussionAuditLog_discussionId_idx" ON "DiscussionAuditLog"("discussionId")`,
    `CREATE INDEX IF NOT EXISTS "DiscussionAuditLog_actorId_idx"      ON "DiscussionAuditLog"("actorId")`,
    `CREATE INDEX IF NOT EXISTS "DiscussionAuditLog_createdAt_idx"    ON "DiscussionAuditLog"("createdAt")`,

    // ─── DiscussionNotification ────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "DiscussionNotification" (
      "id" SERIAL PRIMARY KEY, "userId" INT NOT NULL, "type" "DiscussNotifType" NOT NULL,
      "discussionId" INT, "commentId" INT, "fromUserId" INT, "tagId" INT,
      "read" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `DO $$ BEGIN ALTER TABLE "DiscussionNotification" ADD CONSTRAINT "DiscussionNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionNotification" ADD CONSTRAINT "DiscussionNotification_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionNotification" ADD CONSTRAINT "DiscussionNotification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE "DiscussionNotification" ADD CONSTRAINT "DiscussionNotification_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "DiscussionTag"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "DiscussionNotification_userId_read_idx" ON "DiscussionNotification"("userId","read")`,
    `CREATE INDEX IF NOT EXISTS "DiscussionNotification_createdAt_idx"   ON "DiscussionNotification"("createdAt")`,

    // ─── DiscussionSlugHistory ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "DiscussionSlugHistory" (
      "id" SERIAL PRIMARY KEY, "slug" TEXT NOT NULL, "discussionId" INT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `DO $$ BEGIN ALTER TABLE "DiscussionSlugHistory" ADD CONSTRAINT "DiscussionSlugHistory_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE INDEX IF NOT EXISTS "DiscussionSlugHistory_slug_idx" ON "DiscussionSlugHistory"("slug")`,
  ];

  let succeeded = 0;
  let failed = 0;

  for (const sql of statements) {
    const preview = sql.trim().split('\n')[0].slice(0, 80).replace(/\s+/g, ' ');
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`  ✓ ${preview}`);
      succeeded++;
    } catch (err) {
      const msg = err.message || '';
      const isIdempotent =
        msg.includes('already exists') ||
        msg.includes('duplicate_object') ||
        msg.includes('already defined') ||
        msg.includes('42P07') ||
        msg.includes('42710');
      if (isIdempotent) {
        console.log(`  ⊘ (exists) ${preview}`);
        succeeded++;
      } else {
        console.error(`  ✗ FAILED: ${preview}`);
        console.error(`    ${msg}\n`);
        failed++;
      }
    }
  }

  console.log(`\n[MIGRATION] Done. ${succeeded} statements OK, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error('[MIGRATION] Fatal:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
