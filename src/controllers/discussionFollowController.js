'use strict';

/**
 * discussionFollowController.js
 *
 * Manage following discussions and tag subscriptions.
 */

const prisma = require('../prisma');

/**
 * POST /api/discuss/:slug/follow
 * Follow a discussion for notifications.
 */
const followDiscussion = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const userId = req.user.id;

    const existing = await prisma.discussionFollower.findUnique({
      where: {
        userId_discussionId: { userId, discussionId: discussion.id },
      },
    });

    if (existing) {
      await prisma.discussionFollower.delete({
        where: { userId_discussionId: { userId, discussionId: discussion.id } },
      });
      return res.status(200).json({
        success: true,
        isFollowing: false,
        message: 'Unfollowed discussion.',
      });
    }

    await prisma.discussionFollower.create({
      data: { userId, discussionId: discussion.id },
    });

    res.status(201).json({
      success: true,
      isFollowing: true,
      message: 'Following discussion.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/discuss/:slug/follow
 * Unfollow a discussion.
 */
const unfollowDiscussion = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const userId = req.user.id;

    await prisma.discussionFollower.deleteMany({
      where: { userId, discussionId: discussion.id },
    });

    res.status(200).json({
      success: true,
      isFollowing: false,
      message: 'Unfollowed discussion.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/discuss/tags/:tag/follow
 * Follow a tag for new post notifications.
 */
const followTag = async (req, res, next) => {
  try {
    const tag = req.resource;
    const userId = req.user.id;

    const existing = await prisma.tagFollower.findUnique({
      where: {
        userId_tagId: { userId, tagId: tag.id },
      },
    });

    if (existing) {
      await prisma.tagFollower.delete({
        where: { userId_tagId: { userId, tagId: tag.id } },
      });
      return res.status(200).json({
        success: true,
        isFollowing: false,
        message: `Unfollowed tag #${tag.name}.`,
      });
    }

    await prisma.tagFollower.create({
      data: { userId, tagId: tag.id },
    });

    res.status(201).json({
      success: true,
      isFollowing: true,
      message: `Following tag #${tag.name}.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/discuss/tags/following
 * List tags the user is following.
 */
const listFollowedTags = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const followed = await prisma.tagFollower.findMany({
      where: { userId },
      include: {
        tag: { select: { name: true, slug: true, usageCount: true } },
      },
    });

    res.status(200).json({
      success: true,
      tags: followed.map((f) => f.tag),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  followDiscussion,
  unfollowDiscussion,
  followTag,
  listFollowedTags,
};
