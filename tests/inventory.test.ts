import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_ITEMS } from "../frontend/src/data/items";
import { applyReleaseCheck, mergeInventory, type Installation, type ReleaseCheck } from "../frontend/src/inventory";

test("inventory receipts replace seed installation flags without mutating the catalog", () => {
  const seed = { ...INITIAL_ITEMS[0], installed: true, hasUpdate: true };
  const original = structuredClone(seed);
  const [unverified] = mergeInventory([seed], []);
  assert.equal(unverified.installed, false);
  assert.equal(unverified.hasUpdate, false);

  const receipt: Installation = {
    name: seed.name, githubUrl: `${seed.githubUrl.toUpperCase()}.git/`,
    installed: true, location: "/tmp/dotcode-test/tool", method: "test",
    configurationNotes: "", version: "1.2.3", installCommand: "", updateCommand: "",
    uninstallCommand: "", verificationCommand: "test -x tool",
    verifiedAt: "2026-10-19T00:00:00Z",
  };
  const merged = mergeInventory([seed], [receipt], [{ githubUrl: seed.githubUrl, category: "Utilities" }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].installed, true);
  assert.equal(merged[0].currentVersion, "1.2.3");
  assert.equal(merged[0].category, "Utilities");
  assert.equal(merged[0].categoryLabel, "Utilities");
  assert.deepEqual(seed, original);
});

const receipt: Installation = {
  name: INITIAL_ITEMS[0].name, githubUrl: INITIAL_ITEMS[0].githubUrl, installed: true,
  location: "/tmp/dotcode-test/tool", method: "test", configurationNotes: "", version: "1.2.3",
  installCommand: "", updateCommand: "", uninstallCommand: "",
  verificationCommand: "test -x tool", verifiedAt: "2026-10-19T00:00:00Z",
};

test("removed cards stay removed despite retained install or uninstall receipts", () => {
  assert.deepEqual(mergeInventory([], [receipt]), []);
  assert.deepEqual(mergeInventory([], [{ ...receipt, installed: false }]), []);
  assert.equal(mergeInventory([INITIAL_ITEMS[0]], [{ ...receipt, installed: false }]).length, 1);
});

test("update checks compare versions without claiming unknown or missing installations are current", () => {
  const item = { ...INITIAL_ITEMS[0], installed: true, currentVersion: "1.2.3", receipt };
  const checkedAt = "2026-10-19T00:00:00Z";
  const check: ReleaseCheck = { githubUrl: item.githubUrl, latestVersion: "v1.10.0", checkedAt };
  assert.equal(applyReleaseCheck(item, check).hasUpdate, true);
  assert.equal(applyReleaseCheck(item, { ...check, latestVersion: "v1.2.3" }).hasUpdate, false);
  assert.match(applyReleaseCheck(item, { ...check, latestVersion: "1.2.2" }).updateStatus!, /newer than/);
  assert.match(applyReleaseCheck({ ...item, currentVersion: "main" }, check).updateStatus!, /manual comparison/);
  assert.match(applyReleaseCheck({ ...item, currentVersion: undefined }, check).updateStatus!, /manual comparison/);
  assert.equal(applyReleaseCheck({ ...item, installed: false }, check).hasUpdate, false);
  assert.equal(applyReleaseCheck(item, { ...check, error: "Rate limited" }).hasUpdate, false);
  const merged = mergeInventory([item], [{ ...receipt, version: "1.2.3" }], [], [check]);
  assert.equal(merged[0].hasUpdate, true);
  assert.equal(mergeInventory(merged, [{ ...receipt, version: "1.10.0" }], [], [check])[0].hasUpdate, false);
});

for (const [currentVersion, latestVersion, hasUpdate, status] of [
  ['1.9.0', 'v1.10.0', true, /Update available/],
  ['1', 'v1.0.0', false, /Up to date/],
  ['v1.2.3+local', '1.2.3+release', false, /Up to date/],
  ['2.0.0', '1.99.0', false, /newer than/],
  ['9007199254740992', '9007199254740993', true, /Update available/],
  ['1.2.3-beta.1', 'v1.2.3', false, /manual comparison/],
  ['1.2.3', 'release-2.0', false, /manual comparison/],
  ['', 'v1.2.3', false, /manual comparison/],
] as const) {
  test(`release comparison: ${currentVersion || '(unknown)'} against ${latestVersion}`, () => {
    const item = { ...INITIAL_ITEMS[0], installed: true, currentVersion };
    const result = applyReleaseCheck(item, { githubUrl: item.githubUrl, latestVersion, checkedAt: '2026-10-19T00:00:00Z' });
    assert.equal(result.hasUpdate, hasUpdate);
    assert.match(result.updateStatus!, status);
  });
}

test("failed update checks clear stale update badges without changing installation state", () => {
  const item = { ...INITIAL_ITEMS[0], installed: true, receipt, currentVersion: '1.2.3', hasUpdate: true, latestVersion: '2.0.0' };
  const check: ReleaseCheck = { githubUrl: item.githubUrl, error: 'GitHub unavailable', checkedAt: '2026-10-19T00:00:00Z' };
  const original = structuredClone(item);
  const originalCheck = structuredClone(check);
  const result = applyReleaseCheck(item, check);
  assert.equal(result.hasUpdate, false);
  assert.equal(result.latestVersion, undefined);
  assert.equal(result.updateStatus, 'GitHub unavailable');
  assert.equal(result.lastChecked, check.checkedAt);
  assert.equal(result.installed, true);
  assert.deepEqual(result.receipt, item.receipt);
  assert.deepEqual(item, original);
  assert.deepEqual(check, originalCheck);
});

test("inventory refresh matches release URLs and removes update badges after uninstall", () => {
  const seed = INITIAL_ITEMS[0];
  const check: ReleaseCheck = { githubUrl: `${seed.githubUrl.toUpperCase()}.git/`, latestVersion: 'v2.0.0', checkedAt: '2026-10-19T00:00:00Z' };
  const [updated] = mergeInventory([seed], [receipt], [], [check]);
  assert.equal(updated.hasUpdate, true);
  const [removed] = mergeInventory([updated], [{ ...receipt, installed: false }], [], [check]);
  assert.equal(removed.hasUpdate, false);
  assert.match(removed.updateStatus!, /Latest release/);
  const [unchecked] = mergeInventory([updated], [receipt]);
  assert.equal(unchecked.hasUpdate, false);
  assert.equal(unchecked.latestVersion, undefined);
  assert.equal(unchecked.updateStatus, undefined);
});
