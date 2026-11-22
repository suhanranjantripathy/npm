import { GeminiProvider } from '../providers/gemini.js';
import { OpenAIProvider } from '../providers/openai.js';
import { GroqProvider } from '../providers/groq.js';
import { sanitizeDiffForAI } from '../security/secretDetector.js';
import { generateSuggestions } from './messageGenerator.js';

export const PROVIDERS = {
  gemini: GeminiProvider,
  openai: OpenAIProvider,
  groq: GroqProvider
};

/**
 * Creates provider instance based on config
 * @param {string} providerName 
 * @param {object} options 
 */
export function createProvider(providerName = 'gemini', options = {}) {
  const ProviderClass = PROVIDERS[providerName.toLowerCase()];
  if (!ProviderClass) {
    throw new Error(`Unsupported AI provider: ${providerName}. Supported: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return new ProviderClass(options);
}

/**
 * Generates commit suggestions using AI, with automatic fallback to rule engine
 * @param {object} params
 * @param {string[]} params.files
 * @param {string} params.diffText
 * @param {object} params.analysis
 * @param {object} params.config
 * @returns {Promise<{ suggestions: string[], providerUsed: string, fellBack: boolean }>}
 */
export async function generateWithAI({ files, diffText, analysis, config }) {
  const providerName = config?.ai?.provider || 'gemini';

  try {
    const provider = createProvider(providerName, config?.ai || {});

    if (!provider.hasApiKey()) {
      console.warn(`[AutoCommit AI] No API key found for ${providerName}. Falling back to rule-based engine.`);
      return {
        suggestions: generateSuggestions(analysis, { style: config.style, maxLength: config.maxMessageLength }),
        providerUsed: 'rule-engine',
        fellBack: true
      };
    }

    const sanitizedDiff = sanitizeDiffForAI(diffText);
    const suggestions = await provider.generateCommitMessages({
      diff: sanitizedDiff,
      files,
      style: config.style
    });

    if (suggestions && suggestions.length > 0) {
      return {
        suggestions,
        providerUsed: providerName,
        fellBack: false
      };
    }

    throw new Error('No suggestions returned by provider');
  } catch (err) {
    console.warn(`[AutoCommit AI] ${providerName} failed: ${err.message}. Falling back to rule-based generation.`);
    return {
      suggestions: generateSuggestions(analysis, { style: config.style, maxLength: config.maxMessageLength }),
      providerUsed: 'rule-engine',
      fellBack: true
    };
  }
}
