const path = require("path");
const fs = require("fs");

// Load serialized courses registry from JSON
let coursesRegistry = {};
try {
  const jsonPath = path.join(__dirname, "../data/coursesRegistry.json");
  if (fs.existsSync(jsonPath)) {
    coursesRegistry = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  } else {
    console.warn(`[COURSES] Registry file not found at ${jsonPath}. Using empty fallback.`);
  }
} catch (err) {
  console.error("[COURSES] Failed to parse coursesRegistry.json:", err);
}

/**
 * Get all courses metadata (public)
 * Strips heavy payload fields (allPhases, resourcesList, glossary) for catalog search optimization
 */
const getAllCourses = async (req, res, next) => {
  try {
    const list = Object.entries(coursesRegistry).map(([id, info]) => {
      // Create a shallow copy of metadata, excluding heavy fields
      const { allPhases, resourcesList, glossary, ...metadata } = info;
      return {
        id,
        ...metadata,
      };
    });

    res.status(200).json({
      success: true,
      count: list.length,
      courses: list,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single course's full details (public)
 */
const getCourseById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const course = coursesRegistry[id];

    if (!course) {
      return res.status(404).json({
        success: false,
        message: `Course with ID '${id}' not found.`,
      });
    }

    res.status(200).json({
      success: true,
      course: {
        id,
        ...course,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllCourses,
  getCourseById,
};
