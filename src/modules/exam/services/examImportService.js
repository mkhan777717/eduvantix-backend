'use strict';

const prisma = require('../../../prisma');
const validationService = require('./validationService');
const csvParser = require('./csvParser');
const excelParser = require('./excelParser');
const jsonParser = require('./jsonParser');

/**
 * ExamImportService
 * Production-ready transactional engine for bulk importing question papers.
 */
const idempotencyCache = new Map();

class ExamImportService {

  async previewImport(options) {
    if (options && options.fileBuffer) {
      return this.dryRunImport(options);
    }
    return this.dryRunImport({
      fileBuffer: Buffer.from(''),
      mimeType: 'text/csv',
      filename: 'paper.csv'
    });
  }

  /**
   * Dry-Run Validation (No Database Mutation)
   */
  async dryRunImport({ fileBuffer, mimeType, filename }) {
    let rawRows = [];
    const ext = filename.split('.').pop().toLowerCase();

    if (ext === 'csv' || mimeType.includes('csv')) {
      const content = fileBuffer.toString('utf-8');
      rawRows = csvParser.parseCSV(content);
    } else if (ext === 'xlsx' || ext === 'xls' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      const parsedSheets = excelParser.parseExcel(fileBuffer);
      Object.values(parsedSheets).forEach(sheetRows => {
        rawRows.push(...sheetRows);
      });
    } else if (ext === 'json' || mimeType.includes('json')) {
      const content = fileBuffer.toString('utf-8');
      rawRows = jsonParser.parseJSON(content);
    } else {
      throw new Error(`Unsupported file format ".${ext}". Please upload CSV, Excel (.xlsx), or JSON.`);
    }

    const report = validationService.validateQuestionRows(rawRows);

    return {
      valid: report.errors.length === 0,
      stats: report.stats,
      sectionsDetected: report.sections,
      validationErrors: report.errors,
      validationWarnings: report.warnings,
      validRows: report.validRows,
      estimates: {
        totalRows: rawRows.length,
        validRowsCount: report.validRows.length,
        errorRowsCount: report.errors.length,
        sectionsCreated: report.sections.length
      }
    };
  }

  /**
   * Transactional Execution with Idempotency Support
   */
  async executeImport({ examId, userId, instituteId, fileBuffer, mimeType, filename, duplicateMode = 'CREATE_NEW', questionBankId = null, idempotencyKey = null }) {
    if (idempotencyKey) {
      if (prisma.importRequest) {
        const existingReq = await prisma.importRequest.findUnique({
          where: { idempotencyKey }
        }).catch(() => null);

        if (existingReq) {
          if (existingReq.status === 'COMPLETED' && existingReq.responseSnapshot) {
            return existingReq.responseSnapshot;
          }
          if (existingReq.status === 'PENDING') {
            throw new Error('An import request with this idempotency key is currently processing.');
          }
        }

        await prisma.importRequest.create({
          data: {
            idempotencyKey,
            userId,
            examId: parseInt(examId, 10),
            status: 'PENDING'
          }
        }).catch(() => null);
      } else {
        const cached = idempotencyCache.get(idempotencyKey);
        if (cached) {
          if (cached.status === 'COMPLETED') return cached.result;
          if (cached.status === 'PENDING') throw new Error('An import request with this key is processing.');
        }
        idempotencyCache.set(idempotencyKey, { status: 'PENDING' });
      }
    }

    const dryRunResult = await this.dryRunImport({ fileBuffer, mimeType, filename });
    if (!dryRunResult.valid) {
      if (idempotencyKey) {
        if (prisma.importRequest) {
          await prisma.importRequest.update({
            where: { idempotencyKey },
            data: { status: 'FAILED' }
          }).catch(() => null);
        } else {
          idempotencyCache.delete(idempotencyKey);
        }
      }
      throw new Error(`Paper validation failed with ${dryRunResult.validationErrors.length} errors.`);
    }

    const targetExamId = parseInt(examId, 10);
    const validationReport = dryRunResult;

    let questionsImported = 0;
    let questionsSkipped = 0;
    let sectionsCreated = 0;

    const result = await prisma.$transaction(async (tx) => {
      // Fetch existing sections for this exam
      const existingSections = await tx.section.findMany({
        where: { examId: targetExamId }
      });

      const sectionMap = new Map();
      existingSections.forEach(sec => {
        sectionMap.set(sec.title.toLowerCase(), sec.id);
      });

      // Group rows by Section Name
      const sectionGroupedRows = new Map();
      const rawValidRows = validationReport.estimates.validRowsCount > 0
        ? (await this.dryRunImport({ fileBuffer, mimeType, filename })).validRows || []
        : [];

      // Re-run validation helper to get structured rows
      const ext = filename.split('.').pop().toLowerCase();
      let rawRows = [];
      if (ext === 'csv' || mimeType.includes('csv')) {
        rawRows = csvParser.parseCSV(fileBuffer.toString('utf-8'));
      } else if (ext === 'xlsx' || ext === 'xls' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
        const parsed = excelParser.parseExcel(fileBuffer);
        Object.values(parsed).forEach(r => rawRows.push(...r));
      } else if (ext === 'json' || mimeType.includes('json')) {
        rawRows = jsonParser.parseJSON(fileBuffer.toString('utf-8'));
      }
      const fullReport = validationService.validateQuestionRows(rawRows);

      fullReport.validRows.forEach(row => {
        const secName = row.sectionName.trim();
        if (!sectionGroupedRows.has(secName)) {
          sectionGroupedRows.set(secName, []);
        }
        sectionGroupedRows.get(secName).push(row);
      });

      // Handle Section Creation
      for (const [secName, rows] of sectionGroupedRows.entries()) {
        const secNorm = secName.toLowerCase();
        let sectionId = sectionMap.get(secNorm);

        if (!sectionId) {
          const firstRow = rows[0];
          const secType = (firstRow.type || 'MCQ').toUpperCase();
          const newSection = await tx.section.create({
            data: {
              examId: targetExamId,
              title: secName,
              type: ['MCQ', 'DESCRIPTIVE', 'CODING'].includes(secType) ? secType : 'MCQ',
              description: firstRow.sectionDescription || `Imported Section: ${secName}`,
              order: firstRow.sectionOrder || (sectionMap.size + 1)
            }
          });
          sectionId = newSection.id;
          sectionMap.set(secNorm, sectionId);
          sectionsCreated++;
        }

        // Handle REPLACE mode: remove existing sectionQuestion links
        if (duplicateMode === 'REPLACE') {
          await tx.sectionQuestion.deleteMany({
            where: { sectionId }
          });
        }

        // Insert Questions
        for (let qIndex = 0; qIndex < rows.length; qIndex++) {
          const row = rows[qIndex];

          // Check duplicate title in section if SKIP mode
          if (duplicateMode === 'SKIP') {
            const existingMapping = await tx.sectionQuestion.findFirst({
              where: { sectionId, question: { title: row.title, deletedAt: null } }
            });
            if (existingMapping) {
              questionsSkipped++;
              continue;
            }
          }

          // Create base Question
          const qType = ['MCQ', 'DESCRIPTIVE', 'CODING'].includes(row.type) ? row.type : 'MCQ';
          const newQuestion = await tx.question.create({
            data: {
              title: row.title,
              text: row.text,
              type: qType,
              marks: row.marks || 1,
              negativeMarks: row.negativeMarks || 0,
              explanation: row.explanation || '',
              difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(row.difficulty) ? row.difficulty : 'MEDIUM'
            }
          });

          // Insert MCQ Options
          if (qType === 'MCQ' && row.options && row.options.length > 0) {
            const optPayload = row.options.map((opt, i) => ({
              questionId: newQuestion.id,
              text: String(typeof opt === 'string' ? opt : (opt.text || opt.optionText || opt.value || '')).trim(),
              isCorrect: !!opt.isCorrect,
              order: i + 1
            }));

            console.log(`[Import] Inserting ${optPayload.length} MCQ options for Question "${newQuestion.title}" (ID: ${newQuestion.id}):`, optPayload);

            if (tx.mCQOption) {
              await tx.mCQOption.createMany({ data: optPayload });
            } else if (tx.mcqOption) {
              await tx.mcqOption.createMany({ data: optPayload });
            }

            console.log(`[Import] Successfully created ${optPayload.length} MCQ options in DB for Question ID: ${newQuestion.id}`);
          } 
          // Insert Coding Question details
          else if (qType === 'CODING' && row.coding) {
            const codingQ = await tx.codingQuestion.create({
              data: {
                questionId: newQuestion.id,
                constraints: row.coding.constraints || '',
                inputFormat: row.coding.inputFormat || '',
                outputFormat: row.coding.outputFormat || '',
                starterCode: row.coding.starterCode ? (typeof row.coding.starterCode === 'object' ? row.coding.starterCode : { default: row.coding.starterCode }) : null,
                timeLimit: row.coding.timeLimit || 2000,
                memoryLimit: row.coding.memoryLimit || 256
              }
            });

            if (row.coding.testCases && Array.isArray(row.coding.testCases) && row.coding.testCases.length > 0) {
              await tx.codingTestCase.createMany({
                data: row.coding.testCases.map((tc) => ({
                  codingQuestionId: codingQ.id,
                  input: tc.input || '',
                  expectedOutput: tc.expectedOutput || '',
                  isSample: !!tc.isSample,
                  weight: tc.weight || 50
                }))
              });
            }
          } 
          // Insert Descriptive Question details
          else if (qType === 'DESCRIPTIVE' && row.descriptive) {
            await tx.descriptiveQuestion.create({
              data: {
                questionId: newQuestion.id,
                wordLimit: row.descriptive.wordLimit || null,
                charLimit: row.descriptive.charLimit || null,
                rubric: row.descriptive.rubric || '',
                sampleAnswer: row.descriptive.sampleAnswer || '',
                allowFileUpload: !!row.descriptive.allowFileUpload,
                maxFileSize: row.descriptive.maxFileSize || 5,
                allowedExtensions: row.descriptive.allowedExtensions || ["pdf", "docx"]
              }
            });
          }

          // Link Question to Section
          await tx.sectionQuestion.create({
            data: {
              sectionId,
              questionId: newQuestion.id,
              order: qIndex + 1
            }
          });

          // Link to Question Bank if specified
          if (questionBankId) {
            const bankIdNum = parseInt(questionBankId, 10);
            if (!isNaN(bankIdNum)) {
              await tx.questionBankQuestion.create({
                data: {
                  questionBankId: bankIdNum,
                  questionId: newQuestion.id
                }
              }).catch(() => {});
            }
          }

          questionsImported++;
        }
      }

      return {
        success: true,
        examId: targetExamId,
        questionsImported,
        questionsSkipped,
        sectionsCreated,
        duplicateMode
      };
    }, { timeout: 30000 });

    if (idempotencyKey) {
      if (prisma.importRequest) {
        await prisma.importRequest.update({
          where: { idempotencyKey },
          data: {
            status: 'COMPLETED',
            responseSnapshot: result
          }
        }).catch(() => null);
      } else {
        idempotencyCache.set(idempotencyKey, { status: 'COMPLETED', result });
      }
    }

    return result;
  }
}

module.exports = new ExamImportService();
