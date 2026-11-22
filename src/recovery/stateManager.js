import fs from 'node:fs';
import path from 'node:path';

export const STATE_FILE_NAME = 'state.json';

export const DEFAULT_STATE = {
  repoRoot: '',
  lastBranch: '',
  monitoringActive: false,
  cleanShutdown: true,
  lastMonitoringTimestamp: null,
  lastCheckpoint: null,
  interruptedSession: null
};

/**
 * Validates state object schema
 * @param {object} state 
 * @returns {boolean}
 */
export function isValidState(state) {
  return Boolean(
    state &&
    typeof state === 'object' &&
    typeof state.monitoringActive === 'boolean' &&
    typeof state.cleanShutdown === 'boolean'
  );
}

/**
 * Gets path to state file
 * @param {string} repoRoot 
 */
export function getStateFilePath(repoRoot = process.cwd()) {
  return path.join(repoRoot, '.autocommit', STATE_FILE_NAME);
}

/**
 * Read persistent state from repository
 * @param {string} repoRoot 
 * @returns {typeof DEFAULT_STATE}
 */
export function loadState(repoRoot = process.cwd()) {
  const filePath = getStateFilePath(repoRoot);
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_STATE, repoRoot };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (isValidState(parsed)) {
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch (err) {
    console.warn(`Warning: Could not read AutoCommit state file (${err.message}). Initializing clean state.`);
  }

  return { ...DEFAULT_STATE, repoRoot };
}

/**
 * Write state atomically using rename
 * @param {string} repoRoot 
 * @param {Partial<typeof DEFAULT_STATE>} newState 
 */
export function saveState(repoRoot = process.cwd(), newState = {}) {
  const dir = path.join(repoRoot, '.autocommit');
  fs.mkdirSync(dir, { recursive: true });

  const current = loadState(repoRoot);
  const updated = {
    ...current,
    ...newState,
    repoRoot,
    lastUpdated: new Date().toISOString()
  };

  const targetPath = getStateFilePath(repoRoot);
  const tmpPath = path.join(dir, `${STATE_FILE_NAME}.tmp.${process.pid}.${Date.now()}`);

  try {
    fs.writeFileSync(tmpPath, JSON.stringify(updated, null, 2), 'utf8');
    fs.renameSync(tmpPath, targetPath);
    return updated;
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
    throw new Error(`Failed to save AutoCommit state: ${err.message}`);
  }
}
