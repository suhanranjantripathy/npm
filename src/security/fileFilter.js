import fs from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';
import { isSecretFileName } from './secretDetector.js';

export const BUILT_IN_EXCLUDES = [
  '.git/**',
  '.autocommit/**',
  'node_modules/**',
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  'id_rsa*',
  'id_ed25519*',
  'credentials.json',
  'serviceAccountKey.json'
];

/**
 * Creates a file filter instance based on .gitignore, custom excludes, and built-ins.
 * @param {string} repoRoot 
 * @param {string[]} customExcludes 
 */
export function createFileFilter(repoRoot = process.cwd(), customExcludes = []) {
  const ig = ignore();

  // Add built-ins
  ig.add(BUILT_IN_EXCLUDES);

  // Read .gitignore if present
  const gitignorePath = path.join(repoRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      ig.add(gitignoreContent);
    } catch {
      // ignore read error
    }
  }

  // Add custom exclusions
  if (Array.isArray(customExcludes) && customExcludes.length > 0) {
    ig.add(customExcludes);
  }

  return {
    /**
     * Checks if a relative file path is excluded
     * @param {string} relativeFilePath 
     * @returns {boolean}
     */
    isExcluded(relativeFilePath) {
      if (!relativeFilePath) return true;

      // Normalize slashes to forward slashes for ignore library
      const normalized = relativeFilePath.replace(/\\/g, '/').replace(/^\/+/, '');

      // Check if filename itself is a known secret
      if (isSecretFileName(normalized)) {
        return true;
      }

      // Check against ignore rules
      return ig.ignores(normalized);
    },

    /**
     * Filters list of files, separating eligible from excluded
     * @param {string[]} fileList 
     * @returns {{ eligible: string[], excluded: Array<{ path: string, reason: string }> }}
     */
    filterFiles(fileList) {
      const eligible = [];
      const excluded = [];

      for (const file of fileList) {
        const normalized = file.replace(/\\/g, '/').replace(/^\/+/, '');
        if (isSecretFileName(normalized)) {
          excluded.push({ path: file, reason: 'Matched sensitive secret file pattern' });
        } else if (ig.ignores(normalized)) {
          excluded.push({ path: file, reason: 'Matched .gitignore or exclusion pattern' });
        } else {
          eligible.push(file);
        }
      }

      return { eligible, excluded };
    }
  };
}
