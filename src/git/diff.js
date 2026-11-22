import { getGit } from './repository.js';

/**
 * Get unified diff for staged changes
 * @param {string} dir 
 * @param {string[]} [filePaths] 
 * @returns {Promise<string>}
 */
export async function getStagedDiff(dir = process.cwd(), filePaths = []) {
  const git = getGit(dir);
  const args = ['--cached'];
  if (filePaths && filePaths.length > 0) {
    args.push('--', ...filePaths);
  }
  try {
    return await git.diff(args);
  } catch (err) {
    return '';
  }
}

/**
 * Get unified diff for unstaged changes
 * @param {string} dir 
 * @param {string[]} [filePaths] 
 * @returns {Promise<string>}
 */
export async function getUnstagedDiff(dir = process.cwd(), filePaths = []) {
  const git = getGit(dir);
  const args = [];
  if (filePaths && filePaths.length > 0) {
    args.push('--', ...filePaths);
  }
  try {
    return await git.diff(args);
  } catch (err) {
    return '';
  }
}

/**
 * Get diff for a specific file (staged or unstaged)
 * @param {string} dir 
 * @param {string} filePath 
 * @param {boolean} staged 
 * @returns {Promise<string>}
 */
export async function getFileDiff(dir = process.cwd(), filePath, staged = false) {
  return staged ? getStagedDiff(dir, [filePath]) : getUnstagedDiff(dir, [filePath]);
}

/**
 * Parses unified diff stats: additions, deletions, modified functions
 * @param {string} diffText 
 */
export function parseDiffStats(diffText) {
  if (!diffText || typeof diffText !== 'string') {
    return {
      additions: 0,
      deletions: 0,
      totalLines: 0,
      functionsChanged: [],
      files: []
    };
  }

  let additions = 0;
  let deletions = 0;
  const functionsChanged = new Set();
  const files = new Set();

  const lines = diffText.split('\n');
  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      files.add(line.substring(6));
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    } else if (line.startsWith('@@')) {
      // Diff hunk header: @@ -1,4 +1,5 @@ functionName(args)
      const match = line.match(/@@\s+[^@]+@@\s*(.*)$/);
      if (match && match[1]) {
        const header = match[1].trim();
        if (header) {
          functionsChanged.add(header);
        }
      }
    }
  }

  return {
    additions,
    deletions,
    totalLines: additions + deletions,
    functionsChanged: Array.from(functionsChanged),
    files: Array.from(files)
  };
}
