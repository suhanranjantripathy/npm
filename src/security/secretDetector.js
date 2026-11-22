import path from 'node:path';

export const SECRET_PATTERNS = [
  {
    name: 'AWS Access Key ID',
    regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g
  },
  {
    name: 'GitHub Token',
    regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}/g
  },
  {
    name: 'Slack Token',
    regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g
  },
  {
    name: 'Stripe Secret Key',
    regex: /(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,99}/g
  },
  {
    name: 'Google API Key',
    regex: /AIza[0-9A-Za-z-_]{35}/g
  },
  {
    name: 'Private Key Block',
    regex: /-----BEGIN (?:[A-Z0-9_-]+\s)?PRIVATE KEY-----/g
  },
  {
    name: 'OpenSSH Private Key',
    regex: /-----BEGIN OPENSSH PRIVATE KEY-----/g
  },
  {
    name: 'Generic Token Assignment',
    regex: /(?:api[_-]?key|auth[_-]?token|secret[_-]?key|access[_-]?token|jwt[_-]?token|bearer)\s*[:=]\s*['"][a-zA-Z0-9_\-\.]{12,}['"]/gi
  },
  {
    name: 'Password Assignment',
    regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/gi
  }
];

export const SENSITIVE_FILE_NAMES = [
  /^\.env(?:\..+)?$/i,
  /^id_rsa(?:\.pub)?$/i,
  /^id_ed25519(?:\.pub)?$/i,
  /^id_ecdsa(?:\.pub)?$/i,
  /^id_dsa(?:\.pub)?$/i,
  /.*\.pem$/i,
  /.*\.key$/i,
  /.*\.pkcs12$/i,
  /.*\.pfx$/i,
  /.*\.keystore$/i,
  /^credentials\.json$/i,
  /^serviceAccountKey\.json$/i,
  /^client_secret.*\.json$/i
];

/**
 * Checks if a file name or path matches known sensitive file patterns
 * @param {string} filePath 
 * @returns {boolean}
 */
export function isSecretFileName(filePath) {
  const base = path.basename(filePath);
  return SENSITIVE_FILE_NAMES.some(pattern => pattern.test(base));
}

/**
 * Detect secrets in given text/content
 * @param {string} text 
 * @returns {{ hasSecrets: boolean, findings: Array<{ type: string, match: string, line?: number }> }}
 */
export function detectSecrets(text) {
  if (!text || typeof text !== 'string') {
    return { hasSecrets: false, findings: [] };
  }

  const findings = [];
  const lines = text.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(line)) !== null) {
        findings.push({
          type: pattern.name,
          match: match[0],
          line: lineIndex + 1
        });
      }
    }
  }

  return {
    hasSecrets: findings.length > 0,
    findings
  };
}

/**
 * Detect secrets in a unified git diff
 * @param {string} diffText 
 * @returns {{ hasSecrets: boolean, findings: Array<{ type: string, match: string, line?: number }> }}
 */
export function detectSecretsInDiff(diffText) {
  if (!diffText) return { hasSecrets: false, findings: [] };

  // Only scan added lines in diff to prevent false positives from removing old secrets
  const addedLines = diffText
    .split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .map(l => l.substring(1))
    .join('\n');

  return detectSecrets(addedLines);
}

/**
 * Sanitize text/diff before sending to external AI models
 * Masks all detected secrets and high-entropy secret patterns
 * @param {string} text 
 * @returns {string} Sanitized string
 */
export function sanitizeDiffForAI(text) {
  if (!text) return '';
  let sanitized = text;

  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    sanitized = sanitized.replace(pattern.regex, '[REDACTED_SECRET]');
  }

  return sanitized;
}
