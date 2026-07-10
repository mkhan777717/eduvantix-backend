const express = require("express");
const { getAllCourses, getCourseById } = require("../controllers/courseController");

const router = express.Router();

// Public routes for courses catalog and outlines
router.get("/", getAllCourses);
router.get("/:id", getCourseById);

module.exports = router;
