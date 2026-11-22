# AutoCommit

> Intelligent Git automation and progress-protection CLI tool for developers.

AutoCommit provides two core capabilities:
1. **Smart Commits:** Analyzes working tree diffs, detects change intent, and generates high-quality Conventional Commit messages (with rule-based engine and optional AI).
2. **Automatic Progress Protection:** Monitors repositories and creates scheduled, non-destructive checkpoint commits so you never lose coding progress during crashes or interruptions.

---

## Features

- **Offline-First Rule Engine:** Generates Conventional Commits (`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`) without external API calls.
- **Multiple Commit Suggestions:** Provides 3 tailored options with in-terminal selection, editing, and regeneration.
- **Smart Change Grouping:** Detects logically unrelated changes across different modules (e.g. `auth`, `navbar`, `readme`) and offers to commit them separately.
- **Safe Staging:** Selectively stages only approved files; preserves existing staged and unstaged work without side-effects.
- **Scheduled Watch Mode:** Configurable automated checkpoint intervals (`5m`, `10m`, `15m`, `30m`, `1h`, or custom) with duplicate process prevention and stale lock detection.
- **Crash Recovery Protection:** Detects unexpected power-offs, terminal closures, or crashes, and offers safe recovery prompts.
- **Secret & Sensitive Data Guard:** Automatically excludes `.env`, private keys (`.pem`, `.key`, `id_rsa`), certificates, and AWS/GitHub tokens. Sanitizes AI diffs before transmission.
- **Non-Destructive Recovery:** Inspect checkpoints, create recovery branches, export diff patches, or restore individual files safely.
- **Optional AI Integration:** Plug-and-play support for Google Gemini, OpenAI, and Groq.

---

## Installation

Run directly with `npx`:

```bash
npx autocommit
```

Or install globally:

```bash
npm install -g autocommit
```

---

## Quick Start

### 1. Interactive Commit Generation

Run inside any Git repository with modified or staged changes:

```bash
npx autocommit
```

AutoCommit analyzes your diffs, checks for secrets, and presents 3 suggestions:

```text
AUTOCOMMIT v1.0.0
Repository: my-project
Branch: main
Analysis completed. Found 3 modified files.

Suggested commit:
  feat(auth): add user authentication

What would you like to do?
1. Approve and commit ("feat(auth): add user authentication")
2. Choose alternative message (feat(auth): implement session validation)
3. Choose alternative message (fix(auth): prevent invalid credentials submission)
4. Edit message manually
5. Generate new suggestions
6. View detailed changes / diff
7. Smart grouping (split unrelated changes)
8. Cancel
```

### 2. Scheduled Progress Protection (Watch Mode)

Protect against laptop crashes or sudden power failure by creating automatic checkpoints:

```bash
# Default 15-minute interval
npx autocommit watch

# Custom intervals
npx autocommit watch --interval 10m
npx autocommit watch --interval 30m

# Create a single immediate checkpoint
npx autocommit watch --once

# Inspect monitoring status from another terminal
npx autocommit watch --status

# Control monitoring process remotely
npx autocommit watch --pause
npx autocommit watch --resume
npx autocommit watch --stop
```

### 3. Checkpoint History & Recovery

```bash
# View all AutoCommit checkpoints
npx autocommit history

# Launch interactive recovery wizard
npx autocommit recover

# List checkpoints
npx autocommit recover --list

# Inspect a specific checkpoint commit
npx autocommit recover --inspect <hash>
```

---

## Configuration (`autocommit.config.json`)

Generate a default configuration file with:

```bash
npx autocommit init
```

Example configuration:

```json
{
  "style": "conventional",
  "maxMessageLength": 72,
  "ai": {
    "enabled": false,
    "provider": "gemini",
    "model": ""
  },
  "smartGrouping": true,
  "autoSave": {
    "enabled": false,
    "interval": "15m",
    "commitPrefix": "checkpoint:",
    "includeUntracked": false,
    "pauseOnIdle": true,
    "pushToRemote": false,
    "remoteName": "origin",
    "remoteBranch": ""
  },
  "exclude": [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "id_rsa*",
    "id_ed25519*",
    "node_modules/**",
    "dist/**",
    ".next/**"
  ]
}
```

---

## Optional AI Providers

AutoCommit is completely functional offline using its rule-based engine. To enable AI assistance:

```bash
# Enable via CLI flag
npx autocommit --ai

# Force local generation
npx autocommit --no-ai
```

Set provider API key in your environment:

- **Google Gemini:** `export GEMINI_API_KEY="your-key"` (default model: `gemini-1.5-flash`)
- **OpenAI:** `export OPENAI_API_KEY="your-key"` (default model: `gpt-4o-mini`)
- **Groq:** `export GROQ_API_KEY="your-key"` (default model: `llama-3.3-70b-versatile`)

> **Security Guarantee:** AutoCommit sanitizes all diffs prior to sending to an AI provider by masking high-entropy API keys, credentials, and passwords with `[REDACTED_SECRET]`.

---

## Crash Recovery Architecture

AutoCommit maintains state in `.autocommit/state.json` (auto-excluded from commits). When a session ends abnormally (power outage, killed terminal, kernel panic):

1. AutoCommit identifies the interrupted session on the next invocation.
2. Reconciles state with repository history.
3. Inspects current working tree changes.
4. Prompts you with options:
   - Inspect changes since the last checkpoint
   - Create a recovery checkpoint
   - Resume monitoring
   - View checkpoint details
   - Safely create a recovery branch (`recovery/checkpoint-<hash>`) without touching your working files

---

## CLI Command Reference

| Command | Description |
|---|---|
| `autocommit` | Interactive commit generation for current changes |
| `autocommit --dry-run` | Preview suggestions without staging or committing |
| `autocommit --style <style>` | Format style (`conventional` or `simple`) |
| `autocommit --ai` | Enable configured AI provider |
| `autocommit --no-ai` | Force local rule-based generation |
| `autocommit --verbose` | Show skipped files and detailed analysis |
| `autocommit init` | Initialize `autocommit.config.json` |
| `autocommit watch` | Start scheduled checkpoint monitoring |
| `autocommit watch -i <time>` | Watch with interval (`5m`, `10m`, `30m`, `1h`) |
| `autocommit watch --status` | Display monitoring status, PID, and modified file count |
| `autocommit watch --pause` | Pause active watch process |
| `autocommit watch --resume` | Resume paused watch process |
| `autocommit watch --stop` | Stop watch process gracefully |
| `autocommit watch --once` | Create immediate checkpoint if eligible changes exist |
| `autocommit history` | Display checkpoint commit history |
| `autocommit recover` | Safe, non-destructive recovery wizard |
| `autocommit recover --list` | List available checkpoints |
| `autocommit recover --inspect <hash>` | Inspect details of a checkpoint |

---

## Publishing to npm

To publish this package:

1. Verify package contents:
   ```bash
   npm pack --dry-run
   ```
2. Test local linking:
   ```bash
   npm link
   autocommit --help
   ```
3. Naming Note: The root name `autocommit` was previously used on npm. For official publishing, publish under your user or organization scope (e.g. `@your-scope/autocommit`) or as `autocommit-git` / `autocommit-cli`.
4. Publish:
   ```bash
   npm publish --access public
   ```

---

## License

MIT © 2026 AutoCommit Maintainers
