import assert from "node:assert/strict";
import test from "node:test";
import { readApiJson } from "../frontend/src/useCatalog";
import { mergeInventory } from "../frontend/src/inventory";
import { INITIAL_ITEMS } from "../frontend/src/data/items";

test("empty and HTML API responses explain server recovery instead of exposing JSON parse errors", async () => {
  for (const response of [new Response(null, { status: 500 }), new Response("<!doctype html>")]) {
    await assert.rejects(readApiJson(response), /Restart the DotCode server, then reload/);
  }
});

test("API responses preserve valid data and server validation errors", async () => {
  assert.deepEqual(await readApiJson(Response.json({ items: [] })), { items: [] });
  await assert.rejects(readApiJson(Response.json({ error: "Invalid catalog. File unchanged." }, { status: 400 })), /Invalid catalog. File unchanged/);
});

test("inventory refresh preserves named catalog categories without new AI assignments", () => {
  const item = { ...INITIAL_ITEMS[0], category: "Developer Tools", categoryLabel: "Developer Tools" };
  const [refreshed] = mergeInventory([item], [], []);
  assert.equal(refreshed.category, "Developer Tools");
  assert.equal(refreshed.categoryLabel, "Developer Tools");
  assert.equal(item.category, "Developer Tools");
});
