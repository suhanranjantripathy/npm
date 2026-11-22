import { describe, it, expect } from 'vitest';
import { buildCommitMessage, formatSubject } from '../src/generator/ruleEngine.js';
import { generateSuggestions, generateCheckpointMessage } from '../src/generator/messageGenerator.js';
import { analyzeChanges, COMMIT_TYPES } from '../src/analyzer/changeAnalyzer.js';
import { GeminiProvider } from '../src/providers/gemini.js';
import { OpenAIProvider } from '../src/providers/openai.js';
import { GroqProvider } from '../src/providers/groq.js';
import { generateWithAI, createProvider } from '../src/generator/aiGenerator.js';

describe('Rule Engine & Commit Generator', () => {
  it('formats subject line correctly without punctuation and imperatively', () => {
    expect(formatSubject('Added user login!.')).toBe('added user login');
    expect(formatSubject('Fix critical bug;')).toBe('fix critical bug');
  });

  it('builds standard Conventional Commit format', () => {
    const msg = buildCommitMessage({
      type: 'feat',
      scope: 'auth',
      description: 'add user authentication'
    });
    expect(msg).toBe('feat(auth): add user authentication');
  });

  it('respects maxMessageLength limit and truncates gracefully', () => {
    const longDesc = 'this is an extremely long commit description that should certainly exceed the normal configured character limit of the message';
    const msg = buildCommitMessage({
      type: 'fix',
      scope: 'core',
      description: longDesc,
      maxLength: 50
    });
    expect(msg.length).toBeLessThanOrEqual(50);
    expect(msg.endsWith('...')).toBe(true);
  });

  it('generates 3 distinct suggestions', () => {
    const analysis = analyzeChanges({
      filePaths: ['src/auth/login.js'],
      diffText: '+export function loginUser() { return true; }'
    });

    const suggestions = generateSuggestions(analysis, { maxLength: 72 });
    expect(suggestions.length).toBe(3);

    // Ensure all 3 are distinct
    const unique = new Set(suggestions);
    expect(unique.size).toBe(3);

    // Each starts with conventional format
    suggestions.forEach(s => {
      expect(s).toMatch(/^[a-z]+(\([a-z0-9_-]+\))?:/);
    });
  });

  it('generates checkpoint commit message with default and custom prefixes', () => {
    const analysis = { scope: 'auth' };

    const defaultMsg = generateCheckpointMessage(analysis, { fileCount: 3 });
    expect(defaultMsg).toBe('checkpoint: save progress on auth (3 files)');

    const customMsg = generateCheckpointMessage(analysis, { prefix: 'wip:', fileCount: 1 });
    expect(customMsg).toBe('wip: save progress on auth (1 file)');
  });
});

describe('AI Providers & Fallback Engine', () => {
  it('supports instantiating Gemini, OpenAI, and Groq providers', () => {
    const gemini = createProvider('gemini', { apiKey: 'test-key' });
    const openai = createProvider('openai', { apiKey: 'test-key' });
    const groq = createProvider('groq', { apiKey: 'test-key' });

    expect(gemini).toBeInstanceOf(GeminiProvider);
    expect(openai).toBeInstanceOf(OpenAIProvider);
    expect(groq).toBeInstanceOf(GroqProvider);
  });

  it('correctly reports hasApiKey status based on environment or options', () => {
    const noKey = createProvider('gemini', { apiKey: '' });
    expect(noKey.hasApiKey()).toBe(false);

    const withKey = createProvider('gemini', { apiKey: 'AIzaSyFakeKeyForTest1234567890123' });
    expect(withKey.hasApiKey()).toBe(true);
  });

  it('falls back to rule engine when AI is enabled but no API key is set', async () => {
    const analysis = analyzeChanges({
      filePaths: ['src/auth/login.js'],
      diffText: '+export function test() {}'
    });

    const result = await generateWithAI({
      files: ['src/auth/login.js'],
      diffText: '+export function test() {}',
      analysis,
      config: {
        style: 'conventional',
        maxMessageLength: 72,
        ai: {
          enabled: true,
          provider: 'gemini',
          apiKey: ''
        }
      }
    });

    expect(result.fellBack).toBe(true);
    expect(result.providerUsed).toBe('rule-engine');
    expect(result.suggestions.length).toBe(3);
  });
});
