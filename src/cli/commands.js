import chalk from 'chalk';
import ora from 'ora';
import { select, input, confirm } from '@inquirer/prompts';
import { checkRepoHealth, getGit } from '../git/repository.js';
import { getRepoStatus } from '../git/status.js';
import { getStagedDiff, getUnstagedDiff } from '../git/diff.js';
import { safeCommit } from '../git/commit.js';
import { createFileFilter } from '../security/fileFilter.js';
import { detectSecretsInDiff } from '../security/secretDetector.js';
import { analyzeChanges } from '../analyzer/changeAnalyzer.js';
import { shouldSuggestGrouping, groupChanges } from '../analyzer/groupAnalyzer.js';
import { generateSuggestions } from '../generator/messageGenerator.js';
import { generateWithAI } from '../generator/aiGenerator.js';
import { detectCrash } from '../recovery/crashDetector.js';
import { handleCrashRecoveryPrompt } from '../recovery/recoveryPrompt.js';
import { initConfigFile, loadConfig } from '../config/configManager.js';
import { getCheckpointHistory, getCommitDetails } from '../git/history.js';
import { runInteractiveRecovery } from '../recovery/recoveryManager.js';

export const PACKAGE_VERSION = '1.0.0';

/**
 * Handle autocommit init command
 */
export async function handleInit(options = {}) {
  try {
    const createdPath = initConfigFile(process.cwd(), options.force);
    console.log(chalk.green(`\nSuccess! Created configuration file at: ${createdPath}\n`));
  } catch (err) {
    console.error(chalk.red(`\nFailed to initialize configuration: ${err.message}\n`));
    process.exit(1);
  }
}

/**
 * Handle autocommit history command
 */
export async function handleHistory(options = {}) {
  const health = await checkRepoHealth(process.cwd());
  if (!health.isRepo) {
    console.error(chalk.red('Current directory is not a Git repository.'));
    process.exit(1);
  }

  const checkpoints = await getCheckpointHistory(process.cwd(), { maxCount: 20 });
  console.log(chalk.bold.cyan('\nAUTOCOMMIT HISTORY\n'));

  if (checkpoints.length === 0) {
    console.log(chalk.gray('No checkpoint commits found.'));
    return;
  }

  checkpoints.forEach((c, idx) => {
    console.log(`${chalk.bold.yellow(`${idx + 1}.`)} ${chalk.bold.white(c.message)}`);
    console.log(`   ${chalk.gray('Commit:')} ${chalk.cyan(c.shortHash)}`);
    console.log(`   ${chalk.gray('Date:')}   ${chalk.gray(c.date)}\n`);
  });
}

/**
 * Handle autocommit recover command
 */
export async function handleRecover(options = {}) {
  const health = await checkRepoHealth(process.cwd());
  if (!health.isRepo) {
    console.error(chalk.red('Current directory is not a Git repository.'));
    process.exit(1);
  }

  if (options.list) {
    await handleHistory();
    return;
  }

  if (options.inspect) {
    const details = await getCommitDetails(process.cwd(), options.inspect);
    console.log(chalk.bold.cyan(`\nInspection for commit ${details.shortHash}:`));
    console.log(details.details);
    return;
  }

  await runInteractiveRecovery(process.cwd());
}

/**
 * Main standard commit command handler
 */
export async function handleStandardCommit(cliOptions = {}) {
  const cwd = process.cwd();
  const config = loadConfig(cwd, {
    style: cliOptions.style,
    ai: cliOptions.ai !== undefined ? { enabled: cliOptions.ai } : undefined
  });

  console.log(chalk.bold.cyan(`\nAUTOCOMMIT v${PACKAGE_VERSION}`));
  console.log(chalk.gray('Intelligent Git Automation & Progress Protection\n'));

  const health = await checkRepoHealth(cwd);
  if (!health.isRepo) {
    console.error(chalk.red('Error: Current directory is not a Git repository.'));
    console.log(chalk.gray('Run `git init` first to initialize a repository.'));
    process.exit(1);
  }

  if (health.isMerging) {
    console.error(chalk.red('Error: A Git merge is in progress with potential conflicts. Resolve conflicts before committing.'));
    process.exit(1);
  }

  console.log(`${chalk.gray('Repository:')} ${chalk.white(health.root.split('/').pop() || health.root)}`);
  console.log(`${chalk.gray('Branch:')}     ${chalk.white(health.branch)}`);

  // Check for crash recovery
  const crashReport = await detectCrash(cwd);
  if (crashReport.hasCrash) {
    await handleCrashRecoveryPrompt(cwd, crashReport, config);
    return;
  }

  const spinner = ora(chalk.blue('Analyzing Git changes...')).start();

  const status = await getRepoStatus(cwd);

  if (status.hasConflicts) {
    spinner.fail(chalk.red(`Merge conflicts detected in: ${status.conflicted.join(', ')}`));
    return;
  }

  // Determine candidate files
  const candidateFiles = new Set([
    ...status.staged.map(s => s.path),
    ...status.unstaged.map(u => u.path)
  ]);

  if (candidateFiles.size === 0 && status.untracked.length === 0) {
    spinner.succeed(chalk.green('Working tree is clean. Nothing to commit.'));
    return;
  }

  // If there are only untracked files, ask or inform
  if (candidateFiles.size === 0 && status.untracked.length > 0) {
    for (const f of status.untracked) {
      candidateFiles.add(f);
    }
  }

  const filter = createFileFilter(cwd, config.exclude);
  const { eligible, excluded } = filter.filterFiles(Array.from(candidateFiles));

  if (excluded.length > 0 && cliOptions.verbose) {
    console.log(chalk.gray(`\nSkipped ${excluded.length} excluded or secret files:`));
    excluded.forEach(e => console.log(chalk.gray(` - ${e.path} (${e.reason})`)));
  }

  if (eligible.length === 0) {
    spinner.warn(chalk.yellow('No eligible changes found (all files were excluded by safety rules).'));
    return;
  }

  const [unstagedDiff, stagedDiff] = await Promise.all([
    getUnstagedDiff(cwd, eligible),
    getStagedDiff(cwd, eligible)
  ]);
  const combinedDiff = `${stagedDiff}\n${unstagedDiff}`.trim();

  // Check for secrets
  const secretCheck = detectSecretsInDiff(combinedDiff);
  if (secretCheck.hasSecrets) {
    spinner.warn(chalk.yellow(`Warning: Potential secrets detected in diff (${secretCheck.findings.map(f => f.type).join(', ')})!`));
  } else {
    spinner.succeed(chalk.green(`Analysis completed. Found ${eligible.length} modified file${eligible.length === 1 ? '' : 's'}.`));
  }

  const analysis = analyzeChanges({
    filePaths: eligible,
    diffText: combinedDiff
  });

  // Generate initial suggestions
  let suggestions = [];
  let aiUsed = false;

  if (config.ai?.enabled && !cliOptions.noAi) {
    const aiResult = await generateWithAI({
      files: eligible,
      diffText: combinedDiff,
      analysis,
      config
    });
    suggestions = aiResult.suggestions;
    aiUsed = !aiResult.fellBack;
  } else {
    suggestions = generateSuggestions(analysis, {
      style: config.style,
      maxLength: config.maxMessageLength
    });
  }

  // Dry-run mode
  if (cliOptions.dryRun) {
    console.log(chalk.bold.yellow('\n[DRY RUN MODE] - No changes will be staged or committed.\n'));
    console.log(chalk.bold.white('Suggested commit messages:'));
    suggestions.forEach((msg, i) => console.log(chalk.cyan(`  ${i + 1}. ${msg}`)));
    return;
  }

  // Interactive flow loop
  let variation = 0;
  let activeSuggestions = [...suggestions];

  while (true) {
    console.log(chalk.bold.white('\nSuggested commit:'));
    console.log(chalk.bold.green(`  ${activeSuggestions[0]}\n`));

    console.log(chalk.gray('Alternative options:'));
    activeSuggestions.slice(1).forEach((msg, idx) => {
      console.log(chalk.gray(`  ${idx + 2}. ${msg}`));
    });
    console.log();

    const groupingAvailable = shouldSuggestGrouping(eligible) && config.smartGrouping;

    const choices = [
      { name: `1. Approve and commit ("${activeSuggestions[0]}")`, value: 'approve-1' },
      { name: `2. Choose alternative message (${activeSuggestions[1] || 'variant 2'})`, value: 'approve-2' },
      { name: `3. Choose alternative message (${activeSuggestions[2] || 'variant 3'})`, value: 'approve-3' },
      { name: '4. Edit message manually', value: 'edit' },
      { name: '5. Generate new suggestions', value: 'regenerate' },
      { name: '6. View detailed changes / diff', value: 'view' }
    ];

    if (groupingAvailable) {
      choices.push({ name: '7. Smart grouping (split unrelated changes)', value: 'grouping' });
    }

    choices.push({ name: '8. Cancel', value: 'cancel' });

    const action = await select({
      message: 'What would you like to do?',
      choices
    });

    if (action === 'approve-1' || action === 'approve-2' || action === 'approve-3') {
      const selectedIndex = action === 'approve-1' ? 0 : (action === 'approve-2' ? 1 : 2);
      const chosenMessage = activeSuggestions[selectedIndex];

      await executeCommitWorkflow(cwd, eligible, chosenMessage);
      return;
    } else if (action === 'edit') {
      const customMessage = await input({
        message: 'Enter commit message:',
        default: activeSuggestions[0]
      });

      if (customMessage && customMessage.trim()) {
        await executeCommitWorkflow(cwd, eligible, customMessage.trim());
        return;
      }
    } else if (action === 'regenerate') {
      variation++;
      activeSuggestions = generateSuggestions(analysis, {
        style: config.style,
        maxLength: config.maxMessageLength,
        variation
      });
      console.log(chalk.cyan('\nGenerated new suggestions!'));
    } else if (action === 'view') {
      console.log(chalk.bold.cyan('\n--- Detailed Diff ---'));
      console.log(combinedDiff.slice(0, 5000));
      if (combinedDiff.length > 5000) {
        console.log(chalk.gray(`\n... diff truncated (${combinedDiff.length} characters total) ...`));
      }
    } else if (action === 'grouping') {
      const groups = groupChanges(eligible);
      console.log(chalk.bold.cyan('\nSuggested Commit Groups:'));
      groups.forEach((g, idx) => {
        console.log(chalk.bold.yellow(`\nGroup ${idx + 1} (${g.scope}):`));
        g.files.forEach(f => console.log(chalk.white(`  - ${f}`)));
        console.log(chalk.gray(`  Suggested type: ${g.suggestedType}`));
      });

      const approveGrouping = await confirm({
        message: 'Would you like to commit one of these groups separately?',
        default: true
      });

      if (approveGrouping) {
        const selectedGroup = await select({
          message: 'Select group to commit now:',
          choices: groups.map((g, idx) => ({
            name: `Group ${idx + 1}: ${g.scope} (${g.files.length} file${g.files.length === 1 ? '' : 's'})`,
            value: g
          }))
        });

        const groupMsg = `${selectedGroup.suggestedType}(${selectedGroup.scope}): update ${selectedGroup.scope}`;
        const finalGroupMsg = await input({
          message: 'Commit message for this group:',
          default: groupMsg
        });

        await executeCommitWorkflow(cwd, selectedGroup.files, finalGroupMsg.trim());
        return;
      }
    } else {
      console.log(chalk.gray('\nOperation cancelled. No changes committed.\n'));
      return;
    }
  }
}

/**
 * Stage selected files, commit, and display result
 */
async function executeCommitWorkflow(repoRoot, files, message) {
  const commitSpinner = ora(chalk.blue('Staging selected changes and creating commit...')).start();

  try {
    const result = await safeCommit(repoRoot, {
      files,
      message
    });

    commitSpinner.succeed(chalk.green('Commit created successfully!'));
    console.log(chalk.bold.white(`\nCommit:  ${chalk.cyan(result.shortHash)}`));
    console.log(chalk.bold.white(`Branch:  ${chalk.yellow(result.branch)}`));
    console.log(chalk.bold.white(`Message: ${result.message}`));
    console.log(chalk.gray(`Files:   ${result.filesCommitted.length} committed\n`));
  } catch (err) {
    commitSpinner.fail(chalk.red(`Commit failed: ${err.message}`));
    process.exit(1);
  }
}
