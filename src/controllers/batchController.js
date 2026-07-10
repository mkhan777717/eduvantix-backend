const prisma = require('../prisma');

/**
 * Get all batches in the admin's institute
 */
const getBatches = async (req, res, next) => {
  try {
    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with an institute."
      });
    }

    const batches = await prisma.batch.findMany({
      where: { instituteId },
      include: {
        manager: { select: { id: true, username: true, email: true } },
        mentors: { select: { id: true, username: true, email: true } },
        students: { select: { id: true, username: true, email: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    res.status(200).json({
      success: true,
      batches
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Create a new batch
 */
const createBatch = async (req, res, next) => {
  try {
    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with an institute."
      });
    }

    const { name, managerId, mentorIds, studentIds } = req.body;
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Batch name is required."
      });
    }

    const mId = managerId ? parseInt(managerId, 10) : null;
    const mentIds = Array.isArray(mentorIds) ? mentorIds.map(id => parseInt(id, 10)) : [];
    const studIds = Array.isArray(studentIds) ? studentIds.map(id => parseInt(id, 10)) : [];


    const batch = await prisma.batch.create({
      data: {
        name: name.trim(),
        instituteId,
        managerId: mId,
        mentors: {
          connect: mentIds.map(id => ({ id }))
        },
        students: {
          connect: studIds.map(id => ({ id }))
        }
      },
      include: {
        manager: { select: { id: true, username: true, email: true } },
        mentors: { select: { id: true, username: true, email: true } },
        students: { select: { id: true, username: true, email: true } }
      }
    });

    res.status(201).json({
      success: true,
      message: "Batch created successfully.",
      batch
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete a batch
 */
const deleteBatch = async (req, res, next) => {
  try {
    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with an institute."
      });
    }

    const batchId = parseInt(req.params.id, 10);
    if (isNaN(batchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batch ID."
      });
    }

    const batch = await prisma.batch.findUnique({
      where: { id: batchId }
    });

    if (!batch || batch.instituteId !== instituteId) {
      return res.status(404).json({
        success: false,
        message: "Batch not found in your institute."
      });
    }

    await prisma.batch.delete({
      where: { id: batchId }
    });

    res.status(200).json({
      success: true,
      message: "Batch deleted successfully."
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get batches managed by the current Batch Manager
 */
const getBatchManagerBatches = async (req, res, next) => {
  try {
    const managerId = req.user.id;
    const batches = await prisma.batch.findMany({
      where: { managerId },
      include: {
        manager: { select: { id: true, username: true, email: true } },
        mentors: { select: { id: true, username: true, email: true } },
        students: { select: { id: true, username: true, email: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    res.status(200).json({
      success: true,
      batches
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Add a mentor to a batch
 */
const addMentorToBatch = async (req, res, next) => {
  try {
    const batchId = parseInt(req.params.id, 10);
    const { mentorId } = req.body;
    const mId = parseInt(mentorId, 10);

    if (isNaN(batchId) || isNaN(mId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batch or mentor ID."
      });
    }

    if (req.user.role === 'BATCH_MANAGER') {
      const batch = await prisma.batch.findUnique({ where: { id: batchId } });
      if (!batch || batch.managerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: "You can only manage cohorts assigned to you."
        });
      }
    }

    const updatedBatch = await prisma.batch.update({
      where: { id: batchId },
      data: {
        mentors: { connect: { id: mId } }
      },
      include: {
        manager: { select: { id: true, username: true, email: true } },
        mentors: { select: { id: true, username: true, email: true } },
        students: { select: { id: true, username: true, email: true } }
      }
    });

    res.status(200).json({
      success: true,
      message: "Mentor assigned to cohort successfully.",
      batch: updatedBatch
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Remove a mentor from a batch
 */
const removeMentorFromBatch = async (req, res, next) => {
  try {
    const batchId = parseInt(req.params.id, 10);
    const mentorId = parseInt(req.params.mentorId, 10);

    if (isNaN(batchId) || isNaN(mentorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batch or mentor ID."
      });
    }

    if (req.user.role === 'BATCH_MANAGER') {
      const batch = await prisma.batch.findUnique({ where: { id: batchId } });
      if (!batch || batch.managerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: "You can only manage cohorts assigned to you."
        });
      }
    }

    const updatedBatch = await prisma.batch.update({
      where: { id: batchId },
      data: {
        mentors: { disconnect: { id: mentorId } }
      },
      include: {
        manager: { select: { id: true, username: true, email: true } },
        mentors: { select: { id: true, username: true, email: true } },
        students: { select: { id: true, username: true, email: true } }
      }
    });

    res.status(200).json({
      success: true,
      message: "Mentor removed from cohort successfully.",
      batch: updatedBatch
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Add a student to a batch
 */
const addStudentToBatch = async (req, res, next) => {
  try {
    const batchId = parseInt(req.params.id, 10);
    const { studentId } = req.body;
    const sId = parseInt(studentId, 10);

    if (isNaN(batchId) || isNaN(sId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batch or student ID."
      });
    }

    if (req.user.role === 'BATCH_MANAGER') {
      const batch = await prisma.batch.findUnique({ where: { id: batchId } });
      if (!batch || batch.managerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: "You can only manage cohorts assigned to you."
        });
      }
    }

    const updatedBatch = await prisma.batch.update({
      where: { id: batchId },
      data: {
        students: { connect: { id: sId } }
      },
      include: {
        manager: { select: { id: true, username: true, email: true } },
        mentors: { select: { id: true, username: true, email: true } },
        students: { select: { id: true, username: true, email: true } }
      }
    });

    res.status(200).json({
      success: true,
      message: "Student assigned to cohort successfully.",
      batch: updatedBatch
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Remove a student from a batch
 */
const removeStudentFromBatch = async (req, res, next) => {
  try {
    const batchId = parseInt(req.params.id, 10);
    const studentId = parseInt(req.params.studentId, 10);

    if (isNaN(batchId) || isNaN(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batch or student ID."
      });
    }

    if (req.user.role === 'BATCH_MANAGER') {
      const batch = await prisma.batch.findUnique({ where: { id: batchId } });
      if (!batch || batch.managerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: "You can only manage cohorts assigned to you."
        });
      }
    }

    const updatedBatch = await prisma.batch.update({
      where: { id: batchId },
      data: {
        students: { disconnect: { id: studentId } }
      },
      include: {
        manager: { select: { id: true, username: true, email: true } },
        mentors: { select: { id: true, username: true, email: true } },
        students: { select: { id: true, username: true, email: true } }
      }
    });

    res.status(200).json({
      success: true,
      message: "Student removed from cohort successfully.",
      batch: updatedBatch
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update general batch configurations (Institute Admin only)
 */
const updateBatch = async (req, res, next) => {
  try {
    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with an institute."
      });
    }

    const batchId = parseInt(req.params.id, 10);
    if (isNaN(batchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batch ID."
      });
    }

    const { name, managerId, mentorIds, studentIds } = req.body;

    const existing = await prisma.batch.findUnique({ where: { id: batchId } });
    if (!existing || existing.instituteId !== instituteId) {
      return res.status(404).json({
        success: false,
        message: "Batch not found in your institute."
      });
    }

    const mId = managerId ? parseInt(managerId, 10) : null;
    const mentIds = Array.isArray(mentorIds) ? mentorIds.map(id => parseInt(id, 10)) : [];
    const studIds = Array.isArray(studentIds) ? studentIds.map(id => parseInt(id, 10)) : [];


    const updatedBatch = await prisma.batch.update({
      where: { id: batchId },
      data: {
        name: name ? name.trim() : undefined,
        managerId: mId,
        mentors: mentorIds ? {
          set: mentIds.map(id => ({ id }))
        } : undefined,
        students: studentIds ? {
          set: studIds.map(id => ({ id }))
        } : undefined
      },
      include: {
        manager: { select: { id: true, username: true, email: true } },
        mentors: { select: { id: true, username: true, email: true } },
        students: { select: { id: true, username: true, email: true } }
      }
    });

    res.status(200).json({
      success: true,
      message: "Batch updated successfully.",
      batch: updatedBatch
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBatches,
  createBatch,
  deleteBatch,
  getBatchManagerBatches,
  addMentorToBatch,
  removeMentorFromBatch,
  addStudentToBatch,
  removeStudentFromBatch,
  updateBatch
};
