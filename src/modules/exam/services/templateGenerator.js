'use strict';

/**
 * templateGenerator.js
 * Generates sample CSV and multi-sheet Excel templates for question paper bulk import.
 */

const TEMPLATE_HEADERS = [
  'Section Name',
  'Section Description',
  'Section Order',
  'Question Type',
  'Difficulty',
  'Bloom Level',
  'Question Text',
  'Marks',
  'Negative Marks',
  'Option A',
  'Option B',
  'Option C',
  'Option D',
  'Correct Answer',
  'Explanation',
  'Programming Language',
  'Starter Code',
  'Function Name',
  'Constraints',
  'Input Format',
  'Output Format',
  'Sample Input',
  'Sample Output',
  'Rubric'
];

const SAMPLE_ROWS = [
  [
    'Section A: General Computer Science',
    'Multiple Choice Questions covering core CS concepts',
    '1',
    'MCQ',
    'EASY',
    'Understanding',
    'Which of the following data structures operates on a Last-In, First-Out (LIFO) basis?',
    '2.0',
    '0.5',
    'Queue',
    'Stack',
    'Array',
    'Linked List',
    'B',
    'A Stack operates on a LIFO mechanism where elements are pushed and popped from the top.',
    '', '', '', '', '', '', '', '', ''
  ],
  [
    'Section A: General Computer Science',
    'Multiple Choice Questions covering core CS concepts',
    '1',
    'MCQ',
    'MEDIUM',
    'Application',
    'What is the worst-case time complexity of QuickSort?',
    '2.0',
    '0.5',
    'O(N log N)',
    'O(N)',
    'O(N^2)',
    'O(1)',
    'C',
    'QuickSort degenerates to O(N^2) time complexity when pivot selection is poor on sorted data.',
    '', '', '', '', '', '', '', '', ''
  ],
  [
    'Section B: Algorithms & Coding',
    'Coding assessment problems',
    '2',
    'CODING',
    'MEDIUM',
    'Application',
    'Two Sum Problem: Return indices of two numbers that add up to target.',
    '10.0',
    '0.0',
    '', '', '', '', '',
    'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    'javascript',
    'function solve(nums, target) {\n  // Write solution here\n}',
    'solve',
    '2 <= nums.length <= 10^4',
    'Array of numbers and target integer',
    'Array of 2 indices [i, j]',
    '[2, 7, 11, 15], 9',
    '[0, 1]',
    ''
  ],
  [
    'Section C: Architectural Essay',
    'Descriptive essay questions',
    '3',
    'DESCRIPTIVE',
    'HARD',
    'Analysis',
    'Explain the differences between Monolithic and Microservices architecture with real-world trade-offs.',
    '15.0',
    '0.0',
    '', '', '', '', '',
    'Provide key points on scalability, deployment complexity, and fault isolation.',
    '', '', '', '', '', '', '', '',
    'Grade based on deployment considerations (5 pts), fault tolerance (5 pts), and data management (5 pts).'
  ]
];

function generateCSVTemplate() {
  const lines = [TEMPLATE_HEADERS.join(',')];
  SAMPLE_ROWS.forEach(row => {
    const formattedRow = row.map(val => {
      const str = String(val);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(formattedRow.join(','));
  });
  return lines.join('\n');
}

function generateExcelTemplateBuffer() {
  let xlsx;
  try {
    xlsx = require('xlsx');
  } catch (e) {
    xlsx = null;
  }

  if (xlsx) {
    const wb = xlsx.utils.book_new();

    // Sheet 1: Questions
    const questionsData = [TEMPLATE_HEADERS, ...SAMPLE_ROWS];
    const wsQuestions = xlsx.utils.aoa_to_sheet(questionsData);
    xlsx.utils.book_append_sheet(wb, wsQuestions, 'Questions');

    // Sheet 2: Coding Test Cases
    const testCasesData = [
      ['Question Title', 'Input', 'Expected Output', 'Is Sample', 'Weight'],
      ['Two Sum Problem: Return indices of two numbers that add up to target.', '[2, 7, 11, 15], 9', '[0, 1]', 'TRUE', '50'],
      ['Two Sum Problem: Return indices of two numbers that add up to target.', '[3, 2, 4], 6', '[1, 2]', 'FALSE', '50']
    ];
    const wsTestCases = xlsx.utils.aoa_to_sheet(testCasesData);
    xlsx.utils.book_append_sheet(wb, wsTestCases, 'Coding Test Cases');

    // Sheet 3: Paper Summary
    const summaryData = [
      ['Field', 'Description'],
      ['Supported Types', 'MCQ, DESCRIPTIVE, CODING'],
      ['Instructions', 'Fill in section names and questions. Section names will automatically create section dividers.'],
      ['Format Version', '1.0']
    ];
    const wsSummary = xlsx.utils.aoa_to_sheet(summaryData);
    xlsx.utils.book_append_sheet(wb, wsSummary, 'Metadata & Guidelines');

    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  // Fallback: Return CSV buffer if xlsx library is missing
  return Buffer.from(generateCSVTemplate(), 'utf-8');
}

module.exports = {
  generateCSVTemplate,
  generateExcelTemplateBuffer,
  generateExcelTemplate: generateExcelTemplateBuffer
};
