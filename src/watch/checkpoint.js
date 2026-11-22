import { getRepoStatus } from '../git/status.js';
import { safeCommit } from '../git/commit.js';
import { checkRepoHealth, getGit } from '../git/repository.js';
import { createFileFilter } from '../security/fileFilter.js';
import { analyzeChanges } from '../analyzer/changeAnalyzer.js';
import { generateCheckpointMessage } from '../generator/messageGenerator.js';
import { saveState } from '../recovery/stateManager.js';
import { getUnstagedDiff, getStagedDiff } from '../git/diff.js';

/**
 * Executes a single automated checkpoint operation
 * @param {string} repoRoot 
 * @param {object} config 
 * @returns {Promise<{ committed: boolean, checkpoint?: object, skippedReason?: string }>}
 */
export async function createCheckpoint(repoRoot = process.cwd(), config = {}) {
  const health = await checkRepoHealth(repoRoot);
  if (!health.isRepo) {
    return { committed: false, skippedReason: 'Not a git repository' };
  }

  if (health.isMerging) {
    return { committed: false, skippedReason: 'Merge in progress with potential conflicts' };
  }

  const status = await getRepoStatus(repoRoot);
  if (status.hasConflicts) {
    return { committed: false, skippedReason: `Merge conflicts in: ${status.conflicted.join(', ')}` };
  }

  // Collect modified and optionally untracked files
  const candidateFiles = new Set([
    ...status.staged.map(s => s.path),
    ...status.unstaged.map(u => u.path)
  ]);

  if (config.autoSave?.includeUntracked) {
    for (const f of status.untracked) {
      candidateFiles.add(f);
    }
  }

  if (candidateFiles.size === 0) {
    return { committed: false, skippedReason: 'No modified or eligible changes to checkpoint' };
  }

  // Filter against exclusions and sensitive secret patterns
  const filter = createFileFilter(repoRoot, config.exclude || []);
  const { eligible, excluded } = filter.filterFiles(Array.from(candidateFiles));

  if (eligible.length === 0) {
    return {
      committed: false,
      skippedReason: `All ${candidateFiles.size} candidate files were excluded or contained sensitive patterns`
    };
  }

  // Analyze changes to create a meaningful checkpoint message
  const [unstagedDiff, stagedDiff] = await Promise.all([
    getUnstagedDiff(repoRoot, eligible),
    getStagedDiff(repoRoot, eligible)
  ]);
  const combinedDiff = `${stagedDiff}\n${unstagedDiff}`.trim();

  const analysis = analyzeChanges({
    filePaths: eligible,
    diffText: combinedDiff
  });

  const commitPrefix = config.autoSave?.commitPrefix || 'checkpoint:';
  const commitMsg = generateCheckpointMessage(analysis, {
    prefix: commitPrefix,
    fileCount: eligible.length
  });

  // Execute safe commit
  try {
    const commitResult = await safeCommit(repoRoot, {
      files: eligible,
      message: commitMsg
    });

    const checkpointMeta = {
      hash: commitResult.hash,
      shortHash: commitResult.shortHash,
      branch: commitResult.branch,
      message: commitResult.message,
      timestamp: new Date().toISOString(),
      filesCount: eligible.length,
      files: eligible
    };

    // Update state file atomically
    saveState(repoRoot, {
      lastBranch: commitResult.branch,
      lastCheckpoint: checkpointMeta,
      lastMonitoringTimestamp: new Date().toISOString(),
      cleanShutdown: false // watch is actively running
    });

    // Handle optional remote push
    if (config.autoSave?.pushToRemote) {
      try {
        const git = getGit(repoRoot);
        const remoteName = config.autoSave.remoteName || 'origin';
        const remoteBranch = config.autoSave.remoteBranch || commitResult.branch;
        // Never force push
        await git.push(remoteName, remoteBranch);
      } catch (err) {
        console.warn(`[AutoCommit Watch] Remote push failed: ${err.message}. Local checkpoint was preserved.`);
      }
    }

    return {
      committed: true,
      checkpoint: checkpointMeta
    };
  } catch (err) {
    return {
      committed: false,
      skippedReason: `Commit failed: ${err.message}`
    };
  }
}
