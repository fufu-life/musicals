const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cursorScript = fs.readFileSync(path.join(root, "library-cursor.js"), "utf8");
const libraryScript = fs.readFileSync(path.join(root, "library.js"), "utf8");

test("copyright dialog restores the native cursor above the modal", () => {
  assert.match(cursorScript, /const copyrightNotice = document\.querySelector\("#copyrightNotice"\)/);
  assert.match(cursorScript, /new MutationObserver\(syncCursorWithDialog\)\.observe\(copyrightNotice/);
  assert.match(cursorScript, /copyrightNotice\.addEventListener\("close", syncCursorWithDialog\)/);
  assert.match(cursorScript, /document\.body\.classList\.toggle\("library-cursor-active", !dialogOpen\)/);
  assert.match(cursorScript, /syncCursorWithDialog\(\);/);
  assert.match(cursorScript, /if \(copyrightNotice\?\.open\) return;/);
  assert.match(libraryScript, /copyrightNotice\.showModal\(\);\s*setLibraryCursorMode\(false\);/);
  assert.match(libraryScript, /copyrightNotice\.addEventListener\("close", \(\) => setLibraryCursorMode\(true\)\)/);
  assert.match(indexHtml, /body:has\(\.copyright-dialog\[open\]\)[\s\S]*cursor: auto !important/);
  assert.match(indexHtml, /body:has\(\.copyright-dialog\[open\]\) \.spotlight-mouse[\s\S]*opacity: 0 !important/);
});

test("library title row exposes the Xiaohongshu update link without showing its URL", () => {
  assert.match(indexHtml, /class="library-update-notice"/);
  assert.match(indexHtml, /剧目更新动态可以关注<a href="https:\/\/xhslink\.cn\/m\/5oUCF9o85fs" target="_blank" rel="noopener noreferrer">小红书<\/a>，进群反馈更实时噢～多多四连，阿浮更有动力上新呀！/);
  assert.doesNotMatch(indexHtml, /剧目更新动态[^<]*https:\/\/xhslink\.cn\/m\/5oUCF9o85fs/);
  assert.match(indexHtml, /\.library-update-notice[\s\S]*white-space: nowrap/);
  assert.match(indexHtml, /@media \(max-width: 860px\)[\s\S]*\.library-update-notice[\s\S]*white-space: normal/);
});
