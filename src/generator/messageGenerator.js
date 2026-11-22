import { buildCommitMessage } from './ruleEngine.js';
import { analyzeChanges, COMMIT_TYPES } from '../analyzer/changeAnalyzer.js';
import { FILE_CATEGORIES } from '../analyzer/fileAnalyzer.js';

/**
 * Generates 3 distinct commit suggestions based on change analysis
 * @param {object} analysis Analysis result from analyzeChanges
 * @param {object} options
 * @param {string} [options.style='conventional']
 * @param {number} [options.maxLength=72]
 * @param {number} [options.variation=0]
 * @returns {string[]} Array of 3 distinct commit messages
 */
export function generateSuggestions(analysis, options = {}) {
  const { type, scope, intent, primaryFunction, fileSummary, diffStats } = analysis;
  const { style = 'conventional', maxLength = 72, variation = 0 } = options;

  const suggestions = [];

  // Suggestion 1: Primary action-oriented conventional message
  let primaryDesc = '';
  if (primaryFunction) {
    if (type === COMMIT_TYPES.FEAT) {
      primaryDesc = `add ${primaryFunction}`;
    } else if (type === COMMIT_TYPES.FIX) {
      primaryDesc = `fix issue in ${primaryFunction}`;
    } else if (type === COMMIT_TYPES.TEST) {
      primaryDesc = `add tests for ${primaryFunction}`;
    } else {
      primaryDesc = `update ${primaryFunction}`;
    }
  } else if (fileSummary.primaryCategory === FILE_CATEGORIES.DOCS) {
    primaryDesc = `update ${scope} documentation`;
  } else if (fileSummary.primaryCategory === FILE_CATEGORIES.TEST) {
    primaryDesc = `add unit tests for ${scope}`;
  } else if (fileSummary.primaryCategory === FILE_CATEGORIES.STYLE) {
    primaryDesc = `improve styling for ${scope}`;
  } else if (fileSummary.primaryCategory === FILE_CATEGORIES.BUILD) {
    primaryDesc = `update dependencies and build configuration`;
  } else {
    primaryDesc = `${intent || 'update'} ${scope}`;
  }

  suggestions.push(
    buildCommitMessage({
      type,
      scope,
      description: primaryDesc,
      style,
      maxLength
    })
  );

  // Suggestion 2: Specific/alternate scope or action variant
  let altScope = scope;
  if (fileSummary.files.length > 1) {
    // Pick secondary scope if available
    const otherScope = Object.keys(fileSummary.scopeCounts).find(s => s !== scope);
    if (otherScope) altScope = otherScope;
  }

  let secondaryDesc = '';
  if (type === COMMIT_TYPES.FEAT) {
    secondaryDesc = `implement ${altScope} functionality`;
  } else if (type === COMMIT_TYPES.FIX) {
    secondaryDesc = `handle error conditions in ${altScope}`;
  } else if (type === COMMIT_TYPES.DOCS) {
    secondaryDesc = `document ${altScope} setup and usage`;
  } else if (type === COMMIT_TYPES.TEST) {
    secondaryDesc = `expand test coverage for ${altScope}`;
  } else if (type === COMMIT_TYPES.STYLE) {
    secondaryDesc = `refine UI layout and theme in ${altScope}`;
  } else {
    secondaryDesc = `refactor and streamline ${altScope}`;
  }

  suggestions.push(
    buildCommitMessage({
      type,
      scope: altScope,
      description: secondaryDesc,
      style,
      maxLength
    })
  );

  // Suggestion 3: Intent/defensive or alternative type variant
  let tertiaryType = type;
  let tertiaryDesc = '';

  if (type === COMMIT_TYPES.FEAT) {
    tertiaryType = COMMIT_TYPES.REFACTOR;
    tertiaryDesc = `restructure ${scope} implementation`;
  } else if (type === COMMIT_TYPES.FIX) {
    tertiaryType = COMMIT_TYPES.FEAT;
    tertiaryDesc = `prevent invalid state in ${scope}`;
  } else if (type === COMMIT_TYPES.REFACTOR) {
    tertiaryType = COMMIT_TYPES.PERF;
    tertiaryDesc = `optimize ${scope} execution`;
  } else {
    tertiaryType = COMMIT_TYPES.CHORE;
    tertiaryDesc = `maintain and update ${scope}`;
  }

  suggestions.push(
    buildCommitMessage({
      type: tertiaryType,
      scope,
      description: tertiaryDesc,
      style,
      maxLength
    })
  );

  // If variation > 0, vary descriptions slightly
  if (variation > 0) {
    return suggestions.map((msg, idx) => {
      const prefixes = ['enhance', 'complete', 'review'];
      return msg.replace(/: [a-z]+/, `: ${prefixes[(idx + variation) % prefixes.length]}`);
    });
  }

  return suggestions;
}

/**
 * Generate checkpoint commit message
 * @param {object} analysis 
 * @param {object} [options]
 * @param {string} [options.prefix='checkpoint:']
 * @param {number} [options.fileCount=1]
 */
export function generateCheckpointMessage(analysis, { prefix = 'checkpoint:', fileCount = 1 } = {}) {
  const scope = analysis?.scope || 'workspace';
  const cleanPrefix = prefix.endsWith(':') ? prefix : `${prefix}:`;
  const countDesc = fileCount === 1 ? '1 file' : `${fileCount} files`;

  return `${cleanPrefix} save progress on ${scope} (${countDesc})`;
}
