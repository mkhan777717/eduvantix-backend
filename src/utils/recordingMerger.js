const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Merge multiple MP4/WebM segments into a single file losslessly using FFmpeg concat demuxer.
 * @param {string[]} segmentPaths - Absolute paths to the segment files.
 * @param {string} outputFilePath - Absolute path to the desired merged output file.
 * @returns {Promise<string>} - Resolves with the output file path.
 */
function mergeSegments(segmentPaths, outputFilePath) {
  return new Promise((resolve, reject) => {
    if (!segmentPaths || segmentPaths.length === 0) {
      return reject(new Error('No segments to merge'));
    }
    
    if (segmentPaths.length === 1) {
      // If only one segment, just copy/rename it directly
      fs.copyFile(segmentPaths[0], outputFilePath, (err) => {
        if (err) return reject(err);
        resolve(outputFilePath);
      });
      return;
    }

    // Create a temporary concat text file containing file entries
    const tempTxtFile = path.join(
      path.dirname(outputFilePath),
      `concat_list_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`
    );
    
    const fileEntries = segmentPaths
      .map(p => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`)
      .join('\n');

    fs.writeFile(tempTxtFile, fileEntries, (writeErr) => {
      if (writeErr) return reject(writeErr);

      // Concat command (-safe 0 allows absolute paths, -c copy performs lossless merge without re-encoding)
      const cmd = `ffmpeg -y -f concat -safe 0 -i "${tempTxtFile}" -c copy "${outputFilePath}"`;

      exec(cmd, (execErr, stdout, stderr) => {
        // Clean up the temporary config file
        fs.unlink(tempTxtFile, () => {});

        if (execErr) {
          console.error('[MERGER] FFmpeg execution failed:', stderr);
          return reject(execErr);
        }

        resolve(outputFilePath);
      });
    });
  });
}

module.exports = {
  mergeSegments
};
