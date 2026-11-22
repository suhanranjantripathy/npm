import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import { loadState, saveState, getStateFilePath } from '../src/recovery/stateManager.js';
import { detectCrash, resolveCrashState } from '../src/recovery/crashDetector.js';
import { createRecoveryBranch, restoreFilesFromCheckpoint, exportCheckpointDiff, compareWithWorkingTree } from '../src/git/recovery.js';
import { safeCommit } from '../src/git/commit.js';

describe('Crash Recovery Protection System', () => {
  let tempDir;
  let git;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autocommit-test-recovery-'));
    git = simpleGit(tempDir);
    await git.init();
    await git.addConfig('user.name', 'AutoCommit Recovery Tester');
    await git.addConfig('user.email', 'recovery@autocommit.local');

    // Base initial commit
    fs.writeFileSync(path.join(tempDir, 'main.js'), 'console.log("hello");\n');
    await git.add('main.js');
    await git.commit('chore: initial commit');
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('performs atomic state saves and gracefully recovers from corrupted state files', () => {
    const saved = saveState(tempDir, {
      monitoringActive: true,
      cleanShutdown: false,
      lastBranch: 'main'
    });

    expect(saved.monitoringActive).toBe(true);

    const loaded = loadState(tempDir);
    expect(loaded.monitoringActive).toBe(true);
    expect(loaded.lastBranch).toBe('main');

    // Intentionally corrupt the state file
    const statePath = getStateFilePath(tempDir);
    fs.writeFileSync(statePath, '{ invalid json corrupted !!!', 'utf8');

    // loadState should catch corruption and return clean default state without crashing
    const fallback = loadState(tempDir);
    expect(fallback.monitoringActive).toBe(false);
  });

  it('detects an interrupted monitoring session and identifies uncommitted changes', async () => {
    // Simulate abnormal crash: state says monitoring was active without clean shutdown
    saveState(tempDir, {
      monitoringActive: true,
      cleanShutdown: false,
      lastBranch: 'main',
      lastCheckpoint: { hash: 'abc1234', message: 'checkpoint: save progress' }
    });

    // Add uncommitted changes
    fs.writeFileSync(path.join(tempDir, 'uncommitted.js'), 'export const uncommitted = true;\n');

    const crash = await detectCrash(tempDir);
    expect(crash.hasCrash).toBe(true);
    expect(crash.uncommittedCount).toBeGreaterThanOrEqual(1);

    // Resolving crash clears active flag
    resolveCrashState(tempDir);
    const postResolveState = loadState(tempDir);
    expect(postResolveState.monitoringActive).toBe(false);
    expect(postResolveState.cleanShutdown).toBe(true);
  });

  it('creates safe recovery branches without touching current working branch', async () => {
    // Create a checkpoint commit
    fs.writeFileSync(path.join(tempDir, 'feature.js'), 'const a = 1;\n');
    const commit = await safeCommit(tempDir, {
      files: ['feature.js'],
      message: 'checkpoint: save progress on feature'
    });

    const recoveryBranch = await createRecoveryBranch(tempDir, commit.hash, 'recovery/test-checkpoint');
    expect(recoveryBranch).toBe('recovery/test-checkpoint');

    const branchSummary = await git.branch();
    expect(branchSummary.all).toContain('recovery/test-checkpoint');
    // Ensure user was NOT moved off main branch
    expect(branchSummary.current).toBe('main');
  });

  it('exports checkpoint diff to patch file and compares with working tree', async () => {
    fs.writeFileSync(path.join(tempDir, 'app.js'), 'version 1\n');
    const commit = await safeCommit(tempDir, {
      files: ['app.js'],
      message: 'checkpoint: save app v1'
    });

    // Export patch
    const patchPath = path.join(tempDir, 'export.patch');
    const exported = await exportCheckpointDiff(tempDir, commit.hash, patchPath);
    expect(fs.existsSync(exported)).toBe(true);
    const patchContent = fs.readFileSync(exported, 'utf8');
    expect(patchContent).toContain('checkpoint: save app v1');

    // Modify working tree and compare
    fs.writeFileSync(path.join(tempDir, 'app.js'), 'version 2 modified\n');
    const diff = await compareWithWorkingTree(tempDir, commit.hash);
    expect(diff).toContain('+version 2 modified');
  });

  it('safely restores files from checkpoint while backing up modified files', async () => {
    fs.writeFileSync(path.join(tempDir, 'important.js'), 'original code\n');
    const commit = await safeCommit(tempDir, {
      files: ['important.js'],
      message: 'checkpoint: original'
    });

    // Modify important.js in working tree
    fs.writeFileSync(path.join(tempDir, 'important.js'), 'accidentally modified code\n');

    const restoreRes = await restoreFilesFromCheckpoint(tempDir, commit.hash, ['important.js'], { backup: true });
    expect(restoreRes.restoredFiles).toContain('important.js');
    expect(restoreRes.backedUpFiles).toContain('important.js');

    // Content should be restored to original
    const restoredContent = fs.readFileSync(path.join(tempDir, 'important.js'), 'utf8');
    expect(restoredContent).toBe('original code\n');
  });
});
