const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const http = require('http');
const { io } = require('socket.io-client');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper to make HTTP POST requests
const postRequest = (url, headers, body) => {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
};

async function test() {
  console.log('Starting HTTP + WebSocket end-to-end integration test...');
  
  // 1. Resolve the same USER-role user that the bypass auth middleware resolves
  let studentUser = await prisma.user.findFirst({
    where: { role: 'USER' }
  });
  
  if (!studentUser) {
    studentUser = await prisma.user.create({
      data: {
        username: 'student',
        email: 'student@synapse.com',
        password: 'devbypasshashedpassword',
        role: 'USER'
      }
    });
  }
  console.log(`Using student user: ${studentUser.username} (ID: ${studentUser.id})`);
  
  // 2. Create unique test contest
  const randomSuffix = Math.floor(Math.random() * 1000000);
  const contest = await prisma.contest.create({
    data: {
      title: `Socket Test Contest ${randomSuffix}`,
      description: 'Socket test description',
      startTime: new Date(Date.now() - 60000), // active now
      endTime: new Date(Date.now() + 3600000),
    }
  });
  console.log(`Created contest: "${contest.title}" (ID: ${contest.id})`);
  
  // Register a practice problem as a contest problem with points
  const problem = await prisma.problem.findFirst({
    include: { testCases: true }
  });
  
  if (!problem) {
    throw new Error('No problems found in database. Run seed first.');
  }
  
  await prisma.contestProblem.create({
    data: {
      contestId: contest.id,
      problemId: problem.id,
      points: 120
    }
  });
  console.log(`Linked problem "${problem.title}" (ID: ${problem.id}) to contest`);
  
  // Register student participation in the contest
  await prisma.contestParticipation.create({
    data: {
      userId: studentUser.id,
      contestId: contest.id,
      completed: false,
      username: studentUser.username,
      contestTitle: contest.title
    }
  });
  console.log('Registered participation in DB');

  const port = process.env.PORT || '5001';
  console.log(`Setting up Socket.io client to connect to port ${port}...`);
  const socket = io(`http://127.0.0.1:${port}`, {
    transports: ['websocket', 'polling']
  });

  return new Promise((resolve, reject) => {
    socket.on('connect', () => {
      console.log('✅ Socket client connected to server!');
      
      // Join the contest room
      socket.emit('joinContest', contest.id);
      console.log(`Joined contest room: contest_${contest.id}`);
      
      // Setup the event listener
      socket.on('contestLeaderboardUpdate', async (data) => {
        console.log('📬 Received contestLeaderboardUpdate event via WebSockets!');
        console.log('Contest title:', data.contest.title);
        console.log('Leaderboard rankings:', data.leaderboard);
        
        if (data.contest.id === contest.id) {
          console.log('✅ SUCCESS! Leaderboard updates pushed successfully via Socket.io!');
          
          // Cleanup
          console.log('Cleaning up...');
          await prisma.contestParticipation.deleteMany({ where: { contestId: contest.id } });
          await prisma.contestProblem.deleteMany({ where: { contestId: contest.id } });
          await prisma.contest.delete({ where: { id: contest.id } });
          console.log('Cleanup completed successfully.');
          
          socket.disconnect();
          resolve();
        }
      });
      
      // Setup live submission listener
      socket.on('newLiveSubmission', (data) => {
        console.log('📬 Received newLiveSubmission event via WebSockets for submission ID:', data.id);
      });
      
      // Trigger a submission via HTTP POST request
      console.log('Triggering code submission via HTTP POST request...');
      const submitBody = JSON.stringify({
        language: 'JAVASCRIPT',
        code: `// Solve: ${problem.slug}\nfunction solution() {\n  return true;\n}`
      });
      
      const bypassHeaders = {
        'x-bypass-auth': 'true',
        'x-bypass-role': 'USER'
      };

      postRequest(
        `http://127.0.0.1:${port}/api/submissions/problem/${problem.id}`,
        bypassHeaders,
        submitBody
      )
      .then((res) => {
        console.log('Submission POST response received:', res.success ? 'Success' : 'Failed');
      })
      .catch((err) => {
        reject(new Error(`Failed to post submission: ${err.message}`));
      });
    });

    socket.on('connect_error', (error) => {
      reject(new Error(`Socket connection failed: ${error.message}`));
    });

    setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timeout waiting for WebSocket events'));
    }, 15000);
  });
}

test()
  .then(() => {
    console.log('🎉 WebSocket integration test PASSED!');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Test FAILED:', err);
    // Cleanup on failure
    try {
      await prisma.contestParticipation.deleteMany({ where: { contest: { title: { startsWith: 'Socket Test Contest' } } } });
      await prisma.contestProblem.deleteMany({ where: { contest: { title: { startsWith: 'Socket Test Contest' } } } });
      await prisma.contest.deleteMany({ where: { title: { startsWith: 'Socket Test Contest' } } });
    } catch (cleanupErr) {
      console.error('Failed to cleanup after failure:', cleanupErr);
    }
    process.exit(1);
  });
