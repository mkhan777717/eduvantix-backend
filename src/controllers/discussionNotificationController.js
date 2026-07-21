'use strict';

/**
 * discussionNotificationController.js
 *
 * User notification management for Discussion module.
 */

const prisma = require('../prisma');
const PaginationService = require('../services/paginationService');

/**
 * GET /api/discuss/notifications
 * List user's notifications (paginated + unreadCount).
 */
const listNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const unreadCount = await prisma.discussionNotification.count({
      where: { userId, read: false },
    });

    const config = {
      modelName: 'discussionNotification',
      defaultSort: 'createdAt',
      defaultOrder: 'desc',
    };

    const result = await PaginationService.paginate({
      model: prisma.discussionNotification,
      query: req.query,
      config,
      where: { userId },
      select: {
        id: true,
        type: true,
        read: true,
        createdAt: true,
        discussion: { select: { slug: true, title: true } },
        comment: { select: { slug: true, body: true } },
        tag: { select: { name: true, slug: true } },
      },
    });

    result.unreadCount = unreadCount;

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/discuss/notifications/:id/read
 * Mark a single notification as read.
 */
const markNotificationRead = async (req, res, next) => {
  try {
    const notifId = parseInt(req.params.id, 10);
    const userId = req.user.id;

    await prisma.discussionNotification.updateMany({
      where: { id: notifId, userId },
      data: { read: true },
    });

    res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/discuss/notifications/read-all
 * Mark all user's notifications as read.
 */
const markAllRead = async (req, res, next) => {
  try {
    const userId = req.user.id;

    await prisma.discussionNotification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/discuss/notifications/:id
 * Delete a notification.
 */
const deleteNotification = async (req, res, next) => {
  try {
    const notifId = parseInt(req.params.id, 10);
    const userId = req.user.id;

    await prisma.discussionNotification.deleteMany({
      where: { id: notifId, userId },
    });

    res.status(200).json({
      success: true,
      message: 'Notification deleted.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listNotifications,
  markNotificationRead,
  markAllRead,
  deleteNotification,
};
