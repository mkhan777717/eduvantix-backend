'use strict';

/**
 * discussionService.js
 *
 * Core service layer for Discussion Forum module.
 * Provides helper functions for slugs, sanitization, transactional voting,
 * hot-score computation, mentions, view tracking, and audit logging.
 */

const crypto = require('crypto');
const prisma = require('../prisma');
const { getIO } = require('./socketService');

// ── Slug Generation ────────────────────────────────────────────────────────────

const slugify = (title) =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

async function generateUniqueDiscussionSlug(title, excludeId = null) {
  const base = slugify(title) || 'discussion';
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await prisma.discussion.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

async function generateUniqueCommentSlug() {
  while (true) {
    const randomHex = crypto.randomBytes(6).toString('hex');
    const slug = `c-${randomHex}`;
    const existing = await prisma.comment.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
  }
}

// ── Sanitization (Strip Internal Integer IDs) ──────────────────────────────────

function sanitizeAuthor(author) {
  if (!author) return null;
  return {
    username: author.username,
    role: author.role,
    createdAt: author.createdAt,
  };
}

function sanitizeDiscussion(discussion, options = {}) {
  if (!discussion) return null;
  const { id, authorId, problemId, contestId, vivaId, instituteId, deletedById, acceptedCommentId, ...rest } = discussion;

  if (rest.deletedAt && !options.isStaff && options.currentUserId !== authorId) {
    rest.body = '[This discussion has been deleted]';
    rest.title = '[Deleted]';
  }

  if (rest.author) {
    rest.author = sanitizeAuthor(rest.author);
  }

  return rest;
}

function sanitizeComment(comment, options = {}) {
  if (!comment) return null;
  const { id, authorId, discussionId, parentCommentId, deletedById, ...rest } = comment;

  if (rest.deletedAt && !options.isStaff && options.currentUserId !== authorId) {
    rest.body = '[This comment has been deleted]';
  }

  if (rest.author) {
    rest.author = sanitizeAuthor(rest.author);
  }

  if (Array.isArray(rest.replies)) {
    rest.replies = rest.replies.map((reply) => sanitizeComment(reply, options));
  }

  return rest;
}

// ── View Tracking (Anti-Inflation) ──────────────────────────────────────────────

async function recordView(discussionId, { userId = null, ip = '', userAgent = '', sessionId = '' } = {}) {
  const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex') : null;
  const userAgentHash = userAgent ? crypto.createHash('sha256').update(userAgent).digest('hex') : null;

  try {
    if (userId) {
      // Upsert user view record — only increment viewCount on initial insert
      const existing = await prisma.discussionView.findUnique({
        where: { userId_discussionId: { userId, discussionId } },
      });

      if (!existing) {
        await prisma.$transaction([
          prisma.discussionView.create({
            data: {
              discussionId,
              userId,
              ipHash,
              userAgentHash,
              sessionId,
            },
          }),
          prisma.discussion.update({
            where: { id: discussionId },
            data: {
              viewCount: { increment: 1 },
            },
          }),
        ]);
        await updateHotScore(discussionId);
      } else {
        await prisma.discussionView.update({
          where: { id: existing.id },
          data: { lastViewedAt: new Date() },
        });
      }
    } else {
      // Anonymous view count increment
      await prisma.discussion.update({
        where: { id: discussionId },
        data: { viewCount: { increment: 1 } },
      });
      await updateHotScore(discussionId);
    }
  } catch (err) {
    console.error('[DISCUSSION_SERVICE] Error recording view:', err.message);
  }
}

// ── Transactional Voting (No Scans) ──────────────────────────────────────────

async function applyVote({ targetType, targetId, userId, newValue }) {
  // newValue must be +1 or -1
  return await prisma.$transaction(async (tx) => {
    const existingVote = await tx.discussionVote.findUnique({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType,
          targetId,
        },
      },
    });

    let scoreDelta = 0;
    let upvoteDelta = 0;
    let downvoteDelta = 0;
    let finalUserVote = 0;

    if (!existingVote) {
      // New vote -> apply newValue (+1 or -1)
      scoreDelta = newValue;
      finalUserVote = newValue;
      if (newValue === 1) upvoteDelta = 1;
      else if (newValue === -1) downvoteDelta = 1;

      await tx.discussionVote.create({
        data: {
          userId,
          targetType,
          targetId,
          value: newValue,
          discussionId: targetType === 'DISCUSSION' ? targetId : null,
          commentId: targetType === 'COMMENT' ? targetId : null,
        },
      });
    } else if (existingVote.value === newValue) {
      // Same vote clicked again -> remove vote (toggle to neutral 0)
      scoreDelta = -existingVote.value;
      finalUserVote = 0;
      if (existingVote.value === 1) upvoteDelta = -1;
      else if (existingVote.value === -1) downvoteDelta = -1;

      await tx.discussionVote.delete({
        where: { id: existingVote.id },
      });
    } else {
      // Different vote clicked -> switch vote (e.g. from +1 to -1 or -1 to +1)
      scoreDelta = newValue - existingVote.value;
      finalUserVote = newValue;
      if (newValue === 1) {
        upvoteDelta = 1;
        downvoteDelta = -1;
      } else {
        upvoteDelta = -1;
        downvoteDelta = 1;
      }

      await tx.discussionVote.update({
        where: { id: existingVote.id },
        data: { value: newValue },
      });
    }

    let updatedTarget;
    if (targetType === 'DISCUSSION') {
      await tx.$executeRawUnsafe(
        `UPDATE "Discussion" 
         SET "score" = "score" + $1, 
             "upvoteCount" = GREATEST(0, "upvoteCount" + $2), 
             "downvoteCount" = GREATEST(0, "downvoteCount" + $3) 
         WHERE "id" = $4`,
        scoreDelta,
        upvoteDelta,
        downvoteDelta,
        targetId
      );

      updatedTarget = await tx.discussion.findUnique({
        where: { id: targetId },
      });

      if (updatedTarget) {
        // Update hot score after vote change
        const hotScore = calculateHotScore(updatedTarget);
        await tx.$executeRawUnsafe(
          `UPDATE "Discussion" SET "hotScore" = $1 WHERE "id" = $2`,
          hotScore,
          targetId
        );
        updatedTarget.hotScore = hotScore;
      }
    } else {
      updatedTarget = await tx.comment.update({
        where: { id: targetId },
        data: { score: { increment: scoreDelta } },
      });
    }

    return { updatedTarget, userVote: finalUserVote };
  });
}

// ── Trending Score Calculation (Mathematical Formula with Time Decay) ────────────
/**
 * Trending Score (Raw) =
 *   (Upvotes * 5)
 * + (Comments * 4)
 * + (Bookmarks * 3)
 * + (Shares * 3)
 * + (Views * 0.02)
 * - (Downvotes * 4)
 * - (Reports * 10)
 *
 * Time Decay:
 * Final Score = Trending Score / (Hours Since Posted + 2)^1.5
 */
function calculateHotScore(discussion) {
  const upvotes = Math.max(0, discussion.upvoteCount || 0);
  const downvotes = Math.max(0, discussion.downvoteCount || 0);
  const comments = Math.max(0, discussion.replyCount || 0);
  const bookmarks = Math.max(0, discussion.bookmarkCount || 0);
  const shares = Math.max(0, discussion.shareCount || 0);
  const views = Math.max(0, discussion.viewCount || 0);
  const reports = Math.max(0, discussion.reportCount || 0);

  const rawScore =
    (upvotes * 5) +
    (comments * 4) +
    (bookmarks * 3) +
    (shares * 3) +
    (views * 0.02) -
    (downvotes * 4) -
    (reports * 10);

  const createdAt = discussion.createdAt ? new Date(discussion.createdAt).getTime() : Date.now();
  const hoursSincePosted = Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60));

  const timeDecay = Math.pow(hoursSincePosted + 2, 1.5);
  const finalScore = rawScore / timeDecay;

  return parseFloat(finalScore.toFixed(4));
}

async function updateHotScore(discussionId) {
  try {
    const discussion = await prisma.discussion.findUnique({
      where: { id: discussionId },
      select: {
        id: true,
        score: true,
        upvoteCount: true,
        downvoteCount: true,
        replyCount: true,
        bookmarkCount: true,
        shareCount: true,
        viewCount: true,
        reportCount: true,
        createdAt: true,
      },
    });
    if (!discussion) return;
    const hotScore = calculateHotScore(discussion);
    await prisma.discussion.update({
      where: { id: discussionId },
      data: { hotScore },
    });
  } catch (err) {
    console.error('[DISCUSSION_SERVICE] Error updating hot score:', err.message);
  }
}

async function recalculateAllTrendingScores() {
  try {
    const discussions = await prisma.discussion.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        score: true,
        upvoteCount: true,
        downvoteCount: true,
        replyCount: true,
        bookmarkCount: true,
        shareCount: true,
        viewCount: true,
        reportCount: true,
        createdAt: true,
      },
    });

    for (const d of discussions) {
      const hotScore = calculateHotScore(d);
      await prisma.discussion.update({
        where: { id: d.id },
        data: { hotScore },
      });
    }
  } catch (err) {
    console.error('[DISCUSSION_SERVICE] Error in recalculateAllTrendingScores:', err.message);
  }
}

// ── Tag Usage Tracking ─────────────────────────────────────────────────────────

async function incrementTagUsage(tx, tagIds) {
  if (!Array.isArray(tagIds) || tagIds.length === 0) return;
  await (tx || prisma).discussionTag.updateMany({
    where: { id: { in: tagIds } },
    data: { usageCount: { increment: 1 } },
  });
}

async function decrementTagUsage(tx, tagIds) {
  if (!Array.isArray(tagIds) || tagIds.length === 0) return;
  await (tx || prisma).discussionTag.updateMany({
    where: { id: { in: tagIds } },
    data: { usageCount: { decrement: 1 } },
  });
}

// ── Mention Extraction & Processing ──────────────────────────────────────────

function extractMentions(body) {
  if (!body || typeof body !== 'string') return { usernames: [], roles: [] };

  const userRegex = /@([a-zA-Z0-9_]+)/g;
  const matches = [...body.matchAll(userRegex)].map((m) => m[1]);

  const roles = [];
  const usernames = [];

  const ROLE_MENTIONS = ['admin', 'mentor', 'teacher', 'all'];

  matches.forEach((name) => {
    const lower = name.toLowerCase();
    if (ROLE_MENTIONS.includes(lower)) {
      roles.push(lower.toUpperCase() === 'TEACHER' ? 'MENTOR' : lower.toUpperCase());
    } else {
      usernames.push(name);
    }
  });

  return {
    usernames: [...new Set(usernames)],
    roles: [...new Set(roles)],
  };
}

async function createMentionNotifications({ body, fromUserId, discussionId = null, commentId = null, instituteId = null }) {
  const { usernames, roles } = extractMentions(body);

  const notificationsToCreate = [];

  // Individual user mentions
  if (usernames.length > 0) {
    const users = await prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true },
    });

    users.forEach((u) => {
      if (u.id !== fromUserId) {
        notificationsToCreate.push({
          userId: u.id,
          type: 'MENTION',
          discussionId,
          commentId,
          fromUserId,
        });
      }
    });
  }

  // Role group mentions (@mentor, @admin)
  if (roles.length > 0) {
    const roleWhere = roles.includes('ALL') ? {} : { role: { in: roles } };

    const roleUsers = await prisma.user.findMany({
      where: {
        ...roleWhere,
        ...(instituteId ? { instituteId } : {}),
      },
      select: { id: true },
    });

    roleUsers.forEach((u) => {
      if (u.id !== fromUserId) {
        notificationsToCreate.push({
          userId: u.id,
          type: 'MENTION',
          discussionId,
          commentId,
          fromUserId,
        });
      }
    });
  }

  if (notificationsToCreate.length > 0) {
    await prisma.discussionNotification.createMany({
      data: notificationsToCreate,
      skipDuplicates: true,
    });

    // Real-time socket broadcast to online users
    try {
      const io = getIO();
      notificationsToCreate.forEach((notif) => {
        io.to(`user_${notif.userId}`).emit('discussionNotification', notif);
      });
    } catch (_) {}
  }
}

// ── Notification Helpers ───────────────────────────────────────────────────────

async function notifyFollowers(discussionId, { type, fromUserId, commentId = null }) {
  try {
    const followers = await prisma.discussionFollower.findMany({
      where: { discussionId },
      select: { userId: true },
    });

    const notifications = followers
      .filter((f) => f.userId !== fromUserId)
      .map((f) => ({
        userId: f.userId,
        type,
        discussionId,
        commentId,
        fromUserId,
      }));

    if (notifications.length > 0) {
      await prisma.discussionNotification.createMany({
        data: notifications,
        skipDuplicates: true,
      });

      const io = getIO();
      notifications.forEach((n) => {
        io.to(`user_${n.userId}`).emit('discussionNotification', n);
      });
    }
  } catch (err) {
    console.error('[DISCUSSION_SERVICE] Error notifying followers:', err.message);
  }
}

// ── Audit Logging ─────────────────────────────────────────────────────────────

async function writeAuditLog(actorId, action, { discussionId = null, commentId = null, targetUserId = null, metadata = null } = {}) {
  try {
    await prisma.discussionAuditLog.create({
      data: {
        action,
        actorId,
        discussionId,
        commentId,
        targetUserId,
        metadata: metadata || {},
      },
    });
  } catch (err) {
    console.error('[DISCUSSION_SERVICE] Error writing audit log:', err.message);
  }
}

module.exports = {
  generateUniqueDiscussionSlug,
  generateUniqueCommentSlug,
  sanitizeDiscussion,
  sanitizeComment,
  recordView,
  applyVote,
  calculateHotScore,
  updateHotScore,
  recalculateAllTrendingScores,
  incrementTagUsage,
  decrementTagUsage,
  extractMentions,
  createMentionNotifications,
  notifyFollowers,
  writeAuditLog,
};
