// AutoCommit Programmatic API Exports

export { checkRepoHealth, isGitRepo, getRepoRoot, getCurrentBranch, isEmptyRepo } from './git/repository.js';
export { getRepoStatus } from './git/status.js';
export { getStagedDiff, getUnstagedDiff, getFileDiff, parseDiffStats } from './git/diff.js';
export { safeCommit } from './git/commit.js';
export { getCheckpointHistory, getCommitDiff, getCommitDetails } from './git/history.js';
export { createRecoveryBranch, restoreFilesFromCheckpoint, exportCheckpointDiff, compareWithWorkingTree } from './git/recovery.js';

export { classifyFile, analyzeFiles } from './analyzer/fileAnalyzer.js';
export { analyzeChanges, COMMIT_TYPES } from './analyzer/changeAnalyzer.js';
export { groupChanges, shouldSuggestGrouping } from './analyzer/groupAnalyzer.js';

export { buildCommitMessage, formatSubject } from './generator/ruleEngine.js';
export { generateSuggestions, generateCheckpointMessage } from './generator/messageGenerator.js';
export { generateWithAI, createProvider } from './generator/aiGenerator.js';

export { BaseProvider } from './providers/baseProvider.js';
export { GeminiProvider } from './providers/gemini.js';
export { OpenAIProvider } from './providers/openai.js';
export { GroqProvider } from './providers/groq.js';

export { detectSecrets, detectSecretsInDiff, sanitizeDiffForAI, isSecretFileName } from './security/secretDetector.js';
export { createFileFilter } from './security/fileFilter.js';

export { loadConfig, validateConfig, initConfigFile, DEFAULT_CONFIG } from './config/configManager.js';

export { acquireLock, releaseLock, getLockInfo } from './watch/lockManager.js';
export { Scheduler, parseInterval } from './watch/scheduler.js';
export { createCheckpoint } from './watch/checkpoint.js';
export { sendSignal, consumeSignal, getSessionStatus } from './watch/sessionManager.js';
export { startWatcher } from './watch/watcher.js';

export { loadState, saveState, getStateFilePath } from './recovery/stateManager.js';
export { detectCrash, resolveCrashState } from './recovery/crashDetector.js';
