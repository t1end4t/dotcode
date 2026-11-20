// Run with the prototype server running: npm run prototype:smoke
import assert from "node:assert/strict";

const origin = "http://127.0.0.1:5174";
const html = await (await fetch(`${origin}/`)).text();
assert.match(html, /\/main\.tsx/, "Prototype must serve its separate entry");
const mutation = await fetch(`${origin}/api/catalog`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: '{"items":[]}',
});
assert.equal(mutation.status, 404, "Prototype must not expose the catalog mutation API");
console.log("Prototype entry and API isolation: OK");
