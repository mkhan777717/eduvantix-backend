'use strict';

/**
 * moderationController.js
 *
 * Moderator & Administrative actions for Discussion module.
 * Generates audit log entries for every action.
 */

const prisma = require('../prisma');
const PaginationService = require('../services/paginationService');
const { reportSchema } = require('../utils/validators');
const { writeAuditLog } = require('../services/discussionService');
const { invalidateResourceCache } = require('../middleware/resolvers');

/**
 * POST /api/discuss/:slug/pin
 * Toggle pin state on a discussion (staff only).
 */
const pinDiscussion = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const newPinned = !discussion.isPinned;

    await prisma.discussion.update({
      where: { id: discussion.id },
      data: { isPinned: newPinned },
    });

    writeAuditLog(req.user.id, newPinned ? 'PIN' : 'UNPIN', { discussionId: discussion.id });
    invalidateResourceCache('discussion', discussion.slug);

    res.status(200).json({
      success: true,
      isPinned: newPinned,
      message: newPinned ? 'Discussion pinned.' : 'Discussion unpinned.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/discuss/:slug/lock
 * Toggle lock state on a discussion (staff only).
 */
const lockDiscussion = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const newLocked = !discussion.isLocked;

    await prisma.discussion.update({
      where: { id: discussion.id },
      data: { isLocked: newLocked },
    });

    writeAuditLog(req.user.id, newLocked ? 'LOCK' : 'UNLOCK', { discussionId: discussion.id });
    invalidateResourceCache('discussion', discussion.slug);

    res.status(200).json({
      success: true,
      isLocked: newLocked,
      message: newLocked ? 'Discussion locked.' : 'Discussion unlocked.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/discuss/:slug/move
 * Move discussion to a different category (staff only).
 */
const moveDiscussionCategory = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const { category } = req.body;

    if (!category) {
      return res.status(400).json({ success: false, message: 'New category is required.' });
    }

    const oldCategory = discussion.category;

    await prisma.discussion.update({
      where: { id: discussion.id },
      data: { category: category.toUpperCase() },
    });

    writeAuditLog(req.user.id, 'MOVE', {
      discussionId: discussion.id,
      metadata: { oldCategory, newCategory: category.toUpperCase() },
    });

    invalidateResourceCache('discussion', discussion.slug);

    res.status(200).json({
      success: true,
      category: category.toUpperCase(),
      message: `Discussion moved from ${oldCategory} to ${category.toUpperCase()}.`,
    });
  } catch (error) {
    next(error);
  }
};

const { updateHotScore } = require('../services/discussionService');

/**
 * POST /api/discuss/:slug/report
 * Report a discussion or comment for violation.
 */
const reportContent = async (req, res, next) => {
  try {
    const validated = reportSchema.parse(req.body);
    const discussion = req.resource;
    const comment = req.comment; // present if reporting a comment

    await prisma.discussionReport.create({
      data: {
        reporterId: req.user.id,
        discussionId: discussion?.id ?? null,
        commentId: comment?.id ?? null,
        reason: validated.reason,
        body: validated.body || null,
      },
    });

    if (discussion?.id) {
      await prisma.discussion.update({
        where: { id: discussion.id },
        data: { reportCount: { increment: 1 } },
      });
      await updateHotScore(discussion.id);
    }

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully. Thank you for keeping our community safe.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/discuss/moderation/reports
 * List reports for staff moderation dashboard.
 */
const listReports = async (req, res, next) => {
  try {
    const { resolved = 'false' } = req.query;

    const baseWhere = {
      resolvedAt: resolved === 'true' ? { not: null } : null,
    };

    const config = {
      modelName: 'discussionReport',
      defaultSort: 'createdAt',
      defaultOrder: 'desc',
    };

    const result = await PaginationService.paginate({
      model: prisma.discussionReport,
      query: req.query,
      config,
      where: baseWhere,
      select: {
        id: true,
        reason: true,
        body: true,
        createdAt: true,
        resolvedAt: true,
        resolution: true,
        reporter: { select: { username: true, role: true } },
        discussion: { select: { slug: true, title: true } },
        comment: { select: { slug: true, body: true } },
      },
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/discuss/moderation/reports/:id/resolve
 * Resolve or dismiss a content report (staff only).
 */
const resolveReport = async (req, res, next) => {
  try {
    const reportId = parseInt(req.params.id, 10);
    const { resolution, action } = req.body || {}; // action: 'RESOLVED' or 'REJECTED'

    const report = await prisma.discussionReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    await prisma.discussionReport.update({
      where: { id: reportId },
      data: {
        resolvedAt: new Date(),
        resolvedById: req.user.id,
        resolution: resolution || 'Reviewed by moderator',
      },
    });

    writeAuditLog(req.user.id, action === 'REJECTED' ? 'REJECT_REPORT' : 'RESOLVE_REPORT', {
      discussionId: report.discussionId,
      commentId: report.commentId,
      metadata: { reportId, resolution },
    });

    res.status(200).json({
      success: true,
      message: 'Report resolved successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/discuss/:slug/history
 * Get edit version history for a discussion or comment.
 */
const getDiscussionHistory = async (req, res, next) => {
  try {
    const discussion = req.resource;
    const history = await prisma.discussionHistory.findMany({
      where: { discussionId: discussion.id },
      orderBy: { version: 'asc' },
      include: {
        editedBy: { select: { username: true, role: true } },
      },
    });

    res.status(200).json({
      success: true,
      history,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/discuss/moderation/audit-logs
 * List moderator audit logs (staff only).
 */
const getAuditLogs = async (req, res, next) => {
  try {
    const config = {
      modelName: 'discussionAuditLog',
      defaultSort: 'createdAt',
      defaultOrder: 'desc',
    };

    const result = await PaginationService.paginate({
      model: prisma.discussionAuditLog,
      query: req.query,
      config,
      select: {
        id: true,
        action: true,
        metadata: true,
        createdAt: true,
        actor: { select: { username: true, role: true } },
        discussion: { select: { slug: true, title: true } },
      },
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  pinDiscussion,
  lockDiscussion,
  moveDiscussionCategory,
  reportContent,
  listReports,
  resolveReport,
  getDiscussionHistory,
  getAuditLogs,
};
