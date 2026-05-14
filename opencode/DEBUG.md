# DEBUG: ProviderModelNotFoundError Fix

## Problem
Task category `visual-engineering` failed with `ProviderModelNotFoundError`.

## Root Cause
Config at `~/.config/opencode/oh-my-openagent.json` pointed all agents/categories to model `opencode/gpt-5-nano`, which is not available in this opencode install.

Available models:
```
opencode/big-pickle
opencode/deepseek-v4-flash-free
opencode/minimax-m2.5-free
opencode/nemotron-3-super-free
opencode/ring-2.6-1t-free
opencode-go/deepseek-v4-flash
opencode-go/deepseek-v4-pro
opencode-go/glm-5
opencode-go/glm-5.1
opencode-go/kimi-k2.5
opencode-go/kimi-k2.6
opencode-go/mimo-v2.5
opencode-go/mimo-v2.5-pro
opencode-go/minimax-m2.5
opencode-go/minimax-m2.7
opencode-go/qwen3.5-plus
opencode-go/qwen3.6-plus
9router/paid-combo
```

## Fix Applied
Replace all instances of `opencode/gpt-5-nano` → `9router/paid-combo` in config file.

File: `~/.config/opencode/oh-my-openagent.json`

Command used:
```bash
# Edit replaceAll "opencode/gpt-5-nano" → "9router/paid-combo"
```

## Verification
```bash
opencode models | grep paid-combo
# Output: 9router/paid-combo
```

## Status
Fixed. Task delegation now works.