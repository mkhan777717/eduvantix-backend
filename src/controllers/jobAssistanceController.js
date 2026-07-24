const fs = require('fs');
const path = require('path');
const prisma = require('../prisma');
const {
  sendJobAppAdminNotification,
  sendJobSlotAdminNotification,
  sendJobAppStatusStudentNotification,
  sendJobSlotStudentNotification,
  sendJobFeedbackStudentNotification,
} = require('../services/emailService');

// ─── Job Assistance Controller (Prisma ORM + Gmail SMTP Emails) ───────────────

/**
 * @desc    Submit a new job assistance application (student)
 * @route   POST /api/job-assistance
 * @access  Private (authenticated user)
 */
const submitApplication = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const { fullName, mobile, jobType, jobRole } = req.body;
    const email = (req.user?.email || req.body.email || '').trim().toLowerCase();

    if (!fullName || !email || !mobile || !jobType || !jobRole) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.status(400).json({
        success: false,
        message: 'All fields (fullName, mobile, jobType, jobRole) are required.'
      });
    }

    if (!['INTERNSHIP', 'FULL_TIME'].includes(jobType)) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.status(400).json({
        success: false,
        message: 'jobType must be either INTERNSHIP or FULL_TIME.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Resume file is required. Please upload a PDF or DOCX file (max 10MB).'
      });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.pdf', '.docx', '.doc'].includes(ext)) {
      if (fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.status(400).json({
        success: false,
        message: 'Invalid file extension. Only PDF, DOCX, and DOC files are allowed.'
      });
    }

    const existingApp = await prisma.jobApplication.findUnique({
      where: { userId }
    });

    if (existingApp) {
      if (!['REJECTED', 'SLOT_REJECTED'].includes(existingApp.status)) {
        if (fs.existsSync(req.file.path)) {
          try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
        return res.status(409).json({
          success: false,
          message: 'You already have an active job assistance application.'
        });
      }

      if (existingApp.status === 'REJECTED') {
        const rejectedTime = new Date(existingApp.rejectedAt || existingApp.updatedAt).getTime();
        const now = Date.now();
        const diffMs = now - rejectedTime;
        const cooldownMs = 48 * 60 * 60 * 1000;
        if (diffMs < cooldownMs) {
          if (fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
          }
          const remainingHours = Math.ceil((cooldownMs - diffMs) / (1000 * 60 * 60));
          return res.status(400).json({
            success: false,
            message: `You can re-apply after ${remainingHours} hour(s). Please use this time to prepare using our practice tools.`
          });
        }
      }

      if (existingApp.resumePath && fs.existsSync(existingApp.resumePath) && existingApp.resumePath !== req.file.path) {
        try { fs.unlinkSync(existingApp.resumePath); } catch (e) {}
      }

      const prevNotes = Array.isArray(existingApp.previousNotes) ? [...existingApp.previousNotes] : [];
      if (existingApp.adminNote) {
        prevNotes.push(existingApp.adminNote);
      }

      const updatedApp = await prisma.jobApplication.update({
        where: { userId },
        data: {
          fullName: fullName.trim(),
          email,
          mobile: mobile.trim(),
          jobType,
          jobRole: jobRole.trim(),
          resumeFileName: req.file.originalname,
          resumePath: req.file.path,
          status: 'PENDING',
          currentStep: 1,
          preferredSlot: null,
          confirmedSlot: null,
          interviewerName: null,
          interviewerEmail: null,
          mentorFeedback: null,
          isForwarded: false,
          adminNote: null,
          isReapplication: true,
          reapplyCount: (existingApp.reapplyCount || 0) + 1,
          previousNotes: prevNotes,
          rejectedAt: null,
          approvedAt: null
        }
      });

      // Send email alert to Super Admin (datamindxacademy@gmail.com)
      sendJobAppAdminNotification({
        candidateName: updatedApp.fullName,
        email: updatedApp.email,
        mobile: updatedApp.mobile,
        jobType: updatedApp.jobType,
        jobRole: updatedApp.jobRole,
      }).catch(e => console.error('Admin email error:', e.message));

      return res.status(200).json({
        success: true,
        message: 'Application re-submitted successfully! Our team will review it shortly.',
        application: updatedApp
      });
    }

    const newApp = await prisma.jobApplication.create({
      data: {
        userId,
        username: req.user.username || '',
        fullName: fullName.trim(),
        email,
        mobile: mobile.trim(),
        jobType,
        jobRole: jobRole.trim(),
        resumeFileName: req.file.originalname,
        resumePath: req.file.path,
        status: 'PENDING',
        currentStep: 1,
        isReapplication: false,
        reapplyCount: 0,
        previousNotes: []
      }
    });

    // Send email alert to Super Admin (datamindxacademy@gmail.com)
    sendJobAppAdminNotification({
      candidateName: newApp.fullName,
      email: newApp.email,
      mobile: newApp.mobile,
      jobType: newApp.jobType,
      jobRole: newApp.jobRole,
    }).catch(e => console.error('Admin email error:', e.message));

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully! Our team will review it shortly.',
      application: newApp
    });
  } catch (err) {
    console.error('Error in submitApplication:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to submit application. Internal server error.'
    });
  }
};

/**
 * @desc    Get the current user's latest job application (student)
 * @route   GET /api/job-assistance/my
 * @access  Private
 */
const getMyApplication = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const myApp = await prisma.jobApplication.findUnique({
      where: { userId }
    });

    const bookedApps = await prisma.jobApplication.findMany({
      where: {
        status: { in: ['SLOT_CONFIRMED', 'SLOT_PENDING'] },
        userId: { not: userId }
      },
      select: { confirmedSlot: true, preferredSlot: true }
    });

    const bookedSlots = bookedApps
      .map(a => a.confirmedSlot || a.preferredSlot)
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      application: myApp,
      bookedSlots
    });
  } catch (err) {
    console.error('Error in getMyApplication:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve application. Internal server error.'
    });
  }
};

/**
 * @desc    Get all job applications (Super Admin)
 * @route   GET /api/job-assistance
 * @access  Private (Admin)
 */
const getAllApplications = async (req, res) => {
  try {
    const apps = await prisma.jobApplication.findMany({
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      applications: apps
    });
  } catch (err) {
    console.error('Error in getAllApplications:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve applications. Internal server error.'
    });
  }
};

/**
 * @desc    Review (approve/reject) a job application (Super Admin)
 * @route   PATCH /api/job-assistance/:id/review
 * @access  Private (Admin)
 */
const reviewApplication = async (req, res) => {
  try {
    const appId = parseInt(req.params.id, 10);
    const { action, adminNote } = req.body;

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'action must be either APPROVE or REJECT.'
      });
    }

    const app = await prisma.jobApplication.findUnique({
      where: { id: appId }
    });

    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.'
      });
    }

    if (app.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot review an application with status "${app.status}". Only PENDING applications can be reviewed.`
      });
    }

    const data = {
      status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      currentStep: 2,
    };

    if (action === 'APPROVE') {
      data.approvedAt = new Date();
    } else {
      data.rejectedAt = new Date();
    }

    if (adminNote) {
      data.adminNote = adminNote.trim();
    }

    const updatedApp = await prisma.jobApplication.update({
      where: { id: appId },
      data
    });

    // Send email notification to Student
    sendJobAppStatusStudentNotification({
      candidateName: updatedApp.fullName,
      email: updatedApp.email,
      status: updatedApp.status,
      adminNote: updatedApp.adminNote
    }).catch(e => console.error('Student app status email error:', e.message));

    return res.status(200).json({
      success: true,
      message: `Application ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully.`,
      application: updatedApp
    });
  } catch (err) {
    console.error('Error in reviewApplication:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to review application. Internal server error.'
    });
  }
};

/**
 * @desc    Submit a slot preference (student)
 * @route   PATCH /api/job-assistance/:id/slot
 * @access  Private
 */
const submitSlot = async (req, res) => {
  try {
    const userId = req.user?.id;
    const appId = parseInt(req.params.id, 10);
    const { preferredSlot } = req.body;

    if (!preferredSlot) {
      return res.status(400).json({
        success: false,
        message: 'preferredSlot is required.'
      });
    }

    const app = await prisma.jobApplication.findUnique({
      where: { id: appId }
    });

    if (!app || app.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.'
      });
    }

    if (!['APPROVED', 'SLOT_REJECTED'].includes(app.status)) {
      return res.status(400).json({
        success: false,
        message: 'You can only select a slot after your application has been approved.'
      });
    }

    try {
      const parts = preferredSlot.split('|');
      if (parts.length >= 2) {
        const dateStr = parts[0].trim();
        const timeStr = parts[1].trim();
        const startTimePart = timeStr.split('–')[0].trim();
        const match = startTimePart.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (match) {
          let hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const meridian = match[3].toUpperCase();
          if (meridian === 'PM' && hours < 12) hours += 12;
          if (meridian === 'AM' && hours === 12) hours = 0;
          const [year, month, day] = dateStr.split('-').map(Number);
          const slotDateObj = new Date(year, month - 1, day, hours, minutes, 0, 0);

          if (slotDateObj.getTime() <= Date.now()) {
            return res.status(400).json({
              success: false,
              message: 'This time slot has already passed. Please select an upcoming slot.'
            });
          }

          const baseTimestamp = new Date(app.approvedAt || app.updatedAt || app.createdAt).getTime();
          const minAllowedTime = new Date(baseTimestamp + 6 * 60 * 60 * 1000);
          if (slotDateObj.getTime() < minAllowedTime.getTime()) {
            return res.status(400).json({
              success: false,
              message: 'Selected slot is not available. Please pick a valid upcoming slot.'
            });
          }
        }
      }
    } catch (e) {
      // Ignore
    }

    const bookedApps = await prisma.jobApplication.findMany({
      where: {
        id: { not: appId },
        status: { in: ['SLOT_CONFIRMED', 'SLOT_PENDING'] }
      }
    });

    const isAlreadyBooked = bookedApps.some(a => 
      a.confirmedSlot === preferredSlot.trim() || a.preferredSlot === preferredSlot.trim()
    );

    if (isAlreadyBooked) {
      return res.status(409).json({
        success: false,
        message: 'This slot is not available. Please select a different slot.'
      });
    }

    const updatedApp = await prisma.jobApplication.update({
      where: { id: appId },
      data: {
        preferredSlot: preferredSlot.trim(),
        status: 'SLOT_PENDING',
        currentStep: 3
      }
    });

    // Send email alert to Super Admin (datamindxacademy@gmail.com)
    sendJobSlotAdminNotification({
      candidateName: updatedApp.fullName,
      email: updatedApp.email,
      preferredSlot: updatedApp.preferredSlot
    }).catch(e => console.error('Admin slot email error:', e.message));

    return res.status(200).json({
      success: true,
      message: 'Interview slot preference submitted. Please wait for confirmation.',
      application: updatedApp
    });
  } catch (err) {
    console.error('Error in submitSlot:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit slot. Internal server error.'
    });
  }
};

/**
 * @desc    Admin: approve/edit/reject a slot + add interviewer details
 * @route   PATCH /api/job-assistance/:id/slot-review
 * @access  Private (Admin)
 */
const reviewSlot = async (req, res) => {
  try {
    const appId = parseInt(req.params.id, 10);
    const { action, confirmedSlot, interviewerName, interviewerEmail, adminNote } = req.body;

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'action must be either APPROVE or REJECT.'
      });
    }

    const app = await prisma.jobApplication.findUnique({
      where: { id: appId }
    });

    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.'
      });
    }

    if (app.status !== 'SLOT_PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot review slot for an application with status "${app.status}".`
      });
    }

    const data = {};

    if (action === 'APPROVE') {
      data.status = 'SLOT_CONFIRMED';
      data.confirmedSlot = (confirmedSlot || app.preferredSlot).trim();
      data.interviewerName = interviewerName ? interviewerName.trim() : null;
      data.interviewerEmail = interviewerEmail ? interviewerEmail.trim() : null;
    } else {
      data.status = 'SLOT_REJECTED';
    }

    if (adminNote) {
      data.adminNote = adminNote.trim();
    }

    const updatedApp = await prisma.jobApplication.update({
      where: { id: appId },
      data
    });

    // Send email notification to Student
    sendJobSlotStudentNotification({
      candidateName: updatedApp.fullName,
      email: updatedApp.email,
      action,
      confirmedSlot: updatedApp.confirmedSlot,
      interviewerName: updatedApp.interviewerName,
      interviewerEmail: updatedApp.interviewerEmail,
      adminNote: updatedApp.adminNote
    }).catch(e => console.error('Student slot email error:', e.message));

    return res.status(200).json({
      success: true,
      message: `Slot ${action === 'APPROVE' ? 'confirmed' : 'rejected'} successfully.`,
      application: updatedApp
    });
  } catch (err) {
    console.error('Error in reviewSlot:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to review slot. Internal server error.'
    });
  }
};

/**
 * @desc    Admin: submit mentor feedback & complete application
 * @route   PATCH /api/job-assistance/:id/feedback
 * @access  Private (Admin)
 */
const submitMentorFeedback = async (req, res) => {
  try {
    const appId = parseInt(req.params.id, 10);
    const { mentorFeedback, feedbackRating } = req.body;

    if (!mentorFeedback || !mentorFeedback.trim()) {
      return res.status(400).json({
        success: false,
        message: 'mentorFeedback is required.'
      });
    }

    const rating = ['PERFECT', 'NEEDS_IMPROVEMENT', 'REJECTED'].includes(feedbackRating)
      ? feedbackRating
      : 'PERFECT';

    const app = await prisma.jobApplication.findUnique({
      where: { id: appId }
    });

    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.'
      });
    }

    const allowedStatuses = ['SLOT_CONFIRMED', 'COMPLETED', 'NEEDS_IMPROVEMENT', 'REJECTED'];
    if (!allowedStatuses.includes(app.status) && app.currentStep !== 4) {
      return res.status(400).json({
        success: false,
        message: 'Mentor feedback can only be submitted or edited after the slot is confirmed.'
      });
    }

    const data = {
      mentorFeedback: mentorFeedback.trim(),
      feedbackRating: rating,
      currentStep: 4,
    };

    if (rating === 'PERFECT') {
      data.status = 'COMPLETED';
      data.isForwarded = true;
    } else if (rating === 'NEEDS_IMPROVEMENT') {
      data.status = 'NEEDS_IMPROVEMENT';
      data.isForwarded = false;
      data.rejectedAt = new Date();
    } else {
      data.status = 'REJECTED';
      data.isForwarded = false;
      data.rejectedAt = new Date();
    }

    const updatedApp = await prisma.jobApplication.update({
      where: { id: appId },
      data
    });

    // Send email notification to Student
    sendJobFeedbackStudentNotification({
      candidateName: updatedApp.fullName,
      email: updatedApp.email,
      feedback: updatedApp.mentorFeedback,
      rating: updatedApp.feedbackRating
    }).catch(e => console.error('Student feedback email error:', e.message));

    return res.status(200).json({
      success: true,
      message: `Mentor feedback submitted successfully with outcome "${rating}".`,
      application: updatedApp
    });
  } catch (err) {
    console.error('Error in submitMentorFeedback:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit feedback. Internal server error.'
    });
  }
};

/**
 * @desc    Download a student's resume (Admin)
 * @route   GET /api/job-assistance/:id/resume
 * @access  Private (Admin)
 */
const downloadResume = async (req, res) => {
  try {
    const appId = parseInt(req.params.id, 10);

    const app = await prisma.jobApplication.findUnique({
      where: { id: appId }
    });

    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.'
      });
    }

    const absolutePath = path.resolve(app.resumePath);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        message: 'Resume file not found on server.'
      });
    }

    return res.download(absolutePath, app.resumeFileName);
  } catch (err) {
    console.error('Error in downloadResume:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to download resume. Internal server error.'
    });
  }
};

module.exports = {
  submitApplication,
  getMyApplication,
  getAllApplications,
  reviewApplication,
  submitSlot,
  reviewSlot,
  submitMentorFeedback,
  downloadResume
};
