import { describe, it, expect } from 'vitest';
import { classifyFile, analyzeFiles, FILE_CATEGORIES } from '../src/analyzer/fileAnalyzer.js';
import { analyzeChanges, COMMIT_TYPES } from '../src/analyzer/changeAnalyzer.js';
import { groupChanges, shouldSuggestGrouping } from '../src/analyzer/groupAnalyzer.js';

describe('File Analyzer', () => {
  it('correctly classifies documentation files', () => {
    const res = classifyFile('README.md');
    expect(res.category).toBe(FILE_CATEGORIES.DOCS);
    expect(res.scope).toBe('readme');
  });

  it('correctly classifies test files and derives test scope', () => {
    const res = classifyFile('tests/git.test.js');
    expect(res.category).toBe(FILE_CATEGORIES.TEST);
    expect(res.scope).toBe('git');
  });

  it('correctly classifies style files', () => {
    const res = classifyFile('src/components/navbar.css');
    expect(res.category).toBe(FILE_CATEGORIES.STYLE);
    expect(res.scope).toBe('navbar');
  });

  it('correctly classifies build and dependency files', () => {
    const res = classifyFile('package.json');
    expect(res.category).toBe(FILE_CATEGORIES.BUILD);
    expect(res.scope).toBe('deps');
  });

  it('correctly extracts module scope for nested source code', () => {
    const res = classifyFile('src/auth/login.js');
    expect(res.category).toBe(FILE_CATEGORIES.CODE);
    expect(res.scope).toBe('auth');
  });

  it('analyzes a collection of files and determines primary scope and category', () => {
    const files = ['src/auth/login.js', 'src/auth/token.js', 'README.md'];
    const summary = analyzeFiles(files);
    expect(summary.primaryScope).toBe('auth');
    expect(summary.primaryCategory).toBe(FILE_CATEGORIES.CODE);
    expect(summary.files.length).toBe(3);
  });
});

describe('Change Analyzer', () => {
  it('detects fix intent when bug-related keywords are in added lines', () => {
    const diff = `
@@ -1,5 +1,6 @@
+if (!user) {
+  throw new Error('User not found - fix null pointer');
+}
`;
    const analysis = analyzeChanges({
      filePaths: ['src/auth/login.js'],
      diffText: diff
    });

    expect(analysis.type).toBe(COMMIT_TYPES.FIX);
    expect(analysis.scope).toBe('auth');
  });

  it('detects docs intent for markdown modifications', () => {
    const diff = '+# AutoCommit Documentation';
    const analysis = analyzeChanges({
      filePaths: ['README.md'],
      diffText: diff
    });

    expect(analysis.type).toBe(COMMIT_TYPES.DOCS);
    expect(analysis.scope).toBe('readme');
  });

  it('detects test intent for test suite changes', () => {
    const diff = '+it("should validate input", () => {});';
    const analysis = analyzeChanges({
      filePaths: ['tests/auth.test.js'],
      diffText: diff
    });

    expect(analysis.type).toBe(COMMIT_TYPES.TEST);
    expect(analysis.scope).toBe('auth');
  });

  it('extracts changed function name from diff hunk header', () => {
    const diff = `@@ -10,3 +10,6 @@ export function validateUserCredentials(creds) {
+  return creds.username && creds.password;
`;
    const analysis = analyzeChanges({
      filePaths: ['src/auth/validate.js'],
      diffText: diff
    });

    expect(analysis.primaryFunction).toBe('validateUserCredentials');
  });
});

describe('Group Analyzer (Smart Change Grouping)', () => {
  it('identifies unrelated changes across disparate modules', () => {
    const files = [
      'src/auth/login.js',
      'src/components/navbar.jsx',
      'README.md'
    ];

    expect(shouldSuggestGrouping(files)).toBe(true);

    const groups = groupChanges(files);
    expect(groups.length).toBe(3);

    const scopes = groups.map(g => g.scope);
    expect(scopes).toContain('auth');
    expect(scopes).toContain('navbar');
    expect(scopes).toContain('readme');
  });

  it('does not suggest grouping for single file changes', () => {
    expect(shouldSuggestGrouping(['src/auth/login.js'])).toBe(false);
  });

  it('clusters related files in the same module together', () => {
    const files = [
      'src/auth/login.js',
      'src/auth/session.js',
      'README.md'
    ];

    const groups = groupChanges(files);
    expect(groups.length).toBe(2);

    const authGroup = groups.find(g => g.scope === 'auth');
    expect(authGroup).toBeDefined();
    expect(authGroup.files).toEqual(['src/auth/login.js', 'src/auth/session.js']);
  });
});
