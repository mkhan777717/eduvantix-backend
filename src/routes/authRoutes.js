const express = require('express');
const { register, login, getProfile, updateProfile, getAdminStats, addInstituteAdmin, getInstituteAdmins, deleteInstituteAdmin, updateInstituteAdmin, forgotPassword, resetPassword, getStudentStats, googleLogin, requestInstituteAccess, requestProAccess, applyReferralCode } = require('../controllers/authController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Public routes with rate limit
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleLogin);
router.post('/request-institute-access', authLimiter, requestInstituteAccess);
router.post('/request-pro-access', authLimiter, requestProAccess);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPassword);

// Private/Protected routes
router.get('/profile', protect, getProfile);
router.patch('/profile', protect, updateProfile);
router.post('/referral/apply', protect, applyReferralCode);
router.get('/student/stats', protect, getStudentStats);
router.get('/stats', protect, restrictTo('ADMIN'), getAdminStats);
router.get('/users', protect, restrictTo('ADMIN'), getAllUsers);

// Institute Admin management (restricted to Super Admin only)
router.post('/institute-admin', protect, restrictTo('ADMIN'), addInstituteAdmin);
router.get('/institute-admins', protect, restrictTo('ADMIN'), getInstituteAdmins);
router.patch('/institute-admin/:id', protect, restrictTo('ADMIN'), updateInstituteAdmin);
router.delete('/institute-admin/:id', protect, restrictTo('ADMIN', 'INSTITUTE_ADMIN'), deleteInstituteAdmin);

module.exports = router;
