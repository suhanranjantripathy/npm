import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import { isGitRepo, getRepoRoot, getCurrentBranch, isEmptyRepo, checkRepoHealth } from '../src/git/repository.js';
import { getRepoStatus } from '../src/git/status.js';
import { getStagedDiff, getUnstagedDiff, parseDiffStats } from '../src/git/diff.js';
import { safeCommit } from '../src/git/commit.js';

describe('Git Engine Integration', () => {
  let tempDir;
  let git;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autocommit-test-git-'));
    git = simpleGit(tempDir);
    await git.init();
    await git.addConfig('user.name', 'AutoCommit Test');
    await git.addConfig('user.email', 'test@autocommit.local');
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('detects a valid Git repository and identifies empty repo status', async () => {
    const isRepo = await isGitRepo(tempDir);
    expect(isRepo).toBe(true);

    const empty = await isEmptyRepo(tempDir);
    expect(empty).toBe(true);

    const health = await checkRepoHealth(tempDir);
    expect(health.isRepo).toBe(true);
    expect(health.isEmpty).toBe(true);
  });

  it('correctly tracks untracked, staged, and modified files', async () => {
    // 1. Untracked file
    const file1 = path.join(tempDir, 'file1.txt');
    fs.writeFileSync(file1, 'hello world\n');

    let status = await getRepoStatus(tempDir);
    expect(status.untracked).toContain('file1.txt');
    expect(status.isClean).toBe(false);

    // 2. Stage file
    await git.add('file1.txt');
    status = await getRepoStatus(tempDir);
    expect(status.staged.some(s => s.path === 'file1.txt')).toBe(true);

    // 3. Initial commit
    const commitRes = await safeCommit(tempDir, {
      files: ['file1.txt'],
      message: 'feat: initial commit'
    });
    expect(commitRes.hash).toBeDefined();

    const emptyAfterCommit = await isEmptyRepo(tempDir);
    expect(emptyAfterCommit).toBe(false);

    // 4. Modify committed file
    fs.appendFileSync(file1, 'second line\n');
    status = await getRepoStatus(tempDir);
    expect(status.unstaged.some(u => u.path === 'file1.txt')).toBe(true);
  });

  it('safely commits only specified files without committing unrelated staged files', async () => {
    // Commit an initial file
    fs.writeFileSync(path.join(tempDir, 'init.txt'), 'init');
    await git.add('init.txt');
    await git.commit('chore: init');

    // Create file A and stage it
    fs.writeFileSync(path.join(tempDir, 'fileA.txt'), 'content A');
    await git.add('fileA.txt');

    // Create file B and do NOT stage it
    fs.writeFileSync(path.join(tempDir, 'fileB.txt'), 'content B');

    // Now invoke safeCommit for ONLY fileB.txt
    const commitResult = await safeCommit(tempDir, {
      files: ['fileB.txt'],
      message: 'feat(b): add file b'
    });

    expect(commitResult.filesCommitted).toEqual(['fileB.txt']);

    // Check status after commit:
    // fileA.txt MUST STILL BE STAGED, preserved exactly as the user had it!
    const postStatus = await getRepoStatus(tempDir);
    expect(postStatus.staged.some(s => s.path === 'fileA.txt')).toBe(true);
    expect(postStatus.modified.some(m => m === 'fileB.txt')).toBe(false);
  });

  it('parses diff stats and additions/deletions accurately', async () => {
    fs.writeFileSync(path.join(tempDir, 'sample.txt'), 'line 1\nline 2\n');
    await git.add('sample.txt');
    await git.commit('chore: base');

    fs.writeFileSync(path.join(tempDir, 'sample.txt'), 'line 1\nline 2 modified\nline 3 added\n');
    const unstagedDiff = await getUnstagedDiff(tempDir, ['sample.txt']);
    const stats = parseDiffStats(unstagedDiff);

    expect(stats.additions).toBeGreaterThanOrEqual(1);
    expect(stats.deletions).toBeGreaterThanOrEqual(1);
    expect(stats.files).toContain('sample.txt');
  });
});
