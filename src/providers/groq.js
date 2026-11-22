import { OpenAIProvider } from './openai.js';

export class GroqProvider extends OpenAIProvider {
  constructor(options = {}) {
    super({
      ...options,
      apiKey: options.apiKey || process.env.GROQ_API_KEY,
      model: options.model || 'llama-3.3-70b-versatile',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions'
    });
    this.name = 'groq';
  }

  hasApiKey() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }
}
