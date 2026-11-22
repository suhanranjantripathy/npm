import fs from 'node:fs';
import path from 'node:path';
import { getLockInfo, isProcessRunning } from './lockManager.js';
import { loadState } from '../recovery/stateManager.js';
import { getRepoStatus } from '../git/status.js';
import { checkRepoHealth } from '../git/repository.js';

export const SIGNAL_FILE_NAME = 'watch.signal';

/**
 * Send a control signal to the running watch process
 * @param {string} repoRoot 
 * @param {'pause'|'resume'|'stop'} action 
 */
export function sendSignal(repoRoot = process.cwd(), action) {
  const dir = path.join(repoRoot, '.autocommit');
  fs.mkdirSync(dir, { recursive: true });

  const signalPath = path.join(dir, SIGNAL_FILE_NAME);
  const data = {
    action,
    timestamp: Date.now()
  };

  fs.writeFileSync(signalPath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Read and consume pending signal
 * @param {string} repoRoot 
 * @returns {{ action: 'pause'|'resume'|'stop', timestamp: number }|null}
 */
export function consumeSignal(repoRoot = process.cwd()) {
  const signalPath = path.join(repoRoot, '.autocommit', SIGNAL_FILE_NAME);
  if (!fs.existsSync(signalPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(signalPath, 'utf8');
    const data = JSON.parse(raw);
    fs.unlinkSync(signalPath);
    return data;
  } catch {
    try { fs.unlinkSync(signalPath); } catch {}
    return null;
  }
}

/**
 * Get comprehensive monitoring status
 * @param {string} repoRoot 
 */
export async function getSessionStatus(repoRoot = process.cwd()) {
  const lock = getLockInfo(repoRoot);
  const state = loadState(repoRoot);
  const health = await checkRepoHealth(repoRoot);

  let gitStatus = null;
  if (health.isRepo) {
    gitStatus = await getRepoStatus(repoRoot).catch(() => null);
  }

  const isRunning = Boolean(lock && lock.active);

  return {
    isRunning,
    pid: lock?.pid || null,
    startedAt: lock?.startTime || null,
    interval: lock?.interval || state?.interval || '15m',
    isPaused: lock?.isPaused || false,
    repository: health.root || repoRoot,
    branch: health.branch || 'unknown',
    lastCheckpoint: state?.lastCheckpoint || null,
    modifiedFilesCount: gitStatus ? (gitStatus.modified.length + gitStatus.unstaged.length + gitStatus.staged.length) : 0,
    isClean: gitStatus ? gitStatus.isClean : true
  };
}
