import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectSecrets, detectSecretsInDiff, sanitizeDiffForAI, isSecretFileName } from '../src/security/secretDetector.js';
import { createFileFilter } from '../src/security/fileFilter.js';

describe('Security & Secret Protection Engine', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autocommit-test-security-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('detects AWS access keys in content and diffs', () => {
    const text = 'const awsKey = "AKIAIOSFODNN7EXAMPLE";';
    const res = detectSecrets(text);
    expect(res.hasSecrets).toBe(true);
    expect(res.findings[0].type).toBe('AWS Access Key ID');
  });

  it('detects GitHub personal access tokens', () => {
    const text = 'const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz12";';
    const res = detectSecrets(text);
    expect(res.hasSecrets).toBe(true);
    expect(res.findings[0].type).toBe('GitHub Token');
  });

  it('detects private key blocks', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...';
    const res = detectSecrets(text);
    expect(res.hasSecrets).toBe(true);
    expect(res.findings[0].type).toBe('Private Key Block');
  });

  it('detects secret file names correctly', () => {
    expect(isSecretFileName('.env')).toBe(true);
    expect(isSecretFileName('.env.local')).toBe(true);
    expect(isSecretFileName('id_rsa')).toBe(true);
    expect(isSecretFileName('server.pem')).toBe(true);
    expect(isSecretFileName('private.key')).toBe(true);
    expect(isSecretFileName('credentials.json')).toBe(true);

    expect(isSecretFileName('index.js')).toBe(false);
    expect(isSecretFileName('README.md')).toBe(false);
  });

  it('sanitizes secrets from diff text before AI processing', () => {
    const rawDiff = `
+const secretKey = "AKIAIOSFODNN7EXAMPLE";
+const gh = "ghp_1234567890abcdefghijklmnopqrstuvwxyz12";
+const normalCode = 42;
`;
    const sanitized = sanitizeDiffForAI(rawDiff);
    expect(sanitized).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(sanitized).not.toContain('ghp_1234567890abcdefghijklmnopqrstuvwxyz12');
    expect(sanitized).toContain('[REDACTED_SECRET]');
    expect(sanitized).toContain('normalCode = 42;');
  });

  it('filters files based on .gitignore, custom excludes, and built-in rules', () => {
    // Write .gitignore
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'build/\n*.log\n');

    const filter = createFileFilter(tempDir, ['coverage/**', '*.tmp']);

    const files = [
      'src/index.js',
      '.env',
      'id_rsa',
      'build/bundle.js',
      'error.log',
      'coverage/lcov.info',
      'temp.tmp',
      'docs/guide.md'
    ];

    const { eligible, excluded } = filter.filterFiles(files);

    expect(eligible).toEqual(['src/index.js', 'docs/guide.md']);
    expect(excluded.length).toBe(6);

    const reasons = excluded.map(e => e.path);
    expect(reasons).toContain('.env');
    expect(reasons).toContain('id_rsa');
    expect(reasons).toContain('build/bundle.js');
    expect(reasons).toContain('error.log');
    expect(reasons).toContain('coverage/lcov.info');
    expect(reasons).toContain('temp.tmp');
  });
});
