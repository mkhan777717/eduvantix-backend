'use strict';

/**
 * validationService.js
 * Non-blocking row-by-row validator for bulk paper imports.
 * Collects complete error reports and warning diagnostics without stopping early.
 */

function normalizeKey(obj, ...possibleKeys) {
  for (const key of possibleKeys) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (obj[norm] !== undefined && obj[norm] !== '') return obj[norm];
    if (obj[key] !== undefined && obj[key] !== '') return obj[key];
  }
  return '';
}

function validateAndNormalizeRows(rawRows) {
  const errors = [];
  const warnings = [];
  const normalizedRows = [];
  const sectionsSet = new Set();

  let mcqCount = 0;
  let codingCount = 0;
  let descriptiveCount = 0;
  let totalMarks = 0;

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    errors.push({ row: 0, message: 'The uploaded file contains no data rows.' });
    return {
      validRows: [],
      errors,
      warnings,
      sections: [],
      stats: { totalQuestions: 0, mcqCount: 0, codingCount: 0, descriptiveCount: 0, totalMarks: 0 }
    };
  }

  rawRows.forEach((row, index) => {
    const rowNum = index + 1;
    const title = normalizeKey(row, 'questiontext', 'title', 'question_title', 'question') || '';
    const text = normalizeKey(row, 'questiontext', 'text', 'stem', 'question') || title;
    const typeRaw = (normalizeKey(row, 'questiontype', 'type', 'q_type') || 'MCQ').toUpperCase();

    // Skip empty or blank trailing rows
    const hasContent = Object.values(row).some(val => String(val).trim().length > 0);
    if (!hasContent || (!title && !text && Object.keys(row).length <= 2)) return;

    const sectionName = normalizeKey(row, 'sectionname', 'section', 'section_name') || 'General Section';
    const sectionDescription = normalizeKey(row, 'sectiondescription', 'section_desc', 'section_description') || '';
    const sectionOrder = parseInt(normalizeKey(row, 'sectionorder', 'section_order') || '0', 10);
    const pointsRaw = normalizeKey(row, 'marks', 'points', 'weightage') || '1';
    const negativeMarksRaw = normalizeKey(row, 'negativemarks', 'negative_marks') || '0';

    const points = parseFloat(pointsRaw) || 1.0;
    const negativeMarks = parseFloat(negativeMarksRaw) || 0.0;

    const difficulty = (normalizeKey(row, 'difficulty', 'diff') || 'MEDIUM').toUpperCase();
    const bloomLevel = normalizeKey(row, 'bloomlevel', 'bloom') || 'Understanding';
    const explanation = normalizeKey(row, 'explanation', 'exp') || '';

    sectionsSet.add(sectionName);

    // Validate type
    const validTypes = ['MCQ', 'DESCRIPTIVE', 'CODING'];
    let type = typeRaw;
    if (!validTypes.includes(type)) {
      errors.push({ row: rowNum, message: `Invalid question type "${typeRaw}". Must be MCQ, DESCRIPTIVE, or CODING.` });
      type = 'MCQ';
    }

    if (!title && !text) {
      errors.push({ row: rowNum, message: `Row ${rowNum} is missing Question Text or Title.` });
    }

    if (points <= 0) {
      warnings.push({ row: rowNum, message: `Question marks is ${points}. Recommended to be > 0.` });
    }

    const normRow = {
      rowNum,
      sectionName,
      sectionDescription,
      sectionOrder,
      type,
      title: title || `Question ${rowNum}`,
      text: text || title || `Question ${rowNum}`,
      marks: points,
      negativeMarks,
      difficulty,
      bloomLevel,
      explanation
    };

function findCorrectOptionIndex(correctVal, optionsList) {
  if (correctVal === undefined || correctVal === null) return -1;
  const rawStr = String(correctVal).trim();
  if (!rawStr) return -1;
  const lowerStr = rawStr.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Check exact text match with an option's text value first
  for (let i = 0; i < optionsList.length; i++) {
    const optText = String(optionsList[i].text || '').trim();
    if (!optText) continue;
    if (optText.toLowerCase() === rawStr.toLowerCase()) return i;
    if (optText.toLowerCase().replace(/[^a-z0-9]/g, '') === lowerStr) return i;
  }

  // 2. Fall back to letter or numeric column index (A/1 -> 0, B/2 -> 1, C/3 -> 2, D/4 -> 3, E/5 -> 4, F/6 -> 5)
  if (['a', '1', 'optiona', 'option1', 'opta', 'opt1', 'choicea', 'choice1'].includes(lowerStr)) return 0;
  if (['b', '2', 'optionb', 'option2', 'optb', 'opt2', 'choiceb', 'choice2'].includes(lowerStr)) return 1;
  if (['c', '3', 'optionc', 'option3', 'optc', 'opt3', 'choicec', 'choice3'].includes(lowerStr)) return 2;
  if (['d', '4', 'optiond', 'option4', 'optd', 'opt4', 'choiced', 'choice4'].includes(lowerStr)) return 3;
  if (['e', '5', 'optione', 'option5', 'opte', 'opt5', 'choicee', 'choice5'].includes(lowerStr)) return 4;
  if (['f', '6', 'optionf', 'option6', 'optf', 'opt6', 'choicef', 'choice6'].includes(lowerStr)) return 5;

  return -1;
}

    if (type === 'MCQ') {
      mcqCount++;
      const optA = normalizeKey(row, 'optiona', 'option_a', 'opt_a', 'option1', 'option_1', 'opt1', 'choicea', 'choice1', 'a');
      const optB = normalizeKey(row, 'optionb', 'option_b', 'opt_b', 'option2', 'option_2', 'opt2', 'choiceb', 'choice2', 'b');
      const optC = normalizeKey(row, 'optionc', 'option_c', 'opt_c', 'option3', 'option_3', 'opt3', 'choicec', 'choice3', 'c');
      const optD = normalizeKey(row, 'optiond', 'option_d', 'opt_d', 'option4', 'option_4', 'opt4', 'choiced', 'choice4', 'd');
      const optE = normalizeKey(row, 'optione', 'option_e', 'opt_e', 'option5', 'option_5', 'opt5', 'choicee', 'choice5', 'e');
      const optF = normalizeKey(row, 'optionf', 'option_f', 'opt_f', 'option6', 'option_6', 'opt6', 'choicef', 'choice6', 'f');
      const correct = normalizeKey(row, 'correctanswer', 'correct_answer', 'correct_option', 'correct', 'answer');

      let options = [];

      // Handle array of options provided in row.options
      if (Array.isArray(row.options) && row.options.length > 0) {
        options = row.options.map((o) => ({
          text: String(typeof o === 'string' ? o : (o.text || o.optionText || o.value || '')).trim(),
          isCorrect: !!o.isCorrect
        })).filter(o => o.text.length > 0);
      } else {
        // Collect individual columnar options
        if (optA !== '') options.push({ text: String(optA).trim(), isCorrect: false });
        if (optB !== '') options.push({ text: String(optB).trim(), isCorrect: false });
        if (optC !== '') options.push({ text: String(optC).trim(), isCorrect: false });
        if (optD !== '') options.push({ text: String(optD).trim(), isCorrect: false });
        if (optE !== '') options.push({ text: String(optE).trim(), isCorrect: false });
        if (optF !== '') options.push({ text: String(optF).trim(), isCorrect: false });
      }

      if (options.length < 2) {
        errors.push({ row: rowNum, message: `MCQ Question "${title}" requires at least 2 options (Option A and Option B).` });
      }

      // Identify correct option index
      const correctIdx = findCorrectOptionIndex(correct, options);
      if (correctIdx >= 0 && options[correctIdx]) {
        options[correctIdx].isCorrect = true;
      } else if (!options.some(o => o.isCorrect)) {
        if (options.length > 0 && String(correct).trim() === '') {
          options[0].isCorrect = true;
          warnings.push({ row: rowNum, message: `No correct answer specified for "${title}". Defaulted to Option A.` });
        } else {
          errors.push({ row: rowNum, message: `Missing or invalid Correct Answer "${correct}" for "${title}". Must match Option A/B/C/D or answer text.` });
        }
      }

      normRow.options = options;
      console.log(`[ValidationService] Parsed MCQ Row #${rowNum} "${title}":`, {
        optionsCount: options.length,
        options: options,
        correctAnswerRaw: correct,
        resolvedCorrectIndex: correctIdx
      });
    } else if (type === 'CODING') {
      codingCount++;
      const lang = normalizeKey(row, 'programminglanguage', 'language', 'lang') || 'javascript';
      const starterCode = normalizeKey(row, 'startercode', 'starter_code', 'code') || '// Write code here\n';
      const functionName = normalizeKey(row, 'functionname', 'function_name') || 'solve';
      const constraints = normalizeKey(row, 'constraints') || 'Standard time/memory constraints';
      const inputFormat = normalizeKey(row, 'inputformat', 'input_format') || 'Standard input format';
      const outputFormat = normalizeKey(row, 'outputformat', 'output_format') || 'Standard output format';

      const sampleIn = normalizeKey(row, 'sampleinput', 'sample_input') || '1';
      const sampleOut = normalizeKey(row, 'sampleoutput', 'sample_output') || '1';

      const testCases = [
        { input: sampleIn, expectedOutput: sampleOut, isSample: true, weight: 50 }
      ];

      // Parse JSON test cases if provided
      const hiddenTestCasesRaw = normalizeKey(row, 'hiddentestcases', 'test_cases');
      if (hiddenTestCasesRaw) {
        try {
          const parsedTC = typeof hiddenTestCasesRaw === 'string' ? JSON.parse(hiddenTestCasesRaw) : hiddenTestCasesRaw;
          if (Array.isArray(parsedTC)) {
            parsedTC.forEach(tc => testCases.push({ input: tc.input || '1', expectedOutput: tc.expectedOutput || tc.output || '1', isSample: !!tc.isSample, weight: tc.weight || 50 }));
          }
        } catch {
          warnings.push({ row: rowNum, message: `Could not parse JSON in Hidden Test Cases column.` });
        }
      }

      // Ensure at least 1 visible sample and 1 hidden test case exist for validation
      if (!testCases.some(tc => tc.isSample === true)) {
        testCases.unshift({ input: sampleIn || '1', expectedOutput: sampleOut || '1', isSample: true, weight: 50 });
      }
      if (!testCases.some(tc => tc.isSample === false)) {
        const hiddenIn = normalizeKey(row, 'hiddeninput', 'hidden_input') || '2';
        const hiddenOut = normalizeKey(row, 'hiddenoutput', 'hidden_output') || '2';
        testCases.push({ input: hiddenIn, expectedOutput: hiddenOut, isSample: false, weight: 50 });
      }

      normRow.coding = {
        language: lang,
        starterCode: typeof starterCode === 'object' ? starterCode : { [lang]: starterCode },
        functionName,
        constraints,
        inputFormat,
        outputFormat,
        timeLimit: 2000,
        memoryLimit: 256,
        testCases
      };
    } else if (type === 'DESCRIPTIVE') {
      descriptiveCount++;
      const rubric = normalizeKey(row, 'rubric', 'grading_rubric') || 'Grade based on clarity and completeness.';
      const sampleAnswer = normalizeKey(row, 'sampleanswer', 'sample_answer') || '';

      normRow.descriptive = {
        wordLimit: 500,
        charLimit: 2500,
        rubric,
        sampleAnswer,
        allowFileUpload: false,
        maxFileSize: 5,
        allowedExtensions: ['pdf']
      };
    }

    totalMarks += points;
    normalizedRows.push(normRow);
  });

  return {
    validRows: normalizedRows,
    errors,
    warnings,
    sections: Array.from(sectionsSet),
    stats: {
      totalQuestions: normalizedRows.length,
      mcqCount,
      codingCount,
      descriptiveCount,
      totalMarks
    }
  };
}

module.exports = {
  validateAndNormalizeRows,
  validateQuestionRows: validateAndNormalizeRows
};
