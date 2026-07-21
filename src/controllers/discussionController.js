'use strict';

/**
 * discussionController.js
 *
 * Controller for Discussion CRUD and feed endpoints.
 * Pure data layer — zero permission logic (enforced by resolvers.js + permissionService.js).
 */

const prisma = require('../prisma');
const PaginationService = require('../services/paginationService');
const { discussionSchema, discussionUpdateSchema } = require('../utils/validators');
const {
  generateUniqueDiscussionSlug,
  sanitizeDiscussion,
  recordView,
  incrementTagUsage,
  decrementTagUsage,
  createMentionNotifications,
  notifyFollowers,
  writeAuditLog,
  calculateHotScore,
  updateHotScore,
} = require('../services/discussionService');
const { invalidateResourceCache } = require('../middleware/resolvers');

/**
 * GET /api/discuss
 * List discussions with pagination, search, category/tag filter, and sorting.
 */
const listDiscussions = async (req, res, next) => {
  try {
    const { category, tag, problemSlug, contestSlug, vivaId, sort = 'hot', search } = req.query;

    const baseWhere = {
      deletedAt: null,
    };

    // Filter by category
    if (category) {
      baseWhere.category = category.toUpperCase();
    }

    // Filter by context
    if (problemSlug) {
      const problem = await prisma.problem.findUnique({ where: { slug: problemSlug }, select: { id: true } });
      if (problem) baseWhere.problemId = problem.id;
    }
    if (contestSlug) {
      const contest = await prisma.contest.findUnique({ where: { slug: contestSlug }, select: { id: true } });
      if (contest) baseWhere.contestId = contest.id;
    }
    if (vivaId) {
      baseWhere.vivaId = parseInt(vivaId, 10);
    }

    // Filter by tag slug
    if (tag) {
      baseWhere.tags = {
        some: {
          tag: { slug: tag },
        },
      };
    }

    // Full Text Search or standard term search
    let searchWhere = {};
    if (search && typeof search === 'string' && search.trim() !== '') {
      const term = search.trim();
      searchWhere = {
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { body: { contains: term, mode: 'insensitive' } },
        ],
      };
    }

    // Sorting maps
    let orderBy = { hotScore: 'desc' };
    if (sort === 'new') orderBy = { createdAt: 'desc' };
    else if (sort === 'top') orderBy = { score: 'desc' };
    else if (sort === 'oldest') orderBy = { createdAt: 'asc' };
    else if (sort === 'unanswered') {
      baseWhere.replyCount = 0;
      orderBy = { createdAt: 'desc' };
    }

    const combinedWhere = { ...baseWhere, ...searchWhere };

    const config = {
      modelName: 'discussion',
      defaultSort: 'hotScore',
      defaultOrder: 'desc',
      filterableFields: ['category'],
      searchFields: ['title', 'body'],
    };

    const result = await PaginationService.paginate({
      model: prisma.discussion,
      query: req.query,
      config,
      where: combinedWhere,
      select: {
        id: true,
        slug: true,
        title: true,
        body: true,
        category: true,
        isPinned: true,
        isLocked: true,
        acceptedCommentId: true,
        score: true,
        hotScore: true,
        viewCount: true,
        replyCount: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: { username: true, role: true, createdAt: true },
        },
        tags: {
          select: {
            tag: { select: { name: true, slug: true } },
          },
        },
      },
    });

    // Sanitize output & attach userState if logged in
    let voteMap = new Map();
    let bookmarkSet = new Set();

    if (req.user && result.data.length > 0) {
      const discIds = result.data.map((d) => d.id);
      const [userVotes, userBookmarks] = await Promise.all([
        prisma.discussionVote.findMany({
          where: { userId: req.user.id, targetType: 'DISCUSSION', targetId: { in: discIds } },
          select: { targetId: true, value: true },
        }),
        prisma.bookmark.findMany({
          where: { userId: req.user.id, discussionId: { in: discIds } },
          select: { discussionId: true },
        }),
      ]);

      userVotes.forEach((v) => voteMap.set(v.targetId, v.value));
      userBookmarks.forEach((b) => bookmarkSet.add(b.discussionId));
    }

    result.data = result.data.map((d) => {
      const sanitized = sanitizeDiscussion(d, { currentUserId: req.user?.id });
      sanitized.tags = (d.tags || []).map((t) => t.tag);
      sanitized.userState = {
        vote: voteMap.get(d.id) || 0,
        isBookmarked: bookmarkSet.has(d.id),
      };
      return sanitized;
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/discuss/trending
 * Top discussions by hot score in past 7 days.
 */
const getTrendingDiscussions = async (req, res, next) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const discussions = await prisma.discussion.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: sevenDaysAgo },
      },
      orderBy: { hotScore: 'desc' },
      take: 10,
      select: {
        slug: true,
        title: true,
        category: true,
        score: true,
        replyCount: true,
        viewCount: true,
        createdAt: true,
        author: { select: { username: true, role: true } },
      },
    });

    res.status(200).json({
      success: true,
      discussions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/discuss/my
 * User's authored discussions.
 */
const getMyDiscussions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const discussions = await prisma.discussion.findMany({
      where: { authorId: userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        slug: true,
        title: true,
        category: true,
        score: true,
        replyCount: true,
        viewCount: true,
        createdAt: true,
      },
    });

    res.status(200).json({
      success: true,
      discussions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/discuss/following
 * Feed of discussions the user is following or following tags of.
 */
const getFollowingDiscussions = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Followed discussions
    const followedDiscussions = await prisma.discussionFollower.findMany({
      where: { userId },
      select: { discussionId: true },
    });
    const followedDiscIds = followedDiscussions.map((fd) => fd.discussionId);

    // Followed tags
    const followedTags = await prisma.tagFollower.findMany({
      where: { userId },
      select: { tagId: true },
    });
    const followedTagIds = followedTags.map((ft) => ft.tagId);

    const discussions = await prisma.discussion.findMany({
      where: {
        deletedAt: null,
        OR: [
          { id: { in: followedDiscIds } },
          { tags: { some: { tagId: { in: followedTagIds } } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        slug: true,
        title: true,
        category: true,
        score: true,
        replyCount: true,
        viewCount: true,
        createdAt: true,
        author: { select: { username: true, role: true } },
      },
    });

    res.status(200).json({
      success: true,
      discussions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/discuss/:slug
 * Thread details resolved by resolveDiscussion middleware.
 */
const getDiscussionDetails = async (req, res, next) => {
  try {
    const discussion = req.resource;

    // Record view (anti-inflation)
    recordView(discussion.id, {
      userId: req.user?.id ?? null,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Check user vote & bookmark state if authenticated
    let userVote = 0;
    let isBookmarked = false;
    let isFollowing = false;

    if (req.user) {
      const [vote, bookmark, follow] = await Promise.all([
        prisma.discussionVote.findUnique({
          where: {
            userId_targetType_targetId: {
              userId: req.user.id,
              targetType: 'DISCUSSION',
              targetId: discussion.id,
            },
          },
        }),
        prisma.bookmark.findUnique({
          where: {
            userId_discussionId: {
              userId: req.user.id,
              discussionId: discussion.id,
            },
          },
        }),
        prisma.discussionFollower.findUnique({
          where: {
            userId_discussionId: {
              userId: req.user.id,
              discussionId: discussion.id,
            },
          },
        }),
      ]);

      if (vote) userVote = vote.value;
      if (bookmark) isBookmarked = true;
      if (follow) isFollowing = true;
    }

    const sanitized = sanitizeDiscussion(discussion, {
      currentUserId: req.user?.id,
      isStaff: req.user?.role === 'ADMIN' || req.user?.role === 'MENTOR',
    });

    sanitized.tags = (discussion.tags || []).map((t) => t.tag);
    sanitized.userState = {
      vote: userVote,
      isBookmarked,
      isFollowing,
    };

    res.status(200).json({
      success: true,
      discussion: sanitized,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/discuss
 * Create a new discussion.
 */
const createDiscussion = async (req, res, next) => {
  try {
    const validated = discussionSchema.parse(req.body);
    const userId = req.user.id;

    const slug = await generateUniqueDiscussionSlug(validated.title);

    // Resolve context FKs if slugs provided
    let problemId = null;
    let contestId = null;

    if (validated.problemSlug) {
      const p = await prisma.problem.findUnique({ where: { slug: validated.problemSlug }, select: { id: true } });
      if (p) problemId = p.id;
    }
    if (validated.contestSlug) {
      const c = await prisma.contest.findUnique({ where: { slug: validated.contestSlug }, select: { id: true } });
      if (c) contestId = c.id;
    }

    // Resolve or create tags
    const tagMapsToCreate = [];
    const tagIdsToIncrement = [];

    if (Array.isArray(validated.tags) && validated.tags.length > 0) {
      for (const rawTag of validated.tags) {
        const tagSlug = rawTag.toLowerCase().trim().replace(/[^a-z0-9]/g, '-');
        if (!tagSlug) continue;

        let tag = await prisma.discussionTag.findUnique({ where: { slug: tagSlug } });
        if (!tag) {
          tag = await prisma.discussionTag.create({
            data: { name: rawTag.trim(), slug: tagSlug },
          });
        }

        tagMapsToCreate.push({ tagId: tag.id });
        tagIdsToIncrement.push(tag.id);
      }
    }

    const newDiscussion = await prisma.discussion.create({
      data: {
        slug,
        title: validated.title,
        body: validated.body,
        category: validated.category || 'GENERAL',
        authorId: userId,
        instituteId: req.user.instituteId || null,
        problemId,
        contestId,
        vivaId: validated.vivaId || null,
        tags: {
          create: tagMapsToCreate,
        },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        body: true,
        category: true,
        createdAt: true,
        author: { select: { username: true, role: true } },
      },
    });

    // Auto-follow own discussion
    await prisma.discussionFollower.create({
      data: { userId, discussionId: newDiscussion.id },
    }).catch(() => {});

    // Increment tag counts
    await incrementTagUsage(null, tagIdsToIncrement);

    // Extract & create mention notifications
    await createMentionNotifications({
      body: validated.body,
      fromUserId: userId,
      discussionId: newDiscussion.id,
      instituteId: req.user.instituteId,
    });

    res.status(201).json({
      success: true,
      message: 'Discussion created successfully.',
      discussion: sanitizeDiscussion(newDiscussion),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/discuss/:slug
 * Update a discussion body/title/category/tags. Saves edit history version.
 */
const updateDiscussion = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const validated = discussionUpdateSchema.parse(req.body);

    const oldTitle = discussion.title;
    const oldBody = discussion.body;

    // Get current version count for history
    const historyCount = await prisma.discussionHistory.count({
      where: { discussionId: discussion.id },
    });

    const updated = await prisma.$transaction(async (tx) => {
      // Create version history entry
      await tx.discussionHistory.create({
        data: {
          discussionId: discussion.id,
          editedById: req.user.id,
          version: historyCount + 1,
          oldTitle,
          oldBody,
          newTitle: validated.title || oldTitle,
          newBody: validated.body || oldBody,
          editedReason: validated.editedReason || null,
        },
      });

      return await tx.discussion.update({
        where: { id: discussion.id },
        data: {
          title: validated.title || discussion.title,
          body: validated.body || discussion.body,
          category: validated.category || discussion.category,
        },
      });
    });

    invalidateResourceCache('discussion', discussion.slug);

    res.status(200).json({
      success: true,
      message: 'Discussion updated successfully.',
      discussion: sanitizeDiscussion(updated),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/discuss/:slug
 * Soft delete discussion (sets deletedAt, deletedById, deleteReason).
 */
const deleteDiscussion = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const { deleteReason } = req.body || {};

    await prisma.discussion.update({
      where: { id: discussion.id },
      data: {
        deletedAt: new Date(),
        deletedById: req.user.id,
        deleteReason: deleteReason || 'Deleted by author or moderator',
      },
    });

    writeAuditLog(req.user.id, 'DELETE', {
      discussionId: discussion.id,
      metadata: { reason: deleteReason },
    });

    invalidateResourceCache('discussion', discussion.slug);

    res.status(200).json({
      success: true,
      message: 'Discussion deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/discuss/:slug/restore
 * Restore a soft-deleted discussion (staff only).
 */
const restoreDiscussion = async (req, res, next) => {
  try {
    const discussion = req.resource;

    await prisma.discussion.update({
      where: { id: discussion.id },
      data: {
        deletedAt: null,
        deletedById: null,
        deleteReason: null,
      },
    });

    writeAuditLog(req.user.id, 'RESTORE', { discussionId: discussion.id });
    invalidateResourceCache('discussion', discussion.slug);

    res.status(200).json({
      success: true,
      message: 'Discussion restored successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/discuss/:slug/share
 * Record share action on discussion & update trending score.
 */
const shareDiscussion = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const updated = await prisma.discussion.update({
      where: { id: discussion.id },
      data: { shareCount: { increment: 1 } },
    });

    await updateHotScore(discussion.id);

    res.status(200).json({
      success: true,
      shareCount: updated.shareCount,
      message: 'Share recorded successfully.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listDiscussions,
  getTrendingDiscussions,
  getMyDiscussions,
  getFollowingDiscussions,
  getDiscussionDetails,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  restoreDiscussion,
  shareDiscussion,
};
