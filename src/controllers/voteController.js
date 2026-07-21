'use strict';

/**
 * voteController.js
 *
 * Transactional voting for Discussions and Comments.
 * Zero scan-based score recalculation — uses transactional delta increments.
 */

const prisma = require('../prisma');
const { applyVote } = require('../services/discussionService');
const { invalidateResourceCache } = require('../middleware/resolvers');

/**
 * POST /api/discuss/:slug/vote
 * Vote on a discussion (+1 or -1).
 */
const voteDiscussion = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const { value } = req.body; // 1 or -1

    if (value !== 1 && value !== -1) {
      return res.status(400).json({ success: false, message: 'Vote value must be 1 or -1.' });
    }

    const { updatedTarget, userVote } = await applyVote({
      targetType: 'DISCUSSION',
      targetId: discussion.id,
      userId: req.user.id,
      newValue: value,
    });

    // Notify milestone upvotes (10, 25, 50, 100)
    const MILESTONES = [10, 25, 50, 100];
    if (MILESTONES.includes(updatedTarget.score) && updatedTarget.authorId !== req.user.id) {
      await prisma.discussionNotification.create({
        data: {
          userId: updatedTarget.authorId,
          type: 'VOTE_MILESTONE',
          discussionId: discussion.id,
          fromUserId: req.user.id,
        },
      }).catch(() => {});
    }

    invalidateResourceCache('discussion', discussion.slug);

    res.status(200).json({
      success: true,
      score: updatedTarget.score,
      userVote,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/discuss/:slug/comments/:commentSlug/vote
 * Vote on a comment (+1 or -1).
 */
const voteComment = async (req, res, next) => {
  try {
    const comment = req.comment;
    const { value } = req.body; // 1 or -1

    if (value !== 1 && value !== -1) {
      return res.status(400).json({ success: false, message: 'Vote value must be 1 or -1.' });
    }

    const { updatedTarget, userVote } = await applyVote({
      targetType: 'COMMENT',
      targetId: comment.id,
      userId: req.user.id,
      newValue: value,
    });

    invalidateResourceCache('comment', comment.slug);

    res.status(200).json({
      success: true,
      score: updatedTarget.score,
      userVote,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  voteDiscussion,
  voteComment,
};
