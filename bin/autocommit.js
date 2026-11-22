#!/usr/bin/env node

import { runCLI } from '../src/cli/index.js';

runCLI().catch((err) => {
  console.error('\nAutoCommit unexpected error:', err.message || err);
  process.exit(1);
});
