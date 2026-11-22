import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_CONFIG = {
  style: 'conventional',
  maxMessageLength: 72,
  ai: {
    enabled: false,
    provider: 'gemini',
    model: ''
  },
  smartGrouping: true,
  autoSave: {
    enabled: false,
    interval: '15m',
    commitPrefix: 'checkpoint:',
    includeUntracked: false,
    pauseOnIdle: true,
    pushToRemote: false,
    remoteName: 'origin',
    remoteBranch: ''
  },
  exclude: [
    '.env',
    '.env.*',
    '*.pem',
    '*.key',
    'id_rsa*',
    'id_ed25519*',
    'node_modules/**',
    'dist/**',
    '.next/**',
    'build/**',
    'coverage/**',
    '.autocommit/**'
  ]
};

export const CONFIG_FILE_NAME = 'autocommit.config.json';

/**
 * Validate configuration values
 * @param {object} config 
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateConfig(config) {
  const errors = [];
  if (config.style && !['conventional', 'simple'].includes(config.style)) {
    errors.push(`Invalid style "${config.style}". Allowed styles: conventional, simple.`);
  }

  if (config.maxMessageLength && (typeof config.maxMessageLength !== 'number' || config.maxMessageLength < 20 || config.maxMessageLength > 300)) {
    errors.push('maxMessageLength must be a number between 20 and 300.');
  }

  if (config.ai) {
    if (typeof config.ai.enabled !== 'boolean') {
      errors.push('ai.enabled must be a boolean.');
    }
    if (config.ai.provider && !['gemini', 'openai', 'groq'].includes(config.ai.provider)) {
      errors.push(`ai.provider must be one of: gemini, openai, groq. Received "${config.ai.provider}".`);
    }
  }

  if (config.autoSave) {
    if (config.autoSave.interval && typeof config.autoSave.interval !== 'string' && typeof config.autoSave.interval !== 'number') {
      errors.push('autoSave.interval must be a string (e.g., "10m", "30s") or number of milliseconds.');
    }
    if (config.autoSave.commitPrefix && typeof config.autoSave.commitPrefix !== 'string') {
      errors.push('autoSave.commitPrefix must be a string.');
    }
  }

  if (config.exclude && !Array.isArray(config.exclude)) {
    errors.push('exclude must be an array of glob strings.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Finds configuration file starting from directory
 * @param {string} startDir 
 * @returns {string|null}
 */
export function findConfigFile(startDir = process.cwd()) {
  let currentDir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(currentDir, CONFIG_FILE_NAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return null;
}

/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
  const output = { ...target };
  if (!source || typeof source !== 'object') return output;

  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = deepMerge(target[key] || {}, value);
    } else if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

/**
 * Load configuration from file and merge with defaults
 * @param {string} repoRoot 
 * @param {object} overrides 
 * @returns {object}
 */
export function loadConfig(repoRoot = process.cwd(), overrides = {}) {
  let fileConfig = {};
  const configPath = findConfigFile(repoRoot);

  if (configPath) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      fileConfig = JSON.parse(raw);
    } catch (err) {
      console.warn(`Warning: Could not parse ${configPath}: ${err.message}. Using default configuration.`);
    }
  }

  const merged = deepMerge(DEFAULT_CONFIG, fileConfig);
  const finalConfig = deepMerge(merged, overrides);

  const validation = validateConfig(finalConfig);
  if (!validation.valid) {
    throw new Error(`Invalid AutoCommit configuration:\n - ${validation.errors.join('\n - ')}`);
  }

  return finalConfig;
}

/**
 * Initialize autocommit.config.json file in directory
 * @param {string} targetDir 
 * @param {boolean} force 
 * @returns {string} Path to created config file
 */
export function initConfigFile(targetDir = process.cwd(), force = false) {
  const filePath = path.join(path.resolve(targetDir), CONFIG_FILE_NAME);
  if (fs.existsSync(filePath) && !force) {
    throw new Error(`Configuration file already exists at ${filePath}. Use --force to overwrite.`);
  }

  const content = JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}
