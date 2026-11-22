import fs from 'node:fs';
import path from 'node:path';
import { getGit } from './repository.js';
import { getRepoStatus } from './status.js';

/**
 * Creates a safe recovery branch at the checkpoint commit
 * @param {string} dir 
 * @param {string} commitHash 
 * @param {string} branchName 
 * @returns {Promise<string>}
 */
export async function createRecoveryBranch(dir = process.cwd(), commitHash, branchName) {
  if (!branchName || typeof branchName !== 'string') {
    throw new Error('Branch name must be provided.');
  }

  const git = getGit(dir);
  try {
    // Create branch at commit without switching to it
    await git.branch([branchName, commitHash]);
    return branchName;
  } catch (err) {
    throw new Error(`Failed to create recovery branch "${branchName}": ${err.message}`);
  }
}

/**
 * Restores specified files from a checkpoint commit safely
 * @param {string} dir 
 * @param {string} commitHash 
 * @param {string[]} filePaths 
 * @param {object} options
 * @param {boolean} [options.backup=true]
 */
export async function restoreFilesFromCheckpoint(dir = process.cwd(), commitHash, filePaths, { backup = true } = {}) {
  if (!filePaths || filePaths.length === 0) {
    throw new Error('No files selected to restore.');
  }

  const git = getGit(dir);
  const status = await getRepoStatus(dir);
  const backedUp = [];

  // Backup dirty files if requested
  if (backup) {
    const backupDir = path.join(dir, '.autocommit', 'backups', `restore-${Date.now()}`);
    for (const filePath of filePaths) {
      const fullPath = path.join(dir, filePath);
      if (fs.existsSync(fullPath)) {
        const dest = path.join(backupDir, filePath);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(fullPath, dest);
        backedUp.push(filePath);
      }
    }
  }

  try {
    // Checkout specific files from commit
    await git.checkout([commitHash, '--', ...filePaths]);
    return {
      restoredFiles: filePaths,
      backedUpFiles: backedUp
    };
  } catch (err) {
    throw new Error(`Failed to restore files from ${commitHash}: ${err.message}`);
  }
}

/**
 * Exports commit diff/patch to a file
 * @param {string} dir 
 * @param {string} commitHash 
 * @param {string} outputPath 
 */
export async function exportCheckpointDiff(dir = process.cwd(), commitHash, outputPath) {
  const git = getGit(dir);
  try {
    const diffText = await git.show([commitHash]);
    const resolvedPath = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, diffText, 'utf8');
    return resolvedPath;
  } catch (err) {
    throw new Error(`Failed to export patch for commit ${commitHash}: ${err.message}`);
  }
}

/**
 * Compares current working tree with a checkpoint commit
 * @param {string} dir 
 * @param {string} commitHash 
 * @returns {Promise<string>}
 */
export async function compareWithWorkingTree(dir = process.cwd(), commitHash) {
  const git = getGit(dir);
  try {
    return await git.diff([commitHash]);
  } catch (err) {
    throw new Error(`Failed to compare with checkpoint ${commitHash}: ${err.message}`);
  }
}
