const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../prisma');
const PaginationService = require('../services/paginationService');
const paginationConfig = require('../config/pagination');
const { registerSchema, loginSchema } = require('../utils/validators');
const { invalidateSession } = require('../services/socketService');
const { sendPasswordResetEmail, sendResetSuccessEmail } = require('../services/emailService');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Helper to generate JWT token
 */
const generateToken = (id, sessionId = "") => {
  return jwt.sign({ id, sessionId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * Register a new user
 */
const register = async (req, res, next) => {
  try {
    // Validate request body
    const validatedData = registerSchema.parse(req.body);

    const { username, email, password, role } = validatedData;

    // Check if email or username already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already in use.',
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Map MENTOR to USER for DB storage (DB enum: USER | ADMIN)
    // MENTOR is a UI-only role label until a migration adds it to DB
    const dbRole = role === 'MENTOR' ? 'USER' : (role || 'USER');

    // Generate unique session ID
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role: dbRole,
        currentSessionId: sessionId
      },
    });

    // Generate token
    const token = generateToken(user.id, sessionId);

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        sessionId,
        instituteId: null,   // explicit null so frontend lock condition works immediately
        institute: null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 */
const login = async (req, res, next) => {
  try {
    // Validate request body
    const validatedData = loginSchema.parse(req.body);

    const { email, password } = validatedData;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        institute: {
          select: {
            name: true,
          }
        }
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Check if institute is blocked (non-super-admins only)
    if (user.instituteId && user.role !== 'ADMIN') {
      const institute = await prisma.institute.findUnique({
        where: { id: user.instituteId },
        select: { isBlocked: true }
      });
      if (institute?.isBlocked) {
        return res.status(403).json({
          success: false,
          code: 'INSTITUTE_BLOCKED',
          message: 'Your institute has been blocked. Please contact the Super Administrator.',
        });
      }
    }

    // Generate a unique session ID
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Update user currentSessionId in DB
    await prisma.user.update({
      where: { id: user.id },
      data: { currentSessionId: sessionId }
    });

    // Invalidate other devices
    invalidateSession(user.id, sessionId);

    // Generate token
    const token = generateToken(user.id, sessionId);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        sessionId,
        institute: user.institute,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current authenticated user profile
 */
const getProfile = async (req, res, next) => {
  try {
    // req.user is populated by protect middleware
    let user = req.user;
    if (!user.referralCode) {
      const generatedCode = 'REF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "User" SET "referralCode" = $1 WHERE id = $2`,
          generatedCode, user.id
        );
        user.referralCode = generatedCode;
      } catch (e) {
        console.error('Error generating referral code on getProfile', e);
      }
    }

    res.status(200).json({
      success: true,
      user: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update current authenticated user profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const { username, fullName, email, password, avatarUrl } = req.body;
    const userId = req.user.id;

    // Check if email or username is taken by another user
    if (email || username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            ...(email ? [{ email }] : []),
            ...(username ? [{ username }] : []),
          ],
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        if (existingUser.email === email) {
          return res.status(400).json({ success: false, message: 'Email is already in use.' });
        }
        if (existingUser.username === username) {
          return res.status(400).json({ success: false, message: 'Username is already taken.' });
        }
      }
    }

    // Build core updateData (fields definitely in Prisma client)
    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    // Update core fields via Prisma ORM
    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
    }

    // Update fullName and avatarUrl via raw SQL (works even if Prisma client not regenerated)
    const rawUpdates = [];
    const rawValues = [];
    if (fullName !== undefined) {
      rawUpdates.push(`"fullName" = $${rawValues.length + 1}`);
      rawValues.push(fullName);
    }
    if (avatarUrl !== undefined) {
      rawUpdates.push(`"avatarUrl" = $${rawValues.length + 1}`);
      rawValues.push(avatarUrl);
    }

    if (rawUpdates.length > 0) {
      rawValues.push(userId);
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET ${rawUpdates.join(', ')} WHERE id = $${rawValues.length}`,
        ...rawValues
      );
    }

    // Fetch updated user using raw SQL to ensure fullName and avatarUrl are retrieved
    // even if the Prisma client hasn't been completely regenerated
    const rows = await prisma.$queryRaw`
      SELECT id, username, email, role, "fullName", "avatarUrl"
      FROM "User"
      WHERE id = ${userId}
      LIMIT 1
    `;
    const updatedUser = rows[0];

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        avatarUrl: updatedUser.avatarUrl,
        role: updatedUser.role,
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get system statistics for Admin Dashboard
 */
const getAdminStats = async (req, res, next) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalSubmissions = await prisma.submission.count();
    const totalProblems = await prisma.problem.count();

    const acceptedCount = await prisma.submission.count({ where: { status: 'ACCEPTED' } });
    const wrongAnswerCount = await prisma.submission.count({ where: { status: 'WRONG_ANSWER' } });
    const tleCount = await prisma.submission.count({ where: { status: 'TIME_LIMIT_EXCEEDED' } });
    const runtimeErrorCount = await prisma.submission.count({ where: { status: 'RUNTIME_ERROR' } });
    const compilationErrorCount = await prisma.submission.count({ where: { status: 'COMPILATION_ERROR' } });

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalSubmissions,
        totalProblems,
        verdicts: {
          AC: acceptedCount,
          WA: wrongAnswerCount,
          TLE: tleCount,
          RE: runtimeErrorCount,
          CE: compilationErrorCount
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a new institute admin
 */
const addInstituteAdmin = async (req, res, next) => {
  try {
    // Only Super Admins (role === 'ADMIN') can create new admins
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admins can add Institute Admins.',
      });
    }

    const { username, email, password, instituteName } = req.body;

    if (!username || !email || !password || !instituteName) {
      return res.status(400).json({
        success: false,
        message: 'Username, email, password, and instituteName are required.',
      });
    }

    // Check if email or username already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already in use.',
      });
    }

    // Find or create Institute
    let institute = await prisma.institute.findUnique({
      where: { name: instituteName.trim() },
    });

    if (!institute) {
      institute = await prisma.institute.create({
        data: { name: instituteName.trim() },
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        role: 'INSTITUTE_ADMIN',
        instituteId: institute.id,
      },
      include: {
        institute: true,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Institute Admin created successfully.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        institute: user.institute,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all users (Super Admin only)
 */
const getAllUsers = async (req, res, next) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admins can list all users.',
      });
    }

    const result = await PaginationService.paginate({
      model: prisma.user,
      query: req.query,
      config: paginationConfig.user,
      ctx: { user: req.user },
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all institute admins
 */
const getInstituteAdmins = async (req, res, next) => {
  try {
    // Only Super Admins (role === 'ADMIN') can view all admins
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admins can list Institute Admins.',
      });
    }

    const result = await PaginationService.paginate({
      model: prisma.user,
      query: req.query,
      config: paginationConfig.user,
      where: { role: 'INSTITUTE_ADMIN' },
      ctx: { user: req.user },
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete an institute admin
 */
const deleteInstituteAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = parseInt(id, 10);

    if (isNaN(adminId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Admin ID.',
      });
    }

    const userToDelete = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found.',
      });
    }

    if (userToDelete.role !== 'INSTITUTE_ADMIN') {
      return res.status(400).json({
        success: false,
        message: 'Only Institute Admins can be deleted via this endpoint.',
      });
    }

    await prisma.user.delete({
      where: { id: adminId },
    });

    res.status(200).json({
      success: true,
      message: 'Institute Admin deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an institute admin
 */
const updateInstituteAdmin = async (req, res, next) => {
  try {
    // Only Super Admins can update admins
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admins can update Institute Admins.',
      });
    }

    const { id } = req.params;
    const adminId = parseInt(id, 10);

    if (isNaN(adminId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Admin ID.',
      });
    }

    const userToUpdate = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!userToUpdate) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found.',
      });
    }

    if (userToUpdate.role !== 'INSTITUTE_ADMIN') {
      return res.status(400).json({
        success: false,
        message: 'Only Institute Admins can be updated via this endpoint.',
      });
    }

    const { username, email, password, instituteName } = req.body;

    const updateData = {};

    // Validate and update username
    if (username && username.trim()) {
      const trimmedUsername = username.trim();
      if (trimmedUsername !== userToUpdate.username) {
        const existingUsername = await prisma.user.findUnique({
          where: { username: trimmedUsername },
        });
        if (existingUsername) {
          return res.status(400).json({
            success: false,
            message: 'Username already in use.',
          });
        }
        updateData.username = trimmedUsername;
      }
    }

    // Validate and update email
    if (email && email.trim()) {
      const formattedEmail = email.trim().toLowerCase();
      if (formattedEmail !== userToUpdate.email) {
        const existingEmail = await prisma.user.findUnique({
          where: { email: formattedEmail },
        });
        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: 'Email already in use.',
          });
        }
        updateData.email = formattedEmail;
      }
    }

    // Validate and update password
    if (password && password.trim()) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password.trim(), salt);
    }

    // Handle institute name update
    if (instituteName && instituteName.trim()) {
      const trimmedInstituteName = instituteName.trim();
      let institute = await prisma.institute.findUnique({
        where: { name: trimmedInstituteName },
      });

      if (!institute) {
        institute = await prisma.institute.create({
          data: { name: trimmedInstituteName },
        });
      }
      updateData.instituteId = institute.id;
    }

    const updatedUser = await prisma.user.update({
      where: { id: adminId },
      data: updateData,
      include: {
        institute: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Institute Admin updated successfully.',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        institute: updatedUser.institute,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Request password reset token
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Return success to avoid email enumeration attacks
      return res.status(200).json({
        success: true,
        message: 'If an account exists with that email, a password reset link has been sent.',
      });
    }

    // Generate token and expiry (1 hour)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const tokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Save to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: tokenExpiry,
      },
    });

    // Send email using Brevo email service
    await sendPasswordResetEmail(user.email, user.username, resetToken);

    res.status(200).json({
      success: true,
      message: 'If an account exists with that email, a password reset link has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password using token
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    // Hash the token from url param to match database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with matching unexpired token
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired.',
      });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password.trim(), salt);

    // Update user password and clear token/expiry
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    // Send success notification email
    await sendResetSuccessEmail(user.email, user.username);

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get comprehensive student statistics for the Profile/Dashboard
 */
const getStudentStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 1. Fetch total problems by difficulty in the system
    const problems = await prisma.problem.findMany({
      select: { difficulty: true }
    });
    
    let totalEasy = 0, totalMedium = 0, totalHard = 0;
    problems.forEach(p => {
      if (p.difficulty === 'EASY') totalEasy++;
      else if (p.difficulty === 'MEDIUM') totalMedium++;
      else if (p.difficulty === 'HARD') totalHard++;
      else totalEasy++; // Fallback
    });

    // 2. Fetch all accepted submissions for this user to calculate solved counts
    const acceptedSubs = await prisma.submission.findMany({
      where: { userId, status: 'ACCEPTED' },
      include: { problem: { select: { id: true, difficulty: true } } }
    });

    // Count distinct problems solved by difficulty
    const solvedSet = new Set();
    let solvedEasy = 0, solvedMedium = 0, solvedHard = 0;
    
    // Calculate language breakdown from accepted subs
    const languageStats = {};

    acceptedSubs.forEach(sub => {
      if (!solvedSet.has(sub.problemId)) {
        solvedSet.add(sub.problemId);
        if (sub.problem) {
          if (sub.problem.difficulty === 'EASY') solvedEasy++;
          else if (sub.problem.difficulty === 'MEDIUM') solvedMedium++;
          else if (sub.problem.difficulty === 'HARD') solvedHard++;
          else solvedEasy++;
        } else {
          solvedEasy++; // Fallback if problem is somehow missing
        }
      }
      
      // Aggregate language
      if (sub.language) {
        languageStats[sub.language] = (languageStats[sub.language] || 0) + 1;
      }
    });

    const languages = Object.keys(languageStats).map(lang => ({
      language: lang,
      problemsSolved: languageStats[lang]
    })).sort((a, b) => b.problemsSolved - a.problemsSolved);

    // 3. Fetch all submissions (any status) from the past 365 days for the heatmap and streaks
    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);

    const pastYearSubs = await prisma.submission.findMany({
      where: {
        userId,
        createdAt: { gte: oneYearAgo }
      },
      select: { createdAt: true }
    });

    // Process heatmap data (grouped by YYYY-MM-DD)
    const heatmapData = {};
    pastYearSubs.forEach(sub => {
      // Convert to YYYY-MM-DD
      const date = new Date(sub.createdAt);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      heatmapData[dateStr] = (heatmapData[dateStr] || 0) + 1;
    });
    
    const activeDaysCount = Object.keys(heatmapData).length;

    // Calculate Streak (Max Streak & Current Streak)
    let maxStreak = 0;
    let currentStreak = 0;
    
    const uniqueDates = Object.keys(heatmapData).sort((a, b) => new Date(b) - new Date(a)); // Descending
    
    if (uniqueDates.length > 0) {
      const today = new Date();
      const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const todayStr = formatDate(today);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = formatDate(yesterday);

      // Current Streak
      if (uniqueDates.includes(todayStr) || uniqueDates.includes(yesterdayStr)) {
        let streak = 0;
        const startDateStr = uniqueDates.includes(todayStr) ? todayStr : yesterdayStr;
        let curr = new Date(startDateStr);
        const dateSet = new Set(uniqueDates);
        
        while (true) {
          const checkStr = formatDate(curr);
          if (dateSet.has(checkStr)) {
            streak++;
            curr.setDate(curr.getDate() - 1);
          } else {
            break;
          }
        }
        currentStreak = streak;
      }

      // Max Streak
      let tempMax = 1;
      let runningMax = 1;
      const sortedAsc = [...uniqueDates].sort((a, b) => new Date(a) - new Date(b));
      for (let i = 1; i < sortedAsc.length; i++) {
        const prev = new Date(sortedAsc[i - 1]);
        const curr = new Date(sortedAsc[i]);
        const diffDays = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          runningMax++;
        } else if (diffDays > 1) {
          tempMax = Math.max(tempMax, runningMax);
          runningMax = 1;
        }
      }
      maxStreak = Math.max(tempMax, runningMax);
    }

    res.status(200).json({
      success: true,
      stats: {
        totalProblems: { easy: totalEasy, medium: totalMedium, hard: totalHard },
        solvedProblems: { easy: solvedEasy, medium: solvedMedium, hard: solvedHard, total: solvedSet.size },
        languages,
        heatmap: heatmapData,
        streaks: { current: currentStreak, max: maxStreak, totalActiveDays: activeDaysCount },
        totalSubmissionsPastYear: pastYearSubs.length
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Google OAuth2 Login / Registration
 * Supports:
 *   - ID token flow:    req.body.credential  (legacy GoogleLogin component)
 *   - Implicit flow:   req.body.access_token (useGoogleLogin implicit flow, includes state CSRF param)
 */
const googleLogin = async (req, res, next) => {
  try {
    const { credential, access_token } = req.body;

    if (!credential && !access_token) {
      return res.status(400).json({
        success: false,
        message: 'Google credential or access_token is required.',
      });
    }

    let payload;

    if (credential) {
      // --- ID token path (verifyIdToken) ---
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } catch (verifyErr) {
        console.error('[GOOGLE_AUTH] Token verification failed:', verifyErr);
        return res.status(401).json({
          success: false,
          message: 'Invalid Google authentication token.',
        });
      }
    } else {
      // --- Access token path (implicit flow) ---
      try {
        const userinfoRes = await fetch(
          `https://www.googleapis.com/oauth2/v3/userinfo`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (!userinfoRes.ok) {
          return res.status(401).json({
            success: false,
            message: 'Invalid Google access token.',
          });
        }
        payload = await userinfoRes.json();
      } catch (fetchErr) {
        console.error('[GOOGLE_AUTH] Userinfo fetch failed:', fetchErr);
        return res.status(401).json({
          success: false,
          message: 'Failed to verify Google access token.',
        });
      }
    }

    const { email, name, picture } = payload;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email not provided by Google account.',
      });
    }

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email },
      include: {
        institute: {
          select: {
            name: true,
          }
        }
      }
    });

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (user) {
      // Check if institute is blocked (non-super-admins only)
      if (user.instituteId && user.role !== 'ADMIN') {
        const institute = await prisma.institute.findUnique({
          where: { id: user.instituteId },
          select: { isBlocked: true }
        });
        if (institute?.isBlocked) {
          return res.status(403).json({
            success: false,
            code: 'INSTITUTE_BLOCKED',
            message: 'Your institute has been blocked. Please contact the Super Administrator.',
          });
        }
      }

      // Update session ID in database
      user = await prisma.user.update({
        where: { id: user.id },
        data: { currentSessionId: sessionId },
        include: {
          institute: {
            select: {
              name: true,
            }
          }
        }
      });

      // Invalidate other active sessions for this user
      invalidateSession(user.id, sessionId);
    } else {
      // Deriving a unique username
      let baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (!baseUsername) baseUsername = 'user';
      
      let username = baseUsername;
      let usernameExists = true;
      let suffix = 1;

      while (usernameExists) {
        const existing = await prisma.user.findFirst({
          where: { username }
        });
        if (!existing) {
          usernameExists = false;
        } else {
          username = `${baseUsername}${suffix}`;
          suffix++;
        }
      }

      // Hash a random placeholder password
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      // Create new user (Google logins register as standard STUDENT / USER role)
      user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          role: 'USER',
          currentSessionId: sessionId
        },
        include: {
          institute: {
            select: {
              name: true,
            }
          }
        }
      });
    }

    // Generate session JWT
    const token = generateToken(user.id, sessionId);

    res.status(200).json({
      success: true,
      message: 'Google login successful.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        sessionId,
        institute: user.institute,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle new campus partnership requests
 */
const requestInstituteAccess = async (req, res, next) => {
  try {
    const { name, university, email, phone, message } = req.body;
    if (!name || !university || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name, university, and email are required fields.',
      });
    }

    const { sendPartnerRequestEmail } = require('../services/emailService');
    const sent = await sendPartnerRequestEmail({
      fullName: name,
      university,
      email,
      phone,
      message,
    });

    if (!sent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send partnership request email. Please check your SMTP configuration.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Partnership request submitted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle new Pro early access requests
 */
const requestProAccess = async (req, res, next) => {
  try {
    const { name, email, phone, description } = req.body;
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and mobile number are required fields.',
      });
    }

    const { sendProEarlyAccessEmail } = require('../services/emailService');
    const sent = await sendProEarlyAccessEmail({
      name,
      email,
      phone,
      description,
    });

    if (!sent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send early access request email. Please check your SMTP configuration.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Early access request submitted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Apply Referral Code
 */
const applyReferralCode = async (req, res, next) => {
  try {
    const { referralCode } = req.body;
    const userId = req.user.id;

    if (!referralCode) {
      return res.status(400).json({ success: false, message: 'Referral code is required.' });
    }

    // Find the user who owns this referral code
    const referrer = await prisma.user.findUnique({
      where: { referralCode: referralCode.toUpperCase() }
    });

    if (!referrer) {
      return res.status(404).json({ success: false, message: 'Invalid referral code.' });
    }

    if (referrer.id === userId) {
      return res.status(400).json({ success: false, message: 'You cannot use your own referral code.' });
    }

    // Check if current user already used a referral code
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (currentUser.referredById) {
      return res.status(400).json({ success: false, message: 'You have already used a referral code.' });
    }

    // 7 days in milliseconds
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const now = new Date();

    // Extend referee premium
    let currentPremium = currentUser.premiumUntil && new Date(currentUser.premiumUntil) > now ? new Date(currentUser.premiumUntil) : now;
    const newPremiumUntil = new Date(currentPremium.getTime() + SEVEN_DAYS);

    // Extend referrer premium
    let referrerPremium = referrer.premiumUntil && new Date(referrer.premiumUntil) > now ? new Date(referrer.premiumUntil) : now;
    const referrerNewPremiumUntil = new Date(referrerPremium.getTime() + SEVEN_DAYS);

    // Transaction to update both users safely
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          referredById: referrer.id,
          premiumUntil: newPremiumUntil
        }
      }),
      prisma.user.update({
        where: { id: referrer.id },
        data: {
          premiumUntil: referrerNewPremiumUntil
        }
      })
    ]);

    res.status(200).json({
      success: true,
      message: 'Referral code applied successfully! You and your friend both earned 7 days of premium.',
      premiumUntil: newPremiumUntil
    });
  } catch (error) {
    next(error);
  }
};


module.exports = {
  applyReferralCode,
  register,
  login,
  getProfile,
  updateProfile,
  getAdminStats,
  addInstituteAdmin,
  getInstituteAdmins,
  getAllUsers,
  deleteInstituteAdmin,
  updateInstituteAdmin,
  forgotPassword,
  resetPassword,
  getStudentStats,
  googleLogin,
  requestInstituteAccess,
  requestProAccess,
};
