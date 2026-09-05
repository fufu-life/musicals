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

test("German word cards prefer the current glossary over stale generated cache", () => {
  const generatorSource = fs.readFileSync(path.join(root, "scripts", "generate-musical-pages.js"), "utf8");
  const commonIndex = generatorSource.indexOf("if (commonEntry)");
  const autoIndex = generatorSource.indexOf("if (autoEntry?.zh && autoEntry?.en)");
  const priorIndex = generatorSource.indexOf("if (\n    priorEntry");

  assert.ok(commonIndex >= 0);
  assert.ok(autoIndex > commonIndex);
  assert.ok(priorIndex > commonIndex);
  assert.match(
    generatorSource,
    /if \(!show\.legacyOutputSlug \|\| show\.legacyOutputSlug === show\.slug\) return \{\};/,
  );
});

test("Tanz der Vampire reviewed word cards replace the known stale translations", () => {
  const wordEntries = loadSongs("tanz-der-vampire/word-data.js", "wordEntries");
  const expected = {
    aktion: ["行动；行事", "action"],
    alkohol: ["酒精；酒", "alcohol"],
    aengste: ["恐惧；担忧（Ängste）", "fears"],
    alles: ["一切；所有事物", "everything / all"],
    fraktur: ["哥特体；黑体字", "blackletter"],
    schwamm: ["海绵", "sponge"],
    wirt: ["店主；旅馆老板", "host"],
  };
  for (const [key, [meaning, en]] of Object.entries(expected)) {
    assert.equal(wordEntries[key].meaning, meaning, key);
    assert.equal(wordEntries[key].en, en, key);
  }
});

test("all published German shows use the curated common German word meanings", () => {
  const expected = {
    am: ["在……时；在……上", "at the / on the"],
    an: ["在……旁；向着；在……上", "at / toward / on"],
    als: ["作为；当……时；比", "as / when / than"],
    also: ["所以；那么", "so / therefore"],
    habe: ["有；拥有", "have"],
    alles: ["一切；所有事物", "everything / all"],
  };
  const slugs = {
    "tanz-der-vampire": Object.keys(expected),
    "dracula-das-musical": ["am", "an", "als", "habe", "alles"],
    "ludwig-ii-sehnsucht-nach-dem-paradies": ["am", "an", "als", "alles"],
    "rebecca-das-musical": ["am", "an", "als", "also", "habe", "alles"],
    "elisabeth-das-musical": ["am", "an", "als", "habe", "alles"],
    "mozart-das-musical": Object.keys(expected),
  };

  for (const [slug, keys] of Object.entries(slugs)) {
    const wordEntries = loadSongs(`${slug}/word-data.js`, "wordEntries");
    for (const key of keys) {
      const [meaning, en] = expected[key];
      assert.ok(wordEntries[key], `${slug}:${key} is missing`);
      assert.equal(wordEntries[key].meaning, meaning, `${slug}:${key} meaning`);
      assert.equal(wordEntries[key].en, en, `${slug}:${key} English`);
    }
  }

  const auditedHighFrequency = {
    einfach: ["简单的；只是；直接的", "simple / just"],
    fällt: ["落下；跌落", "falls"],
    frei: ["自由的；免费的；空闲的", "free"],
    geh: ["走；去（省音）", "go"],
    gehn: ["走；去（省音）", "go"],
    heißt: ["叫作；意味着", "is called / means"],
    ins: ["进入……；到……里（in das）", "into the"],
    lass: ["让；放开（命令式）", "let / leave"],
    liebt: ["爱；喜欢（第三人称单数）", "loves"],
    los: ["走开；出发；松开", "away / off / go"],
    macht: ["做；使；权力", "make / power"],
    meinem: ["我的（与格/中性形式）", "my (dative/neuter)"],
    nun: ["现在；那么", "now / then"],
    recht: ["正确的；权利；相当", "right / fairly"],
    seine: ["他的；她的；它的（变格形式）", "his / her / its"],
    seinen: ["他的；自己的（变格形式）", "his / one's own"],
    schlecht: ["坏的；糟糕的", "bad"],
    stern: ["星；星辰", "star"],
    tag: ["日；天", "day"],
    weg: ["离开；不在；路", "away / gone / way"],
    weiß: ["知道；白色", "know / white"],
  };
  for (const slug of Object.keys(slugs)) {
    const wordEntries = loadSongs(`${slug}/word-data.js`, "wordEntries");
    for (const [key, [meaning, en]] of Object.entries(auditedHighFrequency)) {
      if (!wordEntries[key]) continue;
      assert.equal(wordEntries[key].meaning, meaning, `${slug}:${key} meaning`);
      assert.equal(wordEntries[key].en, en, `${slug}:${key} English`);
    }
  }
});
