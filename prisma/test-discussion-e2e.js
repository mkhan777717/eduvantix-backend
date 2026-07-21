const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');
const prisma = require('../src/prisma');

const API_BASE = 'http://localhost:5472';

async function runE2ETests() {
  console.log('=== STARTING DISCUSSION MODULE E2E INTEGRATION TEST ===\n');

  // 1. Get or create a test user
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        username: 'test_forum_user',
        email: 'forum_test@eduvantix.com',
        password: 'hashedpassword123',
        role: 'ADMIN',
      },
    });
  }

  // Generate valid JWT token
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET || 'nfkbregbkjedbfverivjerlsgvuergvirklkuchgvirjgvekeyrghiotrt',
    { expiresIn: '1h' }
  );

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  let testSlug = null;
  let testCommentSlug = null;

  // TEST 1: Create Discussion
  try {
    const res = await fetch(`${API_BASE}/api/discuss`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'E2E Test Discussion Thread',
        body: 'This is a test discussion thread body content written for automated verification.',
        category: 'GENERAL',
        tags: ['e2e-test', 'verification'],
      }),
    });
    const data = await res.json();
    console.log('1. Create Discussion:', res.ok && data.success ? '✓ SUCCESS' : '✗ FAILED', data.message || '');
    if (data.discussion) testSlug = data.discussion.slug;
  } catch (e) {
    console.error('1. Create Discussion Exception:', e.message);
  }

  if (!testSlug) {
    console.error('Cannot proceed without a test discussion slug.');
    return;
  }

  // TEST 2: List Discussions Feed
  try {
    const res = await fetch(`${API_BASE}/api/discuss`, { headers: authHeaders });
    const data = await res.json();
    console.log('2. List Discussions Feed:', res.ok && data.success ? `✓ SUCCESS (${data.data.length} discussions)` : '✗ FAILED');
  } catch (e) {
    console.error('2. List Discussions Exception:', e.message);
  }

  // TEST 3: Get Discussion Details
  try {
    const res = await fetch(`${API_BASE}/api/discuss/${testSlug}`, { headers: authHeaders });
    const data = await res.json();
    console.log('3. Get Discussion Details:', res.ok && data.success ? `✓ SUCCESS (${data.discussion.title})` : '✗ FAILED');
  } catch (e) {
    console.error('3. Get Details Exception:', e.message);
  }

  // TEST 4: Create Comment
  try {
    const res = await fetch(`${API_BASE}/api/discuss/${testSlug}/comments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        body: 'This is an automated test comment.',
      }),
    });
    const data = await res.json();
    console.log('4. Create Comment:', res.ok && data.success ? '✓ SUCCESS' : '✗ FAILED', data.message || '');
    if (data.comment) testCommentSlug = data.comment.slug;
  } catch (e) {
    console.error('4. Create Comment Exception:', e.message);
  }

  // TEST 5: Vote on Discussion
  try {
    const res = await fetch(`${API_BASE}/api/discuss/${testSlug}/vote`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ value: 1 }),
    });
    const data = await res.json();
    console.log('5. Vote on Discussion:', res.ok && data.success ? `✓ SUCCESS (New score: ${data.score})` : '✗ FAILED');
  } catch (e) {
    console.error('5. Vote Exception:', e.message);
  }

  // TEST 6: Bookmark Discussion
  try {
    const res = await fetch(`${API_BASE}/api/discuss/${testSlug}/bookmark`, {
      method: 'POST',
      headers: authHeaders,
    });
    const data = await res.json();
    console.log('6. Bookmark Discussion:', res.ok && data.success ? `✓ SUCCESS (${data.message})` : '✗ FAILED');
  } catch (e) {
    console.error('6. Bookmark Exception:', e.message);
  }

  // TEST 7: Mark Accepted Answer
  if (testCommentSlug) {
    try {
      const res = await fetch(`${API_BASE}/api/discuss/${testSlug}/comments/${testCommentSlug}/accept`, {
        method: 'PATCH',
        headers: authHeaders,
      });
      const data = await res.json();
      console.log('7. Mark Accepted Answer:', res.ok && data.success ? `✓ SUCCESS (${data.message})` : '✗ FAILED');
    } catch (e) {
      console.error('7. Mark Accepted Exception:', e.message);
    }
  }

  // TEST 8: List Popular Tags
  try {
    const res = await fetch(`${API_BASE}/api/discuss/tags/popular`);
    const data = await res.json();
    console.log('8. List Popular Tags:', res.ok && data.success ? `✓ SUCCESS (${data.tags.length} tags)` : '✗ FAILED');
  } catch (e) {
    console.error('8. List Tags Exception:', e.message);
  }

  // TEST 9: Clean Up (Delete Test Discussion)
  try {
    const res = await fetch(`${API_BASE}/api/discuss/${testSlug}`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ deleteReason: 'E2E Cleanup' }),
    });
    const data = await res.json();
    console.log('9. Delete Discussion (Soft Delete):', res.ok && data.success ? '✓ SUCCESS' : '✗ FAILED');
  } catch (e) {
    console.error('9. Delete Exception:', e.message);
  }

  console.log('\n=== E2E INTEGRATION TEST COMPLETED ===');
  await prisma.$disconnect();
}

runE2ETests();
