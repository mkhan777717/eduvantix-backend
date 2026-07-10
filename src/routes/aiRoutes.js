const express = require('express');
const { getSettings, updateSettings, testConnection } = require('../controllers/aiSettingsController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

// All AI settings routes are admin only
router.use(protect, restrictTo('ADMIN'));

router.get( '/settings', getSettings);
router.post('/settings', updateSettings);
router.post('/test',     testConnection);

module.exports = router;
