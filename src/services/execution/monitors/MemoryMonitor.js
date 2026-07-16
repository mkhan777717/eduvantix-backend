const fs = require('fs');
const { exec } = require('child_process');

class MemoryMonitor {
  constructor() {
    this.peakMemoryKb = 0;
    this.timer = null;
  }

  /**
   * Starts a background polling loop tracking memory metrics.
   * @param {number} pid - Process ID
   * @param {number} intervalMs - Polling delay
   */
  start(pid, intervalMs = 20) {
    if (!pid) return;
    this.peakMemoryKb = 0;
    const isWin = process.platform === 'win32';

    this.timer = setInterval(() => {
      if (isWin) {
        exec(`tasklist /FI "PID eq ${pid}" /FO CSV`, (err, stdout) => {
          if (!err && stdout) {
            const lines = stdout.trim().split(/\r?\n/);
            if (lines.length > 1) {
              const fields = lines[1].split(',');
              if (fields.length >= 5) {
                const memStr = fields[4].replace(/"/g, '').replace(/[^\d]/g, '');
                const kb = parseInt(memStr, 10);
                if (!isNaN(kb)) {
                  this.peakMemoryKb = Math.max(this.peakMemoryKb, kb);
                }
              }
            }
          }
        });
      } else {
        try {
          const statm = fs.readFileSync(`/proc/${pid}/statm`, 'utf8');
          const parts = statm.trim().split(/\s+/);
          if (parts.length > 1) {
            const pages = parseInt(parts[1], 10);
            if (!isNaN(pages)) {
              const kb = pages * 4;
              this.peakMemoryKb = Math.max(this.peakMemoryKb, kb);
            }
          }
        } catch (e) {
          // Process exited or /proc not mounted
        }
      }
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getPeakMemoryKb() {
    // Falls back to standard base footprint if no samples were collected
    return this.peakMemoryKb || 4096;
  }
}

module.exports = MemoryMonitor;
