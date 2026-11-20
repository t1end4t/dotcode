# Issue tracker: GitHub

Issues and specs live at https://github.com/t1end4t/dotcode/issues.
Use the `gh` CLI from the repository root.

- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open`.
- Create: `gh issue create --title "..." --body-file <file>`.
- Comment: `gh issue comment <number> --body-file <file>`.
- Label: `gh issue edit <number> --add-label "..."`.
- Close: post the explanation, then run `gh issue close <number>`.

Before creating issues, verify the target with
`gh repo view --json nameWithOwner`.
Create issues only in `t1end4t/dotcode`.

Use native GitHub sub-issues and blocking dependencies when supported.
Otherwise, record `Part of #<parent>` and `Blocked by: #<number>`
at the top of the issue body.

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", read the GitHub issue.

## Pull requests as a triage surface

**PRs as a request surface: no.**
