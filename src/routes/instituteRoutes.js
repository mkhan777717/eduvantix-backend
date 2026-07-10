const express = require('express');
const { getMembers, addMember, deleteMember, updateMember, toggleBlockInstitute } = require('../controllers/instituteController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/members')
  .get(protect, restrictTo('INSTITUTE_ADMIN', 'ADMIN', 'BATCH_MANAGER'), getMembers)
  .post(protect, restrictTo('INSTITUTE_ADMIN', 'ADMIN'), addMember);

router.route('/members/:id')
  .delete(protect, restrictTo('INSTITUTE_ADMIN', 'ADMIN'), deleteMember)
  .patch(protect, restrictTo('INSTITUTE_ADMIN', 'ADMIN'), updateMember);

// Super Admin only: block/unblock institute
router.patch('/:instituteId/block', protect, restrictTo('ADMIN'), toggleBlockInstitute);

module.exports = router;

