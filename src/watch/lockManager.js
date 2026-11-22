import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const LOCK_FILE_NAME = 'autocommit.lock';

/**
 * Check if a process with given PID is still running
 * @param {number} pid 
 * @returns {boolean}
 */
export function isProcessRunning(pid) {
  try {
    // Sending signal 0 checks for process existence without killing it
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // Running but owned by different user
  }
}

/**
 * Acquire watch lock for repository
 * @param {string} repoRoot 
 * @param {object} meta 
 * @returns {{ acquired: boolean, lockPath: string, existingLock?: object, error?: string }}
 */
export function acquireLock(repoRoot = process.cwd(), meta = {}) {
  const dir = path.join(repoRoot, '.autocommit');
  fs.mkdirSync(dir, { recursive: true });

  const lockPath = path.join(dir, LOCK_FILE_NAME);

  if (fs.existsSync(lockPath)) {
    try {
      const raw = fs.readFileSync(lockPath, 'utf8');
      const existing = JSON.parse(raw);

      if (existing.pid && isProcessRunning(existing.pid)) {
        return {
          acquired: false,
          lockPath,
          existingLock: existing,
          error: `Another AutoCommit watch process (PID: ${existing.pid}) is currently running.`
        };
      } else {
        // Stale lock detected
        fs.unlinkSync(lockPath);
      }
    } catch {
      // Corrupt lock file, overwrite
      try {
        fs.unlinkSync(lockPath);
      } catch {}
    }
  }

  const lockData = {
    pid: process.pid,
    startTime: new Date().toISOString(),
    hostname: os.hostname(),
    ...meta
  };

  fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), 'utf8');

  return {
    acquired: true,
    lockPath
  };
}

/**
 * Release watch lock
 * @param {string} repoRoot 
 */
export function releaseLock(repoRoot = process.cwd()) {
  const lockPath = path.join(repoRoot, '.autocommit', LOCK_FILE_NAME);
  if (fs.existsSync(lockPath)) {
    try {
      const raw = fs.readFileSync(lockPath, 'utf8');
      const data = JSON.parse(raw);
      if (data.pid === process.pid) {
        fs.unlinkSync(lockPath);
        return true;
      }
    } catch {
      try {
        fs.unlinkSync(lockPath);
      } catch {}
    }
  }
  return false;
}

/**
 * Read current lock status
 * @param {string} repoRoot 
 */
export function getLockInfo(repoRoot = process.cwd()) {
  const lockPath = path.join(repoRoot, '.autocommit', LOCK_FILE_NAME);
  if (!fs.existsSync(lockPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const data = JSON.parse(raw);
    const active = Boolean(data.pid && isProcessRunning(data.pid));
    return { ...data, active };
  } catch {
    return null;
  }
}
