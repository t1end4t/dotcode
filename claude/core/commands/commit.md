---
description: Safely commit repo changes, including submodule commits plus parent pointer commits
argument-hint: "[message or scope]"
allowed-tools:
  - Bash(git status:*)
  - Bash(git rev-parse:*)
  - Bash(git branch:*)
  - Bash(git diff:*)
  - Bash(git submodule:*)
  - Bash(git ls-files:*)
  - Bash(git add:*)
  - Bash(git commit:*)
  - Bash(git log:*)
  - Bash(git show:*)
---

# Safe Commit Command

Create Git commits safely. Never push.

User args: `$ARGUMENTS`

## Success Criteria

- Normal repo changes are staged, reviewed, committed, then reported.
- If invoked inside a submodule, commit the submodule first, then commit only the updated submodule pointer in the parent repo.
- Parent repo unrelated changes stay unstaged unless the user explicitly includes them.
- Any failed command stops the workflow and is reported exactly.

## Workflow

1. Inspect state:
   - `git status --short`
   - `git rev-parse --show-toplevel`
   - `git branch --show-current`
   - detect submodule status with `.git` plus parent `git submodule status` / `git ls-files --stage <path>`
2. Report intended scope before staging.
3. Stage only requested files, or all current repo changes when no files are specified.
4. Show staged summary: `git diff --cached --stat`.
5. If no staged changes exist, stop: nothing to commit.
6. Commit with user-provided message, or infer a concise imperative message from staged diff.

## Submodule Workflow

When current repo is a submodule:

1. Commit inside the submodule first.
2. Capture submodule commit hash: `git rev-parse --short HEAD`.
3. Move to parent repo.
4. Stage only the submodule path: `git add <submodule-path>`.
5. Verify parent staged diff contains only that submodule pointer.
6. Commit parent pointer with `Update <submodule-name> submodule` unless user gave a parent message.
7. Report both commit hashes.

## Safety Rules

- Never push.
- Never run `git reset`, `git clean`, force ops, or destructive commands.
- Never stage unrelated parent repo changes during submodule pointer commit.
- Stop on commit failure.
- Final response includes commit hash(es), staged paths, unrelated changes left untouched, and `No push performed.`
