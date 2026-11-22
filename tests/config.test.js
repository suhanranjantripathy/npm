import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, validateConfig, initConfigFile, DEFAULT_CONFIG } from '../src/config/configManager.js';

describe('Configuration Manager', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autocommit-test-config-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('loads sensible defaults when no config file exists', () => {
    const config = loadConfig(tempDir);
    expect(config.style).toBe('conventional');
    expect(config.maxMessageLength).toBe(72);
    expect(config.ai.enabled).toBe(false);
    expect(config.autoSave.interval).toBe('15m');
    expect(config.exclude).toContain('.env');
  });

  it('validates configuration correctly and rejects invalid values', () => {
    const invalidConfig = {
      style: 'unknown-style',
      maxMessageLength: 10,
      ai: { provider: 'unknown-ai', enabled: 'yes' },
      exclude: 'not-an-array'
    };

    const res = validateConfig(invalidConfig);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('initializes config file safely and rejects overwrite unless forced', () => {
    const configPath = initConfigFile(tempDir);
    expect(fs.existsSync(configPath)).toBe(true);

    // Should throw if initialized again without force
    expect(() => initConfigFile(tempDir, false)).toThrow(/already exists/);

    // Should succeed with force: true
    expect(() => initConfigFile(tempDir, true)).not.toThrow();
  });

  it('applies CLI option overrides on top of file config', () => {
    const config = loadConfig(tempDir, {
      style: 'simple',
      maxMessageLength: 50,
      ai: { enabled: true }
    });

    expect(config.style).toBe('simple');
    expect(config.maxMessageLength).toBe(50);
    expect(config.ai.enabled).toBe(true);
  });
});
