#!/usr/bin/env node
// Codex SDK 0.172.0 forwards config values but has no API for these CLI flags.
import { createRequire } from 'node:module';
import path from 'node:path';

const [, , command, ...args] = process.argv;
if (command !== 'exec') process.exit(1);
const sdkRequire = createRequire(import.meta.resolve('@openai/codex-sdk'));
const cli = path.join(path.dirname(sdkRequire.resolve('@openai/codex/package.json')), 'bin/codex.js');
process.execve(process.execPath, [process.execPath, cli, command, '--ignore-user-config', '--ignore-rules', '--ephemeral', ...args], process.env);
