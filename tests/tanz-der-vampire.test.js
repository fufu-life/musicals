const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const expectedOrders = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 17,
  18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
];

function loadSongs(file, variable) {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  return context.window[variable];
}

test("Tanz der Vampire uses the canonical theatrical order without alternate-recording duplicates", () => {
  const fullSongs = loadSongs("tanz-der-vampire/songs-full.js", "songs");
  const metadataSongs = loadSongs("tanz-der-vampire/songs.js", "songs");
  const initialSongs = loadSongs("tanz-der-vampire/songs-initial.js", "songsInitial");

  assert.deepEqual(Array.from(fullSongs, (song) => song.order), expectedOrders);
  assert.deepEqual(
    Array.from(fullSongs, (song) => song.displayOrder),
    expectedOrders.map((_, index) => index + 1),
  );
  assert.equal(new Set(fullSongs.map((song) => song.id)).size, fullSongs.length);
  assert.deepEqual(
    Array.from(metadataSongs, (song) => [song.id, song.order, song.displayOrder]),
    Array.from(fullSongs, (song) => [song.id, song.order, song.displayOrder]),
  );
  assert.deepEqual(
    Array.from(initialSongs, (song) => [song.id, song.order, song.displayOrder]),
    Array.from(fullSongs, (song) => [song.id, song.order, song.displayOrder]),
  );
});
