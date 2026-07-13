const prisma = require('../prisma');

// Get all resumes for the current user
const getResumes = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const resumes = await prisma.resume.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    });

    res.status(200).json({
      success: true,
      resumes
    });
  } catch (error) {
    next(error);
  }
};

// Get a specific resume by ID
const getResumeById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const resumeId = parseInt(req.params.id);

    const resume = await prisma.resume.findFirst({
      where: {
        id: resumeId,
        userId
      }
    });

    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    res.status(200).json({
      success: true,
      resume
    });
  } catch (error) {
    next(error);
  }
};

// Create a new resume
const createResume = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { title, personalInfo, summary, experience, education, skills, projects, certifications } = req.body;

    const newResume = await prisma.resume.create({
      data: {
        userId,
        title: title || 'Untitled Resume',
        personalInfo: personalInfo || {},
        summary: summary || '',
        experience: experience || [],
        education: education || [],
        skills: skills || [],
        projects: projects || [],
        certifications: certifications || []
      }
    });

    res.status(201).json({
      success: true,
      message: 'Resume created successfully',
      resume: newResume
    });
  } catch (error) {
    next(error);
  }
};

// Update an existing resume
const updateResume = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const resumeId = parseInt(req.params.id);
    const updateData = req.body;

    // Check if resume exists and belongs to user
    const existingResume = await prisma.resume.findFirst({
      where: {
        id: resumeId,
        userId
      }
    });

    if (!existingResume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    const updatedResume = await prisma.resume.update({
      where: { id: resumeId },
      data: {
        title: updateData.title !== undefined ? updateData.title : existingResume.title,
        personalInfo: updateData.personalInfo !== undefined ? updateData.personalInfo : existingResume.personalInfo,
        summary: updateData.summary !== undefined ? updateData.summary : existingResume.summary,
        experience: updateData.experience !== undefined ? updateData.experience : existingResume.experience,
        education: updateData.education !== undefined ? updateData.education : existingResume.education,
        skills: updateData.skills !== undefined ? updateData.skills : existingResume.skills,
        projects: updateData.projects !== undefined ? updateData.projects : existingResume.projects,
        certifications: updateData.certifications !== undefined ? updateData.certifications : existingResume.certifications,
        isATSReady: updateData.isATSReady !== undefined ? updateData.isATSReady : existingResume.isATSReady
      }
    });

    res.status(200).json({
      success: true,
      message: 'Resume updated successfully',
      resume: updatedResume
    });
  } catch (error) {
    next(error);
  }
};

// Delete a resume
const deleteResume = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const resumeId = parseInt(req.params.id);

    const existingResume = await prisma.resume.findFirst({
      where: {
        id: resumeId,
        userId
      }
    });

    if (!existingResume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    await prisma.resume.delete({
      where: { id: resumeId }
    });

    res.status(200).json({
      success: true,
      message: 'Resume deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getResumes,
  getResumeById,
  createResume,
  updateResume,
  deleteResume
};
