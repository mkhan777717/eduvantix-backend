const path = require('path');
// Load environment variables from backend/.env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { initSocket } = require('./services/socketService');
const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorMiddleware');

// Route imports
const authRoutes = require('./routes/authRoutes');
const problemRoutes = require('./routes/problemRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const contestRoutes = require('./routes/contestRoutes');
const livekitRoutes = require('./routes/livekitRoutes');
const vivaRoutes = require('./routes/vivaRoutes');
const courseRoutes = require('./routes/courseRoutes');
const aiRoutes = require('./routes/aiRoutes');
const instituteRoutes = require('./routes/instituteRoutes');
const batchRoutes = require('./routes/batchRoutes');
const arcadeRoutes = require('./routes/arcadeRoutes');
const resumeRoutes = require('./routes/resumeRoutes');
const syllabusRoutes = require('./routes/syllabusRoutes');
const discussionRoutes = require('./routes/discussionRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const jobAssistanceRoutes = require('./routes/jobAssistanceRoutes');


const app = express();
const PORT = process.env.PORT || 5000;

// Security Middlewares
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));
app.use(cors({
  origin: '*', // Customize to Next.js URL in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-bypass-auth', 'x-bypass-role', 'x-bypass-userid']
}));

// Request Parsers & Limiters
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(apiLimiter);

// Health Check API
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'UP',
    timestamp: new Date().toISOString(),
    os: process.platform
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/livekit', livekitRoutes);
app.use('/api/viva', vivaRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/institutes', instituteRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/arcade', arcadeRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/syllabus', syllabusRoutes);
app.use('/api/discuss', discussionRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/job-assistance', jobAssistanceRoutes);


// Fallback for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler
app.use(errorHandler);

// Seeding helper to enforce single Admin/Mentor users
const seedDefaultUsers = async () => {
  try {
    const prisma = require('./prisma');
    const bcrypt = require('bcryptjs');

    if (!process.env.DEFAULT_ADMIN_EMAIL || !process.env.DEFAULT_ADMIN_PASSWORD) {
      console.log('[SEED] Default admin seeding skipped.');
      return;
    }

    const defaultUsers = [
      {
        username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
        email: process.env.DEFAULT_ADMIN_EMAIL,
        password: process.env.DEFAULT_ADMIN_PASSWORD,
        role: 'ADMIN',
      }
    ];

    for (const u of defaultUsers) {
      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            { email: u.email },
            { username: u.username }
          ]
        }
      });

      if (!existing) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(u.password, salt);
        await prisma.user.create({
          data: {
            username: u.username,
            email: u.email,
            password: hashedPassword,
            role: u.role,
          }
        });
        console.log(`[SEED] Created default ${u.role} user: ${u.email}`);
      } else {
        // Enforce default role and credentials
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(u.password, salt);
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            email: u.email, // Make sure the email is updated to the correct default value
            role: u.role,
            username: u.username,
            password: hashedPassword
          }
        });
        console.log(`[SEED] Enforced default settings for ${u.role}: ${u.email}`);
      }
    }

    // No longer auto-demoting custom admins to allow custom super admins to persist.

  } catch (err) {
    console.error('[SEED] Failed to seed default users:', err);
  }
};

// Start server
const server = http.createServer(app);
initSocket(server);

server.listen(PORT, async () => {
  console.log(`=================================`);
  console.log(`  Server running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`  Listening on port: ${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
  console.log(`=================================`);
  await seedDefaultUsers();
  const { seedDefaultQuestionsIfNeeded } = require('./controllers/arcadeController');
  await seedDefaultQuestionsIfNeeded();
  const { recalculateAllTrendingScores } = require('./services/discussionService');
  await recalculateAllTrendingScores();
  setInterval(() => {
    recalculateAllTrendingScores();
  }, 15 * 60 * 1000);
});

module.exports = app;