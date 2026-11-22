import path from 'node:path';

export const FILE_CATEGORIES = {
  DOCS: 'docs',
  TEST: 'test',
  STYLE: 'style',
  CONFIG: 'config',
  BUILD: 'build',
  CI: 'ci',
  CODE: 'code'
};

/**
 * Classifies a single file by category, extension, and detected scope
 * @param {string} filePath 
 */
export function classifyFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const ext = path.extname(normalized).toLowerCase();
  const base = path.basename(normalized).toLowerCase();
  const parts = normalized.split('/').filter(Boolean);

  let category = FILE_CATEGORIES.CODE;
  let scope = 'app';

  // Docs
  if (
    normalized.startsWith('docs/') ||
    base === 'readme.md' ||
    base === 'contributing.md' ||
    base === 'changelog.md' ||
    base === 'license' ||
    base === 'license.md' ||
    ext === '.md'
  ) {
    category = FILE_CATEGORIES.DOCS;
    scope = base.replace(/\.md$/, '');
    return { path: filePath, category, scope, ext };
  }

  // Tests
  if (
    normalized.includes('/tests/') ||
    normalized.includes('/test/') ||
    normalized.includes('/__tests__/') ||
    normalized.startsWith('tests/') ||
    normalized.startsWith('test/') ||
    base.includes('.test.') ||
    base.includes('.spec.')
  ) {
    category = FILE_CATEGORIES.TEST;
    // Derive scope from test name or parent folder
    const cleanBase = base.replace(/(\.test|\.spec)\.[a-z0-9]+$/, '');
    scope = cleanBase !== 'index' ? cleanBase : (parts.length > 2 ? parts[parts.length - 2] : 'tests');
    return { path: filePath, category, scope, ext };
  }

  // CI
  if (
    normalized.startsWith('.github/') ||
    normalized.startsWith('.gitlab/') ||
    base === '.travis.yml' ||
    base === 'jenkinsfile' ||
    base === '.gitlab-ci.yml'
  ) {
    category = FILE_CATEGORIES.CI;
    scope = 'ci';
    return { path: filePath, category, scope, ext };
  }

  // Build / Package
  if (
    base === 'package.json' ||
    base === 'package-lock.json' ||
    base === 'pnpm-lock.yaml' ||
    base === 'yarn.lock' ||
    base === 'dockerfile' ||
    base === 'docker-compose.yml' ||
    base === 'makefile' ||
    base.includes('webpack') ||
    base.includes('vite.config') ||
    base.includes('rollup.config')
  ) {
    category = FILE_CATEGORIES.BUILD;
    scope = base === 'package.json' ? 'deps' : 'build';
    return { path: filePath, category, scope, ext };
  }

  // Styles
  if (['.css', '.scss', '.sass', '.less', '.styl'].includes(ext)) {
    category = FILE_CATEGORIES.STYLE;
    scope = base.replace(ext, '');
    return { path: filePath, category, scope, ext };
  }

  // Config
  if (
    base.endsWith('.config.js') ||
    base.endsWith('.config.json') ||
    base.endsWith('.config.mjs') ||
    base.endsWith('.config.ts') ||
    base === 'tsconfig.json' ||
    base.startsWith('.eslintrc') ||
    base.startsWith('.prettierrc')
  ) {
    category = FILE_CATEGORIES.CONFIG;
    scope = base.split('.')[0] || 'config';
    return { path: filePath, category, scope, ext };
  }

  // Code files - derive meaningful scope from folder structure or filename
  // Examples: src/auth/login.js -> 'auth'
  // src/components/navbar.jsx -> 'navbar'
  // api/users/controller.js -> 'users'
  if (parts.length >= 3 && (parts[0] === 'src' || parts[0] === 'lib' || parts[0] === 'app')) {
    if (['components', 'pages', 'views', 'modules', 'controllers', 'routes', 'services'].includes(parts[1]) && parts[2]) {
      scope = path.basename(parts[2], ext);
    } else {
      scope = parts[1];
    }
  } else if (parts.length >= 2) {
    scope = parts[0];
  } else {
    scope = base.replace(ext, '') || 'core';
  }

  return { path: filePath, category, scope, ext };
}

/**
 * Analyzes a collection of file paths
 * @param {string[]} filePaths 
 */
export function analyzeFiles(filePaths = []) {
  const classified = filePaths.map(classifyFile);

  const scopeCounts = {};
  const categoryCounts = {};

  for (const item of classified) {
    scopeCounts[item.scope] = (scopeCounts[item.scope] || 0) + 1;
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  }

  // Determine primary scope
  let primaryScope = 'core';
  let maxScopeCount = 0;
  for (const [scope, count] of Object.entries(scopeCounts)) {
    if (count > maxScopeCount) {
      maxScopeCount = count;
      primaryScope = scope;
    }
  }

  // Determine primary category
  let primaryCategory = FILE_CATEGORIES.CODE;
  let maxCatCount = 0;
  for (const [cat, count] of Object.entries(categoryCounts)) {
    if (count > maxCatCount) {
      maxCatCount = count;
      primaryCategory = cat;
    }
  }

  return {
    files: classified,
    primaryScope,
    primaryCategory,
    scopeCounts,
    categoryCounts
  };
}
