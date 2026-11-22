import { BaseProvider } from './baseProvider.js';

export class GeminiProvider extends BaseProvider {
  constructor(options = {}) {
    super('gemini', options);
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    this.model = options.model || 'gemini-1.5-flash';
  }

  hasApiKey() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async generateCommitMessages({ diff, files, style = 'conventional' }) {
    if (!this.hasApiKey()) {
      throw new Error('GEMINI_API_KEY environment variable is not set.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

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
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 200
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const lines = rawText
        .split('\n')
        .map(l => l.replace(/^[0-9\.\-\*\s]+/, '').trim())
        .filter(l => l.length > 0 && l.includes(':'));

      if (lines.length >= 3) {
        return lines.slice(0, 3);
      } else if (lines.length > 0) {
        return lines;
      }
      throw new Error('Empty response from Gemini API');
    } finally {
      clearTimeout(timer);
    }
  }
}
