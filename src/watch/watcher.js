import chokidar from 'chokidar';
import chalk from 'chalk';
import ora from 'ora';
import { acquireLock, releaseLock } from './lockManager.js';
import { Scheduler } from './scheduler.js';
import { createCheckpoint } from './checkpoint.js';
import { consumeSignal } from './sessionManager.js';
import { checkRepoHealth } from '../git/repository.js';
import { getRepoStatus } from '../git/status.js';
import { saveState, loadState } from '../recovery/stateManager.js';

/**
 * Start foreground watch monitoring
 * @param {string} repoRoot 
 * @param {object} config 
 */
export async function startWatcher(repoRoot = process.cwd(), config = {}) {
  const health = await checkRepoHealth(repoRoot);
  if (!health.isRepo) {
    throw new Error(`Directory "${repoRoot}" is not a Git repository.`);
  }

  const interval = config.autoSave?.interval || '15m';

  // Acquire lock
  const lockResult = acquireLock(repoRoot, { interval });
  if (!lockResult.acquired) {
    throw new Error(lockResult.error);
  }

  // Update initial state
  saveState(repoRoot, {
    monitoringActive: true,
    cleanShutdown: false,
    lastBranch: health.branch,
    lastMonitoringTimestamp: new Date().toISOString()
  });

  console.log(chalk.bold.cyan('\nAUTOCOMMIT WATCH MODE'));
  console.log(chalk.gray(`Repository: ${health.root}`));
  console.log(chalk.gray(`Branch: ${health.branch}`));
  console.log(chalk.gray(`Checkpoint interval: ${interval}\n`));

  let currentBranch = health.branch;
  let isPaused = false;
  let fsWatcher = null;
  let modifiedCount = 0;

  const spinner = ora({
    text: chalk.blue('Monitoring repository for changes...'),
    spinner: 'dots'
  }).start();

  // Clean shutdown handler
  const cleanup = () => {
    spinner.stop();
    console.log(chalk.yellow('\nStopping AutoCommit watch mode gracefully...'));
    if (fsWatcher) {
      fsWatcher.close().catch(() => {});
    }
    scheduler.stop();
    releaseLock(repoRoot);
    saveState(repoRoot, {
      monitoringActive: false,
      cleanShutdown: true,
      lastMonitoringTimestamp: new Date().toISOString()
    });
    console.log(chalk.green('Watch mode stopped. Goodbye!\n'));
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Setup periodic checkpoint task
  const triggerCheckpoint = async () => {
    if (isPaused) return;

    // Check branch changes
    const currentHealth = await checkRepoHealth(repoRoot).catch(() => null);
    if (currentHealth && currentHealth.branch !== currentBranch) {
      spinner.info(chalk.yellow(`Branch switch detected: ${currentBranch} -> ${currentHealth.branch}`));
      currentBranch = currentHealth.branch;
      saveState(repoRoot, { lastBranch: currentBranch });
    }

    spinner.text = chalk.cyan('Evaluating changes for checkpoint...');
    const result = await createCheckpoint(repoRoot, config);

    if (result.committed) {
      spinner.succeed(chalk.green(`Checkpoint created: ${result.checkpoint.message} (${result.checkpoint.shortHash})`));
      modifiedCount = 0;
    } else {
      if (result.skippedReason && !result.skippedReason.includes('No modified')) {
        spinner.info(chalk.gray(`Skipped checkpoint: ${result.skippedReason}`));
      }
    }

    spinner.start(chalk.blue(isPaused ? 'Monitoring paused' : 'Monitoring repository for changes...'));
  };

  const scheduler = new Scheduler({
    interval,
    onTrigger: triggerCheckpoint
  });

  scheduler.start();

  // Watch files for activity feedback
  try {
    fsWatcher = chokidar.watch(repoRoot, {
      ignored: [
        '**/.git/**',
        '**/.autocommit/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/.next/**'
      ],
      ignoreInitial: true,
      depth: 5
    });

    fsWatcher.on('all', async () => {
      // Recheck status on filesystem change
      const status = await getRepoStatus(repoRoot).catch(() => null);
      if (status) {
        modifiedCount = status.modified.length + status.staged.length + status.unstaged.length;
        if (!isPaused) {
          spinner.text = chalk.blue(`Monitoring changes... (${modifiedCount} modified file${modifiedCount === 1 ? '' : 's'})`);
        }
      }
    });
  } catch (err) {
    // Filesystem watcher failure should not crash monitoring - Git status is source of truth
    spinner.warn(chalk.yellow(`Filesystem watcher unavailable: ${err.message}. Using Git polling.`));
  }

  // Periodic signal polling loop (every 1s) to handle --pause, --resume, --stop from other terminals
  const signalInterval = setInterval(async () => {
    const signal = consumeSignal(repoRoot);
    if (!signal) return;

    if (signal.action === 'stop') {
      clearInterval(signalInterval);
      cleanup();
    } else if (signal.action === 'pause') {
      isPaused = true;
      scheduler.pause();
      spinner.warn(chalk.yellow('Monitoring paused via command signal.'));
    } else if (signal.action === 'resume') {
      isPaused = false;
      scheduler.resume();
      spinner.start(chalk.blue('Monitoring resumed via command signal.'));
    }
  }, 1000);

  // Keep event loop alive
  return {
    cleanup,
    scheduler,
    triggerCheckpoint
  };
}
