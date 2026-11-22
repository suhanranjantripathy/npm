/**
 * Rule-based conventional commit message builder
 */

/**
 * Clean up a subject line: lowercase, no trailing period, imperative mood
 * @param {string} subject 
 * @param {number} maxLength 
 */
export function formatSubject(subject, maxLength = 72) {
  let cleaned = subject.trim();
  // Remove trailing punctuation
  cleaned = cleaned.replace(/[\.\;\!\?]+$/, '');

  // Lowercase first letter unless it's an acronym
  if (cleaned.length > 1 && !/^[A-Z]{2,}/.test(cleaned)) {
    cleaned = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  }

  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength - 3).trim() + '...';
  }

  return cleaned;
}

/**
 * Builds a single conventional commit message
 * @param {object} params
 * @param {string} params.type feat, fix, docs, style, refactor, perf, test, build, ci, chore
 * @param {string} [params.scope]
 * @param {string} params.description
 * @param {string} [params.style='conventional']
 * @param {number} [params.maxLength=72]
 */
export function buildCommitMessage({
  type = 'feat',
  scope = '',
  description = 'update code',
  style = 'conventional',
  maxLength = 72
} = {}) {
  const cleanDesc = formatSubject(description, maxLength);

  if (style === 'simple' || !type) {
    return cleanDesc;
  }

  const cleanScope = scope ? `(${scope.toLowerCase().replace(/[^a-z0-9_-]/g, '')})` : '';
  const message = `${type}${cleanScope}: ${cleanDesc}`;

  if (message.length > maxLength) {
    // Truncate description to fit total message inside maxLength
    const prefix = `${type}${cleanScope}: `;
    const allowedDescLength = maxLength - prefix.length;
    if (allowedDescLength > 10) {
      const truncatedDesc = cleanDesc.substring(0, allowedDescLength - 3).trim() + '...';
      return `${prefix}${truncatedDesc}`;
    }
  }

  return message;
}
