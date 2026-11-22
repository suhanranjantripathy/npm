import { getGit, isEmptyRepo } from './repository.js';

/**
 * Retrieves checkpoint commit history
 * @param {string} dir 
 * @param {object} options
 * @param {number} [options.maxCount=50]
 * @param {string} [options.prefix='checkpoint:']
 * @returns {Promise<Array<{ hash: string, shortHash: string, date: string, message: string, author: string, filesChanged?: number }>>}
 */
export async function getCheckpointHistory(dir = process.cwd(), { maxCount = 50, prefix = 'checkpoint:' } = {}) {
  const empty = await isEmptyRepo(dir);
  if (empty) {
    return [];
  }

  const git = getGit(dir);
  const logResult = await git.log({ maxCount });

  const normalizedPrefix = prefix.toLowerCase().trim();

  const checkpoints = [];
  for (const commit of logResult.all) {
    const isCheckpoint = commit.message.toLowerCase().startsWith(normalizedPrefix) ||
      commit.message.includes('[autocommit]') ||
      commit.body.includes('[autocommit-checkpoint]');

    if (isCheckpoint) {
      checkpoints.push({
        hash: commit.hash,
        shortHash: commit.hash.substring(0, 7),
        date: commit.date,
        message: commit.message,
        body: commit.body,
        author: commit.author_name,
        email: commit.author_email
      });
    }
  }

  return checkpoints;
}

/**
 * Get diff for a specific commit
 * @param {string} dir 
 * @param {string} commitHash 
 * @returns {Promise<string>}
 */
export async function getCommitDiff(dir = process.cwd(), commitHash) {
  const git = getGit(dir);
  try {
    return await git.show([commitHash]);
  } catch (err) {
    throw new Error(`Failed to retrieve diff for commit ${commitHash}: ${err.message}`);
  }
}

/**
 * Get detailed metadata and changed files for a commit
 * @param {string} dir 
 * @param {string} commitHash 
 */
export async function getCommitDetails(dir = process.cwd(), commitHash) {
  const git = getGit(dir);
  try {
    const showOutput = await git.show(['--stat', '--name-status', commitHash]);
    const filesOutput = await git.show(['--name-only', '--format=', commitHash]);
    const files = filesOutput.split('\n').map(f => f.trim()).filter(Boolean);

    return {
      hash: commitHash,
      shortHash: commitHash.substring(0, 7),
      files,
      details: showOutput
    };
  } catch (err) {
    throw new Error(`Failed to inspect commit ${commitHash}: ${err.message}`);
  }
}
