import { Command } from 'commander';
import { handleStandardCommit, handleInit, handleHistory, handleRecover, PACKAGE_VERSION } from './commands.js';
import { handleWatch } from './watchCommands.js';

export function createProgram() {
  const program = new Command();

  program
    .name('autocommit')
    .description('Intelligent Git automation and progress-protection CLI tool')
    .version(PACKAGE_VERSION, '-v, --version', 'Output the current version of AutoCommit')
    .option('--dry-run', 'Preview generated messages without committing')
    .option('--style <style>', 'Commit message style (conventional, simple)', 'conventional')
    .option('--ai', 'Enable AI-assisted commit message generation')
    .option('--no-ai', 'Force local rule-based generation')
    .option('--verbose', 'Show detailed analysis')
    .action(async (options) => {
      await handleStandardCommit(options);
    });

  program
    .command('init')
    .description('Initialize autocommit.config.json configuration file')
    .option('-f, --force', 'Overwrite existing configuration file')
    .action(async (options) => {
      await handleInit(options);
    });

  program
    .command('watch')
    .description('Monitor repository and create scheduled progress checkpoints')
    .option('-i, --interval <interval>', 'Checkpoint interval (e.g., 5m, 10m, 15m, 30m, 1h)')
    .option('--pause', 'Pause active watch monitoring')
    .option('--resume', 'Resume paused watch monitoring')
    .option('--stop', 'Stop active watch monitoring gracefully')
    .option('--status', 'Show current monitoring status')
    .option('--once', 'Create an immediate checkpoint if eligible changes exist')
    .action(async (options) => {
      await handleWatch(options);
    });

  program
    .command('history')
    .description('Display AutoCommit checkpoint commit history')
    .action(async (options) => {
      await handleHistory(options);
    });

  program
    .command('recover')
    .description('Interactive checkpoint recovery and inspection system')
    .option('-l, --list', 'List available checkpoints')
    .option('--inspect <hash>', 'Inspect a specific checkpoint commit')
    .action(async (options) => {
      await handleRecover(options);
    });

  return program;
}

export async function runCLI(argv = process.argv) {
  const program = createProgram();
  await program.parseAsync(argv);
}
