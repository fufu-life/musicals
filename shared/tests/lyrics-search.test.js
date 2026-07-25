const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildIndex,
  editDistanceAtMostOne,
  getHighlightRanges,
  normalizeSearchText,
  searchIndex,
} = require("../lyrics-search.js");

const songs = [{
  id: "01-alexander-hamilton",
  order: 1,
  title: "Alexander Hamilton",
  lines: [
    { id: "ham-01-001", en: "How does a bastard, orphan, son of a whore", zh: "一个私生子、孤儿" },
    { id: "ham-01-002", en: "I'm not throwing away my shot", zh: "我绝不会放弃机会" },
  ],
}, {
  id: "02-aaron-burr-sir",
  order: 2,
  title: "Aaron Burr, Sir",
  lines: [{ id: "ham-02-001", en: "Pardon me, are you Aaron Burr, sir?", zh: "请问您是阿伦·伯尔先生吗？" }],
}];

const index = buildIndex(songs, {
  getLinePrimary: (line) => line.en,
  getLineSecondary: (line) => line.zh,
});

test("normalization ignores case, accents, punctuation, spaces, and apostrophe style", () => {
  assert.equal(normalizeSearchText("  DON'T—Café  "), "dont cafe");
});

test("search matches titles, English lyrics, Chinese translations, and apostrophe-free queries", () => {
  const titleResult = searchIndex(index, "Alexander Hamilton");
  assert.equal(titleResult.results[0].type, "title");
  assert.equal(titleResult.songCount, 1);
  assert.equal(searchIndex(index, "dont").total, 0);
  assert.equal(searchIndex(index, "im throwing").results[0].lineId, "ham-01-002");
  assert.equal(searchIndex(index, "孤儿").results[0].lineId, "ham-01-001");
});

test("search supports token prefixes and only falls back to one-edit spelling tolerance", () => {
  assert.equal(searchIndex(index, "alex ham").results[0].type, "title");
  const fuzzy = searchIndex(index, "bastardd");
  assert.equal(fuzzy.mode, "fuzzy");
  assert.equal(fuzzy.results[0].lineId, "ham-01-001");
  assert.equal(editDistanceAtMostOne("bastardd", "bastard"), true);
  assert.equal(searchIndex(index, "bxxstard").total, 0);
});

test("search reports empty, no-result, and truncated states without inventing matches", () => {
  assert.equal(searchIndex(index, "   ").mode, "empty");
  assert.equal(searchIndex(index, "xyzxyz").total, 0);
  const limited = searchIndex(index, "a", { limit: 2 });
  assert.equal(limited.results.length, 2);
  assert.equal(limited.truncated, true);
});

test("highlight ranges map normalized apostrophe-free queries back to source text", () => {
  const value = "I'm not throwing away my shot";
  const ranges = getHighlightRanges(value, "im throwing");
  assert.deepEqual(ranges.map((range) => value.slice(range.start, range.end)), ["I'm", "throwing"]);
});
