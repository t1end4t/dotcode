---
name: commit-commands
description: Git commit and branch cleanup workflows converted from Anthropic Claude Code's commit-commands plugin. Use when the user asks to commit changes, create a git commit, or clean up local branches whose remotes are gone.
license: Derived from https://github.com/anthropics/claude-code/tree/main/plugins/commit-commands
---

# Commit Commands

Use this skill for two workflows: create a commit from current changes, or delete local branches whose upstream remote branch is gone.

## Commit workflow

When the user asks to commit:

1. Inspect the repo state with `git status`.
2. If there are no staged changes, stage relevant changes with `git add` only after confirming they match the user's request. Do not stage unrelated files.
3. Review what will be committed with `git diff --staged`.
4. Create a concise commit message.
5. Run `git commit -m "<message>"`.
6. Do not push unless the user explicitly asks.

If unrelated local changes exist, leave them untouched and mention them.

## Clean gone branches workflow

When the user asks to clean gone branches:

1. Run `git fetch --prune`.
2. List local branches whose upstream is gone:

```bash
git branch -vv | grep ': gone]' || true
```

3. Delete only those gone local branches, preserving the current branch. Prefer safe deletion:

```bash
git branch -d <branch>
```

4. Use force deletion only if the user explicitly approves:

```bash
git branch -D <branch>
```

Report deleted branches and skipped branches.
