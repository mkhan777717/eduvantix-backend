'use strict';

/**
 * pdfGenerator.js
 * Generates styled printable HTML/PDF views for exam papers.
 * Supports profiles: Student Copy, Faculty Copy, Moderation Copy, Practice Sheet, Revision Sheet.
 */

function generateExamPDFHTML(exam, options = {}) {
  const profile = (options.profile || 'STUDENT').toUpperCase(); // STUDENT, FACULTY, MODERATION, PRACTICE, REVISION
  const includeAnswerKey = options.includeAnswerKey !== false && (profile === 'FACULTY' || profile === 'MODERATION');
  const includeExplanations = options.includeExplanations !== false && (profile === 'FACULTY' || profile === 'MODERATION' || profile === 'REVISION');

  const totalMarks = exam.sections?.reduce((acc, sec) => {
    return acc + (sec.questions?.reduce((qAcc, q) => qAcc + (q.question?.marks || 1), 0) || 0);
  }, 0) || 0;

  const totalQuestions = exam.sections?.reduce((acc, sec) => acc + (sec.questions?.length || 0), 0) || 0;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${exam.title || 'Exam Paper'} - ${profile} View</title>
  <style>
    @media print {
      body { margin: 0; padding: 20px; font-size: 12pt; background: #fff !important; color: #000 !important; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; color: #1e293b; background: #f8fafc; margin: 0; padding: 40px; }
    .paper-container { max-width: 850px; margin: 0 auto; background: #ffffff; padding: 48px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
    .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 24px; }
    .institute-name { font-size: 14px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #4f46e5; margin-bottom: 6px; }
    .exam-title { font-size: 26px; font-weight: 900; color: #0f172a; margin: 0 0 8px 0; }
    .meta-bar { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #475569; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 10px 0; margin-top: 14px; }
    .profile-badge { display: inline-block; background: #e0e7ff; color: #3730a3; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 20px; text-transform: uppercase; margin-bottom: 12px; }
    .instructions { background: #f1f5f9; border-left: 4px solid #4f46e5; padding: 14px 18px; border-radius: 6px; margin-bottom: 32px; font-size: 13px; }
    .instructions h4 { margin: 0 0 6px 0; font-size: 14px; font-weight: 700; color: #0f172a; }
    .instructions ul { margin: 0; padding-left: 20px; }
    .section-header { background: #0f172a; color: #ffffff; padding: 10px 16px; border-radius: 8px; font-size: 15px; font-weight: 800; margin: 32px 0 20px 0; display: flex; justify-content: space-between; align-items: center; }
    .question-card { margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #f1f5f9; }
    .question-head { font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 10px; display: flex; justify-content: space-between; }
    .question-text { font-size: 14px; color: #334155; margin-bottom: 14px; white-space: pre-wrap; }
    .options-grid { display: grid; grid-cols: 2; gap: 10px; margin-bottom: 12px; }
    .option-item { background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
    .option-item.correct { background: #dcfce7; border-color: #86efac; color: #14532d; font-weight: 700; }
    .answer-key-box { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px 16px; border-radius: 8px; margin-top: 10px; font-size: 13px; color: #166534; }
    .explanation-box { background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px 16px; border-radius: 8px; margin-top: 10px; font-size: 13px; color: #1e40af; }
    .print-btn { background: #4f46e5; color: white; border: none; padding: 12px 24px; font-weight: 700; border-radius: 12px; cursor: pointer; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(79,70,229,0.3); }
    .print-btn:hover { background: #4338ca; }
    .descriptive-box { height: 120px; border: 2px dashed #cbd5e1; border-radius: 8px; margin-top: 10px; background: #fafafa; }
    .code-box { font-family: monospace; background: #0f172a; color: #38bdf8; padding: 14px; border-radius: 8px; font-size: 12px; white-space: pre; overflow-x: auto; margin-top: 10px; }
  </style>
</head>
<body>
  <div className="no-print" style="max-width:850px; margin:0 auto 20px auto; text-align:right;">
    <button onclick="window.print()" class="print-btn">🖨️ Print / Download PDF Paper</button>
  </div>

  <div class="paper-container">
    <div class="header">
      <div class="institute-name">${exam.institute?.name || 'Eduvantix Assessment System'}</div>
      <div class="profile-badge">${profile} COPY</div>
      <h1 class="exam-title">${exam.title}</h1>
      <div style="font-size:13px; color:#64748b;">${exam.description || ''}</div>
      <div class="meta-bar">
        <span>⏱️ Duration: ${Math.round((new Date(exam.endDate) - new Date(exam.startDate)) / (1000 * 60))} mins</span>
        <span>📋 Total Questions: ${totalQuestions}</span>
        <span>🏆 Total Marks: ${totalMarks}</span>
      </div>
    </div>

    ${exam.instructions && exam.instructions.length > 0 ? `
    <div class="instructions">
      <h4>General Instructions:</h4>
      <ul>
        ${exam.instructions.map(ins => `<li>${ins.text}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
`;

  let qNumber = 1;

  if (exam.sections && exam.sections.length > 0) {
    exam.sections.forEach((section) => {
      html += `
      <div class="section-header">
        <span>${section.name}</span>
        <span style="font-size:12px; font-weight:600;">Weight: ${section.weightage || 0}%</span>
      </div>
      ${section.description ? `<p style="font-size:12px; color:#64748b; margin-top:-10px; margin-bottom:20px;">${section.description}</p>` : ''}
      `;

      if (section.questions && section.questions.length > 0) {
        section.questions.forEach((eq) => {
          const q = eq.question;
          if (!q) return;

          html += `
          <div class="question-card">
            <div class="question-head">
              <span>Q${qNumber}. ${q.title || ''} [${q.type}]</span>
              <span>[${q.marks || 1} Marks]</span>
            </div>
            <div class="question-text">${q.text || ''}</div>
          `;

          if (q.type === 'MCQ' && q.options) {
            html += `<div class="options-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">`;
            q.options.forEach((opt, idx) => {
              const letter = String.fromCharCode(65 + idx);
              const isCorrectClass = includeAnswerKey && opt.isCorrect ? 'correct' : '';
              html += `<div class="option-item ${isCorrectClass}"><strong>${letter}.</strong> ${opt.text}</div>`;
            });
            html += `</div>`;
          } else if (q.type === 'DESCRIPTIVE') {
            html += `<div class="descriptive-box"></div>`;
          } else if (q.type === 'CODING' && q.codingQuestion) {
            html += `
            <div style="font-size:12px; color:#475569; margin-top:6px;"><strong>Constraints:</strong> ${q.codingQuestion.constraints || 'Standard'}</div>
            <div class="code-box">${q.codingQuestion.starterCode?.javascript || '// Write code here'}</div>
            `;
          }

          if (includeExplanations && q.explanation) {
            html += `<div class="explanation-box"><strong>Explanation:</strong> ${q.explanation}</div>`;
          }

          html += `</div>`;
          qNumber++;
        });
      }
    });
  }

  // Add Answer Key Section at end if requested
  if (includeAnswerKey) {
    html += `
    <div class="page-break"></div>
    <div class="section-header" style="background:#166534; margin-top:40px;">
      <span>FACULTY ANSWER KEY SUMMARY</span>
      <span>CONFIDENTIAL</span>
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:12px; margin-top:16px;">
      <thead>
        <tr style="background:#f1f5f9; text-align:left;">
          <th style="padding:8px; border:1px solid #cbd5e1;">Q#</th>
          <th style="padding:8px; border:1px solid #cbd5e1;">Type</th>
          <th style="padding:8px; border:1px solid #cbd5e1;">Correct Answer / Key Solution</th>
          <th style="padding:8px; border:1px solid #cbd5e1;">Marks</th>
        </tr>
      </thead>
      <tbody>
    `;

    let keyIdx = 1;
    exam.sections?.forEach(sec => {
      sec.questions?.forEach(eq => {
        const q = eq.question;
        if (!q) return;
        let ansStr = 'N/A';
        if (q.type === 'MCQ' && q.options) {
          const correctOpts = q.options.filter(o => o.isCorrect).map(o => o.text);
          ansStr = correctOpts.join(', ');
        } else if (q.type === 'DESCRIPTIVE') {
          ansStr = q.descriptiveQuestion?.sampleAnswer || 'Evaluated manually against rubric';
        } else if (q.type === 'CODING') {
          ansStr = 'Passes automated test suite';
        }

        html += `
        <tr>
          <td style="padding:8px; border:1px solid #e2e8f0;">Q${keyIdx}</td>
          <td style="padding:8px; border:1px solid #e2e8f0;">${q.type}</td>
          <td style="padding:8px; border:1px solid #e2e8f0;">${ansStr}</td>
          <td style="padding:8px; border:1px solid #e2e8f0;">${q.marks || 1}</td>
        </tr>
        `;
        keyIdx++;
      });
    });

    html += `
      </tbody>
    </table>
    `;
  }

  html += `
  </div>
</body>
</html>
`;

  return html;
}

module.exports = {
  generateExamPDFHTML
};
