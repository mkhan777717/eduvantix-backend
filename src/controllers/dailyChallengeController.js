const prisma = require('../prisma');

// Get all daily challenges (Admin)
const getChallenges = async (req, res, next) => {
  try {
    const challenges = await prisma.dailyChallenge.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, challenges });
  } catch (error) {
    next(error);
  }
};

// Create a new daily challenge (Admin)
const createChallenge = async (req, res, next) => {
  try {
    const { title, question, date, points } = req.body;
    const newChallenge = await prisma.dailyChallenge.create({
      data: {
        title,
        question,
        date: date || null,
        points: points || 10
      }
    });
    res.status(201).json({ success: true, challenge: newChallenge });
  } catch (error) {
    next(error);
  }
};

// Update an existing challenge (Admin)
const updateChallenge = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, question, date, points } = req.body;
    const updatedChallenge = await prisma.dailyChallenge.update({
      where: { id: parseInt(id) },
      data: { title, question, date: date || null, points }
    });
    res.status(200).json({ success: true, challenge: updatedChallenge });
  } catch (error) {
    next(error);
  }
};

// Delete a challenge (Admin)
const deleteChallenge = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.dailyChallenge.delete({
      where: { id: parseInt(id) }
    });
    res.status(200).json({ success: true, message: 'Challenge deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Get today's challenge (Student)
const getTodayChallenge = async (req, res, next) => {
  try {
    const userId = req.user.id;
    // Today's date in YYYY-MM-DD local time
    const today = new Date();
    // adjust for local timezone offset if needed, or simply use ISO string portion
    const localDateStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000))
      .toISOString()
      .split('T')[0];

    const challenge = await prisma.dailyChallenge.findUnique({
      where: { date: localDateStr }
    });

    if (!challenge) {
      return res.status(200).json({ success: true, challenge: null });
    }

    // Check if the user has already attempted it
    const attempt = await prisma.dailyChallengeAttempt.findUnique({
      where: {
        userId_challengeId: {
          userId,
          challengeId: challenge.id
        }
      }
    });

    res.status(200).json({
      success: true,
      challenge,
      hasAttempted: !!attempt,
      attempt
    });
  } catch (error) {
    next(error);
  }
};

// Submit an answer for a challenge (Student)
const submitChallenge = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { challengeId, answer } = req.body;

    const challenge = await prisma.dailyChallenge.findUnique({
      where: { id: parseInt(challengeId) }
    });

    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    // Check for existing attempt
    const existingAttempt = await prisma.dailyChallengeAttempt.findUnique({
      where: {
        userId_challengeId: {
          userId,
          challengeId: challenge.id
        }
      }
    });

    if (existingAttempt) {
      return res.status(400).json({ success: false, message: 'You have already completed this challenge' });
    }

    // Record the attempt and award points
    const newAttempt = await prisma.dailyChallengeAttempt.create({
      data: {
        userId,
        challengeId: challenge.id,
        answer,
        pointsEarned: challenge.points
      }
    });

    // Update user streak and points
    const todayStr = new Date().toISOString().split('T')[0];
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    let newStreak = user.dailyStreak;
    if (user.lastStreakDate !== todayStr) {
      // Very simple streak logic: if it wasn't today, increment it
      // In a real app, you'd check if lastStreakDate was exactly yesterday
      newStreak += 1;
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        totalPoints: { increment: challenge.points },
        dailyStreak: newStreak,
        lastStreakDate: todayStr
      }
    });

    res.status(200).json({
      success: true,
      message: 'Challenge submitted successfully',
      attempt: newAttempt,
      pointsEarned: challenge.points
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getChallenges,
  createChallenge,
  updateChallenge,
  deleteChallenge,
  getTodayChallenge,
  submitChallenge
};
