'use strict';

/**
 * discussionRoutes.js
 *
 * Security Model:
 *   GET /                        → public/auth feed (fetchUserIfExists)
 *   GET /trending, /my, /following → authenticated shortcuts
 *   GET /tags, /tags/popular     → public tag listing
 *   POST /tags                   → staff only (requireModerator)
 *   GET /notifications           → authenticated user notifications
 *   GET /moderation/*            → staff only (requireModerator)
 *   GET /:slug                   → resolveDiscussion → validateDiscussionAccess → getDetails
 *   POST /                       → protect → discussionLimiter → create
 *   PUT /:slug                   → protect → resolveDiscussion → requireEditDiscussion → update
 *   DELETE /:slug                → protect → resolveDiscussion → requireDeleteDiscussion → delete
 *   POST /:slug/comments         → protect → commentLimiter → resolveDiscussion → createComment
 *   POST /:slug/vote             → protect → voteLimiter → resolveDiscussion → vote
 */

const express = require('express');

// Controllers
const {
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
} = require('../controllers/discussionController');

const {
  listComments,
  createComment,
  updateComment,
  deleteComment,
  markAcceptedAnswer,
} = require('../controllers/commentController');

const {
  voteDiscussion,
  voteComment,
} = require('../controllers/voteController');

const {
  listBookmarks,
  listBookmarkFolders,
  createBookmarkFolder,
  deleteBookmarkFolder,
  bookmarkDiscussion,
  removeBookmark,
} = require('../controllers/bookmarkController');

const {
  followDiscussion,
  unfollowDiscussion,
  followTag,
  listFollowedTags,
} = require('../controllers/discussionFollowController');

const {
  listTags,
  getPopularTags,
  createTag,
} = require('../controllers/tagController');

const {
  pinDiscussion,
  lockDiscussion,
  moveDiscussionCategory,
  reportContent,
  listReports,
  resolveReport,
  getDiscussionHistory,
  getAuditLogs,
} = require('../controllers/moderationController');

const {
  listNotifications,
  markNotificationRead,
  markAllRead,
  deleteNotification,
} = require('../controllers/discussionNotificationController');

// Middlewares
const { protect, fetchUserIfExists } = require('../middleware/authMiddleware');
const {
  resolveDiscussion,
  resolveComment,
  resolveTag,
  validateDiscussionAccess,
  requireEditDiscussion,
  requireDeleteDiscussion,
  requireEditComment,
  requireDeleteComment,
  requireModerator,
} = require('../middleware/resolvers');

const {
  invalidAccessLimiter,
  discussionLimiter,
  commentLimiter,
  voteLimiter,
  reportLimiter,
} = require('../middleware/rateLimiter');

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// ── STATIC ROUTES (Must precede /:slug) ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── Feed Shortcuts ─────────────────────────────────────────────────────────────
router.get('/', fetchUserIfExists, listDiscussions);
router.get('/trending', getTrendingDiscussions);
router.get('/my', protect, getMyDiscussions);
router.get('/following', protect, getFollowingDiscussions);

// ── Bookmarks & Folders ───────────────────────────────────────────────────────
router.get('/saved', protect, listBookmarks);
router.get('/saved/folders', protect, listBookmarkFolders);
router.post('/saved/folders', protect, createBookmarkFolder);
router.delete('/saved/folders/:id', protect, deleteBookmarkFolder);

// ── Tags & Subscriptions ──────────────────────────────────────────────────────
router.get('/tags', listTags);
router.get('/tags/popular', getPopularTags);
router.get('/tags/following', protect, listFollowedTags);
router.post('/tags', protect, requireModerator, createTag);
router.post('/tags/:tag/follow', protect, resolveTag, followTag);

// ── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications', protect, listNotifications);
router.patch('/notifications/read-all', protect, markAllRead);
router.patch('/notifications/:id/read', protect, markNotificationRead);
router.delete('/notifications/:id', protect, deleteNotification);

// ── Moderation Dashboard & Audit ──────────────────────────────────────────────
router.get('/moderation/reports', protect, requireModerator, listReports);
router.patch('/moderation/reports/:id/resolve', protect, requireModerator, resolveReport);
router.get('/moderation/audit-logs', protect, requireModerator, getAuditLogs);

// ── Discussion Creation ───────────────────────────────────────────────────────
router.post('/', protect, discussionLimiter, createDiscussion);

// ═══════════════════════════════════════════════════════════════════════════════
// ── DYNAMIC ROUTES (/:slug) ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Thread Details & Actions
router.get(
  '/:slug',
  invalidAccessLimiter,
  fetchUserIfExists,
  resolveDiscussion,
  validateDiscussionAccess,
  getDiscussionDetails
);

router.put(
  '/:slug',
  protect,
  resolveDiscussion,
  requireEditDiscussion,
  updateDiscussion
);

router.delete(
  '/:slug',
  protect,
  resolveDiscussion,
  requireDeleteDiscussion,
  deleteDiscussion
);

router.post(
  '/:slug/restore',
  protect,
  resolveDiscussion,
  requireModerator,
  restoreDiscussion
);

router.get(
  '/:slug/history',
  protect,
  resolveDiscussion,
  getDiscussionHistory
);

// Comments
router.get(
  '/:slug/comments',
  fetchUserIfExists,
  resolveDiscussion,
  validateDiscussionAccess,
  listComments
);

router.post(
  '/:slug/comments',
  protect,
  commentLimiter,
  resolveDiscussion,
  validateDiscussionAccess,
  createComment
);

router.put(
  '/:slug/comments/:commentSlug',
  protect,
  resolveDiscussion,
  resolveComment,
  requireEditComment,
  updateComment
);

router.delete(
  '/:slug/comments/:commentSlug',
  protect,
  resolveDiscussion,
  resolveComment,
  requireDeleteComment,
  deleteComment
);

router.patch(
  '/:slug/comments/:commentSlug/accept',
  protect,
  resolveDiscussion,
  resolveComment,
  requireEditDiscussion,
  markAcceptedAnswer
);

// Voting
router.post(
  '/:slug/vote',
  protect,
  voteLimiter,
  resolveDiscussion,
  voteDiscussion
);

router.post(
  '/:slug/comments/:commentSlug/vote',
  protect,
  voteLimiter,
  resolveDiscussion,
  resolveComment,
  voteComment
);

// Bookmarking & Following Threads
router.post(
  '/:slug/bookmark',
  protect,
  resolveDiscussion,
  bookmarkDiscussion
);

router.delete(
  '/:slug/bookmark',
  protect,
  resolveDiscussion,
  removeBookmark
);

router.post(
  '/:slug/follow',
  protect,
  resolveDiscussion,
  followDiscussion
);

router.delete(
  '/:slug/follow',
  protect,
  resolveDiscussion,
  unfollowDiscussion
);

router.post(
  '/:slug/share',
  fetchUserIfExists,
  resolveDiscussion,
  shareDiscussion
);

// Moderation Actions on Threads
router.post(
  '/:slug/pin',
  protect,
  resolveDiscussion,
  requireModerator,
  pinDiscussion
);

router.post(
  '/:slug/lock',
  protect,
  resolveDiscussion,
  requireModerator,
  lockDiscussion
);

router.patch(
  '/:slug/move',
  protect,
  resolveDiscussion,
  requireModerator,
  moveDiscussionCategory
);

router.post(
  '/:slug/report',
  protect,
  reportLimiter,
  resolveDiscussion,
  reportContent
);

router.post(
  '/:slug/comments/:commentSlug/report',
  protect,
  reportLimiter,
  resolveDiscussion,
  resolveComment,
  reportContent
);

module.exports = router;
