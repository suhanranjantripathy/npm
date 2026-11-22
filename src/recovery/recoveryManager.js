import chalk from 'chalk';
import { select, input, confirm } from '@inquirer/prompts';
import { getCheckpointHistory, getCommitDetails, getCommitDiff } from '../git/history.js';
import { createRecoveryBranch, restoreFilesFromCheckpoint, exportCheckpointDiff, compareWithWorkingTree } from '../git/recovery.js';

/**
 * Interactive recovery UI
 * @param {string} repoRoot 
 */
export async function runInteractiveRecovery(repoRoot = process.cwd()) {
  console.log(chalk.bold.cyan('\nAUTOCOMMIT RECOVERY SYSTEM'));
  console.log(chalk.gray('Safe, non-destructive checkpoint recovery\n'));

  const checkpoints = await getCheckpointHistory(repoRoot, { maxCount: 25 });
  if (checkpoints.length === 0) {
    console.log(chalk.yellow('No AutoCommit checkpoint commits found in repository history.'));
    return;
  }

  const checkpointChoice = await select({
    message: 'Select a checkpoint to inspect or recover from:',
    choices: checkpoints.map(c => ({
      name: `${c.shortHash} - ${c.message} (${c.date})`,
      value: c.hash
    }))
  });

  const details = await getCommitDetails(repoRoot, checkpointChoice);

  console.log(chalk.bold.cyan(`\nCheckpoint Selected: ${details.shortHash}`));
  console.log(chalk.gray(`Changed files:`));
  details.files.forEach(f => console.log(chalk.white(`  - ${f}`)));
  console.log();

  const action = await select({
    message: 'Choose a recovery action (Non-destructive):',
    choices: [
      { name: '1. Create a safe recovery branch (Recommended)', value: 'branch' },
      { name: '2. Compare current working tree with this checkpoint', value: 'compare' },
      { name: '3. Export checkpoint diff patch file', value: 'export' },
      { name: '4. Restore selected files to working tree', value: 'restore' },
      { name: '5. Cancel', value: 'cancel' }
    ]
  });

  if (action === 'branch') {
    const defaultBranchName = `recovery/checkpoint-${details.shortHash}`;
    const branchName = await input({
      message: 'Enter name for recovery branch:',
      default: defaultBranchName
    });

    try {
      await createRecoveryBranch(repoRoot, checkpointChoice, branchName.trim());
      console.log(chalk.green(`\nSuccess! Created recovery branch "${branchName.trim()}".`));
      console.log(chalk.gray(`You can switch to it anytime with: git checkout ${branchName.trim()}\n`));
    } catch (err) {
      console.error(chalk.red(`\nError: ${err.message}`));
    }
  } else if (action === 'compare') {
    const diff = await compareWithWorkingTree(repoRoot, checkpointChoice);
    console.log(chalk.bold.cyan('\n--- Comparison with Current Working Tree ---'));
    console.log(diff || chalk.gray('(No differences found - working tree matches checkpoint)'));
  } else if (action === 'export') {
    const defaultPatchPath = `./checkpoint-${details.shortHash}.patch`;
    const patchPath = await input({
      message: 'Enter file path to export patch:',
      default: defaultPatchPath
    });

    try {
      const exported = await exportCheckpointDiff(repoRoot, checkpointChoice, patchPath.trim());
      console.log(chalk.green(`\nPatch exported successfully to: ${exported}`));
    } catch (err) {
      console.error(chalk.red(`\nError exporting patch: ${err.message}`));
    }
  } else if (action === 'restore') {
    console.log(chalk.yellow('\nWarning: Restoring will update selected files in your working directory.'));
    console.log(chalk.gray('AutoCommit will automatically create backups of modified files in .autocommit/backups.\n'));

    const confirmed = await confirm({
      message: `Are you sure you want to restore files from checkpoint ${details.shortHash}?`,
      default: false
    });

    if (confirmed) {
      try {
        const result = await restoreFilesFromCheckpoint(repoRoot, checkpointChoice, details.files, { backup: true });
        console.log(chalk.green(`\nSuccessfully restored ${result.restoredFiles.length} files.`));
        if (result.backedUpFiles.length > 0) {
          console.log(chalk.gray(`Backups created for: ${result.backedUpFiles.join(', ')} in .autocommit/backups/`));
        }
      } catch (err) {
        console.error(chalk.red(`\nError restoring files: ${err.message}`));
      }
    } else {
      console.log(chalk.gray('Restore cancelled.'));
    }
  } else {
    console.log(chalk.gray('Recovery cancelled.'));
  }
}
