const { z } = require('zod');

// Authentication schemas
const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters long')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  role: z.enum(['USER', 'ADMIN', 'MENTOR']).optional().default('USER'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Problem schemas
const testCaseSchema = z.object({
  input: z.string().default(''),
  expectedOutput: z.string().min(1, 'Expected output is required'),
  isSample: z.boolean().default(false),
});

const problemSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters long'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  statement: z.string().min(10, 'Statement must be at least 10 characters long'),
  inputFormat: z.string().min(1, 'Input format is required'),
  outputFormat: z.string().min(1, 'Output format is required'),
  constraints: z.string().min(1, 'Constraints are required'),
  explanation: z.string().min(1, 'Explanation is required'),
  followup: z.string().min(1, 'Followup content is required'),
  editorial: z.string().min(1, 'Editorial content is required'),
  solution: z.string().min(1, 'Solution content is required'),
  evaluation: z.string().min(1, 'Evaluation criteria is required'),
  templateJS: z.string().optional().default(''),
  templatePython: z.string().optional().default(''),
  templateGo: z.string().optional().default(''),
  templateCPP: z.string().optional().default(''),
  templateJava: z.string().optional().default(''),
  // Compiler/Judge fields
  functionName: z.string().optional().default('solve'),
  category: z.enum(['FUNCTIONAL', 'CLASS_DESIGN']).optional().default('FUNCTIONAL'),
  returnType: z.string().optional().default('INT'),
  judgeStrategy: z.enum(['exact', 'tokens', 'float', 'tree', 'graph', 'order_insensitive', 'set', 'special', 'interactive']).optional().default('tokens'),
  scoringModel: z.enum(['PARTIAL', 'ALL_OR_NOTHING']).optional().default('PARTIAL'),
  parameters: z.array(z.object({
    name: z.string(),
    type: z.string()
  })).optional().default([]),
  methods: z.array(z.any()).optional().default([]),
  timeout: z.number().int().min(1000).optional().default(2000),
  memoryLimit: z.number().int().min(16).optional().default(256),
  comparator: z.string().optional().default('tokens'),
  testCases: z.array(testCaseSchema).min(1, 'At least one testcase is required'),
});

const problemUpdateSchema = problemSchema.partial().extend({
  testCases: z.array(testCaseSchema).optional(),
});

// Contest schemas
const contestSchema = z.object({
  title: z.string().min(3, 'Contest title must be at least 3 characters long'),
  description: z.string().optional(),
  category: z.string().optional(),
  startTime: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: 'Invalid start time date string',
  }),
  endTime: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: 'Invalid end time date string',
  }),
  batchIds: z.array(z.number()).optional(),
}).refine(data => new Date(data.startTime) < new Date(data.endTime), {
  message: 'End time must be after start time',
  path: ['endTime'],
});

const contestProblemSchema = z.object({
  problemId: z.number().int('Problem ID must be an integer'),
  points: z.number().int().min(1, 'Points must be at least 1').optional().default(100),
});

// Submission schemas
const submissionSchema = z.object({
  language: z.preprocess(
    (val) => (typeof val === 'string' ? val.toUpperCase() : val),
    z.enum(['JAVASCRIPT', 'PYTHON', 'CPP', 'JAVA', 'GO',
            'TYPESCRIPT', 'C', 'CSHARP', 'KOTLIN', 'SWIFT',
            'RUST', 'RUBY', 'PHP', 'DART', 'SCALA',
            'ELIXIR', 'ERLANG', 'RACKET'])
  ),
  code: z.string().optional().default(''),
});

// Discussion schemas
const discussionCategoryEnum = z.enum([
  'GENERAL', 'PROBLEM', 'CONTEST', 'VIVA', 'COURSE', 'ASSIGNMENT', 'QUIZ', 'ANNOUNCEMENT',
  'INTERVIEW', 'CAREER', 'HELP', 'BUG_REPORT', 'FEATURE_REQUEST', 'OFF_TOPIC'
]);

const discussionSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters long').max(150, 'Title cannot exceed 150 characters'),
  body: z.string().min(3, 'Body must be at least 3 characters long'),
  category: z.preprocess(
    (val) => (typeof val === 'string' ? val.toUpperCase() : val),
    discussionCategoryEnum
  ).optional().default('GENERAL'),
  tags: z.array(z.string().min(1).max(30)).max(5, 'Maximum 5 tags allowed').optional().default([]),
  problemSlug: z.preprocess((val) => (val === '' ? undefined : val), z.string().optional().nullable()),
  contestSlug: z.preprocess((val) => (val === '' ? undefined : val), z.string().optional().nullable()),
  vivaId: z.preprocess((val) => {
    if (!val || val === 'undefined' || val === 'null') return undefined;
    const parsed = parseInt(val, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }, z.number().int().optional().nullable()),
});

const discussionUpdateSchema = discussionSchema.partial().extend({
  editedReason: z.string().max(250).optional(),
});

const commentSchema = z.object({
  body: z.string().min(1, 'Comment body cannot be empty').max(10000, 'Comment body too long'),
  parentCommentSlug: z.preprocess((val) => (val === '' ? undefined : val), z.string().optional().nullable()),
});

const commentUpdateSchema = z.object({
  body: z.string().min(1, 'Comment body cannot be empty').max(10000, 'Comment body too long'),
  editedReason: z.string().max(250).optional(),
});

const tagSchema = z.object({
  name: z.string().min(2, 'Tag name must be at least 2 characters').max(30, 'Tag name max 30 characters'),
  description: z.string().max(250).optional(),
});

const reportSchema = z.object({
  reason: z.enum(['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'OFF_TOPIC', 'OTHER']),
  body: z.string().max(1000).optional(),
});

const bookmarkFolderSchema = z.object({
  name: z.string().min(1, 'Folder name required').max(50, 'Folder name max 50 characters'),
});

module.exports = {
  registerSchema,
  loginSchema,
  problemSchema,
  problemUpdateSchema,
  contestSchema,
  contestProblemSchema,
  submissionSchema,
  discussionCategoryEnum,
  discussionSchema,
  discussionUpdateSchema,
  commentSchema,
  commentUpdateSchema,
  tagSchema,
  reportSchema,
  bookmarkFolderSchema,
};

