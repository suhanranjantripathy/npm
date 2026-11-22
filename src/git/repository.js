import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';

/**
 * Get simpleGit instance
 * @param {string} dir 
 * @returns {import('simple-git').SimpleGit}
 */
export function getGit(dir = process.cwd()) {
  return simpleGit({ baseDir: dir, binary: 'git', maxConcurrentProcesses: 4 });
}

/**
 * Checks if directory is inside a Git repository
 * @param {string} dir 
 * @returns {Promise<boolean>}
 */
export function isGitRepo(dir = process.cwd()) {
  const git = getGit(dir);
  return git.checkIsRepo();
}

/**
 * Returns top-level directory of repository
 * @param {string} dir 
 * @returns {Promise<string>}
 */
export async function getRepoRoot(dir = process.cwd()) {
  const git = getGit(dir);
  try {
    const root = await git.revparse(['--show-toplevel']);
    return root.trim();
  } catch (err) {
    throw new Error(`Directory is not a git repository: ${err.message}`);
  }
}

/**
 * Gets current branch or indicates detached HEAD
 * @param {string} dir 
 * @returns {Promise<string>}
 */
export async function getCurrentBranch(dir = process.cwd()) {
  const git = getGit(dir);
  try {
    const branchSummary = await git.branch();
    return branchSummary.current || 'HEAD (detached)';
  } catch {
    return 'unknown';
  }
}

/**
 * Checks if HEAD is detached
 * @param {string} dir 
 * @returns {Promise<boolean>}
 */
export async function isDetachedHead(dir = process.cwd()) {
  const git = getGit(dir);
  try {
    const branchSummary = await git.branch();
    return branchSummary.detached || !branchSummary.current;
  } catch {
    return false;
  }
}

/**
 * Checks if repository has any commits
 * @param {string} dir 
 * @returns {Promise<boolean>}
 */
export async function isEmptyRepo(dir = process.cwd()) {
  const git = getGit(dir);
  try {
    await git.revparse(['HEAD']);
    return false;
  } catch (err) {
    if (err.message.includes('unknown revision') || err.message.includes('bad default revision') || err.message.includes('fatal: ambiguous argument')) {
      return true;
    }
    // Check if branch list is empty
    const branchSummary = await git.branch().catch(() => ({ all: [] }));
    return branchSummary.all.length === 0;
  }
}

/**
 * Checks if merge is currently in progress
 * @param {string} repoRoot 
 * @returns {boolean}
 */
export function isMergeInProgress(repoRoot) {
  const mergeHead = path.join(repoRoot, '.git', 'MERGE_HEAD');
  return fs.existsSync(mergeHead);
}

/**
 * Comprehensive repository health check
 * @param {string} dir 
 */
export async function checkRepoHealth(dir = process.cwd()) {
  const git = getGit(dir);
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    return {
      isRepo: false,
      root: null,
      branch: null,
      isDetached: false,
      isEmpty: false,
      isMerging: false
    };
  }

  const root = await getRepoRoot(dir);
  const branch = await getCurrentBranch(dir);
  const detached = await isDetachedHead(dir);
  const empty = await isEmptyRepo(dir);
  const merging = isMergeInProgress(root);

  return {
    isRepo: true,
    root,
    branch,
    isDetached: detached,
    isEmpty: empty,
    isMerging: merging
  };
}
