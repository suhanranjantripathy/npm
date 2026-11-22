import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/configManager.js';
import { checkRepoHealth } from '../git/repository.js';
import { startWatcher } from '../watch/watcher.js';
import { createCheckpoint } from '../watch/checkpoint.js';
import { sendSignal, getSessionStatus } from '../watch/sessionManager.js';

/**
 * Handle watch command and options
 */
export async function handleWatch(options = {}) {
  const cwd = process.cwd();
  const health = await checkRepoHealth(cwd);

  if (!health.isRepo) {
    console.error(chalk.red('Error: Current directory is not a Git repository.'));
    process.exit(1);
  }

  const config = loadConfig(cwd, {
    autoSave: {
      interval: options.interval
    }
  });

  // Handle --status
  if (options.status) {
    const status = await getSessionStatus(cwd);
    console.log(chalk.bold.cyan('\nAUTOCOMMIT WATCH STATUS\n'));
    console.log(`${chalk.gray('Monitoring active:')} ${status.isRunning ? chalk.green('YES') : chalk.yellow('NO')}`);
    if (status.isRunning) {
      console.log(`${chalk.gray('Process PID:')}       ${chalk.white(status.pid)}`);
      console.log(`${chalk.gray('Started at:')}        ${chalk.white(status.startedAt)}`);
      console.log(`${chalk.gray('Interval:')}          ${chalk.cyan(status.interval)}`);
      console.log(`${chalk.gray('State:')}             ${status.isPaused ? chalk.yellow('PAUSED') : chalk.green('RUNNING')}`);
    }
    console.log(`${chalk.gray('Repository:')}        ${chalk.white(status.repository)}`);
    console.log(`${chalk.gray('Current Branch:')}    ${chalk.white(status.branch)}`);
    console.log(`${chalk.gray('Modified Files:')}    ${status.modifiedFilesCount > 0 ? chalk.yellow(status.modifiedFilesCount) : chalk.green('0 (Clean)')}`);

    if (status.lastCheckpoint) {
      console.log(`${chalk.gray('Last Checkpoint:')}   ${chalk.cyan(status.lastCheckpoint.shortHash || status.lastCheckpoint.hash)}`);
      console.log(`                    ${chalk.gray(status.lastCheckpoint.message || '')}`);
      console.log(`                    ${chalk.gray(status.lastCheckpoint.timestamp || '')}`);
    } else {
      console.log(`${chalk.gray('Last Checkpoint:')}   ${chalk.gray('None recorded yet')}`);
    }
    console.log();
    return;
  }

  // Handle --pause
  if (options.pause) {
    sendSignal(cwd, 'pause');
    console.log(chalk.yellow('\nPause signal sent to AutoCommit watch process.\n'));
    return;
  }

  // Handle --resume
  if (options.resume) {
    sendSignal(cwd, 'resume');
    console.log(chalk.green('\nResume signal sent to AutoCommit watch process.\n'));
    return;
  }

  // Handle --stop
  if (options.stop) {
    sendSignal(cwd, 'stop');
    console.log(chalk.yellow('\nStop signal sent to AutoCommit watch process.\n'));
    return;
  }

  // Handle --once
  if (options.once) {
    const spinner = ora(chalk.blue('Checking for eligible changes...')).start();
    const result = await createCheckpoint(cwd, config);

    if (result.committed) {
      spinner.succeed(chalk.green(`Checkpoint created: ${result.checkpoint.message} (${result.checkpoint.shortHash})`));
    } else {
      spinner.info(chalk.yellow(`Checkpoint skipped: ${result.skippedReason}`));
    }
    return;
  }

  // Default: start foreground monitoring
  try {
    await startWatcher(cwd, config);
  } catch (err) {
    console.error(chalk.red(`\nWatch mode error: ${err.message}\n`));
    process.exit(1);
  }
}
