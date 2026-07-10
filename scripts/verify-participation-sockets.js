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
  console.log('Starting HTTP + WebSocket participation live reporting test...');
  
  // 1. Resolve/create the student user
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
      title: `Participation Test Contest ${randomSuffix}`,
      description: 'Participation test description',
      startTime: new Date(Date.now() - 60000), // active now
      endTime: new Date(Date.now() + 3600000),
    }
  });
  console.log(`Created contest: "${contest.title}" (ID: ${contest.id})`);

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
      
      // Setup the event listener for live participants update
      socket.on('contestParticipantsUpdate', async (data) => {
        console.log('📬 Received contestParticipantsUpdate event via WebSockets!');
        console.log('Contest ID:', data.contestId);
        console.log('Participants list:', data.participants);
        
        if (data.contestId === contest.id) {
          const isParticipantListed = data.participants.some(p => p.userId === studentUser.id);
          if (isParticipantListed) {
            console.log('✅ SUCCESS! Live participant update pushed successfully via Socket.io!');
            
            // Cleanup
            console.log('Cleaning up...');
            await prisma.contestParticipation.deleteMany({ where: { contestId: contest.id } });
            await prisma.contest.delete({ where: { id: contest.id } });
            console.log('Cleanup completed successfully.');
            
            socket.disconnect();
            resolve();
          } else {
            reject(new Error('Participant not in the received list'));
          }
        }
      });
      
      // Trigger participation registration via HTTP POST request
      console.log('Registering student participation via HTTP POST request...');
      const bypassHeaders = {
        'x-bypass-auth': 'true',
        'x-bypass-role': 'USER'
      };

      postRequest(
        `http://127.0.0.1:${port}/api/contests/${contest.id}/participate`,
        bypassHeaders,
        '{}'
      )
      .then((res) => {
        console.log('Participation POST response received:', res.success ? 'Success' : 'Failed');
      })
      .catch((err) => {
        reject(new Error(`Failed to register participation: ${err.message}`));
      });
    });

    socket.on('connect_error', (error) => {
      reject(new Error(`Socket connection failed: ${error.message}`));
    });

    setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timeout waiting for contestParticipantsUpdate event'));
    }, 15000);
  });
}

test()
  .then(() => {
    console.log('🎉 Live participation integration test PASSED!');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Test FAILED:', err);
    // Cleanup on failure
    try {
      await prisma.contestParticipation.deleteMany({ where: { contest: { title: { startsWith: 'Participation Test Contest' } } } });
      await prisma.contest.deleteMany({ where: { title: { startsWith: 'Participation Test Contest' } } });
    } catch (cleanupErr) {
      console.error('Failed to cleanup after failure:', cleanupErr);
    }
    process.exit(1);
  });
