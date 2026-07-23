'use strict';

/**
 * excelParser.js
 * Multi-sheet Excel (.xlsx / .xls) parser.
 * Falls back to CSV parsing if workbook contains raw CSV buffers.
 */

const { parseCSV, sanitizeValue } = require('./csvParser');

function parseExcel(buffer) {
  let xlsx;
  try {
    xlsx = require('xlsx');
  } catch (e) {
    xlsx = null;
  }

  if (xlsx) {
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheets = {};

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

        const cleanedRows = rawRows.map(row => {
          const cleanedRow = {};
          Object.keys(row).forEach(key => {
            const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            cleanedRow[normKey] = sanitizeValue(String(row[key]));
          });
          return cleanedRow;
        });

        sheets[sheetName] = cleanedRows;
      }

      return sheets;
    } catch (err) {
      console.warn('Excel parse error, trying CSV fallback:', err.message);
    }
  }

  // Fallback: parse as UTF-8 string/CSV
  const text = buffer.toString('utf-8');
  const csvRows = parseCSV(text);
  return { Sheet1: csvRows };
}

function parseExcelBuffer(buffer) {
  const sheets = parseExcel(buffer);
  const allRows = [];
  Object.values(sheets).forEach(sheetRows => {
    if (Array.isArray(sheetRows)) {
      allRows.push(...sheetRows);
    }
  });
  return allRows;
}

module.exports = {
  parseExcel,
  parseExcelBuffer
};
