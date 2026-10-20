import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../frontend/src/App";
import { AiPane, formatToolCommand, renderChatText, ToolSteps } from "../frontend/src/components/AiPane";
import { CustomConfigModal } from "../frontend/src/components/CustomConfigModal";
import { INITIAL_ITEMS } from "../frontend/src/data/items";

test("tool command previews remove known shell wrappers without executing commands", () => {
  assert.equal(formatToolCommand("/run/current-system/sw/bin/bash -lc 'npm test'"), "npm test");
  assert.equal(formatToolCommand("bash -lc 'printf '\"'\"'%s\\n'\"'\"' hello\nnode --version'"), "printf '%s\\n' hello node --version");
  assert.equal(formatToolCommand("sh -c 'printf '\\''hello'\\'''"), "printf 'hello'");
  assert.equal(formatToolCommand('bash -lc "npm test"'), "npm test");
  for (const command of ["npm test", "bash -lc 'npm test", "bash -lc 'npm test' extra", "custom-shell -lc 'npm test'"]) {
    assert.equal(formatToolCommand(command), command);
  }
});

test("tool activity uses compact expandable rows with full commands and bounded output", () => {
  const command = `/run/current-system/sw/bin/bash -lc 'echo ${"checking ".repeat(100)}'`;
  const html = renderToStaticMarkup(<ToolSteps steps={[
    { id: "run", label: `Running ${formatToolCommand(command)}`, command, output: "<script>not HTML</script>\nverified" },
    { id: "failed", label: "Failed npm test", command: "npm test", failed: true },
    { id: "notice", label: "Inspecting files\nChecking configuration" },
  ]} />);
  assert.equal((html.match(/<details\b/g) || []).length, 3);
  for (const summary of html.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/g) || []) {
    assert.match(summary, /truncate/);
    assert.match(summary, /title=/);
    assert.doesNotMatch(summary, /break-all|whitespace-pre-wrap|rounded-xl/);
  }
  assert.match(html, /font-mono/);
  assert.match(html, /aria-label="Tool activity"/);
  assert.match(html, /aria-label="Full command"/);
  assert.match(html, /aria-label="Command output"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /max-h-48[^\"]*overflow-auto/);
  assert.match(html, /text-\(--ctp-red\)/);
  assert.match(html, /&lt;script&gt;not HTML&lt;\/script&gt;/);
  assert.ok(html.includes(command.replaceAll("'", "&#x27;")));
  assert.match(html, /Inspecting files\nChecking configuration/);
  assert.doesNotMatch(html, /<script|Show 3 steps|animate-bounce/);
  const source = readFileSync(new URL("../frontend/src/components/AiPane.tsx", import.meta.url), "utf8");
  assert.match(source, /<ToolSteps steps=\{steps\}/);
  assert.match(source, /<ToolSteps steps=\{msg\.steps\}/);
  assert.doesNotMatch(source, /steps\.at\(-1\)|Show \{steps\.length\} steps/);
});

test("assistant uses Catppuccin tokens throughout, including messages and Markdown", () => {
  const source = readFileSync(new URL("../frontend/src/components/AiPane.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /(?:bg|text|border|ring|outline|caret|placeholder|decoration)-(?:slate|indigo|emerald|amber|rose|sky)-\d+|text-white/);
  assert.match(source, /bg-\(--ctp-mantle\)/);
  assert.match(source, /text-\(--ctp-text\)/);
  assert.match(source, /bg-\(--ctp-mauve\)/);
  assert.match(source, /text-\(--ctp-crust\)/);
});

test("multiple URLs become safe links without trailing sentence punctuation", () => {
  const html = renderToStaticMarkup(<>{renderChatText("Compare https://github.com/stablyai/orca and (https://chatgpt.com/).", true)}</>);
  assert.equal((html.match(/<a /g) || []).length, 2);
  assert.ok(html.includes('href="https://github.com/stablyai/orca"'));
  assert.ok(html.includes('href="https://chatgpt.com/"'));
  assert.equal((html.match(/rel="noopener noreferrer"/g) || []).length, 2);
  assert.equal((html.match(/aria-hidden="true"/g) || []).length, 2);
});

test("input highlighting leaves text unchanged and never creates links", () => {
  const text = "HTTPS://example.com/?a=1&b=2\nhttps://chatgpt.com/";
  const html = renderToStaticMarkup(<>{renderChatText(text, false)}</>);
  assert.equal((html.match(/<span /g) || []).length, 2);
  assert.ok(!html.includes("<a "));
  assert.equal(html.replace(/<[^>]+>/g, "").replaceAll("&amp;", "&"), text);
});

test("HTML and unsafe protocols remain plain text", () => {
  const html = renderToStaticMarkup(<>{renderChatText('<script>alert(1)</script> javascript:alert(1) data:text/html,x', true)}</>);
  assert.ok(!html.includes("<a "));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("Markdown links show the raw URL instead of label or syntax", () => {
  const html = renderToStaticMarkup(<>{renderChatText("Source ([github.com](https://github.com/magnitudedev/magnitude)).", true)}</>);
  assert.equal((html.match(/<a /g) || []).length, 1);
  assert.ok(html.includes('href="https://github.com/magnitudedev/magnitude"'));
  assert.equal(html.replace(/<[^>]+>/g, ""), "Source (https://github.com/magnitudedev/magnitude).");
  assert.equal(renderToStaticMarkup(<>{renderChatText("[label](https://example.com)", false)}</>).replace(/<[^>]+>/g, ""), "[label](https://example.com)");
});

test("chat answers render common Markdown without linking code", () => {
  const html = renderToStaticMarkup(<>{renderChatText("## Found\n- **Location:** `/tmp/tool`\n- Source: https://github.com/example/tool\n\n1. Approve\n2. Run `node -e 'https://github.com/example/tool'`\n\n```js\nconst url = \"https://github.com/example/tool\";\n```", true)}</>);
  assert.match(html, /<h3[^>]*>Found<\/h3>/);
  assert.match(html, /<ul[^>]*><li[^>]*><strong[^>]*>Location:<\/strong> <code[^>]*>\/tmp\/tool<\/code><\/li>/);
  assert.match(html, /<ol[^>]*><li[^>]*>Approve<\/li><li[^>]*>Run <code[^>]*>node -e &#x27;https:\/\/github.com\/example\/tool&#x27;<\/code><\/li><\/ol>/);
  assert.match(html, /<pre[^>]*><code[^>]*>const url = &quot;https:\/\/github.com\/example\/tool&quot;;<\/code><\/pre>/);
  assert.equal((html.match(/<a /g) || []).length, 1);
  assert.doesNotMatch(html, /```|\*\*|## /);
});

test("long inline commands scroll separately instead of wrapping through the answer", () => {
  const command = `node -e 'const url = "https://github.com/example/tool"; ${"verify();".repeat(30)}'`;
  const html = renderToStaticMarkup(<>{renderChatText(`After approval:\n\`${command}\``, true)}</>);
  assert.match(html, /<code[^>]*tabindex="0"[^>]*class="[^"]*overflow-auto[^"]*whitespace-pre/);
  assert.doesNotMatch(html, /<a /);
  assert.match(html, /verify\(\);verify\(\);/);
});

test("code blocks preserve indentation, escape HTML, and tolerate an unfinished fence", () => {
  const html = renderToStaticMarkup(<>{renderChatText('```html\n<script>bad()</script>\n  <a href="javascript:bad()">bad</a>', true)}</>);
  assert.match(html, /<pre[^>]*tabindex="0"/);
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;\n  &lt;a href=&quot;javascript:bad()&quot;&gt;bad&lt;/a&gt;'));
  assert.doesNotMatch(html, /<script|<a /);
});

test("dashboard, chat, and item settings omit activation controls and status", () => {
  const item = { ...INITIAL_ITEMS[0], installed: true, receipt: {
    name: "Tool", githubUrl: INITIAL_ITEMS[0].githubUrl, installed: true, enabled: true,
    location: "/tmp/tool", method: "test", configurationNotes: "", version: "1.0.0",
    installCommand: "install-tool", updateCommand: "update-tool", uninstallCommand: "remove-tool",
    enableCommand: "enable-tool", disableCommand: "disable-tool", verificationCommand: "tool --version",
    verifiedAt: "2026-10-19T00:00:00Z",
  } };
  const noop = () => {};
  const dashboard = renderToStaticMarkup(<App />);
  const chat = renderToStaticMarkup(<AiPane isOpen items={[item]} onClose={noop} onClearSubmittedPrompt={noop} onInventoryChanged={noop} />);
  const settings = renderToStaticMarkup(<CustomConfigModal isOpen item={item} onClose={noop} onAskAi={noop} />);
  for (const html of [dashboard, chat, settings]) {
    assert.doesNotMatch(html, /\b(?:enabled|disabled|activation)\b(?![=:])/i);
    assert.doesNotMatch(html, /Enable All|Disable All|enable-tool|disable-tool/);
  }
  assert.match(chat, /1 verified/);
  assert.match(settings, /Installation State/);
  assert.match(settings, /update-tool/);
  assert.match(settings, /remove-tool/);
});

test("card details display metadata without manual editing or removal controls", () => {
  const noop = () => {};
  const item = { ...INITIAL_ITEMS[0], customNotes: 'Saved through chat', customCommand: 'tool --help', tags: ['CLI'] };
  const details = renderToStaticMarkup(<CustomConfigModal isOpen item={item} onClose={noop} onAskAi={noop} />);
  assert.match(details, /Saved through chat/);
  assert.match(details, /tool --help/);
  assert.match(details, /CLI/);
  assert.match(details, /Manage in chat/);
  assert.doesNotMatch(details, /<input|<textarea|<form|Save Configuration|Remove Card/);
  assert.doesNotMatch(renderToStaticMarkup(<App />), /Reset Defaults/);
});

test("the target folder picker belongs in the app header; chat keeps clear conversation", () => {
  const dashboard = renderToStaticMarkup(<App />);
  const chat = renderToStaticMarkup(<AiPane isOpen onClose={() => {}} items={INITIAL_ITEMS} onClearSubmittedPrompt={() => {}} onInventoryChanged={() => {}} />);
  assert.doesNotMatch(dashboard + chat, /Check Updates|Add Item|Export Script|Quick actions|Install from GitHub|Prepare scripts only/);
  const header = dashboard.slice(0, dashboard.indexOf('</header>'));
  assert.match(header, /aria-label="Target folder"/);
  assert.match(header, /aria-haspopup="dialog"/);
  assert.match(dashboard, /Use this folder/);
  assert.match(dashboard, /aria-label="Parent folder"/);
  assert.match(dashboard, /<dialog[^>]*aria-labelledby="codex-folder-title"/);
  assert.match(dashboard, /aria-label="Close folder picker"/);
  assert.match(dashboard, />Cancel<\/button>/);
  assert.doesNotMatch(chat, /Target folder|Use this folder|<dialog/);
  assert.doesNotMatch(chat, /id="codex-target-folder"|Absolute path or ~\/project/);
  assert.match(chat, /aria-label="Clear conversation"/);
  assert.match(chat, /lucide-eraser/);
  assert.doesNotMatch(chat, /lucide-trash/);
  assert.match(dashboard, /Loading catalog/);
  assert.doesNotMatch(dashboard, /No items match your filter/);
});

test("assistant pane stays below the topbar so its toggle remains usable", () => {
  const dashboard = renderToStaticMarkup(<App />);
  const chat = renderToStaticMarkup(<AiPane isOpen onClose={() => {}} items={INITIAL_ITEMS} onClearSubmittedPrompt={() => {}} onInventoryChanged={() => {}} />);
  assert.match(dashboard, /<button[^>]*id="assistant-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="assistant-pane"/);
  assert.doesNotMatch(dashboard, /lg:mr-\[460px\]/);
  assert.match(chat, /<aside[^>]*id="assistant-pane"[^>]*aria-labelledby="assistant-pane-title"/);
  assert.match(chat, /id="assistant-pane-title"/);
  const pane = /<aside[^>]*class="([^"]*)"/.exec(chat)?.[1] ?? "";
  assert.doesNotMatch(pane, /\bfixed\b/);
  assert.match(pane, /\babsolute\b.*\blg:relative\b.*\blg:w-\[460px\]/);
  assert.match(chat, /<button[^>]*aria-label="Close assistant"/);
  assert.match(chat, /<button[^>]*aria-label="Expand assistant"[^>]*aria-pressed="false"/);
  const appSource = readFileSync(new URL("../frontend/src/App.tsx", import.meta.url), "utf8");
  const chatSource = readFileSync(new URL("../frontend/src/components/AiPane.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(appSource, /lg:mr-\[460px\]/);
  assert.match(appSource, /<div className="relative flex min-h-0[^\n]*>[\s\S]*<AiPane[\s\S]*?\/>\s*<\/div>/);
  assert.doesNotMatch(appSource, /isAiPaneOpen\s*&&\s*(?:\(\s*)?<AiPane/);
  assert.match(appSource, /setIsAiPaneOpen\(false\);\s*assistantToggle\.current\?\.focus\(\)/);
  assert.match(chatSource, /event\.key === "Escape"/);
  assert.match(appSource, /workspace=\{workspace\}/);
  assert.match(chatSource, /\[workspace\]/);
  assert.match(chatSource, /await runAgent\(\{ mode: "chat", message: query, history \}\)/);
  assert.doesNotMatch(chatSource, /Approve and run on this machine/);
});
