import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseInterval, Scheduler } from '../src/watch/scheduler.js';
import { acquireLock, releaseLock, getLockInfo } from '../src/watch/lockManager.js';
import { sendSignal, consumeSignal } from '../src/watch/sessionManager.js';

describe('Watch Mode & Scheduler', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autocommit-test-watch-'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (tempDir && fs.existsSync(tempDir)) {
      releaseLock(tempDir);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('parses interval strings accurately into milliseconds', () => {
    expect(parseInterval('5m')).toBe(5 * 60 * 1000);
    expect(parseInterval('10m')).toBe(10 * 60 * 1000);
    expect(parseInterval('15m')).toBe(15 * 60 * 1000);
    expect(parseInterval('30m')).toBe(30 * 60 * 1000);
    expect(parseInterval('1h')).toBe(60 * 60 * 1000);
    expect(parseInterval('45s')).toBe(45 * 1000);
    expect(() => parseInterval('invalid')).toThrow(/Invalid interval format/);
  });

  it('executes scheduled callback when interval expires using fake timers', async () => {
    vi.useFakeTimers();

    let triggerCount = 0;
    const scheduler = new Scheduler({
      interval: '5m',
      onTrigger: () => {
        triggerCount++;
      }
    });

    scheduler.start();
    expect(triggerCount).toBe(0);

    // Fast-forward 5 minutes
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(triggerCount).toBe(1);

    // Fast-forward another 5 minutes
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(triggerCount).toBe(2);

    scheduler.stop();
  });

  it('respects pause, resume, and reset in scheduler', async () => {
    vi.useFakeTimers();

    let triggerCount = 0;
    const scheduler = new Scheduler({
      interval: '10m',
      onTrigger: () => {
        triggerCount++;
      }
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(triggerCount).toBe(0);

    // Pause timer
    scheduler.pause();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(triggerCount).toBe(0); // Paused, no trigger

    // Resume timer
    scheduler.resume();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(triggerCount).toBe(1);

    scheduler.stop();
  });

  it('acquires lock, prevents duplicate instances, and cleans up stale locks', () => {
    // 1. Acquire initial lock
    const res1 = acquireLock(tempDir, { interval: '10m' });
    expect(res1.acquired).toBe(true);

    const lockInfo = getLockInfo(tempDir);
    expect(lockInfo.active).toBe(true);
    expect(lockInfo.pid).toBe(process.pid);

    // 2. Attempt duplicate lock while current process is alive
    const res2 = acquireLock(tempDir, { interval: '10m' });
    expect(res2.acquired).toBe(false);
    expect(res2.error).toContain('Another AutoCommit watch process');

    // 3. Simulate stale lock with non-existent dead PID
    const lockPath = path.join(tempDir, '.autocommit', 'autocommit.lock');
    const staleData = { pid: 99999999, startTime: new Date().toISOString() };
    fs.writeFileSync(lockPath, JSON.stringify(staleData), 'utf8');

    // Acquire should detect dead process, clear stale lock, and succeed!
    const res3 = acquireLock(tempDir, { interval: '10m' });
    expect(res3.acquired).toBe(true);

    // 4. Release lock
    const released = releaseLock(tempDir);
    expect(released).toBe(true);
    expect(getLockInfo(tempDir)).toBeNull();
  });

  it('sends and consumes control signals (pause, resume, stop)', () => {
    sendSignal(tempDir, 'pause');
    const signal1 = consumeSignal(tempDir);
    expect(signal1).toBeDefined();
    expect(signal1.action).toBe('pause');

    // Signal file should be consumed and gone
    expect(consumeSignal(tempDir)).toBeNull();

    sendSignal(tempDir, 'resume');
    const signal2 = consumeSignal(tempDir);
    expect(signal2.action).toBe('resume');
  });
});
