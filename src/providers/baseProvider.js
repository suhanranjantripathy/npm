/**
 * Base AI Provider Abstract Interface
 */
export class BaseProvider {
  /**
   * @param {string} name 
   * @param {object} options
   */
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
  }

  /**
   * Checks whether this provider has a valid configured API key
   * @returns {boolean}
   */
  hasApiKey() {
    throw new Error('hasApiKey() must be implemented by provider');
  }

  /**
   * Generates 3 commit message suggestions using the provider
   * @param {object} params
   * @param {string} params.diff Sanitized diff
   * @param {string[]} params.files List of changed files
   * @param {string} [params.style='conventional']
   * @returns {Promise<string[]>}
   */
  async generateCommitMessages({ diff, files, style = 'conventional' }) {
    throw new Error('generateCommitMessages() must be implemented by provider');
  }
}
