'use strict';

const prisma = require('../../../prisma');
const { generateExamPDFHTML } = require('./pdfGenerator');
const { sanitizeValue } = require('./csvParser');

/**
 * ExamExportService
 * Multi-profile paper exporter supporting PDF, Multi-sheet Excel (.xlsx), and sanitized CSV downloads.
 */
class ExamExportService {
  async getFullExamTree(examId, instituteId) {
    const exam = await prisma.exam.findFirst({
      where: { id: examId, deletedAt: null },
      include: {
        institute: true,
        instructions: { orderBy: { order: 'asc' } },
        sections: {
          orderBy: { order: 'asc' },
          include: {
            questions: {
              orderBy: { order: 'asc' },
              include: {
                question: {
                  include: {
                    options: { orderBy: { order: 'asc' } },
                    codingQuestion: { include: { testCases: true } },
                    descriptiveQuestion: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!exam) throw new Error('EXAM_NOT_FOUND');
    return exam;
  }

  /**
   * Export to HTML/PDF Printable Paper (Student Copy, Faculty Copy, Moderation, Practice, Revision).
   */
  async exportPDF(examId, instituteId, options = {}) {
    const exam = await this.getFullExamTree(examId, instituteId);
    return generateExamPDFHTML(exam, options);
  }

  /**
   * Export to Multi-sheet Excel workbook or fallback buffer.
   */
  async exportExcel(examId, instituteId, options = {}) {
    const exam = await this.getFullExamTree(examId, instituteId);
    let xlsx;
    try {
      xlsx = require('xlsx');
    } catch {
      xlsx = null;
    }

    const rows = [];
    const testCaseRows = [];
    let qNum = 1;

    exam.sections?.forEach(sec => {
      sec.questions?.forEach(eq => {
        const q = eq.question;
        if (!q) return;

        let optA = '', optB = '', optC = '', optD = '', correct = '';
        if (q.options) {
          optA = q.options[0]?.text || '';
          optB = q.options[1]?.text || '';
          optC = q.options[2]?.text || '';
          optD = q.options[3]?.text || '';
          const correctOpt = q.options.find(o => o.isCorrect);
          if (correctOpt) {
            const idx = q.options.indexOf(correctOpt);
            correct = String.fromCharCode(65 + idx);
          }
        }

        rows.push({
          'Section Name': sec.name,
          'Section Description': sec.description || '',
          'Section Order': sec.order,
          'Question Type': q.type,
          'Difficulty': q.difficulty || 'MEDIUM',
          'Question Text': q.text,
          'Marks': q.marks || 1,
          'Negative Marks': q.negativeMarks || 0,
          'Option A': optA,
          'Option B': optB,
          'Option C': optC,
          'Option D': optD,
          'Correct Answer': correct,
          'Explanation': q.explanation || '',
          'Programming Language': q.codingQuestion?.language || '',
          'Starter Code': JSON.stringify(q.codingQuestion?.starterCode || ''),
          'Function Name': q.codingQuestion?.functionName || '',
          'Constraints': q.codingQuestion?.constraints || '',
          'Input Format': q.codingQuestion?.inputFormat || '',
          'Output Format': q.codingQuestion?.outputFormat || '',
          'Rubric': q.descriptiveQuestion?.rubric || ''
        });

        if (q.codingQuestion?.testCases) {
          q.codingQuestion.testCases.forEach(tc => {
            testCaseRows.push({
              'Question #': `Q${qNum}`,
              'Question Title': q.title,
              'Input': tc.input,
              'Expected Output': tc.expectedOutput,
              'Is Sample': tc.isSample ? 'TRUE' : 'FALSE',
              'Weight': tc.weight
            });
          });
        }
        qNum++;
      });
    });

    if (xlsx) {
      const wb = xlsx.utils.book_new();
      const wsQuestions = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(wb, wsQuestions, 'Questions');

      if (testCaseRows.length > 0) {
        const wsTestCases = xlsx.utils.json_to_sheet(testCaseRows);
        xlsx.utils.book_append_sheet(wb, wsTestCases, 'Coding Test Cases');
      }

      return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    }

    // Fallback: CSV buffer
    const csvString = await this.exportCSV(examId, instituteId, options);
    return Buffer.from(csvString, 'utf-8');
  }

  /**
   * Export to Sanitized CSV string.
   */
  async exportCSV(examId, instituteId, options = {}) {
    const exam = await this.getFullExamTree(examId, instituteId);
    const headers = [
      'Section Name', 'Section Description', 'Section Order',
      'Question Type', 'Difficulty', 'Question Text', 'Marks', 'Negative Marks',
      'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Explanation'
    ];

    const lines = [headers.join(',')];

    exam.sections?.forEach(sec => {
      sec.questions?.forEach(eq => {
        const q = eq.question;
        if (!q) return;

        let optA = '', optB = '', optC = '', optD = '', correct = '';
        if (q.options) {
          optA = q.options[0]?.text || '';
          optB = q.options[1]?.text || '';
          optC = q.options[2]?.text || '';
          optD = q.options[3]?.text || '';
          const correctOpt = q.options.find(o => o.isCorrect);
          if (correctOpt) {
            const idx = q.options.indexOf(correctOpt);
            correct = String.fromCharCode(65 + idx);
          }
        }

        const rowValues = [
          sec.name,
          sec.description || '',
          sec.order,
          q.type,
          q.difficulty || 'MEDIUM',
          q.text || '',
          q.marks || 1,
          q.negativeMarks || 0,
          optA, optB, optC, optD,
          correct,
          q.explanation || ''
        ].map(v => {
          let str = sanitizeValue(String(v));
          if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });

        lines.push(rowValues.join(','));
      });
    });

    return lines.join('\n');
  }
}

module.exports = new ExamExportService();
