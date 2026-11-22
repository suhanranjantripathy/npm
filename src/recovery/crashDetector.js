import { loadState, saveState } from './stateManager.js';
import { getLockInfo } from '../watch/lockManager.js';
import { checkRepoHealth, getGit } from '../git/repository.js';
import { getRepoStatus } from '../git/status.js';
import { getCheckpointHistory } from '../git/history.js';

/**
 * Checks if a previous monitoring session ended abnormally (crash, sudden power-off, terminal kill)
 * and reconciles state with Git history.
 * @param {string} repoRoot 
 * @returns {Promise<{ hasCrash: boolean, reason?: string, lastCheckpoint?: object, uncommittedCount: number, status?: object }>}
 */
export async function detectCrash(repoRoot = process.cwd()) {
  const health = await checkRepoHealth(repoRoot);
  if (!health.isRepo) {
    return { hasCrash: false, uncommittedCount: 0 };
  }

  const state = loadState(repoRoot);
  const lock = getLockInfo(repoRoot);

  // If lock exists but process is dead, or state says monitoring was active without clean shutdown
  const abnormalEnd = (state.monitoringActive && !state.cleanShutdown) || (lock && !lock.active);

  if (!abnormalEnd) {
    return { hasCrash: false, uncommittedCount: 0 };
  }

  const gitStatus = await getRepoStatus(repoRoot);
  const uncommittedCount = gitStatus.modified.length + gitStatus.unstaged.length + gitStatus.staged.length + gitStatus.untracked.length;

  // Reconcile with actual Git history:
  // In case the commit succeeded just before crash, check if the latest checkpoint in git log matches state
  let latestCheckpoint = state.lastCheckpoint;
  try {
    const recentCheckpoints = await getCheckpointHistory(repoRoot, { maxCount: 5 });
    if (recentCheckpoints.length > 0) {
      const topCheckpoint = recentCheckpoints[0];
      if (!latestCheckpoint || topCheckpoint.hash !== latestCheckpoint.hash) {
        latestCheckpoint = {
          hash: topCheckpoint.hash,
          shortHash: topCheckpoint.shortHash,
          message: topCheckpoint.message,
          timestamp: topCheckpoint.date
        };
        // Update state to reconciled commit
        saveState(repoRoot, { lastCheckpoint: latestCheckpoint });
      }
    }
  } catch {}

  return {
    hasCrash: true,
    reason: 'An interrupted or abnormally terminated AutoCommit session was detected.',
    lastCheckpoint: latestCheckpoint,
    lastBranch: state.lastBranch || health.branch,
    lastMonitoringTimestamp: state.lastMonitoringTimestamp,
    uncommittedCount,
    status: gitStatus
  };
}

/**
 * Clears crash state after user acknowledgement or recovery
 * @param {string} repoRoot 
 */
export function resolveCrashState(repoRoot = process.cwd()) {
  saveState(repoRoot, {
    monitoringActive: false,
    cleanShutdown: true
  });
}
