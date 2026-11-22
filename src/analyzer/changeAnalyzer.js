import { parseDiffStats } from '../git/diff.js';
import { analyzeFiles, FILE_CATEGORIES } from './fileAnalyzer.js';

export const COMMIT_TYPES = {
  FEAT: 'feat',
  FIX: 'fix',
  DOCS: 'docs',
  STYLE: 'style',
  REFACTOR: 'refactor',
  PERF: 'perf',
  TEST: 'test',
  BUILD: 'build',
  CI: 'ci',
  CHORE: 'chore'
};

const FIX_KEYWORDS = /\b(fix|bug|error|issue|problem|patch|handle|null|undefined|invalid|crash|fail|exception)\b/i;
const PERF_KEYWORDS = /\b(perf|performance|optimize|cache|memo|debounce|throttle|speed|latency)\b/i;
const REFACTOR_KEYWORDS = /\b(refactor|clean|simplify|extract|restructure|reorganize)\b/i;
const FEAT_KEYWORDS = /\b(add|create|implement|new|feature|support|introduce|allow)\b/i;

/**
 * Analyzes Git diff and changed files to determine change characteristics and intent
 * @param {object} params
 * @param {string[]} params.filePaths
 * @param {string} params.diffText
 * @param {string[]} [params.untrackedFiles]
 * @param {string[]} [params.deletedFiles]
 */
export function analyzeChanges({ filePaths = [], diffText = '', untrackedFiles = [], deletedFiles = [] } = {}) {
  const fileSummary = analyzeFiles(filePaths);
  const diffStats = parseDiffStats(diffText);

  // Check category-based type first
  if (fileSummary.primaryCategory === FILE_CATEGORIES.DOCS) {
    return {
      type: COMMIT_TYPES.DOCS,
      scope: fileSummary.primaryScope,
      intent: 'update documentation',
      fileSummary,
      diffStats
    };
  }

  if (fileSummary.primaryCategory === FILE_CATEGORIES.TEST) {
    return {
      type: COMMIT_TYPES.TEST,
      scope: fileSummary.primaryScope,
      intent: 'add or update tests',
      fileSummary,
      diffStats
    };
  }

  if (fileSummary.primaryCategory === FILE_CATEGORIES.CI) {
    return {
      type: COMMIT_TYPES.CI,
      scope: 'ci',
      intent: 'update CI/CD configuration',
      fileSummary,
      diffStats
    };
  }

  if (fileSummary.primaryCategory === FILE_CATEGORIES.STYLE) {
    return {
      type: COMMIT_TYPES.STYLE,
      scope: fileSummary.primaryScope,
      intent: 'update styling and UI appearance',
      fileSummary,
      diffStats
    };
  }

  if (fileSummary.primaryCategory === FILE_CATEGORIES.BUILD) {
    return {
      type: COMMIT_TYPES.BUILD,
      scope: fileSummary.primaryScope,
      intent: 'update build configuration and dependencies',
      fileSummary,
      diffStats
    };
  }

  // Scan added diff lines for intent keywords
  const addedLines = diffText
    .split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .map(l => l.substring(1))
    .join(' ');

  let type = COMMIT_TYPES.FEAT;
  let intent = 'update functionality';

  if (FIX_KEYWORDS.test(addedLines)) {
    type = COMMIT_TYPES.FIX;
    intent = 'resolve issue or error condition';
  } else if (PERF_KEYWORDS.test(addedLines)) {
    type = COMMIT_TYPES.PERF;
    intent = 'optimize performance';
  } else if (REFACTOR_KEYWORDS.test(addedLines)) {
    type = COMMIT_TYPES.REFACTOR;
    intent = 'refactor code structure';
  } else if (diffStats.additions > 0 && diffStats.deletions === 0) {
    type = COMMIT_TYPES.FEAT;
    intent = 'add new functionality';
  } else if (diffStats.deletions > 0 && diffStats.additions === 0) {
    type = COMMIT_TYPES.REFACTOR;
    intent = 'remove unused code';
  } else if (Math.abs(diffStats.additions - diffStats.deletions) < 10 && diffStats.totalLines > 20) {
    type = COMMIT_TYPES.REFACTOR;
    intent = 'refactor implementation';
  }

  // Extract function or feature specifics
  let primaryFunction = null;
  if (diffStats.functionsChanged.length > 0) {
    // Pick the most relevant function name from diff hunks
    primaryFunction = diffStats.functionsChanged[0]
      .replace(/^(?:async\s+|export\s+|function\s+|class\s+|const\s+|let\s+|var\s+)+/, '')
      .split(/[\(\{\:]/)[0]
      .trim();
  }

  return {
    type,
    scope: fileSummary.primaryScope,
    intent,
    primaryFunction,
    fileSummary,
    diffStats
  };
}
