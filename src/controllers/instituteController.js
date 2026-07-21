const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const PaginationService = require('../services/paginationService');
const paginationConfig = require('../config/pagination');

/**
 * Get all members inside the admin's institute with pagination
 */
const getMembers = async (req, res, next) => {
  try {
    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with an institute."
      });
    }

    const result = await PaginationService.paginate({
      model: prisma.user,
      query: req.query,
      config: paginationConfig.user,
      where: { instituteId: parseInt(instituteId, 10) },
      ctx: { user: req.user },
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * Get all institutes (Super Admin / Institute Admin)
 */
const getAllInstitutes = async (req, res, next) => {
  try {
    const result = await PaginationService.paginate({
      model: prisma.institute,
      query: req.query,
      config: paginationConfig.institute,
      ctx: { user: req.user },
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * Add a new member under the admin's institute
 */
const addMember = async (req, res, next) => {
  try {
    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with an institute."
      });
    }

    const { username, email, password, role, batchIds } = req.body;
    if (!username || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Username, email, password, and role are required."
      });
    }

    const dbRole = role.toUpperCase();
    if (!['BATCH_MANAGER', 'MENTOR', 'USER'].includes(dbRole)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified. Must be BATCH_MANAGER, MENTOR, or USER."
      });
    }

    // Check unique constraints
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.trim().toLowerCase() },
          { username: username.trim() }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Username or email is already in use."
      });
    }

    // Parse batch IDs from body
    const parsedBatchIds = Array.isArray(batchIds) ? batchIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : [];

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        role: dbRole,
        instituteId: parseInt(instituteId, 10),
        managedBatches: dbRole === 'BATCH_MANAGER' && parsedBatchIds.length > 0 ? {
          connect: parsedBatchIds.map(id => ({ id }))
        } : undefined,
        batchesTaught: dbRole === 'MENTOR' && parsedBatchIds.length > 0 ? {
          connect: parsedBatchIds.map(id => ({ id }))
        } : undefined,
        batchesStudied: dbRole === 'USER' && parsedBatchIds.length > 0 ? {
          connect: parsedBatchIds.map(id => ({ id }))
        } : undefined,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        batchesStudied: { select: { id: true, name: true } },
        batchesTaught: { select: { id: true, name: true } },
        managedBatches: { select: { id: true, name: true } }
      }
    });

    res.status(201).json({
      success: true,
      message: "Member created successfully.",
      user
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete a member under the admin's institute
 */
const deleteMember = async (req, res, next) => {
  try {
    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with an institute."
      });
    }

    const memberId = parseInt(req.params.id, 10);
    if (isNaN(memberId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid member ID."
      });
    }

    const member = await prisma.user.findUnique({
      where: { id: memberId }
    });

    if (!member || member.instituteId !== instituteId) {
      return res.status(404).json({
        success: false,
        message: "Member not found in your institute."
      });
    }

    if (member.role === 'ADMIN' || member.role === 'INSTITUTE_ADMIN') {
      return res.status(403).json({
        success: false,
        message: "Cannot delete administrators."
      });
    }

    await prisma.user.delete({
      where: { id: memberId }
    });

    res.status(200).json({
      success: true,
      message: "Member deleted successfully."
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update a member's details under the admin's institute
 */
const updateMember = async (req, res, next) => {
  try {
    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with an institute."
      });
    }

    const memberId = parseInt(req.params.id, 10);
    if (isNaN(memberId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid member ID."
      });
    }

    const { username, email, password, batchIds } = req.body;

    const member = await prisma.user.findUnique({
      where: { id: memberId }
    });

    if (!member || member.instituteId !== instituteId) {
      return res.status(404).json({
        success: false,
        message: "Member not found in your institute."
      });
    }

    const updateData = {};
    if (username) updateData.username = username.trim();
    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: email.trim().toLowerCase(),
          NOT: { id: memberId }
        }
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email is already in use."
        });
      }
      updateData.email = email.trim().toLowerCase();
    }
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    if (batchIds) {
      const parsedBatchIds = batchIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

      if (member.role === 'BATCH_MANAGER') {
        updateData.managedBatches = {
          set: parsedBatchIds.map(id => ({ id }))
        };
      } else if (member.role === 'MENTOR') {
        updateData.batchesTaught = {
          set: parsedBatchIds.map(id => ({ id }))
        };
      } else if (member.role === 'USER') {
        updateData.batchesStudied = {
          set: parsedBatchIds.map(id => ({ id }))
        };
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: memberId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        batchesStudied: { select: { id: true, name: true } },
        batchesTaught: { select: { id: true, name: true } },
        managedBatches: { select: { id: true, name: true } }
      }
    });

    res.status(200).json({
      success: true,
      message: "Member updated successfully.",
      user: updatedUser
    });
  } catch (err) {
    next(err);
  }
};


/**
 * Toggle block/unblock an institute (Super Admin only)
 */
const toggleBlockInstitute = async (req, res, next) => {
  try {
    const instituteId = parseInt(req.params.instituteId, 10);
    if (!instituteId) {
      return res.status(400).json({ success: false, message: "Invalid institute ID." });
    }

    const institute = await prisma.institute.findUnique({ where: { id: instituteId } });
    if (!institute) {
      return res.status(404).json({ success: false, message: "Institute not found." });
    }

    const updated = await prisma.institute.update({
      where: { id: instituteId },
      data: { isBlocked: !institute.isBlocked }
    });

    res.status(200).json({
      success: true,
      isBlocked: updated.isBlocked,
      message: updated.isBlocked ? "Institute blocked successfully." : "Institute unblocked successfully."
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Request premium access for an institute (Institute Admin only)
 */
const requestPremiumAccess = async (req, res, next) => {
  try {
    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({ success: false, message: "User is not associated with an institute." });
    }

    if (req.user?.role !== 'INSTITUTE_ADMIN') {
      return res.status(403).json({ success: false, message: "Only Institute Administrators can request premium." });
    }

    const { featureName } = req.body;
    if (!featureName) {
      return res.status(400).json({ success: false, message: "Feature name is required." });
    }

    const inst = await prisma.institute.findUnique({ where: { id: instituteId } });
    if (!inst) {
      return res.status(404).json({ success: false, message: "Institute not found." });
    }

    const existingFeatures = inst.wantsPremium ? inst.wantsPremium.split(",") : [];
    if (!existingFeatures.includes(featureName)) {
      existingFeatures.push(featureName);
    }

    await prisma.institute.update({
      where: { id: instituteId },
      data: { wantsPremium: existingFeatures.join(",") }
    });

    res.status(200).json({
      success: true,
      message: "Premium request submitted successfully."
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMembers,
  getAllInstitutes,
  addMember,
  deleteMember,
  updateMember,
  toggleBlockInstitute,
  requestPremiumAccess
};
