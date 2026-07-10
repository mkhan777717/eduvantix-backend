/**
 * summary.service.js — AI-generated viva session summary.
 *
 * Output shape (stored as JSON in VivaSession.aiSummary):
 * {
 *   overallRemark: string,
 *   strongTopics: string[],
 *   weakTopics: string[],
 *   missingConcepts: string[],
 *   recommendedStudy: string[],
 *   avgScore: number,
 *   generatedAt: ISO string
 * }
 */

const { generateJSON, OllamaUnavailableError } = require('./llm.service');

async function generateSessionSummary(session, answers) {
  if (!answers?.length) return null;

  const avgScore = Math.round(answers.reduce((s, a) => s + (a.score || 0), 0) / answers.length * 10) / 10;

  // Compact Q&A digest — keep total under ~1200 chars
  const qaSummary = answers.map((a, i) => {
    const q = a.questionText?.slice(0, 80) || `Q${i+1}`;
    const ans = (a.answerText || '').slice(0, 100);
    const miss = Array.isArray(a.missingConcepts) && a.missingConcepts.length
      ? ` [missing: ${a.missingConcepts.slice(0,2).join(', ')}]` : '';
    return `Q${i+1} [${a.score}/10]: ${q} | Answer: ${ans}${miss}`;
  }).join('\n');

  const prompt = `You are an academic performance analyst. A student just completed a ${session.subject} viva.

Average Score: ${avgScore}/10
Questions: ${answers.length}

## Q&A Digest
${qaSummary}

## Task
Analyse performance. Return ONLY a JSON object:
{
  "overallRemark": "<2-3 honest sentences summarising performance>",
  "strongTopics": [<topics demonstrated well, up to 4>],
  "weakTopics": [<topics with gaps, up to 4>],
  "missingConcepts": [<specific concepts not mentioned across all answers, up to 5>],
  "recommendedStudy": [<specific topics/resources to study, 2-4 items>]
}

Be specific. Do not invent topics not present in the questions.`;

  try {
    const { data } = await generateJSON(prompt, { temperature: 0.2, maxTokens: 600 });
    return {
      overallRemark:    String(data.overallRemark    || ''),
      strongTopics:     toStringArray(data.strongTopics),
      weakTopics:       toStringArray(data.weakTopics),
      missingConcepts:  toStringArray(data.missingConcepts),
      recommendedStudy: toStringArray(data.recommendedStudy),
      avgScore,
      generatedAt: new Date().toISOString()
    };
  } catch (err) {
    if (err instanceof OllamaUnavailableError) console.warn('[SummaryService] Fallback');
    else console.error('[SummaryService] Error:', err.message);
    return ruleBasedSummary(session, answers, avgScore);
  }
}

function ruleBasedSummary(session, answers, avgScore) {
  const strong = answers.filter(a => a.score >= 7).map(a => (a.questionText || '').slice(0, 60));
  const weak   = answers.filter(a => a.score <  5).map(a => (a.questionText || '').slice(0, 60));
  const allMissing = [...new Set(answers.flatMap(a => toStringArray(a.missingConcepts)))].slice(0, 5);

  let overallRemark;
  if      (avgScore >= 8) overallRemark = `Outstanding ${session.subject} performance. Strong command of core concepts.`;
  else if (avgScore >= 6) overallRemark = `Good ${session.subject} performance with room to deepen understanding.`;
  else if (avgScore >= 4) overallRemark = `Adequate ${session.subject} performance. Core concepts need more practice.`;
  else                    overallRemark = `${session.subject} fundamentals need significant review.`;

  return {
    overallRemark,
    strongTopics:     strong.slice(0, 3),
    weakTopics:       weak.slice(0, 3),
    missingConcepts:  allMissing,
    recommendedStudy: allMissing.length > 0
      ? allMissing.slice(0, 3)
      : [`Review ${session.subject} fundamentals`],
    avgScore,
    generatedAt: new Date().toISOString()
  };
}

const toStringArray = v => Array.isArray(v) ? v.map(String) : [];

module.exports = { generateSessionSummary };
