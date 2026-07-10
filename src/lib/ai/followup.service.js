/**
 * followup.service.js
 *
 * Generates a contextual follow-up viva question based on:
 *   - The original question
 *   - The student's answer
 *   - Their score (only generate when score is mid-range: needs probing)
 *
 * Follow-ups are stored on VivaAnswer.followUp.
 * The evaluation.service already generates followUp as part of its response,
 * so this module provides standalone generation if needed separately.
 */

const { generate, OllamaUnavailableError } = require('./llm.service');

/**
 * Decide whether a follow-up is worth generating.
 * Skip for very low (student clearly doesn't know) or very high scores.
 */
function shouldGenerateFollowUp(score) {
  return score >= 3 && score <= 7;
}

/**
 * Generate a follow-up question.
 * Returns string or null.
 */
async function generateFollowUp(question, answerText, score) {
  if (!shouldGenerateFollowUp(score)) return null;

  const prompt = `You are a viva examiner. A student just answered a question.

Question: ${question.questionText}
Student's Answer: ${answerText}
Score: ${score}/10

Generate ONE short follow-up viva question that:
- Probes a gap in their answer
- Is directly related to the original topic
- Can be answered in 1-2 sentences

Return ONLY the follow-up question text, nothing else.`;

  try {
    const { text } = await generate(prompt, { temperature: 0.4, maxTokens: 80 });
    // Clean up — remove quotes, numbering etc.
    return text.replace(/^["'\d.\-\s]+/, '').replace(/["']$/, '').trim() || null;
  } catch (err) {
    if (err instanceof OllamaUnavailableError) return null;
    console.error('[AI] Follow-up generation error:', err.message);
    return null;
  }
}

module.exports = { generateFollowUp, shouldGenerateFollowUp };
