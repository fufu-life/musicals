const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const pageToolsCss = fs.readFileSync(path.join(__dirname, "../lyrics-page-tools.css"), "utf8");

test("shared lyric search hides the native WebKit cancel button", () => {
  assert.match(
    pageToolsCss,
    /\.lyrics-tools-search input::-webkit-search-cancel-button\s*\{[^}]*display:\s*none\s*;?[^}]*\}/s,
  );
});
