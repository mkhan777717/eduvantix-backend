'use strict';

/**
 * commentController.js
 *
 * Controller for Comments on discussions.
 * Supports unlimited-depth nested replies, accepted answer marking,
 * version history, and soft deletes.
 */

const prisma = require('../prisma');
const PaginationService = require('../services/paginationService');
const { commentSchema, commentUpdateSchema } = require('../utils/validators');
const {
  generateUniqueCommentSlug,
  sanitizeComment,
  createMentionNotifications,
  notifyFollowers,
  writeAuditLog,
  updateHotScore,
} = require('../services/discussionService');
const { invalidateResourceCache } = require('../middleware/resolvers');

/**
 * GET /api/discuss/:slug/comments
 * List comments for a discussion (nested or flat).
 */
const listComments = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const { format = 'tree' } = req.query;

    const baseWhere = {
      discussionId: discussion.id,
      deletedAt: null,
    };

    if (format === 'tree') {
      // Fetch root comments first (parentCommentId = null)
      baseWhere.parentCommentId = null;
    }

    const config = {
      modelName: 'comment',
      defaultSort: 'createdAt',
      defaultOrder: 'asc',
    };

    const result = await PaginationService.paginate({
      model: prisma.comment,
      query: req.query,
      config,
      where: baseWhere,
      select: {
        id: true,
        slug: true,
        body: true,
        depth: true,
        score: true,
        replyCount: true,
        createdAt: true,
        updatedAt: true,
        parentCommentId: true,
        author: { select: { username: true, role: true, createdAt: true } },
        replies: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            slug: true,
            body: true,
            depth: true,
            score: true,
            replyCount: true,
            createdAt: true,
            parentCommentId: true,
            author: { select: { username: true, role: true, createdAt: true } },
          },
        },
      },
    });

    // If there is an accepted comment, highlight or place it first
    let acceptedComment = null;
    if (discussion.acceptedCommentId) {
      const ac = await prisma.comment.findUnique({
        where: { id: discussion.acceptedCommentId },
        select: {
          id: true,
          slug: true,
          body: true,
          depth: true,
          score: true,
          replyCount: true,
          createdAt: true,
          author: { select: { username: true, role: true, createdAt: true } },
        },
      });
      if (ac) {
        acceptedComment = sanitizeComment(ac, { currentUserId: req.user?.id });
      }
    }

    // Attach userState (votes) for comments and nested replies if authenticated
    if (req.user && result.data.length > 0) {
      const commentIds = [];
      result.data.forEach((c) => {
        commentIds.push(c.id);
        (c.replies || []).forEach((r) => commentIds.push(r.id));
      });

      const commentVotes = await prisma.discussionVote.findMany({
        where: { userId: req.user.id, targetType: 'COMMENT', targetId: { in: commentIds } },
        select: { targetId: true, value: true },
      });

      const voteMap = new Map(commentVotes.map((v) => [v.targetId, v.value]));

      result.data = result.data.map((c) => {
        const s = sanitizeComment(c, { currentUserId: req.user.id });
        s.userState = { vote: voteMap.get(c.id) || 0 };
        if (s.replies) {
          s.replies = s.replies.map((r) => ({
            ...sanitizeComment(r, { currentUserId: req.user.id }),
            userState: { vote: voteMap.get(r.id) || 0 },
          }));
        }
        return s;
      });
    } else {
      result.data = result.data.map((c) => sanitizeComment(c, { currentUserId: req.user?.id }));
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/discuss/:slug/comments
 * Add a new comment to a discussion (or reply to parent comment).
 */
const createComment = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const validated = commentSchema.parse(req.body);
    const userId = req.user.id;

    let parentComment = null;
    let depth = 0;

    if (validated.parentCommentSlug) {
      parentComment = await prisma.comment.findUnique({
        where: { slug: validated.parentCommentSlug },
        select: { id: true, depth: true, discussionId: true },
      });
      if (parentComment) {
        depth = parentComment.depth + 1;
      }
    }

    const commentSlug = await generateUniqueCommentSlug();

    const newComment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          slug: commentSlug,
          body: validated.body,
          depth,
          authorId: userId,
          discussionId: discussion.id,
          parentCommentId: parentComment ? parentComment.id : null,
        },
        select: {
          id: true,
          slug: true,
          body: true,
          depth: true,
          createdAt: true,
          author: { select: { username: true, role: true } },
        },
      });

      // Increment reply counts
      await tx.discussion.update({
        where: { id: discussion.id },
        data: { replyCount: { increment: 1 } },
      });

      if (parentComment) {
        await tx.comment.update({
          where: { id: parentComment.id },
          data: { replyCount: { increment: 1 } },
        });
      }

      return created;
    });

    // Extract & create mention notifications
    await createMentionNotifications({
      body: validated.body,
      fromUserId: userId,
      discussionId: discussion.id,
      commentId: newComment.id,
      instituteId: req.user.instituteId,
    });

    // Notify thread followers
    await notifyFollowers(discussion.id, {
      type: 'REPLY',
      fromUserId: userId,
      commentId: newComment.id,
    });

    invalidateResourceCache('discussion', discussion.slug);

    res.status(201).json({
      success: true,
      message: 'Comment added successfully.',
      comment: sanitizeComment(newComment),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/discuss/:slug/comments/:commentSlug
 * Edit a comment. Saves history version.
 */
const updateComment = async (req, res, next) => {
  try {
    const comment = req.comment;
    const validated = commentUpdateSchema.parse(req.body);

    const oldBody = comment.body;
    const historyCount = await prisma.discussionHistory.count({
      where: { commentId: comment.id },
    });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.discussionHistory.create({
        data: {
          commentId: comment.id,
          editedById: req.user.id,
          version: historyCount + 1,
          oldBody,
          newBody: validated.body,
          editedReason: validated.editedReason || null,
        },
      });

      return await tx.comment.update({
        where: { id: comment.id },
        data: { body: validated.body },
      });
    });

    invalidateResourceCache('comment', comment.slug);

    res.status(200).json({
      success: true,
      message: 'Comment updated successfully.',
      comment: sanitizeComment(updated),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/discuss/:slug/comments/:commentSlug
 * Soft delete a comment.
 */
const deleteComment = async (req, res, next) => {
  try {
    const comment = req.comment;
    const { deleteReason } = req.body || {};

    await prisma.$transaction([
      prisma.comment.update({
        where: { id: comment.id },
        data: {
          deletedAt: new Date(),
          deletedById: req.user.id,
          deleteReason: deleteReason || 'Deleted by author or moderator',
        },
      }),
      prisma.discussion.update({
        where: { id: comment.discussionId },
        data: { replyCount: { decrement: 1 } },
      }),
    ]);

    await updateHotScore(comment.discussionId);

    invalidateResourceCache('comment', comment.slug);

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/discuss/:slug/comments/:commentSlug/accept
 * Mark a comment as the accepted answer for the discussion.
 */
const markAcceptedAnswer = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const comment = req.comment;

    // Toggle off if already accepted
    const isAlreadyAccepted = discussion.acceptedCommentId === comment.id;
    const newAcceptedId = isAlreadyAccepted ? null : comment.id;

    await prisma.discussion.update({
      where: { id: discussion.id },
      data: { acceptedCommentId: newAcceptedId },
    });

    if (!isAlreadyAccepted) {
      // Notify comment author
      await prisma.discussionNotification.create({
        data: {
          userId: comment.authorId,
          type: 'ACCEPTED_ANSWER',
          discussionId: discussion.id,
          commentId: comment.id,
          fromUserId: req.user.id,
        },
      }).catch(() => {});

      writeAuditLog(req.user.id, 'ACCEPT_ANSWER', {
        discussionId: discussion.id,
        commentId: comment.id,
      });
    }

    invalidateResourceCache('discussion', discussion.slug);

    res.status(200).json({
      success: true,
      message: isAlreadyAccepted ? 'Accepted answer unmarked.' : 'Accepted answer marked successfully.',
      acceptedCommentSlug: isAlreadyAccepted ? null : comment.slug,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listComments,
  createComment,
  updateComment,
  deleteComment,
  markAcceptedAnswer,
};
