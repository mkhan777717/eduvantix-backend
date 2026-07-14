const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Merge multiple MP4/WebM segments into a single file losslessly using FFmpeg concat demuxer.
 * @param {string[]} segmentPaths - Absolute paths to the segment files.
 * @param {string} outputFilePath - Absolute path to the desired merged output file.
 * @returns {Promise<string>} - Resolves with the output file path.
 */
function mergeSegments(segmentPaths, outputFilePath, watermarkText = null) {
  return new Promise((resolve, reject) => {
    if (!segmentPaths || segmentPaths.length === 0) {
      return reject(new Error('No segments to merge'));
    }

    const hasWatermark = !!watermarkText;
    const cleanText = watermarkText ? watermarkText.replace(/[^a-zA-Z0-9\s]/g, '') : '';

    const performWatermark = (inputFile, outputFile) => {
      // Drawtext filter with moving text expression (bounces smoothly)
      const cmd = `ffmpeg -y -i "${inputFile}" -vf "drawtext=text='${cleanText}':x='(w-tw)/2+(w-tw)/2*sin(t*0.5)':y='(h-th)/2+(h-th)/2*cos(t*0.3)':fontcolor=white@0.25:fontsize=28" -c:v libx264 -preset superfast -crf 23 -c:a copy "${outputFile}"`;
      
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          console.error('[MERGER] FFmpeg watermark failed:', stderr);
          return reject(err);
        }
        resolve(outputFile);
      });
    };

    if (segmentPaths.length === 1) {
      if (hasWatermark) {
        performWatermark(segmentPaths[0], outputFilePath);
      } else {
        fs.copyFile(segmentPaths[0], outputFilePath, (err) => {
          if (err) return reject(err);
          resolve(outputFilePath);
        });
      }
      return;
    }

    // Merge multiple files first
    const tempTxtFile = path.join(
      path.dirname(outputFilePath),
      `concat_list_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`
    );
    
    const fileEntries = segmentPaths
      .map(p => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`)
      .join('\n');

    fs.writeFile(tempTxtFile, fileEntries, (writeErr) => {
      if (writeErr) return reject(writeErr);

      // Create a temporary intermediate file for concatenation
      const tempMergedFile = path.join(
        path.dirname(outputFilePath),
        `temp_merged_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`
      );

      const cmd = `ffmpeg -y -f concat -safe 0 -i "${tempTxtFile}" -c copy "${tempMergedFile}"`;

      exec(cmd, (execErr, stdout, stderr) => {
        // Clean up the temporary config file
        fs.unlink(tempTxtFile, () => {});

        if (execErr) {
          console.error('[MERGER] FFmpeg concat failed:', stderr);
          return reject(execErr);
        }

        if (hasWatermark) {
          performWatermark(tempMergedFile, outputFilePath);
          // Delete temp merged file afterwards
          fs.unlink(tempMergedFile, () => {});
        } else {
          // If no watermark, rename/move the tempMergedFile to outputFilePath
          fs.rename(tempMergedFile, outputFilePath, (renameErr) => {
            if (renameErr) {
              // Fallback to copy if rename fails across partitions
              fs.copyFile(tempMergedFile, outputFilePath, (copyErr) => {
                fs.unlink(tempMergedFile, () => {});
                if (copyErr) return reject(copyErr);
                resolve(outputFilePath);
              });
            } else {
              resolve(outputFilePath);
            }
          });
        }
      });
    });
  });
}

module.exports = {
  mergeSegments
};
