const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const LYRICS_ROOT = path.resolve(ROOT, "..", "lyrics");

const TARGETS = [
  {
    slug: "mozart-das-musical",
    dataFile: "songs.js",
    sourceFile: "Mozart!-Das Musical-Gesamtaufnahme (Original Cast Wien) (35123377).md",
    songs: {
      "Irgendwo Wird Immer Getanzt": "序曲/ 总有一处可尽情起舞",
      "Wie Kann Es Möglich Sein?": "怎会如此？",
      "Schliess Dein Herz In Eisen Ein (Reprise)": "紧锁心扉，坚如磐石（重唱）",
      "Wie wird man seinen Schatten los?": "如何逃离自己的阴影？",
      "Wie Wird Man Seinen Schatten Los? (Finale)": "如何逃离自己的阴影？（终曲）",
    },
    sourceTitles: {
      "Irgendwo Wird Immer Getanzt": "序曲/ 总有一处可尽情起舞",
      "Wie Kann Es Möglich Sein?": "怎会如此？",
      "Schliess Dein Herz In Eisen Ein (Reprise)": "紧锁心扉，坚如磐石（重唱）",
      "Wie Wird Man Seinen Schatten Los? (Finale)": "如何逃离自己的阴影？（终曲）",
    },
  },
  {
    slug: "rebecca-das-musical",
    dataFile: "songs-full.js",
    sourceFile: path.join("..", "outputs", "german_musicals", "Rebecca", "lyrics", "Rebecca 全曲目歌词.md"),
    songs: {
      "Zeit in einer Flasche": "序曲/瓶中时光",
      "Gott, warum?": "上天，为什么",
      "Hilf mir durch die Nacht": "助我度过沉沉黑夜",
      "I’m an American Woman": "我是一个美国女人",
      Rebecca: "瑞贝卡",
    },
    sourceTitles: {
      "Zeit in einer Flasche (Live)": "序曲/瓶中时光",
      "Hilf mir durch die Nacht": "助我度过沉沉黑夜",
      "Gott, warum? (Live)": "上天，为什么",
      "I’m an American Woman (Live)": "我是一个美国女人",
      Rebecca: "瑞贝卡",
    },
  },
  {
    slug: "elisabeth-das-musical",
    dataFile: "songs.js",
    sourceFile: "Elisabeth - Das Musical - Gesamtaufnahme Live - Jubiläumsfassung (37313354).md",
    songs: {
      "Der letzte Tanz": "最后一舞",
      "Ich gehör nur mir": "我只属于我自己",
      "Die Schatten werden länger": "阴霾渐袭",
      "Die Schatten werden länger (Reprise)": "阴霾渐袭（重唱）",
      Kitsch: "便宜货",
    },
    sourceTitles: {
      "Nichts ist schwer": "世上无难事",
      "Der letzte Tanz": "最后一舞",
      "Ich gehör nur mir": "我只属于我自己",
      "Die Schatten werden länger": "阴霾渐袭",
      "Die Schatten werden länger (Reprise)": "阴霾渐袭（重唱）",
      Kitsch: "便宜货",
    },
  },
];

function loadSongs(target) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, target.slug, target.dataFile), "utf8"), sandbox);
  return sandbox.window.songs;
}

function sourceSection(source, title) {
  const lines = source.split(/\r?\n/);
  const starts = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^#{1,2}\s+\d+\.?\s+/.test(line));
  const startEntry = starts.find(({ line, index }, position) => {
    const heading = line.match(/^#{1,2}\s+\d+\.?\s+(.+?)\s*$/u);
    const end = starts[position + 1]?.index ?? lines.length;
    const section = lines.slice(index, end).join("\n");
    return (heading && heading[1] === title) || new RegExp(`^-\\s*原歌名：${title.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`, "mu").test(section);
  });
  assert.ok(startEntry, `missing source section: ${title}`);
  const end = starts.find(({ index }) => index > startEntry.index)?.index ?? lines.length;
  return lines.slice(startEntry.index, end).join("\n");
}

test("German musical song titles use the user-approved Chinese translations", () => {
  TARGETS.forEach((target) => {
    const songs = loadSongs(target);
    Object.entries(target.songs).forEach(([title, expected]) => {
      const matches = songs.filter((song) => song.title === title);
      assert.ok(matches.length, `${target.slug}: rendered song missing: ${title}`);
      matches.forEach((song) => assert.equal(song.titleZh, expected, `${target.slug}: ${title}`));
    });

    const source = fs.readFileSync(path.join(LYRICS_ROOT, target.sourceFile), "utf8");
    Object.entries(target.sourceTitles).forEach(([title, expected]) => {
      assert.match(sourceSection(source, title), new RegExp(`^[-]?\\s*中文歌名：${expected.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`, "mu"));
    });
  });
});

test("Nichts ist schwer restores its approved source title and lyric rows", () => {
  const source = fs.readFileSync(
    path.join(LYRICS_ROOT, "Elisabeth - Das Musical - Gesamtaufnahme Live - Jubiläumsfassung (37313354).md"),
    "utf8",
  );
  assert.match(sourceSection(source, "Nichts ist schwer"), /^中文歌名：世上无难事$/mu);
  const song = loadSongs(TARGETS[2]).find((entry) => entry.title === "Nichts ist schwer");
  assert.ok(song, "Nichts ist schwer must be rendered");
  // The authoritative source keeps 38 rows; reviewed sentence merges render 24 cards.
  assert.equal(song.lines.length, 24);
  assert.equal(song.lines[0].speaker, "Franz Joseph");
  assert.equal(song.lines[5].speaker, "Elisabeth & Franz Joseph");
  assert.ok(song.lines.every((line) => /^\/[^/]+\/$/u.test(line.ipa)));
});
