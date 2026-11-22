import { BaseProvider } from './baseProvider.js';

export class OpenAIProvider extends BaseProvider {
  constructor(options = {}) {
    super('openai', options);
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.model = options.model || 'gpt-4o-mini';
    this.endpoint = options.endpoint || 'https://api.openai.com/v1/chat/completions';
  }

  hasApiKey() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async generateCommitMessages({ diff, files, style = 'conventional' }) {
    if (!this.hasApiKey()) {
      throw new Error('OPENAI_API_KEY environment variable is not set.');
    }

    const prompt = `You are an expert Git commit assistant.
Given the following Git diff and files, generate exactly 3 distinct, concise Conventional Commit messages.
Format rules:
- Must follow format: <type>(<scope>): <description>
- Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
- Max 72 characters per line
- No markdown formatting, no numbers, no bullet points, just 3 lines with one message per line.

Changed files:
${files.slice(0, 20).join('\n')}

Diff:
${diff.slice(0, 3000)}
`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 150
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const rawText = data?.choices?.[0]?.message?.content || '';
      const lines = rawText
        .split('\n')
        .map(l => l.replace(/^[0-9\.\-\*\s]+/, '').trim())
        .filter(l => l.length > 0 && l.includes(':'));

      if (lines.length >= 3) {
        return lines.slice(0, 3);
      } else if (lines.length > 0) {
        return lines;
      }
      throw new Error('Empty response from OpenAI API');
    } finally {
      clearTimeout(timer);
    }
  }
}
