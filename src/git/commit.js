import { getGit, isEmptyRepo, isMergeInProgress } from './repository.js';
import { getRepoStatus } from './status.js';

/**
 * Safely commit only the explicitly specified files.
 * Preserves unrelated staged and unstaged work without side-effects.
 *
 * @param {string} dir Directory of git repository
 * @param {object} options
 * @param {string[]} options.files List of relative file paths to commit
 * @param {string} options.message Commit message
 * @param {string} [options.author] Optional commit author
 * @returns {Promise<{ hash: string, shortHash: string, branch: string, message: string, filesCommitted: string[] }>}
 */
export async function safeCommit(dir = process.cwd(), { files, message, author } = {}) {
  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new Error('No files specified to commit. AutoCommit never blindly commits everything.');
  }

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new Error('Commit message cannot be empty.');
  }

  const git = getGit(dir);

  // Check for merge conflicts
  if (isMergeInProgress(dir)) {
    throw new Error('Merge is in progress with unresolved state. Resolve conflicts before committing.');
  }

  const currentStatus = await getRepoStatus(dir);
  if (currentStatus.hasConflicts) {
    throw new Error(`Merge conflicts detected in: ${currentStatus.conflicted.join(', ')}. Commit aborted.`);
  }

  const empty = await isEmptyRepo(dir);

  // Check existing staged files that should NOT be in this commit
  const alreadyStaged = currentStatus.staged.map(s => s.path);
  const unrelatedStaged = alreadyStaged.filter(p => !files.includes(p));

  try {
    // If there are unrelated files already staged, temporarily unstage them
    if (unrelatedStaged.length > 0) {
      if (empty) {
        await git.raw(['rm', '--cached', '-r', '--', ...unrelatedStaged]);
      } else {
        await git.reset(['HEAD', '--', ...unrelatedStaged]);
      }
    }

    // Stage ONLY the specified files
    await git.add(files);

    // Perform commit
    const commitOptions = {};
    if (author) {
      commitOptions['--author'] = author;
    }

    const commitResult = await git.commit(message.trim(), files, commitOptions);

    // Get the committed hash
    let hash = commitResult.commit;
    if (!hash || hash.length < 5) {
      hash = (await git.revparse(['HEAD'])).trim();
    }
    const shortHash = hash.substring(0, 7);
    const branch = commitResult.branch || currentStatus.currentBranch;

    return {
      hash,
      shortHash,
      branch,
      message: message.trim(),
      filesCommitted: files
    };
  } finally {
    // Always re-stage unrelated files that were previously staged so user's staging state is preserved
    if (unrelatedStaged.length > 0) {
      try {
        await git.add(unrelatedStaged);
      } catch (err) {
        console.warn(`Warning: Could not re-stage previously staged files: ${err.message}`);
      }
    }
  }
}
