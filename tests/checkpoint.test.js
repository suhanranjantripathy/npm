import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import { createCheckpoint } from '../src/watch/checkpoint.js';
import { loadState } from '../src/recovery/stateManager.js';
import { safeCommit } from '../src/git/commit.js';
import { getRepoStatus } from '../src/git/status.js';

describe('Checkpoint System Integration', () => {
  let tempDir;
  let git;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autocommit-test-checkpoint-'));
    git = simpleGit(tempDir);
    await git.init();
    await git.addConfig('user.name', 'AutoCommit Checkpoint Tester');
    await git.addConfig('user.email', 'checkpoint@autocommit.local');

    // Create initial commit
    fs.writeFileSync(path.join(tempDir, 'base.txt'), 'base');
    await git.add('base.txt');
    await git.commit('chore: init repo');
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('skips checkpoint when working tree is completely clean', async () => {
    const res = await createCheckpoint(tempDir, {});
    expect(res.committed).toBe(false);
    expect(res.skippedReason).toContain('No modified or eligible changes');
  });

  it('creates automatic checkpoint commit for eligible changes and updates state', async () => {
    // Modify a source file
    fs.mkdirSync(path.join(tempDir, 'src', 'auth'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'auth', 'login.js'), 'export function login() {}\n');

    const config = {
      autoSave: {
        interval: '10m',
        commitPrefix: 'checkpoint:',
        includeUntracked: true
      }
    };

    const res = await createCheckpoint(tempDir, config);
    expect(res.committed).toBe(true);
    expect(res.checkpoint.hash).toBeDefined();
    expect(res.checkpoint.message).toContain('checkpoint: save progress on auth');

    // Verify state was recorded
    const state = loadState(tempDir);
    expect(state.lastCheckpoint).toBeDefined();
    expect(state.lastCheckpoint.hash).toBe(res.checkpoint.hash);
  });

  it('excludes sensitive files (.env) from automated checkpoints', async () => {
    // Create an .env file with a fake secret
    fs.writeFileSync(path.join(tempDir, '.env'), 'DATABASE_PASSWORD=super_secret\n');

    const config = {
      autoSave: {
        includeUntracked: true
      }
    };

    // Should skip since only .env was created and it is protected
    const res = await createCheckpoint(tempDir, config);
    expect(res.committed).toBe(false);
    expect(res.skippedReason).toContain('excluded or contained sensitive patterns');

    // Status check confirms .env was NEVER committed!
    const status = await getRepoStatus(tempDir);
    expect(status.untracked).toContain('.env');
  });
});
