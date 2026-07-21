const { Server } = require('socket.io');
const prisma = require('../prisma');

let io;

/**
 * Calculates the leaderboard statistics for a contest (copied from contestController logic)
 */
const calculateLeaderboardData = async (contestId) => {
  try {
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        contestProblems: {
          include: { problem: true },
        },
      },
    });

    if (!contest) return null;

    const problemIds = contest.contestProblems.map((cp) => cp.problemId);
    const problemPointsMap = {};
    contest.contestProblems.forEach((cp) => {
      problemPointsMap[cp.problemId] = cp.points;
    });

    const submissions = await prisma.submission.findMany({
      where: {
        problemId: { in: problemIds },
        createdAt: {
          gte: contest.startTime,
          lte: contest.endTime,
        },
      },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const leaderboardMap = {};

    submissions.forEach((sub) => {
      const uId = sub.userId;
      if (!leaderboardMap[uId]) {
        leaderboardMap[uId] = {
          user: {
            id: sub.user.id,
            username: sub.user.username,
          },
          solvedProblems: {},
          totalScore: 0,
          totalExecutionTime: 0,
          attempts: {},
        };
      }

      const userStats = leaderboardMap[uId];

      if (!userStats.solvedProblems[sub.problemId]) {
        userStats.attempts[sub.problemId] = (userStats.attempts[sub.problemId] || 0) + 1;

        if (sub.status === 'ACCEPTED') {
          const points = problemPointsMap[sub.problemId] || 100;
          userStats.solvedProblems[sub.problemId] = {
            points,
            executionTime: sub.executionTime || 0,
            submissionId: sub.id,
            createdAt: sub.createdAt,
          };
          userStats.totalScore += points;
          userStats.totalExecutionTime += sub.executionTime || 0;
        }
      }
    });

    const leaderboard = Object.values(leaderboardMap).map((player) => {
      return {
        user: player.user,
        totalScore: player.totalScore,
        totalExecutionTime: player.totalExecutionTime,
        solvedCount: Object.keys(player.solvedProblems).length,
        solvedProblems: player.solvedProblems,
        attempts: player.attempts,
      };
    });

    leaderboard.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      return a.totalExecutionTime - b.totalExecutionTime;
    });

    return {
      contest: {
        id: contest.id,
        title: contest.title,
        startTime: contest.startTime,
        endTime: contest.endTime,
      },
      leaderboard,
    };
  } catch (error) {
    console.error(`Error calculating leaderboard for contest ${contestId}:`, error);
    return null;
  }
};

/**
 * Initializes Socket.io attached to the HTTP server
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-bypass-auth', 'x-bypass-role', 'x-bypass-userid']
    }
  });

  io.on('connection', (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);

    // Join personal user room
    socket.on('joinUser', async (data) => {
      const { userId, sessionId } = typeof data === 'object' ? data : { userId: data, sessionId: null };
      const roomId = `user_${userId}`;
      socket.join(roomId);
      console.log(`[SOCKET] Client ${socket.id} joined personal room: ${roomId}`);

      if (userId && sessionId) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: parseInt(userId, 10) },
            select: { currentSessionId: true }
          });
          if (dbUser && dbUser.currentSessionId && dbUser.currentSessionId !== sessionId) {
            console.log(`[SOCKET] Immediate invalidation on reconnect for client ${socket.id} (user_${userId})`);
            socket.emit('newSessionLoggedIn', { newSessionId: dbUser.currentSessionId });
          }
        } catch (err) {
          console.error('[SOCKET] Error checking session during joinUser:', err.message);
        }
      }
    });

    // Leave personal user room
    socket.on('leaveUser', (userId) => {
      const roomId = `user_${userId}`;
      socket.leave(roomId);
      console.log(`[SOCKET] Client ${socket.id} left personal room: ${roomId}`);
    });

    // Join a contest room (e.g. contest_1)
    socket.on('joinContest', (contestId) => {
      const roomId = `contest_${contestId}`;
      socket.join(roomId);
      console.log(`[SOCKET] Client ${socket.id} joined room: ${roomId}`);
    });

    // Leave a contest room
    socket.on('leaveContest', (contestId) => {
      const roomId = `contest_${contestId}`;
      socket.leave(roomId);
      console.log(`[SOCKET] Client ${socket.id} left room: ${roomId}`);
    });

    // Join a discussion room (e.g. discuss_my-slug)
    socket.on('joinDiscussion', (discussionSlug) => {
      const roomId = `discuss_${discussionSlug}`;
      socket.join(roomId);
      console.log(`[SOCKET] Client ${socket.id} joined room: ${roomId}`);
    });

    // Leave a discussion room
    socket.on('leaveDiscussion', (discussionSlug) => {
      const roomId = `discuss_${discussionSlug}`;
      socket.leave(roomId);
      console.log(`[SOCKET] Client ${socket.id} left room: ${roomId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET] User disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Retrieves the Socket.io instance
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized!');
  }
  return io;
};

/**
 * Broadcasts a live submission update to all clients
 */
const broadcastLiveSubmission = (submission) => {
  try {
    const socketio = getIO();
    socketio.emit('newLiveSubmission', submission);
    console.log(`[SOCKET] Broadcasted live submission #${submission.id}`);
  } catch (error) {
    console.error('[SOCKET] Failed to broadcast live submission:', error.message);
  }
};

/**
 * Broadcasts a new participation report to all clients
 */
const broadcastParticipationReport = (participation) => {
  try {
    const socketio = getIO();
    socketio.emit('newParticipationReport', participation);
    console.log(`[SOCKET] Broadcasted participation report for user ${participation.userId}`);
  } catch (error) {
    console.error('[SOCKET] Failed to broadcast participation report:', error.message);
  }
};

/**
 * Calculates and broadcasts contest leaderboard updates to all sockets in the contest room
 */
const broadcastLeaderboardUpdate = async (contestId) => {
  try {
    const data = await calculateLeaderboardData(contestId);
    if (!data) return;

    const socketio = getIO();
    const roomId = `contest_${contestId}`;
    socketio.to(roomId).emit('contestLeaderboardUpdate', data);
    console.log(`[SOCKET] Broadcasted leaderboard update for room: ${roomId}`);

    // Also emit participant update for admin pages
    const participants = await prisma.contestParticipation.findMany({
      where: { contestId },
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true }
        }
      },
      orderBy: [
        { score: 'desc' },
        { createdAt: 'asc' }
      ]
    });
    socketio.to(roomId).emit('contestParticipantsUpdate', {
      contestId,
      participants
    });
    console.log(`[SOCKET] Broadcasted participants list update for room: ${roomId}`);
  } catch (error) {
    console.error(`[SOCKET] Failed to broadcast leaderboard update for contest ${contestId}:`, error.message);
  }
};

/**
 * Invalidates other active connections for the given user with a new sessionId
 */
const invalidateSession = (userId, newSessionId) => {
  try {
    const socketio = getIO();
    const roomId = `user_${userId}`;
    socketio.to(roomId).emit('newSessionLoggedIn', { newSessionId });
    console.log(`[SOCKET] Broadcasted session invalidation for user_${userId} to ${newSessionId}`);
  } catch (error) {
    console.error(`[SOCKET] Failed to invalidate session for user ${userId}:`, error.message);
  }
};

/**
 * Broadcasts a discussion notification to a specific user's socket room
 */
const broadcastDiscussionNotification = (userId, payload) => {
  try {
    const socketio = getIO();
    const roomId = `user_${userId}`;
    socketio.to(roomId).emit('discussionNotification', payload);
  } catch (error) {
    console.error(`[SOCKET] Failed to broadcast discussion notification for user ${userId}:`, error.message);
  }
};

/**
 * Broadcasts real-time discussion thread updates (e.g. new comment, vote count update)
 */
const broadcastDiscussionUpdate = (discussionSlug, payload) => {
  try {
    const socketio = getIO();
    const roomId = `discuss_${discussionSlug}`;
    socketio.to(roomId).emit('discussionUpdate', payload);
  } catch (error) {
    console.error(`[SOCKET] Failed to broadcast discussion update for ${discussionSlug}:`, error.message);
  }
};

module.exports = {
  initSocket,
  getIO,
  broadcastLiveSubmission,
  broadcastParticipationReport,
  broadcastLeaderboardUpdate,
  invalidateSession,
  broadcastDiscussionNotification,
  broadcastDiscussionUpdate,
};

