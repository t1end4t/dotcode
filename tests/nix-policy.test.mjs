import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Nix lifecycle policy requires durable roots and safe replacement', async () => {
  const policy = await readFile(new URL('../instructions.md', import.meta.url), 'utf8');
  assert.match(policy, /nix-store --realise.*--add-root.*--indirect/);
  assert.match(policy, /Keep the previous root until.*verification succeeds/);
  assert.match(policy, /nix-store --query --roots/);
  assert.match(policy, /Uninstall.*remove.*gc-root/);
});
