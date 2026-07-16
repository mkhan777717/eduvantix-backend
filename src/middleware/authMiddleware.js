const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

/**
 * Middleware to authenticate requests using JWT
 */
const protect = async (req, res, next) => {
  try {
    // Development bypass for local Next.js frontend integration
    const isBypass = req.headers['x-bypass-auth'] === 'true' || req.query['x-bypass-auth'] === 'true';
    if (process.env.NODE_ENV === 'development' && isBypass) {
      const bypassRole = req.headers['x-bypass-role'] || req.query['x-bypass-role'] || 'ADMIN';
      const bypassUserId = req.headers['x-bypass-userid'] || req.query['x-bypass-userid'];

      let dbUser = null;

      // Prefer looking up by explicit user ID (preserves instituteId correctly)
      if (bypassUserId) {
        const userId = parseInt(bypassUserId, 10);
        if (!isNaN(userId)) {
          dbUser = await prisma.user.findUnique({ where: { id: userId } });
        }
      }

      // Fallback: find or create a generic bypass user by role
      if (!dbUser) {
        const bypassUsername = bypassRole === 'ADMIN' ? 'admin' : bypassRole === 'MENTOR' ? 'mentor' : 'student';
        const bypassEmail = bypassRole === 'ADMIN' ? 'admin@example.com' : bypassRole === 'MENTOR' ? 'mentor@synapse.com' : 'student@example.com';
        dbUser = await prisma.user.findFirst({
          where: bypassRole === 'MENTOR' ? { email: 'mentor@synapse.com' } : { role: bypassRole }
        });
        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              username: bypassUsername,
              email: bypassEmail,
              password: 'devbypasshashedpassword',
              role: bypassRole === 'MENTOR' ? 'USER' : bypassRole,
            }
          });
        }
      }

      req.user = dbUser;
      return next();
    }

    // Check Authorization header for Bearer token or check query param
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route. Token missing.',
      });
    }

    // Handle Demo/Mock Token
    if (token.startsWith('demo-token-')) {
      const email = token.replace('demo-token-', '');
      let dbUser = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          createdAt: true,
          instituteId: true,
          institute: {
            select: {
              name: true,
            }
          }
        }
      });

      if (!dbUser) {
        const username = email.split('@')[0];
        let role = 'USER';
        if (email.includes('admin')) role = 'ADMIN';
        else if (email.includes('mentor') || (process.env.NODE_ENV === 'development' && /^\d+$/.test(email))) role = 'MENTOR';
        else if (email.includes('bm') || email.includes('batchmanager')) role = 'BATCH_MANAGER';

        let inst = await prisma.institute.findFirst();
        if (!inst) {
          inst = await prisma.institute.create({ data: { name: 'Synapse Institute' } });
        }

        dbUser = await prisma.user.create({
          data: {
            username,
            email,
            password: 'demohashedpassword',
            role,
            instituteId: inst.id
          },
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            createdAt: true,
            instituteId: true,
            institute: {
              select: {
                name: true,
              }
            }
          }
        });
      }

      req.user = dbUser;
      return next();
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userId = parseInt(decoded.id, 10);
    if (isNaN(userId)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload: user ID must be an integer.',
      });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        currentSessionId: true,
        createdAt: true,
        instituteId: true,
        institute: {
          select: {
            name: true,
          }
        }
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'The user belonging to this token no longer exists.',
      });
    }

    // Verify session ID matches DB (prevent multi-device concurrent logins)
    if (decoded.sessionId && user.currentSessionId && decoded.sessionId !== user.currentSessionId) {
      return res.status(401).json({
        success: false,
        code: 'SESSION_EXPIRED',
        message: 'Your session has expired because you logged in on another device.',
      });
    }

    // Check if the user's institute is blocked (not applicable to super admins)
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

    // Grant access and store user info in request object
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please log in again.',
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Your token has expired. Please log in again.',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Authentication failed due to an internal server error.',
    });
  }
};

/**
 * Middleware to restrict route access to specific roles
 * @param {...string} roles - List of allowed roles (e.g., 'ADMIN')
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    const email = req.user?.email || "";
    const emailLower = email.toLowerCase();

    // Dynamically map role based on email keyword or DB role
    const isEmailAdmin = emailLower.includes('admin');
    const isEmailMentor = emailLower.includes('mentor') || (process.env.NODE_ENV === 'development' && /^\d+$/.test(emailLower));
    const isEmailBm = emailLower.includes('bm') || emailLower.includes('batchmanager');
    const effectiveRole = isEmailAdmin ? 'ADMIN' : (isEmailMentor ? 'MENTOR' : (isEmailBm ? 'BATCH_MANAGER' : userRole));

    const isAllowedRole = roles.includes(effectiveRole);
    // Mentors are allowed access to ADMIN routes as well
    const isAllowedMentor = (roles.includes('MENTOR') || roles.includes('ADMIN')) && (effectiveRole === 'MENTOR');
    // Institute admins are allowed access to ADMIN routes as well
    const isAllowedInstAdmin = roles.includes('ADMIN') && (effectiveRole === 'INSTITUTE_ADMIN');

    console.log("RESTRICT_TO DEBUG:", {
      userEmail: req.user?.email,
      userRole: req.user?.role,
      effectiveRole,
      allowedRoles: roles,
      isAllowedRole,
      isAllowedMentor,
      isAllowedInstAdmin,
      decision: (!req.user || (!isAllowedRole && !isAllowedMentor && !isAllowedInstAdmin)) ? "REJECTED" : "ALLOWED"
    });

    if (!req.user || (!isAllowedRole && !isAllowedMentor && !isAllowedInstAdmin)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
      });
    }
    next();
  };
};

/**
 * Middleware to check JWT token optionally. If token is invalid or missing,
 * the request is still allowed to proceed but req.user remains undefined.
 */
const fetchUserIfExists = async (req, res, next) => {
  try {
    // Development bypass — same as protect middleware
    const isBypass = req.headers['x-bypass-auth'] === 'true' || req.query['x-bypass-auth'] === 'true';
    if (process.env.NODE_ENV === 'development' && isBypass) {
      const bypassRole = req.headers['x-bypass-role'] || req.query['x-bypass-role'] || 'USER';
      const bypassUserId = req.headers['x-bypass-userid'] || req.query['x-bypass-userid'];

      let dbUser = null;

      // Prefer looking up by explicit user ID (preserves instituteId correctly)
      if (bypassUserId) {
        const userId = parseInt(bypassUserId, 10);
        if (!isNaN(userId)) {
          dbUser = await prisma.user.findUnique({ where: { id: userId } });
        }
      }

      // Fallback: find or create a generic bypass user by role
      if (!dbUser) {
        const bypassUsername = bypassRole === 'ADMIN' ? 'admin' : bypassRole === 'MENTOR' ? 'mentor' : 'student';
        const bypassEmail = bypassRole === 'ADMIN' ? 'admin@example.com' : bypassRole === 'MENTOR' ? 'mentor@synapse.com' : 'student@example.com';
        dbUser = await prisma.user.findFirst({
          where: bypassRole === 'MENTOR' ? { email: 'mentor@synapse.com' } : { role: bypassRole }
        });
        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              username: bypassUsername,
              email: bypassEmail,
              password: 'devbypasshashedpassword',
              role: bypassRole,
            }
          });
        }
      }

      req.user = dbUser;
      return next();
    }

    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          instituteId: true,
        },
      });
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    // If token is invalid or expired, proceed without throwing error (anonymous view)
    next();
  }
};

module.exports = {
  protect,
  restrictTo,
  fetchUserIfExists,
};
