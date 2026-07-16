const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

// Helper to seed on startup
const seedDefaultQuestionsIfNeeded = async () => {
  try {
    let jsonPath = '';
    const possiblePaths = [
      path.join(__dirname, '../../../dmx-academy-frontend/src/data/learning-arcade-content.json'),
      path.join(__dirname, '../../../../dmx-academy-frontend/src/data/learning-arcade-content.json'),
      path.join(__dirname, '../../../../frontend/src/data/learning-arcade-content.json'),
      path.join(__dirname, '../../../frontend/src/data/learning-arcade-content.json'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        jsonPath = p;
        break;
      }
    }

    if (!jsonPath) {
      console.warn("Could not find learning-arcade-content.json. Seeding skipped.");
      return;
    }

    const content = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    // 1. Seed quizzes
    if (Array.isArray(content.quiz)) {
      const quizCount = await prisma.arcadeQuestion.count({ where: { type: "quiz" } });
      if (quizCount === 0) {
        console.log("Seeding default quiz arcade questions...");
        for (const q of content.quiz) {
          await prisma.arcadeQuestion.create({
            data: {
              type: "quiz",
              track: q.track,
              question: q.question,
              code: q.code || "",
              optionA: q.option_a || "",
              optionB: q.option_b || "",
              optionC: q.option_c || "",
              optionD: q.option_d || "",
              correctOption: q.correct_option,
              explanation: q.explanation || "",
              timeLimit: q.time_limit || 20,
              instituteId: null
            }
          });
        }
      }
    }

    // 2. Seed match pairs
    if (Array.isArray(content.match)) {
      const matchCount = await prisma.arcadeQuestion.count({ where: { type: "match" } });
      if (matchCount === 0) {
        console.log("Seeding default match arcade questions...");
        for (const m of content.match) {
          await prisma.arcadeQuestion.create({
            data: {
              type: "match",
              track: m.track,
              term: m.term,
              definition: m.definition,
              instituteId: null
            }
          });
        }
      }
    }

    // 3. Seed debug questions
    if (Array.isArray(content.debug)) {
      const debugCount = await prisma.arcadeQuestion.count({ where: { type: "debug" } });
      if (debugCount === 0) {
        console.log("Seeding default debug arcade questions...");
        for (const d of content.debug) {
          await prisma.arcadeQuestion.create({
            data: {
              type: "debug",
              track: d.track,
              title: d.title || "Debug Challenge",
              code: d.code || "",
              defaultCode: d.code || "",
              explanation: d.explanation || "",
              buggyLines: [
                {
                  line_number: String(d.buggy_line_number),
                  line_content: d.buggy_line_content
                }
              ],
              instituteId: null
            }
          });
        }
      }
    }

    // 4. Seed fillin questions
    if (Array.isArray(content.fillin)) {
      const fillinCount = await prisma.arcadeQuestion.count({ where: { type: "fillin" } });
      if (fillinCount === 0) {
        console.log("Seeding default fillin arcade questions...");
        for (const f of content.fillin) {
          await prisma.arcadeQuestion.create({
            data: {
              type: "fillin",
              track: f.lang || f.track || "",
              title: f.title || "Fill in the Blanks",
              code: f.code || "",
              hint: f.hint || "",
              blanks: f.blanks || null,
              instituteId: null
            }
          });
        }
      }
    }
  } catch (err) {
    console.error("Error seeding default arcade questions:", err);
  }
};

const getQuestions = async (req, res) => {
  try {
    const { type } = req.query || req.params;
    const filterType = type || req.query.type;

    let whereClause = {};
    if (filterType) {
      whereClause.type = filterType;
    }

    if (req.user) {
      const role = req.user.role;
      const userId = req.user.id ? Number(req.user.id) : null;
      const instituteId = req.user.instituteId ? Number(req.user.instituteId) : null;

      if (role === 'ADMIN') {
        // Super admin sees: built-in global questions (no creator, no institute)
        // + global questions they personally created
        whereClause.AND = [
          { instituteId: null },
          {
            OR: [
              { createdById: null },      // built-in seeded questions
              { createdById: userId }      // their own created global questions
            ]
          }
        ];
      } else if (role === 'INSTITUTE_ADMIN') {
        // Institute admin sees only their institute's custom questions
        whereClause.instituteId = instituteId;
      } else {
        // Students / mentors / others: see their institute's questions + all global questions
        whereClause.OR = [
          { instituteId: instituteId },
          { instituteId: null }
        ];
      }
    }

    const questions = await prisma.arcadeQuestion.findMany({
      where: whereClause,
      orderBy: { id: 'asc' }
    });

    res.status(200).json({ success: true, data: questions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createQuestion = async (req, res) => {
  try {
    const data = req.body;
    const user = req.user;

    // Role/permission validation
    if (!user || !["ADMIN", "INSTITUTE_ADMIN"].includes(user.role)) {
      return res.status(403).json({ success: false, message: "Unauthorized role for question creation." });
    }

    // Determine institute ID scoping
    let targetInstituteId = null;
    if (user.role === 'INSTITUTE_ADMIN') {
      targetInstituteId = user.instituteId;
    } else if (user.role === 'ADMIN') {
      // Allow ADMIN to set instituteId or leave as global (null)
      targetInstituteId = data.instituteId !== undefined ? (data.instituteId ? Number(data.instituteId) : null) : null;
    }

    // Type check required
    if (!data.type) {
      return res.status(400).json({ success: false, message: "Question type is required." });
    }

    // Normalized create data based on type
    // Default all props:
    const baseData = {
      type: data.type,
      track: data.track || "",
      title: data.title || "",
      level: data.level !== undefined ? Number(data.level) : 1,
      question: data.question || "",
      code: data.code || "",
      optionA: data.optionA || "",
      optionB: data.optionB || "",
      optionC: data.optionC || "",
      optionD: data.optionD || "",
      correctOption: data.correctOption || "",
      explanation: data.explanation || "",
      timeLimit: data.timeLimit !== undefined ? Number(data.timeLimit) : 20,
      term: data.term || "",
      definition: data.definition || "",
      blank: data.blank || "____",
      hint: data.hint || "",
      file: data.file || "",
      instructions: data.instructions || "",
      defaultCode: data.defaultCode || "",
      validateCode: data.validateCode || "",
      buggyLines: data.buggyLines || null,
      blanks: data.blanks || null,
      instituteId: targetInstituteId,
      createdById: user.id ? Number(user.id) : null
    };

    // Adjust fields required by type
    switch (data.type) {
      case "quiz":
        if (!baseData.track || !baseData.question || !baseData.optionA || !baseData.optionB || !baseData.optionC || !baseData.optionD || !baseData.correctOption) {
          return res.status(400).json({ success: false, message: "Missing required quiz fields." });
        }
        break;
      case "match":
        if (!baseData.track || !baseData.term || !baseData.definition) {
          return res.status(400).json({ success: false, message: "Missing required match fields." });
        }
        break;
      case "fillin":
        if (!baseData.track && !baseData.lang) {
          return res.status(400).json({ success: false, message: "Missing language or track for fillin." });
        }
        if (!baseData.code || (!baseData.optionA && !baseData.blanks) ) {
          return res.status(400).json({ success: false, message: "Missing code options for fillin." });
        }
        break;
      case "debug":
        if (!baseData.track || !baseData.title || !baseData.defaultCode) {
          return res.status(400).json({ success: false, message: "Missing required debug fields." });
        }
        break;
    }

    const newQuestion = await prisma.arcadeQuestion.create({
      data: baseData
    });

    res.status(201).json({ success: true, data: newQuestion });

  } catch (error) {
    console.error("Error in createQuestion:", error); // logging for backend visibility
    res.status(500).json({ success: false, message: error.message || "Server error." });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const questionId = Number(id);
    const existing = await prisma.arcadeQuestion.findUnique({
      where: { id: questionId }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Question not found" });
    }

    const userRole = req.user.role;
    const userInstituteId = req.user.instituteId ? Number(req.user.instituteId) : null;
    const questionInstituteId = existing.instituteId ? Number(existing.instituteId) : null;

    if (userRole !== 'ADMIN') {
      if (userRole !== 'INSTITUTE_ADMIN') {
        return res.status(403).json({ success: false, message: "Only admins can update questions." });
      }
      if (questionInstituteId === null) {
        return res.status(403).json({ success: false, message: "You cannot edit global (built-in) questions. Create a new question instead." });
      }
      if (questionInstituteId !== userInstituteId) {
        return res.status(403).json({ success: false, message: "You can only edit questions belonging to your institute." });
      }
    }

    const updated = await prisma.arcadeQuestion.update({
      where: { id: questionId },
      data: {
        track: data.track !== undefined ? data.track : existing.track,
        title: data.title !== undefined ? data.title : existing.title,
        level: data.level !== undefined ? Number(data.level) : existing.level,
        question: data.question !== undefined ? data.question : existing.question,
        code: data.code !== undefined ? data.code : existing.code,
        optionA: data.optionA !== undefined ? data.optionA : existing.optionA,
        optionB: data.optionB !== undefined ? data.optionB : existing.optionB,
        optionC: data.optionC !== undefined ? data.optionC : existing.optionC,
        optionD: data.optionD !== undefined ? data.optionD : existing.optionD,
        correctOption: data.correctOption !== undefined ? data.correctOption : existing.correctOption,
        explanation: data.explanation !== undefined ? data.explanation : existing.explanation,
        timeLimit: data.timeLimit !== undefined ? Number(data.timeLimit) : existing.timeLimit,
        term: data.term !== undefined ? data.term : existing.term,
        definition: data.definition !== undefined ? data.definition : existing.definition,
        blank: data.blank !== undefined ? data.blank : existing.blank,
        hint: data.hint !== undefined ? data.hint : existing.hint,
        file: data.file !== undefined ? data.file : existing.file,
        instructions: data.instructions !== undefined ? data.instructions : existing.instructions,
        defaultCode: data.defaultCode !== undefined ? data.defaultCode : existing.defaultCode,
        validateCode: data.validateCode !== undefined ? data.validateCode : existing.validateCode,
        buggyLines: data.buggyLines !== undefined ? data.buggyLines : existing.buggyLines,
        blanks: data.blanks !== undefined ? data.blanks : existing.blanks
      }
    });

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const questionId = Number(id);

    const existing = await prisma.arcadeQuestion.findUnique({
      where: { id: questionId }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Question not found" });
    }

    const userRole = req.user.role;
    const userInstituteId = req.user.instituteId ? Number(req.user.instituteId) : null;
    const questionInstituteId = existing.instituteId ? Number(existing.instituteId) : null;

    if (userRole !== 'ADMIN') {
      if (userRole !== 'INSTITUTE_ADMIN') {
        return res.status(403).json({ success: false, message: "Only admins can delete questions." });
      }
      if (questionInstituteId === null) {
        return res.status(403).json({ success: false, message: "Built-in questions cannot be deleted. You can only delete questions you created for your institute." });
      }
      if (questionInstituteId !== userInstituteId) {
        return res.status(403).json({ success: false, message: "You can only delete questions belonging to your institute." });
      }
    }

    await prisma.arcadeQuestion.delete({
      where: { id: questionId }
    });

    res.status(200).json({ success: true, message: "Question deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  seedDefaultQuestionsIfNeeded
};
