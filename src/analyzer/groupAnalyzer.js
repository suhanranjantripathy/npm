import { classifyFile, FILE_CATEGORIES } from './fileAnalyzer.js';

/**
 * Group files logically based on directory, module, category, and scope
 * @param {string[]} filePaths 
 * @returns {Array<{ id: string, scope: string, category: string, files: string[], suggestedType: string }>}
 */
export function groupChanges(filePaths = []) {
  if (!filePaths || filePaths.length === 0) {
    return [];
  }

  const clusters = new Map();

  for (const filePath of filePaths) {
    const info = classifyFile(filePath);
    // Key by scope + category for precise logical grouping
    const groupKey = `${info.category}:${info.scope}`;

    if (!clusters.has(groupKey)) {
      clusters.set(groupKey, {
        scope: info.scope,
        category: info.category,
        files: []
      });
    }

    clusters.get(groupKey).files.push(filePath);
  }

  const groups = [];
  let index = 1;

  for (const [key, cluster] of clusters.entries()) {
    let suggestedType = 'feat';

    switch (cluster.category) {
      case FILE_CATEGORIES.DOCS:
        suggestedType = 'docs';
        break;
      case FILE_CATEGORIES.TEST:
        suggestedType = 'test';
        break;
      case FILE_CATEGORIES.STYLE:
        suggestedType = 'style';
        break;
      case FILE_CATEGORIES.BUILD:
        suggestedType = 'build';
        break;
      case FILE_CATEGORIES.CI:
        suggestedType = 'ci';
        break;
      case FILE_CATEGORIES.CONFIG:
        suggestedType = 'chore';
        break;
      default:
        suggestedType = 'feat';
        break;
    }

    groups.push({
      id: `group-${index++}`,
      scope: cluster.scope,
      category: cluster.category,
      files: cluster.files,
      suggestedType
    });
  }

  return groups;
}

/**
 * Determine if grouping is recommended (e.g. changes span multiple distinct components)
 * @param {string[]} filePaths 
 * @returns {boolean}
 */
export function shouldSuggestGrouping(filePaths = []) {
  if (filePaths.length <= 1) return false;
  const groups = groupChanges(filePaths);
  return groups.length > 1;
}
