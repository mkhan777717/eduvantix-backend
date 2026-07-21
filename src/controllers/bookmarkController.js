'use strict';

/**
 * bookmarkController.js
 *
 * Folder-organized bookmarking system for Discussions.
 */

const prisma = require('../prisma');
const PaginationService = require('../services/paginationService');
const { bookmarkFolderSchema } = require('../utils/validators');
const { sanitizeDiscussion } = require('../services/discussionService');

/**
 * GET /api/discuss/saved
 * List user's bookmarked discussions (paginated).
 */
const listBookmarks = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { folderName } = req.query;

    const baseWhere = { userId };

    if (folderName) {
      const folder = await prisma.bookmarkFolder.findFirst({
        where: { userId, name: folderName },
        select: { id: true },
      });
      if (folder) {
        baseWhere.folderId = folder.id;
      }
    }

    const config = {
      modelName: 'bookmark',
      defaultSort: 'createdAt',
      defaultOrder: 'desc',
    };

    const result = await PaginationService.paginate({
      model: prisma.bookmark,
      query: req.query,
      config,
      where: baseWhere,
      select: {
        id: true,
        createdAt: true,
        folder: { select: { id: true, name: true } },
        discussion: {
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
        },
      },
    });

    result.data = result.data.map((b) => ({
      folder: b.folder,
      createdAt: b.createdAt,
      discussion: sanitizeDiscussion(b.discussion, { currentUserId: userId }),
    }));

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/discuss/saved/folders
 * List user's bookmark folders.
 */
const listBookmarkFolders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const folders = await prisma.bookmarkFolder.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { bookmarks: true } },
      },
    });

    res.status(200).json({
      success: true,
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        count: f._count.bookmarks,
        createdAt: f.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/discuss/saved/folders
 * Create a new bookmark folder.
 */
const createBookmarkFolder = async (req, res, next) => {
  try {
    const validated = bookmarkFolderSchema.parse(req.body);
    const userId = req.user.id;

    const folder = await prisma.bookmarkFolder.create({
      data: {
        userId,
        name: validated.name.trim(),
      },
    });

    res.status(201).json({
      success: true,
      folder: { id: folder.id, name: folder.name, count: 0 },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/discuss/saved/folders/:id
 * Delete a bookmark folder.
 */
const deleteBookmarkFolder = async (req, res, next) => {
  try {
    const folderId = parseInt(req.params.id, 10);
    const userId = req.user.id;

    await prisma.bookmarkFolder.deleteMany({
      where: { id: folderId, userId },
    });

    res.status(200).json({
      success: true,
      message: 'Folder deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

const { updateHotScore } = require('../services/discussionService');

/**
 * POST /api/discuss/:slug/bookmark
 * Toggle or save a discussion to bookmarks.
 */
const bookmarkDiscussion = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const userId = req.user.id;
    const { folderId } = req.body || {};

    const existing = await prisma.bookmark.findUnique({
      where: {
        userId_discussionId: { userId, discussionId: discussion.id },
      },
    });

    if (existing) {
      await prisma.$transaction([
        prisma.bookmark.delete({ where: { id: existing.id } }),
        prisma.discussion.update({
          where: { id: discussion.id },
          data: { bookmarkCount: { decrement: 1 } },
        }),
      ]);
      await updateHotScore(discussion.id);

      return res.status(200).json({
        success: true,
        isBookmarked: false,
        message: 'Discussion removed from bookmarks.',
      });
    }

    await prisma.$transaction([
      prisma.bookmark.create({
        data: {
          userId,
          discussionId: discussion.id,
          folderId: folderId ? parseInt(folderId, 10) : null,
        },
      }),
      prisma.discussion.update({
        where: { id: discussion.id },
        data: { bookmarkCount: { increment: 1 } },
      }),
    ]);
    await updateHotScore(discussion.id);

    res.status(201).json({
      success: true,
      isBookmarked: true,
      message: 'Discussion bookmarked successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/discuss/:slug/bookmark
 * Remove a discussion from bookmarks.
 */
const removeBookmark = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const userId = req.user.id;

    await prisma.$transaction([
      prisma.bookmark.deleteMany({
        where: { userId, discussionId: discussion.id },
      }),
      prisma.discussion.update({
        where: { id: discussion.id },
        data: { bookmarkCount: { decrement: 1 } },
      }),
    ]);
    await updateHotScore(discussion.id);

    res.status(200).json({
      success: true,
      isBookmarked: false,
      message: 'Bookmark removed.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listBookmarks,
  listBookmarkFolders,
  createBookmarkFolder,
  deleteBookmarkFolder,
  bookmarkDiscussion,
  removeBookmark,
};
