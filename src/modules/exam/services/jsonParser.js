'use strict';

/**
 * jsonParser.js
 * Parses JSON question paper format safely.
 */

function parseJSONPaper(content) {
  if (!content) return [];
  let parsed;
  if (typeof content === 'string') {
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new Error('Invalid JSON format: ' + err.message);
    }
  } else {
    parsed = content;
  }

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && Array.isArray(parsed.questions)) {
    return parsed.questions;
  }

  if (parsed && Array.isArray(parsed.sections)) {
    const flattened = [];
    parsed.sections.forEach(sec => {
      const secName = sec.title || sec.name || 'General';
      const secDesc = sec.description || '';
      if (Array.isArray(sec.questions)) {
        sec.questions.forEach(q => {
          flattened.push({
            ...q,
            sectionname: secName,
            sectiondescription: secDesc
          });
        });
      }
    });
    return flattened;
  }

  throw new Error('JSON structure must contain an array of questions or sections');
}

module.exports = {
  parseJSONPaper
};
