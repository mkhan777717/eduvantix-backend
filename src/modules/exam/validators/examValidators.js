'use strict';

const { z } = require('zod');

// ── Exam Settings Schema ─────────────────────────────────────────────────────
const settingsSchema = z.object({
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  negativeMarking: z.boolean().default(false),
  autoSubmit: z.boolean().default(true),
  password: z.string().max(30).nullable().optional(),
  fullscreenEnforcement: z.boolean().default(false),
  allowNavigation: z.boolean().default(true),
  allowReview: z.boolean().default(true),
  randomQuestionOrder: z.boolean().default(false),
  multipleAttempts: z.boolean().default(false),
  maxAttempts: z.number().int().min(1).default(1),
  calculatorAllowed: z.boolean().default(false),
  copyPasteRestriction: z.boolean().default(false),
  webcamRequirement: z.boolean().default(false)
});

// ── Create Exam Schema ───────────────────────────────────────────────────────
const createExamSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(150),
  description: z.string().optional().nullable(),
  startDate: z.string().datetime('Start date must be a valid ISO timestamp'),
  endDate: z.string().datetime('End date must be a valid ISO timestamp'),
  timezone: z.string().default('UTC'),
  resultReleasePolicy: z.enum([
    'IMMEDIATE',
    'MANUAL',
    'SCHEDULED',
    'AFTER_ALL_FINISHED',
    'AFTER_DEADLINE'
  ]).default('IMMEDIATE'),
  publishResultDate: z.string().datetime().optional().nullable(),
  settings: settingsSchema.optional(),
  instructions: z.array(z.string()).optional().default([])
});

// ── Update Exam Schema (Draft phase) ──────────────────────────────────────────
const updateExamSchema = z.object({
  version: z.number().int('Draft version integer is required for optimistic locking'),
  title: z.string().min(3).max(150).optional(),
  description: z.string().optional().nullable(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  timezone: z.string().optional(),
  resultReleasePolicy: z.enum([
    'IMMEDIATE',
    'MANUAL',
    'SCHEDULED',
    'AFTER_ALL_FINISHED',
    'AFTER_DEADLINE'
  ]).optional(),
  publishResultDate: z.string().datetime().optional().nullable(),
  settings: settingsSchema.partial().optional(),
  instructions: z.array(z.string()).optional()
});

// ── Start Attempt Schema ─────────────────────────────────────────────────────
const startAttemptSchema = z.object({
  password: z.string().optional().nullable()
});

// ── Save Answer Schema ────────────────────────────────────────────────────────
const saveAnswerSchema = z.object({
  questionId: z.number().int(),
  visited: z.boolean().optional(),
  flagged: z.boolean().optional(),
  mcqOptionIds: z.array(z.union([z.number().int(), z.string()])).optional().nullable(),
  descriptiveAnswer: z.string().optional().nullable(),
  codingCode: z.string().optional().nullable(),
  codingLanguage: z.string().optional().nullable()
});

// ── Run Code Schema ──────────────────────────────────────────────────────────
const runCodeSchema = z.object({
  questionId: z.number().int(),
  code: z.string().min(1, 'Source code cannot be empty'),
  language: z.enum(['JAVASCRIPT', 'PYTHON', 'CPP', 'JAVA', 'GO'])
});

// ── Manual Grade Schema ──────────────────────────────────────────────────────
const manualGradeSchema = z.object({
  score: z.number().min(0, 'Score cannot be negative'),
  comments: z.string().max(500).optional().nullable()
});

module.exports = {
  createExamSchema,
  updateExamSchema,
  startAttemptSchema,
  saveAnswerSchema,
  runCodeSchema,
  manualGradeSchema
};
