import { getGit } from './repository.js';

/**
 * Parses simple-git status into a structured object
 * @param {string} dir 
 */
export async function getRepoStatus(dir = process.cwd()) {
  const git = getGit(dir);
  const status = await git.status();

  const staged = [];
  const unstaged = [];
  const untracked = [...status.not_added];
  const conflicted = [...status.conflicted];
  const renamed = status.renamed.map(r => ({ from: r.from, to: r.to }));
  const deleted = [...status.deleted];
  const modified = [...status.modified];
  const created = [...status.created];

  // In simple-git status.files:
  // index: staged status ('M', 'A', 'D', 'R', etc. or ' ' if not staged)
  // working_dir: unstaged status ('M', 'D', '?', etc.)
  for (const file of status.files) {
    if (file.index && file.index !== ' ' && file.index !== '?') {
      staged.push({
        path: file.path,
        status: file.index
      });
    }

    if (file.working_dir && file.working_dir !== ' ' && file.working_dir !== '?') {
      unstaged.push({
        path: file.path,
        status: file.working_dir
      });
    }
  }

  const isClean = status.isClean();
  const hasConflicts = conflicted.length > 0;
  const totalChanges = staged.length + unstaged.length + untracked.length;

  return {
    raw: status,
    currentBranch: status.current || 'HEAD (detached)',
    trackingBranch: status.tracking,
    ahead: status.ahead,
    behind: status.behind,
    staged,
    unstaged,
    untracked,
    conflicted,
    renamed,
    deleted,
    modified,
    created,
    isClean,
    hasConflicts,
    totalChanges
  };
}
