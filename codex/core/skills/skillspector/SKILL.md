---
name: skillspector
description: Scan third-party agent skills for security risks before installing or updating them. Use when a task involves adding an external skill or reviewing a skill's safety.
---

# SkillSpector

Use SkillSpector before installing or updating any third-party directory or URL containing a `SKILL.md`.

## Availability

Check first:

```bash
command -v skillspector
```

If unavailable, do not install it automatically. Tell the user to run:

```bash
uv tool install git+https://github.com/NVIDIA/SkillSpector.git
```

Then resume only after `skillspector --version` succeeds.

## Scan Workflow

1. Scan the candidate before copying it into an agent config directory:

   ```bash
   skillspector scan --no-llm <path-or-url>
   ```

2. Report the risk score, severity, recommendation, and findings.
3. Continue only when the report recommends `SAFE`.
4. For any other recommendation, stop and ask the user whether to reject or inspect the skill. Do not bypass findings or create a baseline unless explicitly requested.

Use `--recursive` when the input contains multiple immediate subdirectories with their own `SKILL.md` files.

## Deeper Scan

Run LLM analysis only when the user explicitly requests it and understands that skill contents may be sent to the configured provider:

```bash
skillspector scan <path-or-url>
```
