const express = require('express');
const { getMembers, getAllInstitutes, addMember, deleteMember, updateMember, toggleBlockInstitute, requestPremiumAccess } = require('../controllers/instituteController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, restrictTo('ADMIN', 'INSTITUTE_ADMIN'), getAllInstitutes);

router.route('/members')
  .get(protect, restrictTo('INSTITUTE_ADMIN', 'ADMIN', 'BATCH_MANAGER'), getMembers)
  .post(protect, restrictTo('INSTITUTE_ADMIN', 'ADMIN'), addMember);

router.route('/members/:id')
  .delete(protect, restrictTo('INSTITUTE_ADMIN', 'ADMIN'), deleteMember)
  .patch(protect, restrictTo('INSTITUTE_ADMIN', 'ADMIN'), updateMember);

// Request premium upgrade (Institute Admin only)
router.post('/subscribe-request', protect, restrictTo('INSTITUTE_ADMIN'), requestPremiumAccess);

// Super Admin only: block/unblock institute
router.patch('/:instituteId/block', protect, restrictTo('ADMIN'), toggleBlockInstitute);

module.exports = router;

