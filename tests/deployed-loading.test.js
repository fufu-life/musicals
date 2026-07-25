const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function size(relativePath) {
  return fs.statSync(path.join(root, relativePath)).size;
}

function gzipSize(relativePath) {
  return zlib.gzipSync(fs.readFileSync(path.join(root, relativePath))).length;
}

function readWindowValue(relativePath, key) {
  const context = { window: {} };
  vm.runInNewContext(read(relativePath), context);
  return context.window[key];
}

test("initial data keeps every song title but only the first song lyrics", () => {
  [
    ["dazhuangwang/songs-initial.js", "dazhuangwangSongsInitial", "dazhuangwang/songs.js"],
    ["rouge-et-noir/songs-initial.js", "songsInitial", "rouge-et-noir/songs.js"],
    ["mozart-opera-rock/songs-initial.js", "songsInitial", "mozart-opera-rock/songs.js"],
    ["romeo-et-juliette/songs-initial.js", "songsInitial", "romeo-et-juliette/songs.js"],
    ["moliere-le-spectacle-musical/songs-initial.js", "songsInitial", "moliere-le-spectacle-musical/songs.js"],
  ].forEach(([initialPath, key, fullPath]) => {
    const songs = readWindowValue(initialPath, key);
    assert.ok(songs[0].lines.length > 0, initialPath);
    assert.ok(songs.slice(1).every((song) => song.lines.length === 0), initialPath);
    assert.ok(gzipSize(initialPath) < gzipSize(fullPath), initialPath);
  });

  const initialRows = readWindowValue("Hamilton/lyrics-initial.js", "hamiltonLyricsInitialRows");
  const fullRows = readWindowValue("Hamilton/lyrics-data.js", "hamiltonLyricsRows");
  assert.equal(new Set(initialRows.map((row) => row.song_id)).size, new Set(fullRows.map((row) => row.song_id)).size);
  assert.ok(gzipSize("Hamilton/lyrics-initial.js") < gzipSize("Hamilton/lyrics-data.js"));
});

test("deployed entry pages suppress the implicit favicon request and do not preload audio", () => {
  [
    "index.html",
    "dazhuangwang/index.html",
    "Hamilton/index.html",
    "rouge-et-noir/index.html",
    "mozart-opera-rock/index.html",
    "romeo-et-juliette/index.html",
    "moliere-le-spectacle-musical/index.html",
  ].forEach((relativePath) => {
    const index = read(relativePath);
    assert.match(index, /<link rel="icon" href="data:," \/>/, relativePath);
    assert.doesNotMatch(index, /<audio\b|preload=["'](?:auto|metadata)["']/, relativePath);
  });
});

test("dazhuangwang starts its external lyric download from the document head", () => {
  const index = read("dazhuangwang/index.html");
  assert.match(index, /<link rel="preload" href="songs-initial\.js" as="script" \/>/);
  assert.match(index, /<link rel="icon" href="data:," \/>/);
  assert.match(index, /writeCriticalScript\("songs-initial\.js"\)/);
  assert.match(index, /ensureSearchReady:\s*ensureFullSongs/);
  assert.doesNotMatch(index, /const dazhuangwangSongs = \[/);
  assert.doesNotMatch(index, /<audio\b|preload=["'](?:auto|metadata)["']/);
  assert.match(index, /content-visibility:\s*auto/);
  assert.ok(size("dazhuangwang/index.html") < 600_000);
  assert.ok(size("dazhuangwang/songs.js") < 600_000);
});

test("Hamilton renders lyrics before loading analysis and word dictionaries", () => {
  const index = read("Hamilton/index.html");
  const script = read("Hamilton/script.js");
  assert.match(index, /<link rel="preload" href="lyrics-initial\.js" as="script" \/>/);
  assert.doesNotMatch(index, /<link rel="preload" href="word-data\.js"/);
  assert.match(index, /writeCriticalScript\("lyrics-initial\.js"\)/);
  assert.doesNotMatch(index, /<script src="(?:songs|word-data)\.js"><\/script>/);
  assert.match(script, /renderCurrentSong\(\);\s*scheduleDeferredData\(\)/);
  assert.match(script, /showLoadingPopover\(part, button\);\s*await ensureWordDictionaryReady\(\)/);
  assert.match(script, /window\.addEventListener\("load", start, \{ once: true \}\)/);
  assert.doesNotMatch(index, /<audio\b|preload=["'](?:auto|metadata)["']/);
  assert.ok(gzipSize("Hamilton/lyrics-data.js") < 250_000);
});

test("Rouge et Noir renders lyrics before loading corrected line phonetics", () => {
  const index = read("rouge-et-noir/index.html");
  const script = read("rouge-et-noir/script.js");
  assert.match(index, /<link rel="preload" href="songs-initial\.js" as="script" \/>/);
  assert.match(index, /writeCriticalScript\("songs-initial\.js"\)/);
  assert.match(script, /ensureSearchReady:\s*ensureFullSongs/);
  assert.doesNotMatch(index, /<script src="line-phonetics\.js"><\/script>/);
  assert.match(script, /renderCurrentSong\(\)/);
  assert.match(script, /scheduleDeferredPhonetics\(\)/);
  assert.match(script, /window\.addEventListener\("load", start, \{ once: true \}\)/);
  assert.doesNotMatch(index, /<audio\b|preload=["'](?:auto|metadata)["']/);
  assert.ok(size("rouge-et-noir/songs.js") < 650_000);
});

test("shared search index is created only when a search runs", () => {
  const script = read("shared/lyrics-page-tools.js");
  assert.match(script, /let searchIndex = null/);
  assert.match(script, /function getSearchIndex\(\)/);
  assert.match(script, /searchIndex\(getSearchIndex\(\), queryValue/);
});
