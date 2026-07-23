const fs = require('fs');
const path = require('path');
const prisma = require('../prisma');

// ─── Job Assistance Storage Layer ─────────────────────────────────────────────
// Supports Prisma ORM (prisma.jobApplication) in production and JSON persistence for dev testing.
// ──────────────────────────────────────────────────────────────────────────────

const DATA_FILE = path.join(__dirname, '..', 'data', 'jobApplications.json');

const readAll = () => {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const writeAll = (data) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
};

const nextId = (apps) => {
  if (apps.length === 0) return 1;
  return Math.max(...apps.map(a => a.id)) + 1;
};

// ─── Statuses ─────────────────────────────────────────────────────────────────
// PENDING           → student submitted, awaiting admin review  (step 2 in-progress)
// APPROVED          → admin approved application                (step 2 complete)
// REJECTED          → admin rejected application                (step 2 rejected)
// SLOT_PENDING      → student submitted a slot choice           (step 3 in-progress)
// SLOT_CONFIRMED    → admin confirmed/edited the slot           (step 3 complete)
// SLOT_REJECTED     → admin rejected the slot                   (step 3 rejected)
// NEEDS_IMPROVEMENT → mentor feedback needs practice            (step 4 practice needed)
// COMPLETED         → mentor feedback provided, forwarded       (step 4 complete)

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
    // Always lock email to authenticated user's email
    const email = (req.user?.email || req.body.email || '').trim().toLowerCase();

    // Validate required fields
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

    // Validate resume file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Resume file is required. Please upload a PDF or DOCX file (max 10MB).'
      });
    }

    // Extension security check
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

    const apps = readAll();

    // Find existing application for this user (Option 1: update in place on re-apply)
    const existingIdx = apps.findIndex(a => a.userId === userId);

    if (existingIdx !== -1) {
      const existingApp = apps[existingIdx];

      // If active application exists (not REJECTED or SLOT_REJECTED)
      if (!['REJECTED', 'SLOT_REJECTED'].includes(existingApp.status)) {
        if (fs.existsSync(req.file.path)) {
          try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
        return res.status(409).json({
          success: false,
          message: 'You already have an active job assistance application.'
        });
      }

      // If status is REJECTED, check 48-hour cooldown
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

      // Cleanup old resume file from server disk if different
      if (existingApp.resumePath && fs.existsSync(existingApp.resumePath) && existingApp.resumePath !== req.file.path) {
        try { fs.unlinkSync(existingApp.resumePath); } catch (e) {}
      }

      const prevNotes = Array.isArray(existingApp.previousNotes) ? [...existingApp.previousNotes] : [];
      if (existingApp.adminNote) {
        prevNotes.push(existingApp.adminNote);
      }

      const updatedApp = {
        ...existingApp,
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      apps[existingIdx] = updatedApp;
      writeAll(apps);

      return res.status(200).json({
        success: true,
        message: 'Application re-submitted successfully! Our team will review it shortly.',
        application: updatedApp
      });
    }

    // Brand new application
    const newApp = {
      id: nextId(apps),
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
      preferredSlot: null,
      confirmedSlot: null,
      interviewerName: null,
      interviewerEmail: null,
      mentorFeedback: null,
      isForwarded: false,
      adminNote: null,
      isReapplication: false,
      reapplyCount: 0,
      previousNotes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    apps.push(newApp);
    writeAll(apps);

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

    const apps = readAll();
    // Return the most recent application for this user
    const myApps = apps
      .filter(a => a.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const myApp = myApps[0] || null;
    const bookedSlots = apps
      .filter(a => ['SLOT_CONFIRMED', 'SLOT_PENDING'].includes(a.status) && a.id !== (myApp?.id))
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
    const apps = readAll();
    // Sort newest first
    const sorted = apps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({
      success: true,
      applications: sorted
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

    const apps = readAll();
    const idx = apps.findIndex(a => a.id === appId);

    if (idx === -1) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.'
      });
    }

    const app = apps[idx];

    if (app.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot review an application with status "${app.status}". Only PENDING applications can be reviewed.`
      });
    }

    if (action === 'APPROVE') {
      app.status = 'APPROVED';
      app.currentStep = 2;
      app.approvedAt = new Date().toISOString();
    } else {
      app.status = 'REJECTED';
      app.currentStep = 2;
      app.rejectedAt = new Date().toISOString();
    }

    if (adminNote) {
      app.adminNote = adminNote.trim();
    }

    app.updatedAt = new Date().toISOString();
    apps[idx] = app;
    writeAll(apps);

    return res.status(200).json({
      success: true,
      message: `Application ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully.`,
      application: app
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

    const apps = readAll();
    const idx = apps.findIndex(a => a.id === appId && a.userId === userId);

    if (idx === -1) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.'
      });
    }

    const app = apps[idx];

    // Only allow slot submission when application is APPROVED or SLOT_REJECTED (retry)
    if (!['APPROVED', 'SLOT_REJECTED'].includes(app.status)) {
      return res.status(400).json({
        success: false,
        message: 'You can only select a slot after your application has been approved.'
      });
    }

    // Validate 6-hour slot advance rule
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

          // Check if slot has already passed
          if (slotDateObj.getTime() <= Date.now()) {
            return res.status(400).json({
              success: false,
              message: 'This time slot has already passed. Please select an upcoming slot.'
            });
          }

          const baseTimestamp = new Date(app.approvedAt || app.updatedAt || app.createdAt).getTime();
          const minAllowedTime = new Date(baseTimestamp + 6 * 60 * 60 * 1000);
          if (slotDateObj < minAllowedTime) {
            return res.status(400).json({
              success: false,
              message: 'Selected slot is not available. Please pick a valid upcoming slot.'
            });
          }
        }
      }
    } catch (e) {
      // Ignore parse error and proceed
    }

    // Check if slot is already booked by another candidate
    const isAlreadyBooked = apps.some(a =>
      a.id !== appId &&
      ['SLOT_CONFIRMED', 'SLOT_PENDING'].includes(a.status) &&
      (a.confirmedSlot === preferredSlot.trim() || a.preferredSlot === preferredSlot.trim())
    );

    if (isAlreadyBooked) {
      return res.status(409).json({
        success: false,
        message: 'This slot is not available. Please select a different slot.'
      });
    }

    app.preferredSlot = preferredSlot.trim();
    app.status = 'SLOT_PENDING';
    app.currentStep = 3;
    app.updatedAt = new Date().toISOString();

    apps[idx] = app;
    writeAll(apps);

    return res.status(200).json({
      success: true,
      message: 'Interview slot preference submitted. Please wait for confirmation.',
      application: app
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

    const apps = readAll();
    const idx = apps.findIndex(a => a.id === appId);

    if (idx === -1) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.'
      });
    }

    const app = apps[idx];

    if (app.status !== 'SLOT_PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot review slot for an application with status "${app.status}".`
      });
    }

    if (action === 'APPROVE') {
      app.status = 'SLOT_CONFIRMED';
      app.confirmedSlot = (confirmedSlot || app.preferredSlot).trim();
      app.interviewerName = interviewerName ? interviewerName.trim() : null;
      app.interviewerEmail = interviewerEmail ? interviewerEmail.trim() : null;
    } else {
      app.status = 'SLOT_REJECTED';
    }

    if (adminNote) {
      app.adminNote = adminNote.trim();
    }

    app.updatedAt = new Date().toISOString();
    apps[idx] = app;
    writeAll(apps);

    return res.status(200).json({
      success: true,
      message: `Slot ${action === 'APPROVE' ? 'confirmed' : 'rejected'} successfully.`,
      application: app
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

    const apps = readAll();
    const idx = apps.findIndex(a => a.id === appId);

    if (idx === -1) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.'
      });
    }

    const app = apps[idx];

    const allowedStatuses = ['SLOT_CONFIRMED', 'COMPLETED', 'NEEDS_IMPROVEMENT', 'REJECTED'];
    if (!allowedStatuses.includes(app.status) && app.currentStep !== 4) {
      return res.status(400).json({
        success: false,
        message: 'Mentor feedback can only be submitted or edited after the slot is confirmed.'
      });
    }

    app.mentorFeedback = mentorFeedback.trim();
    app.feedbackRating = rating;
    app.currentStep = 4;
    app.updatedAt = new Date().toISOString();

    if (rating === 'PERFECT') {
      app.status = 'COMPLETED';
      app.isForwarded = true;
    } else if (rating === 'NEEDS_IMPROVEMENT') {
      app.status = 'NEEDS_IMPROVEMENT';
      app.isForwarded = false;
      app.rejectedAt = new Date().toISOString();
    } else {
      app.status = 'REJECTED';
      app.isForwarded = false;
      app.rejectedAt = new Date().toISOString();
    }

    apps[idx] = app;
    writeAll(apps);

    return res.status(200).json({
      success: true,
      message: `Mentor feedback submitted successfully with outcome "${rating}".`,
      application: app
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

    const apps = readAll();
    const app = apps.find(a => a.id === appId);

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
