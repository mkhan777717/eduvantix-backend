'use strict';

/**
 * csvParser.js
 * Stream-compatible multiline CSV parser with formula injection protection.
 * Properly respects multiline quoted fields (e.g. starter code or descriptions).
 */

function sanitizeValue(val) {
  if (typeof val !== 'string') return val;
  let cleaned = val.trim();
  // Prevent CSV Formula Injection
  if (/^[=+\-@\t\r]/.test(cleaned)) {
    cleaned = cleaned.replace(/^[=+\-@\t\r]+/, '');
  }
  return cleaned;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(sanitizeValue(current));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(sanitizeValue(current));
  return result;
}

function splitCSVLines(content) {
  const lines = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
        currentLine += '"';
      }
    } else if (char === '\r' && nextChar === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
      i++; // skip \n
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }

  if (currentLine.trim().length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

function parseCSV(content) {
  if (!content || typeof content !== 'string') return [];
  const lines = splitCSVLines(content).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const hasValues = values.some(v => String(v).trim().length > 0);
    if (!hasValues) continue;

    const rowObj = {};
    headers.forEach((header, index) => {
      if (header) {
        rowObj[header] = values[index] !== undefined ? values[index] : '';
      }
    });
    rows.push(rowObj);
  }

  return rows;
}

module.exports = {
  parseCSV,
  sanitizeValue
};
