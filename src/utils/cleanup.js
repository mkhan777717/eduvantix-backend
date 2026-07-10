const fs = require('fs');
const path = require('path');

const TEMP_BASE_DIR = path.join(__dirname, '..', 'temp');

/**
 * Ensures the main temp directory exists
 */
const ensureBaseTempDir = () => {
  if (!fs.existsSync(TEMP_BASE_DIR)) {
    fs.mkdirSync(TEMP_BASE_DIR, { recursive: true });
  }
};

/**
 * Creates a unique subdirectory for a submission
 * @param {string|number} submissionId
 * @returns {string} Path to the created directory
 */
const createTempDir = (submissionId) => {
  ensureBaseTempDir();
  const dirPath = path.join(TEMP_BASE_DIR, `submission_${submissionId}`);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
};

/**
 * Writes code text to a file in the temporary directory
 * @param {string} dirPath
 * @param {string} fileName
 * @param {string} codeContent
 * @returns {string} Absolute path to the written file
 */
const writeTempFile = (dirPath, fileName, codeContent) => {
  const filePath = path.join(dirPath, fileName);
  fs.writeFileSync(filePath, codeContent, 'utf-8');
  return filePath;
};

/**
 * Recursively deletes a temporary directory and its contents
 * Retries up to 3 times with a delay on failure to handle Windows file locking delays
 * @param {string} dirPath
 * @param {number} retries
 * @param {number} delay
 */
const cleanupDir = async (dirPath, retries = 3, delay = 150) => {
  for (let i = 0; i < retries; i++) {
    try {
      if (fs.existsSync(dirPath)) {
        await fs.promises.rm(dirPath, { recursive: true, force: true });
      }
      return; // Success
    } catch (error) {
      if (i === retries - 1) {
        console.error(`Failed to clean up temporary directory ${dirPath} after ${retries} attempts:`, error);
      } else {
        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
};

module.exports = {
  createTempDir,
  writeTempFile,
  cleanupDir,
};
