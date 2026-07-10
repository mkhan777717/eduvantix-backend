const prisma = require('../prisma');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

const getHttpLivekitUrl = (url) => {
  if (!url) return '';
  return url.replace(/^wss?:\/\//, (match) => match === 'wss://' ? 'https://' : 'http://');
};

/**
 * @desc    Create a new live session (Admin/Mentor only)
 * @route   POST /api/livekit/session
 * @access  Protected (ADMIN, MENTOR)
 */
const createSession = async (req, res) => {
  try {
    const { title, description, thumbnailUrl, scheduledAt, batchIds } = req.body;

    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Session title is required.',
      });
    }

    // Check if there's already an active live session for the targeted scope
    let conflictWhere = { isLive: true };
    if (batchIds && batchIds.length > 0) {
      conflictWhere.batches = {
        some: { id: { in: batchIds } }
      };
    } else {
      if (req.user?.role === "ADMIN") {
        // Global Super Admin session conflict check
        conflictWhere.batches = { none: {} };
      } else {
        // Institute Admin/Mentor session conflict check within their own institute
        conflictWhere.host = { instituteId: req.user.instituteId };
      }
    }

    const existingLive = await prisma.liveSession.findFirst({
      where: conflictWhere,
    });

    if (existingLive) {
      return res.status(409).json({
        success: false,
        message: 'Another session is already live for the selected targeted group. End it before starting a new one.',
        activeSession: existingLive,
      });
    }

    // Generate a unique room name
    const roomName = `dmx-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const session = await prisma.liveSession.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        thumbnailUrl: thumbnailUrl || null,
        roomName,
        hostId: req.user.id,
        isLive: true,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        startedAt: new Date(),
        batches: batchIds && batchIds.length > 0 ? {
          connect: batchIds.map(id => ({ id }))
        } : undefined
      },
      include: {
        host: {
          select: { id: true, username: true, role: true },
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Live session started successfully.',
      session,
    });
  } catch (error) {
    console.error('Error creating live session:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create live session.',
    });
  }
};

/**
 * @desc    Generate a LiveKit access token for joining a room
 * @route   POST /api/livekit/token
 * @access  Protected (any authenticated user)
 */
const generateToken = async (req, res) => {
  try {
    const { roomName } = req.body;

    if (!roomName) {
      return res.status(400).json({
        success: false,
        message: 'Room name is required.',
      });
    }

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'LiveKit credentials are not configured on the server.',
      });
    }

    // Determine permissions based on user role
    const isHost = req.user.role === 'ADMIN' || req.user.role === 'MENTOR';

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: req.user.username,
      name: req.user.username,
      ttl: '4h',
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,           // Allow everyone to publish (needed for student raise hand and speak feature)
      canSubscribe: true,         // Everyone can watch
      canPublishData: true,       // Data channels for future chat feature
    });

    const token = await at.toJwt();

    return res.status(200).json({
      success: true,
      token,
      isHost,
    });
  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate access token.',
    });
  }
};

/**
 * @desc    Get the currently active live session (if any)
 * @route   GET /api/livekit/session/active
 * @access  Public
 */
const getActiveSession = async (req, res) => {
  try {
    let whereClause = { isLive: true };
    const { sessionId } = req.query;

    if (sessionId) {
      whereClause.id = parseInt(sessionId, 10);
    }

    if (req.user && req.user.role === 'USER') {
      const student = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          batchesStudied: { select: { id: true } }
        }
      });
      const batchIds = student ? student.batchesStudied.map(b => b.id) : [];

      whereClause = {
        isLive: true,
        OR: [
          {
            batches: {
              some: { id: { in: batchIds } }
            }
          },
          {
            batches: { none: {} },
            host: {
              OR: [
                { role: 'ADMIN' },
                { instituteId: req.user.instituteId }
              ]
            }
          }
        ]
      };
    }

    const session = await prisma.liveSession.findFirst({
      where: whereClause,
      include: {
        host: {
          select: { id: true, username: true, role: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      session: session || null,
    });
  } catch (error) {
    console.error('Error fetching active session:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch active session.',
    });
  }
};

/**
 * @desc    Get all sessions (for homepage past sessions and admin dashboard)
 * @route   GET /api/livekit/sessions
 * @access  Public
 */
const getAllSessions = async (req, res) => {
  try {
    let whereClause = {};

    if (req.user && req.user.role === 'USER') {
      const student = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          batchesStudied: { select: { id: true } }
        }
      });
      const batchIds = student ? student.batchesStudied.map(b => b.id) : [];

      whereClause = {
        OR: [
          {
            batches: {
              some: { id: { in: batchIds } }
            }
          },
          {
            batches: { none: {} },
            host: {
              OR: [
                { role: 'ADMIN' },
                { instituteId: req.user.instituteId }
              ]
            }
          }
        ]
      };
    }

    const sessions = await prisma.liveSession.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        host: {
          select: { id: true, username: true, role: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      sessions,
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions.',
    });
  }
};

/**
 * @desc    End a live session
 * @route   PATCH /api/livekit/session/:id/end
 * @access  Protected (ADMIN, MENTOR — session host only)
 */
const endSession = async (req, res) => {
  try {
    const { id } = req.params;
    const sessionId = parseInt(id, 10);

    if (isNaN(sessionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID.',
      });
    }

    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found.',
      });
    }

    if (!session.isLive) {
      return res.status(400).json({
        success: false,
        message: 'This session has already ended.',
      });
    }

    // Only the host or an admin can end a session
    if (session.hostId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to end this session.',
      });
    }

    const updatedSession = await prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        isLive: false,
        endedAt: new Date(),
      },
      include: {
        host: {
          select: { id: true, username: true, role: true },
        },
      },
    });

    // Delete all chat messages and polls associated with this session after it has ended
    try {
      await prisma.liveChatMessage.deleteMany({ where: { sessionId: sessionId } });
      // Delete poll answers first (FK child), then polls
      const sessionPolls = await prisma.livePoll.findMany({ where: { sessionId: sessionId }, select: { id: true } });
      const pollIds = sessionPolls.map(p => p.id);
      if (pollIds.length > 0) {
        await prisma.livePollAnswer.deleteMany({ where: { pollId: { in: pollIds } } });
        await prisma.livePoll.deleteMany({ where: { sessionId: sessionId } });
      }
      console.log(`Successfully deleted chat messages and polls for ended session ID: ${sessionId}`);
    } catch (dbErr) {
      console.error('Failed to clean up session chat/poll data:', dbErr);
    }

    // Close the LiveKit room if we have the service client configured
    if (LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET) {
      try {
        const httpUrl = getHttpLivekitUrl(LIVEKIT_URL);
        const svc = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
        await svc.deleteRoom(session.roomName);
        console.log(`Successfully deleted LiveKit room: ${session.roomName}`);
      } catch (lkErr) {
        console.error('Failed to close LiveKit room:', lkErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Session ended successfully.',
      session: updatedSession,
    });
  } catch (error) {
    console.error('Error ending session:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to end session.',
    });
  }
};

const deleteSession = async (req, res) => {
  try {
    const { id } = req.params;
    const sessionId = parseInt(id, 10);

    if (isNaN(sessionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID.',
      });
    }

    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found.',
      });
    }

    // Only the host or an admin can delete a session
    if (session.hostId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this session.',
      });
    }

    await prisma.liveSession.delete({
      where: { id: sessionId },
    });

    return res.status(200).json({
      success: true,
      message: 'Session deleted successfully.',
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete session.',
    });
  }
};

/**
 * @desc    Get all chat messages for a live session
 * @route   GET /api/livekit/session/:id/chat
 * @access  Protected
 */
const getSessionChat = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) {
      return res.status(400).json({ success: false, message: 'Invalid session ID.' });
    }

    const messages = await prisma.liveChatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error('Error fetching session chat messages:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
  }
};

/**
 * @desc    Post a new chat message for a live session
 * @route   POST /api/livekit/session/:id/chat
 * @access  Protected
 */
const postChatMessage = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { messageText } = req.body;

    if (isNaN(sessionId)) {
      return res.status(400).json({ success: false, message: 'Invalid session ID.' });
    }
    if (!messageText || messageText.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Message text is required.' });
    }

    // Verify session exists and is live
    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || !session.isLive) {
      return res.status(400).json({ success: false, message: 'Session is not active.' });
    }

    const message = await prisma.liveChatMessage.create({
      data: {
        sessionId,
        senderUsername: req.user.username,
        messageText: messageText.trim(),
      },
    });

    return res.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    console.error('Error creating chat message:', error);
    return res.status(500).json({ success: false, message: 'Failed to save message.' });
  }
};

// ─── Poll Controllers ────────────────────────────────────────────────

/**
 * @desc    Create a new poll for a live session
 * @route   POST /api/livekit/session/:id/poll
 * @access  Protected (ADMIN, MENTOR)
 */
const createPoll = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { question, options, correctIdx, timerSecs } = req.body;

    if (isNaN(sessionId)) {
      return res.status(400).json({ success: false, message: 'Invalid session ID.' });
    }
    if (!question || !question.trim()) {
      return res.status(400).json({ success: false, message: 'Question text is required.' });
    }
    if (!Array.isArray(options) || options.length < 2 || options.length > 4) {
      return res.status(400).json({ success: false, message: 'Options must be an array of 2–4 items.' });
    }
    if (typeof correctIdx !== 'number' || correctIdx < 0 || correctIdx >= options.length) {
      return res.status(400).json({ success: false, message: 'Invalid correct option index.' });
    }

    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session || !session.isLive) {
      return res.status(400).json({ success: false, message: 'Session is not active.' });
    }

    const poll = await prisma.livePoll.create({
      data: {
        sessionId,
        question: question.trim(),
        options: options.map(o => o.trim()),
        correctIdx,
        timerSecs: timerSecs || 30,
      },
    });

    return res.status(201).json({ success: true, poll });
  } catch (error) {
    console.error('Error creating poll:', error);
    return res.status(500).json({ success: false, message: 'Failed to create poll.' });
  }
};

/**
 * @desc    Save a student's answer to a poll
 * @route   POST /api/livekit/poll/:pollId/answer
 * @access  Protected
 */
const savePollAnswer = async (req, res) => {
  try {
    const pollId = parseInt(req.params.pollId, 10);
    const { chosenIdx, timeMs } = req.body;

    if (isNaN(pollId)) {
      return res.status(400).json({ success: false, message: 'Invalid poll ID.' });
    }
    if (typeof chosenIdx !== 'number') {
      return res.status(400).json({ success: false, message: 'chosenIdx is required.' });
    }

    const poll = await prisma.livePoll.findUnique({ where: { id: pollId } });
    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found.' });
    }

    const isCorrect = chosenIdx === poll.correctIdx;
    // Scoring: 1000 pts for correct, minus time penalty (capped at 0)
    // Time penalty: 1 pt per 100ms, max deduction 500 pts
    const timePenalty = isCorrect ? Math.min(500, Math.floor((timeMs || 0) / 100)) : 0;
    const points = isCorrect ? Math.max(500, 1000 - timePenalty) : 0;

    // Upsert — prevents duplicate answers
    const answer = await prisma.livePollAnswer.upsert({
      where: { pollId_username: { pollId, username: req.user.username } },
      update: { chosenIdx, timeMs: timeMs || 0, isCorrect, points },
      create: { pollId, username: req.user.username, chosenIdx, timeMs: timeMs || 0, isCorrect, points },
    });

    return res.status(200).json({ success: true, answer });
  } catch (error) {
    console.error('Error saving poll answer:', error);
    return res.status(500).json({ success: false, message: 'Failed to save answer.' });
  }
};

/**
 * @desc    Get the cumulative leaderboard for a session (from all poll answers in DB)
 * @route   GET /api/livekit/session/:id/leaderboard
 * @access  Protected
 */
const getSessionLeaderboard = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) {
      return res.status(400).json({ success: false, message: 'Invalid session ID.' });
    }

    // Fetch all polls for the session
    const polls = await prisma.livePoll.findMany({
      where: { sessionId },
      include: { answers: true },
      orderBy: { launchedAt: 'asc' },
    });

    if (polls.length === 0) {
      return res.status(200).json({ success: true, leaderboard: [], totalPolls: 0 });
    }

    // Aggregate per-user stats across all polls
    const userStats = {};
    for (const poll of polls) {
      for (const answer of poll.answers) {
        if (!userStats[answer.username]) {
          userStats[answer.username] = { username: answer.username, totalPoints: 0, correctCount: 0, totalAnswered: 0, totalTimeMs: 0 };
        }
        userStats[answer.username].totalPoints += answer.points;
        userStats[answer.username].totalAnswered += 1;
        userStats[answer.username].totalTimeMs += answer.timeMs;
        if (answer.isCorrect) userStats[answer.username].correctCount += 1;
      }
    }

    // Sort: highest points first, then fastest total time as tiebreaker
    const leaderboard = Object.values(userStats).sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return a.totalTimeMs - b.totalTimeMs;
    }).map((entry, idx) => ({ ...entry, rank: idx + 1 }));

    const lastPoll = polls[polls.length - 1];

    return res.status(200).json({ success: true, leaderboard, totalPolls: polls.length, lastPollId: lastPoll ? lastPoll.id : null });
  } catch (error) {
    console.error('Error fetching session leaderboard:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch leaderboard.' });
  }
};

/**
 * @desc    Get per-question results for a specific poll (for the post-poll result overlay)
 * @route   GET /api/livekit/poll/:pollId/results
 * @access  Protected
 */
const getPollResults = async (req, res) => {
  try {
    const pollId = parseInt(req.params.pollId, 10);
    if (isNaN(pollId)) {
      return res.status(400).json({ success: false, message: 'Invalid poll ID.' });
    }

    const poll = await prisma.livePoll.findUnique({
      where: { id: pollId },
      include: { answers: { orderBy: { timeMs: 'asc' } } },
    });

    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found.' });
    }

    // Compute vote counts per option
    const voteCounts = new Array(poll.options.length).fill(0);
    for (const answer of poll.answers) {
      if (answer.chosenIdx >= 0 && answer.chosenIdx < poll.options.length) {
        voteCounts[answer.chosenIdx]++;
      }
    }
    const totalVotes = poll.answers.length;

    // Per-student ranking for this question
    const studentResults = poll.answers
      .map((a, idx) => ({
        username: a.username,
        chosenIdx: a.chosenIdx,
        isCorrect: a.isCorrect,
        timeMs: a.timeMs,
        points: a.points,
        rank: idx + 1, // already ordered by timeMs asc above
      }));

    return res.status(200).json({
      success: true,
      poll: {
        id: poll.id,
        question: poll.question,
        options: poll.options,
        correctIdx: poll.correctIdx,
        timerSecs: poll.timerSecs,
      },
      voteCounts,
      totalVotes,
      studentResults,
    });
  } catch (error) {
    console.error('Error fetching poll results:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch poll results.' });
  }
};


let hostLastSeenMap = {};

const startLiveSessionMonitor = () => {
  console.log('[MONITOR] Starting Active Live Session Monitor (15s interval)...');
  setInterval(async () => {
    try {
      const activeSession = await prisma.liveSession.findFirst({
        where: { isLive: true },
        include: {
          host: { select: { username: true } }
        }
      });
      
      if (!activeSession) {
        hostLastSeenMap = {};
        return;
      }

      if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        return;
      }

      const httpUrl = getHttpLivekitUrl(LIVEKIT_URL);
      const svc = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
      
      let participants = [];
      try {
        participants = await svc.listParticipants(activeSession.roomName);
      } catch (lkErr) {
        participants = [];
      }

      const hostUsername = activeSession.host.username;
      const isHostPresent = participants.some(p => p.identity === hostUsername);

      if (isHostPresent) {
        if (hostLastSeenMap[activeSession.id]) {
          console.log(`[MONITOR] Host "${hostUsername}" returned to room "${activeSession.roomName}". Clearing countdown.`);
          delete hostLastSeenMap[activeSession.id];
        }
      } else {
        if (!hostLastSeenMap[activeSession.id]) {
          hostLastSeenMap[activeSession.id] = Date.now();
          console.log(`[MONITOR] Host "${hostUsername}" is absent from room "${activeSession.roomName}". Starting 15-minute auto-end countdown.`);
        } else {
          const absentDuration = Date.now() - hostLastSeenMap[activeSession.id];
          const fifteenMinutes = 15 * 60 * 1000;
          if (absentDuration >= fifteenMinutes) {
            console.log(`[MONITOR] Host "${hostUsername}" absent for 15+ minutes. Automatically ending session ID: ${activeSession.id}`);
            
            await prisma.liveSession.update({
              where: { id: activeSession.id },
              data: {
                isLive: false,
                endedAt: new Date()
              }
            });

            try {
              await prisma.liveChatMessage.deleteMany({ where: { sessionId: activeSession.id } });
              // Delete poll data
              const sessionPolls = await prisma.livePoll.findMany({ where: { sessionId: activeSession.id }, select: { id: true } });
              const pollIds = sessionPolls.map(p => p.id);
              if (pollIds.length > 0) {
                await prisma.livePollAnswer.deleteMany({ where: { pollId: { in: pollIds } } });
                await prisma.livePoll.deleteMany({ where: { sessionId: activeSession.id } });
              }
            } catch (dbErr) {
              console.error('[MONITOR] Failed to clean up session chats/polls during auto-end:', dbErr);
            }

            try {
              await svc.deleteRoom(activeSession.roomName);
            } catch (lkErr) {
              console.error('[MONITOR] Failed to delete LiveKit room during auto-end:', lkErr);
            }

            delete hostLastSeenMap[activeSession.id];
          }
        }
      }
    } catch (err) {
      console.error('[MONITOR] Error in active session monitor:', err);
    }
  }, 15000);
};

startLiveSessionMonitor();

module.exports = {
  createSession,
  generateToken,
  getActiveSession,
  getAllSessions,
  endSession,
  deleteSession,
  getSessionChat,
  postChatMessage,
  createPoll,
  savePollAnswer,
  getSessionLeaderboard,
  getPollResults,
};
