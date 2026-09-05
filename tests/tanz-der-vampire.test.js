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

test("Tanz der Vampire translations are publication-safe and speaker labels are normalized", () => {
  const fullSongs = loadSongs("tanz-der-vampire/songs-full.js", "songs");
  const allLines = fullSongs.flatMap((song) => song.lines);
  const forbiddenTranslation = /[粑粑~～！!]|……|\.\.\.|[（）()]|[“”"‘’]|[+＋]/u;
  const forbiddenSpeakers = new Set([
    "A",
    "H",
    "P",
    "P (Professor)",
    "Von Krolocks Stimme (zu Alfred)",
  ]);

  assert.equal(allLines.length, 1608);
  assert.equal(allLines.filter((line) => forbiddenTranslation.test(line.zh)).length, 0);
  assert.equal(allLines.filter((line) => forbiddenSpeakers.has(line.speaker)).length, 0);

  const ballroom = fullSongs.find((song) => song.order === 29);
  assert.equal(ballroom.lines[0].id, "tanz-der-vampire-29-002");
  assert.equal(ballroom.lines[0].speaker, "克罗洛克");
  assert.equal(
    ballroom.lines.some((line) => /^(?:VON KROLOCK|VAMPIRE|SARAH|ALFRED|PROFESSOR)$/u.test(line.original)),
    false,
  );
});
