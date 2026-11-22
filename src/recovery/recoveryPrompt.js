import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { resolveCrashState } from './crashDetector.js';
import { createCheckpoint } from '../watch/checkpoint.js';
import { startWatcher } from '../watch/watcher.js';
import { getCommitDetails } from '../git/history.js';
import { getUnstagedDiff, getStagedDiff } from '../git/diff.js';

/**
 * Interactive crash recovery handler
 * @param {string} repoRoot 
 * @param {object} crashReport 
 * @param {object} config 
 */
export async function handleCrashRecoveryPrompt(repoRoot, crashReport, config) {
  console.log(chalk.bold.yellow('\nAUTOCOMMIT RECOVERY CHECK'));
  console.log(chalk.yellow('An interrupted AutoCommit session was detected.'));

  if (crashReport.lastCheckpoint) {
    console.log(chalk.gray(`\nLast successful checkpoint:`));
    console.log(chalk.cyan(`  ${crashReport.lastCheckpoint.message || 'checkpoint'}`));
    console.log(chalk.gray(`  Commit: ${crashReport.lastCheckpoint.shortHash || crashReport.lastCheckpoint.hash}`));
    if (crashReport.lastCheckpoint.timestamp) {
      console.log(chalk.gray(`  Date:   ${crashReport.lastCheckpoint.timestamp}`));
    }
  }

  console.log(chalk.gray(`\nLast known branch:`));
  console.log(chalk.cyan(`  ${crashReport.lastBranch || 'unknown'}`));

  console.log(chalk.gray(`\nCurrent working tree:`));
  console.log(chalk.white(`  ${crashReport.uncommittedCount} uncommitted files`));
  console.log(chalk.yellow('\nSome changes may not have been included in the previous checkpoint.\n'));

  const choice = await select({
    message: 'What would you like to do?',
    choices: [
      { name: '1. Inspect current changes', value: 'inspect' },
      { name: '2. Create a recovery checkpoint', value: 'checkpoint' },
      { name: '3. Resume monitoring', value: 'resume' },
      { name: '4. View previous checkpoint', value: 'view' },
      { name: '5. Ignore warning', value: 'ignore' }
    ]
  });

  if (choice === 'inspect') {
    const [unstaged, staged] = await Promise.all([
      getUnstagedDiff(repoRoot),
      getStagedDiff(repoRoot)
    ]);
    console.log(chalk.bold.cyan('\n--- Staged Changes ---'));
    console.log(staged || chalk.gray('(none)'));
    console.log(chalk.bold.cyan('\n--- Unstaged Changes ---'));
    console.log(unstaged || chalk.gray('(none)'));
    resolveCrashState(repoRoot);
  } else if (choice === 'checkpoint') {
    const result = await createCheckpoint(repoRoot, config);
    if (result.committed) {
      console.log(chalk.green(`\nRecovery checkpoint created: ${result.checkpoint.message} (${result.checkpoint.shortHash})`));
    } else {
      console.log(chalk.yellow(`\nCould not create checkpoint: ${result.skippedReason}`));
    }
    resolveCrashState(repoRoot);
  } else if (choice === 'resume') {
    resolveCrashState(repoRoot);
    await startWatcher(repoRoot, config);
  } else if (choice === 'view') {
    if (crashReport.lastCheckpoint?.hash) {
      const details = await getCommitDetails(repoRoot, crashReport.lastCheckpoint.hash);
      console.log(chalk.bold.cyan('\n--- Checkpoint Details ---'));
      console.log(details.details);
    } else {
      console.log(chalk.gray('No previous checkpoint details found.'));
    }
    resolveCrashState(repoRoot);
  } else {
    resolveCrashState(repoRoot);
    console.log(chalk.gray('Crash warning dismissed.'));
  }
}
