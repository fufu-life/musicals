const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scriptJs = fs.readFileSync(path.join(root, "script.js"), "utf8");
const styleCss = fs.readFileSync(path.join(root, "style.css"), "utf8");
const songsJs = fs.readFileSync(path.join(root, "songs.js"), "utf8");
const songsInitialJs = fs.readFileSync(path.join(root, "songs-initial.js"), "utf8");
const wordDataJs = fs.readFileSync(path.join(root, "word-data.js"), "utf8");
const audioBuilderJs = fs.readFileSync(path.join(root, "scripts", "build-audio.js"), "utf8");
const cursorJs = fs.readFileSync(path.join(root, "..", "shared", "cursors", "moliere-le-spectacle-musical.js"), "utf8");
const cursorMarker = "preRenderPureQuill";

test("page uses the shared analytics module", () => {
  assert.match(indexHtml, /writeCriticalScript\("\.\.\/shared\/analytics\.js"\)/);
  assert.match(scriptJs, /window\.MusicalAnalytics\.initShow/);
  assert.match(scriptJs, /showId:\s*config\.slug/);
  assert.doesNotMatch(indexHtml, /function gtag\(\)/);
});

test("lyrics do not contain OCR acute apostrophes or glued Latin punctuation", () => {
  const punctuationSandbox = { window: {} };
  vm.runInNewContext(songsJs, punctuationSandbox);
  const displayedLyrics = punctuationSandbox.window.songs.flatMap((song) => [
    song.title,
    song.titleZh,
    ...song.lines.flatMap((line) => [line.original, line.en, line.zh]),
  ]).filter(Boolean).join("\n");
  assert.doesNotMatch(displayedLyrics, /´/u);
  assert.doesNotMatch(
    displayedLyrics,
    /\p{Script=Latin},\p{Script=Latin}|\p{Script=Latin}[!?;:]\p{Script=Latin}|\p{Ll}\.\p{Script=Latin}|\p{Script=Latin}\.\p{Ll}|\p{Script=Latin}[!?]\(|\)\p{Script=Latin}/u,
  );
});

test("favorites are not present", () => {
  const combined = `${indexHtml}\n${scriptJs}\n${styleCss}`;
  ["favorite", "Favorite", "收藏", "onlyFavorites", "song-star"].forEach((term) => {
    assert.equal(combined.includes(term), false, `found removed favorite term: ${term}`);
  });
});

test("Chinese, IPA, and optional English toggles exist", () => {
  assert.match(indexHtml, /data-toggle="showZh"/);
  assert.match(indexHtml, /data-toggle="showIpa"/);
  assert.match(indexHtml, /id="feedbackButton"[^>]*>反馈<\/button>/);
  assert.ok(indexHtml.indexOf('data-toggle="showIpa"') < indexHtml.indexOf('id="feedbackButton"'));
  if (false) {
    assert.doesNotMatch(indexHtml, /data-toggle="showEn"/);
  } else {
    assert.match(indexHtml, /data-toggle="showEn"/);
    assert.ok(indexHtml.indexOf('data-toggle="showEn"') < indexHtml.indexOf('id="feedbackButton"'));
  }
  assert.match(scriptJs, /showIpa:\s*true/);
  assert.match(scriptJs, /phonetic\.hidden\s*=\s*!state\.settings\.showIpa/);
  assert.match(scriptJs, /function getAlignedWordIpa/);
  assert.match(scriptJs, /function formatLineIpaPart/);
  assert.match(styleCss, /\.word-phonetic/);
  assert.match(styleCss, /\.song-order/);
  assert.match(styleCss, /#effectCanvas \{[\s\S]*z-index:\s*999999/);
  assert.doesNotMatch(scriptJs, /行歌词/);
});

test("page mounts the shared feedback widget with current song selection", () => {
  assert.match(indexHtml, /\.\.\/shared\/feedback-widget\.js/);
  assert.match(indexHtml, /window\.MusicalFeedback\.mount/);
  assert.match(indexHtml, /trigger:\s*"#feedbackButton"/);
  assert.match(indexHtml, /recipient:\s*"fulife@agent\.qq\.com"/);
  assert.match(indexHtml, /getCurrentSongId:\s*\(\) =>/);
  assert.match(scriptJs, /function getCurrentSong/);
});

test("script initializes page config before reading display settings", () => {
  const configIndex = scriptJs.indexOf("const config = window.pageConfig || {};");
  const stateIndex = scriptJs.indexOf("const state = {");
  const readSettingsIndex = scriptJs.indexOf("settings: readSettings(),");
  assert.notEqual(configIndex, -1);
  assert.notEqual(stateIndex, -1);
  assert.notEqual(readSettingsIndex, -1);
  assert.ok(configIndex < stateIndex);
  assert.ok(configIndex < readSettingsIndex);
});

test("first-screen lyrics do not wait for the word dictionary", () => {
  assert.match(indexHtml, /<link rel="preload" href="songs-initial\.js" as="script" \/>/);
  assert.doesNotMatch(indexHtml, /<link rel="preload" href="word-data\.js"/);
  assert.match(indexHtml, /writeCriticalScript\("songs-initial\.js"\)/);
  assert.doesNotMatch(indexHtml, /<script src="word-data\.js"><\/script>/);
  const initialSandbox = { window: {} };
  vm.runInNewContext(songsInitialJs, initialSandbox);
  assert.ok(initialSandbox.window.songsInitial[0].lines.length > 0);
  assert.ok(initialSandbox.window.songsInitial.slice(1).every((song) => song.lines.length === 0));
  assert.ok(Buffer.byteLength(songsInitialJs) < Buffer.byteLength(songsJs));
  assert.match(scriptJs, /ensureSearchReady:\s*ensureFullSongs/);
  assert.match(scriptJs, /await loadScript\("songs\.js", "high"\)/);
  assert.match(scriptJs, /renderSong\(\)/);
  assert.match(scriptJs, /scheduleDeferredWordData\(\)/);
  assert.match(scriptJs, /await loadScript\("word-data\.js", "low"\)/);
  assert.match(scriptJs, /window\.addEventListener\("load", start, \{ once: true \}\)/);
  assert.match(scriptJs, /showWordLoading\(token, anchor\);\s*await ensureWordDataReady\(\)/);
  assert.match(styleCss, /content-visibility:\s*auto/);
  assert.ok(Buffer.byteLength(songsJs) < 520_000, `critical songs.js too large: ${Buffer.byteLength(songsJs)}B`);
});

test("song header uses an unframed show logo and soft switching", () => {
  assert.match(indexHtml, /class="hero"/);
  assert.match(indexHtml, /class="home-button" href="\.\.\/index\.html" aria-label="返回音乐剧展示架"/);
  assert.match(indexHtml, /class="show-visual"/);
  assert.doesNotMatch(indexHtml, /show-visual-inner/);
  assert.match(indexHtml, /class="show-visual-image" src="assets\/show-logo\.(?:png|svg)"/);
  assert.match(styleCss, /\.hero/);
  assert.match(styleCss, /\.show-visual/);
  assert.match(scriptJs, /function renderCurrentSongWithTransition/);
  assert.match(scriptJs, /is-song-changing/);
  assert.match(scriptJs, /is-song-settling/);
  assert.match(styleCss, /@keyframes lyric-card-soft-in/);
});

test("song switching resets the new song to the top of the page", () => {
  assert.match(scriptJs, /function resetSongScrollPosition/);
  assert.match(scriptJs, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
  assert.match(scriptJs, /renderCurrentSongWithTransition\(\);\s*resetSongScrollPosition\(\);/);
});

test("playlist and rate controls follow feedback in a stable toolbar group", () => {
  const feedbackIndex = indexHtml.indexOf('id="feedbackButton"');
  const playbackIndex = indexHtml.indexOf('class="toolbar-playback-tools"');
  assert.ok(feedbackIndex !== -1 && playbackIndex > feedbackIndex);
  assert.match(indexHtml, /class="toolbar-playback-tools"[\s\S]*?id="songPlayButton"/);
  assert.match(scriptJs, /playbackTools:\s*document\.querySelector\("\.toolbar-playback-tools"\)/);
  assert.match(scriptJs, /rateContainer:\s*dom\.playbackTools/);
  assert.match(styleCss, /\.toolbar-playback-tools\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;/);
  assert.match(styleCss, /\.toolbar-playback-tools\s*\{[\s\S]*?flex:\s*0 0 auto;/);
  assert.match(styleCss, /\.toolbar-playback-tools \.lyrics-tools-rate/);
  assert.match(styleCss, /\.toggle-btn\s*\{[\s\S]*?min-height:\s*28px;[\s\S]*?font-size:\s*0\.74rem;/);
});

test("page follows the Hamilton-style collapsible navigation frame", () => {
  assert.match(indexHtml, /id="sidebarToggle"/);
  assert.match(indexHtml, /id="songSelect"/);
  assert.match(styleCss, /\.app-shell\.is-collapsed/);
  assert.match(styleCss, /\.song-sidebar/);
  assert.match(styleCss, /\.mobile-picker/);
  assert.match(scriptJs, /const SIDEBAR_KEY/);
  assert.match(scriptJs, /function syncSidebarState/);
  assert.match(scriptJs, /dom\.songSelect\?\.addEventListener/);
  assert.doesNotMatch(indexHtml, />合集<\/a>/);
});

test("page includes a themed canvas cursor effect", () => {
  assert.match(indexHtml, /<canvas id="effectCanvas"/);
  assert.match(styleCss, /#effectCanvas\s*\{/);
  assert.match(styleCss, /cursor:\s*none !important/);
  assert.match(indexHtml, /\.\.\/shared\/cursors\/moliere-le-spectacle-musical\.js/);
  assert.match(scriptJs, /initThemedCursor\(\)/);
  assert.match(scriptJs, /if \(window\.referenceCursorActive\) return/);
  assert.match(cursorJs, /window\.referenceCursorActive = true/);
  assert.match(cursorJs, new RegExp(cursorMarker));
  assert.match(cursorJs, /Math\.min\(window\.devicePixelRatio \|\| 1, 1\.5\)/);
  assert.match(cursorJs, /particles\.length > 72/);
  assert.match(cursorJs, /document\.hidden/);
});

test("songs and word data are populated", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  vm.runInNewContext(wordDataJs, sandbox);
  assert.ok(sandbox.window.songs.length > 0);
  assert.ok(sandbox.window.songs.every((song) => song.lines.length > 0));
  assert.ok(sandbox.window.songs.every((song) => song.titleZh));
  const versionLabel = /(?:[（(\[［]\s*(?:live|现场)|[-–—]\s*live)/iu;
  assert.ok(sandbox.window.songs.every((song) => !versionLabel.test(song.title) && !versionLabel.test(song.titleZh)));
  assert.ok(Object.keys(sandbox.window.wordEntries).length > 0);
});

test("bracketed lyrics with aligned translations remain lyrics, not speaker labels", () => {
  if ("moliere-le-spectacle-musical" !== "mozart-opera-rock") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const lines = sandbox.window.songs.flatMap((song) => song.lines);
  const backingVocal = lines.find((line) => line.id === "mozart-opera-rock-04-034");
  assert.equal(backingVocal.original, "je suis une femme mi-lune mi-homme");
  assert.equal(backingVocal.speaker, "");
  assert.equal(backingVocal.zh, "我是半月女人，半男人");
  assert.equal(lines.find((line) => line.id === "mozart-opera-rock-04-035").speaker, "");
});

test("visible song numbers are consecutive after empty tracks are removed", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const songs = sandbox.window.songs;
  assert.deepEqual(songs.map((song) => song.displayOrder), songs.map((_, index) => index + 1));
  assert.match(scriptJs, /song.displayOrder || song.order/);
});

test("Starmania opening keeps the reviewed Chinese translation", () => {
  if ("moliere-le-spectacle-musical" !== "starmania") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const opening = sandbox.window.songs[0];
  assert.equal(opening.titleZh, "垄断城出大事了");
  assert.equal(opening.lines.find((line) => line.lineIndex === 3).zh, "垄断城");
  assert.equal(opening.lines.find((line) => line.lineIndex === 29).zh, "当太阳落下");
});

test("Phantom and Love Never Dies stay in separate source ranges", () => {
  if (!["phantom-of-the-opera", "love-never-dies"].includes("moliere-le-spectacle-musical")) return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const songs = sandbox.window.songs;
  if ("moliere-le-spectacle-musical" === "phantom-of-the-opera") {
    assert.equal(songs.length, 18);
    assert.equal(Math.max(...songs.map((song) => song.sourceOrder)), 21);
    assert.equal(songs[0].title, "Prologue");
    assert.equal(songs[0].titleZh, "序幕");
    assert.ok(songs.every((song) => !/live|现场/iu.test(song.title) && !/live|现场/iu.test(song.titleZh)));
    return;
  }
  assert.equal(songs.length, 26);
  assert.equal(Math.min(...songs.map((song) => song.sourceOrder)), 22);
  assert.match(songs[0].lines[0].id, /^phantom-of-the-opera-22-/);
});

test("Romeo Aimer keeps one opening lyric, not an expanded spelling duplicate", () => {
  if ("moliere-le-spectacle-musical" !== "romeo-et-juliette") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const aimer = sandbox.window.songs.find((song) => song.sourceOrder === 18);
  assert.deepEqual(
    Array.from(aimer.lines.slice(0, 2), (line) => line.original),
    ["Aimer, c'est ce qu'y a d'plus beau", "Aimer, c'est monter si haut"],
  );
  assert.equal(aimer.lines.some((line) => line.id === "romeo-et-juliette-18-004"), false);
});

test("reviewed OCR word fragments are reassembled", () => {
  if (!["la-legende-du-roi-arthur", "phantom-of-the-opera", "notre-dame-de-paris", "le-roi-soleil", "mozart-opera-rock"].includes("moliere-le-spectacle-musical")) return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  vm.runInNewContext(wordDataJs, sandbox);
  const lines = sandbox.window.songs.flatMap((song) => song.lines);
  const brokenTerms = ["Go té", "dé mons", "dé fait", "magné tique", "dé fie", "Ensorcelé e", "pensé es", "dé tour", "dé lit", "gouté", "au delà", "guida nce", "Monsieur ur", "prot égeront", "imb éciles", "qu'àvenir", "M ême", "fian? ailles", "pa? enne", "pa? ens", "r? le", "fl? te"];
  assert.equal(brokenTerms.find((term) => songsJs.includes(term)), undefined);

  if ("moliere-le-spectacle-musical" === "la-legende-du-roi-arthur") {
    assert.equal(lines.find((line) => line.id === "la-legende-du-roi-arthur-01-003").original, "Goûté aux effets toxiques");
    assert.equal(lines.find((line) => line.id === "la-legende-du-roi-arthur-01-007").original, "Tué mes démons, bravé les tourments");
    assert.equal(lines.find((line) => line.id === "la-legende-du-roi-arthur-06-004").original, "Ensorcelée par de sensuelles pensées");
    assert.equal(lines.find((line) => line.id === "la-legende-du-roi-arthur-17-011").original, "De désirer jusqu'au délit");
    assert.equal(sandbox.window.wordEntries["goûté"].meaning, "尝过；品尝过");
    assert.equal(sandbox.window.wordEntries.démons.meaning, "恶魔；心魔");
    return;
  }

  if ("moliere-le-spectacle-musical" === "notre-dame-de-paris") {
    assert.equal(lines.find((line) => line.id === "notre-dame-de-paris-08-044").original, "Avec sa bosse au dos");
    assert.equal(lines.find((line) => line.id === "notre-dame-de-paris-10-010").original, "Dans les cœurs dans les âmes des fidèles de Notre-Dame");
    assert.equal(lines.find((line) => line.id === "notre-dame-de-paris-21-002").original, "Te protégeront de tous les imbéciles");
    assert.equal(lines.find((line) => line.id === "notre-dame-de-paris-31-001").original, "Gringoire qu'as-tu fait de ta femme?");
    assert.equal(lines.find((line) => line.id === "notre-dame-de-paris-53-016").original, "Laissez entrer ces païens, ces vandales");
    return;
  }

  if ("moliere-le-spectacle-musical" === "le-roi-soleil") {
    assert.equal(lines.find((line) => line.id === "le-roi-soleil-24-016").original, "Chacun d'entre nous a son rôle à jouer");
    return;
  }

  if ("moliere-le-spectacle-musical" === "mozart-opera-rock") {
    assert.equal(lines.find((line) => line.id === "mozart-opera-rock-16-027").original, "De flûte enchantée");
    assert.equal(sandbox.window.songs.find((song) => song.sourceOrder === 17).title, "L'assasymphonie");
    return;
  }

  assert.equal(lines.find((line) => line.id === "phantom-of-the-opera-19-003").original, "yearning for my guidance...");
  assert.equal(lines.find((line) => line.id === "phantom-of-the-opera-19-043").original, "Let's see, Monsieur, how far you dare go?");
  assert.equal(sandbox.window.wordEntries.guidance.meaning, "指引；指导");
});

test("word cards do not contain placeholder copy", () => {
  const combined = `${scriptJs}\n${wordDataJs}`;
  ["word from the lyric line", "暂未收录", "not in the local glossary yet", "title word", "contextual lyric term", "结合本句", "语境", "词义：", "de + ésir", "专有名词；人名、地名或剧中称谓", "proper noun or character/place name"].forEach((term) => {
    assert.equal(combined.includes(term), false, `found placeholder: ${term}`);
  });
  const sandbox = { window: {} };
  vm.runInNewContext(wordDataJs, sandbox);
  const unresolved = Object.entries(sandbox.window.wordEntries).find(([, entry]) => /^(?:ce|de|je|le\/la|me|ne|que|se|te) \+ /i.test(entry.en || ""));
  assert.equal(unresolved, undefined, `found unresolved contraction: ${unresolved?.[0]}`);
});

test("Le Roi Soleil keeps clean lyric breaks and real glosses", () => {
  if ("moliere-le-spectacle-musical" !== "le-roi-soleil") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  vm.runInNewContext(wordDataJs, sandbox);
  const opening = sandbox.window.songs.find((song) => song.sourceOrder === 2);
  assert.equal(opening.lines.length, 54);
  assert.equal(opening.lines[0].original, "Pour une couronne qu'on n'aura pas");
  assert.equal(opening.lines[1].original, "Un jour meilleur qui ne vient pas");
  assert.equal(opening.lines.some((line) => /,\s*[，,]|，/u.test(line.original)), false);
  assert.equal(sandbox.window.songs.some((song) => song.lines.some((line) => /,\s*[，,]|，/u.test(line.original))), false);
  assert.equal(sandbox.window.wordEntries["apprends-moi"].meaning, "教教我；告诉我");
  assert.equal(sandbox.window.wordEntries.versailles.meaning, "凡尔赛");
  assert.equal(sandbox.window.wordEntries.jerusalem.meaning, "耶路撒冷");
  assert.equal(sandbox.window.wordEntries.panurge.meaning, "盲从者；随大流的人");
});

test("French desire words keep dictionary glosses instead of elision fragments", () => {
  if ("fr" !== "fr") return;
  const sandbox = { window: {} };
  vm.runInNewContext(wordDataJs, sandbox);
  ["désir", "désirs", "désirer", "désire", "désirée", "désirent"].forEach((key) => {
    const entry = sandbox.window.wordEntries[key];
    if (!entry) return;
    assert.match(entry.meaning, /欲望|渴望|想要/);
    assert.match(entry.en, /desire|want|desired|wanted/);
    assert.doesNotMatch(entry.en, /\+\s*ésir/);
  });
});

test("Moliere keeps the requested show name and dictionary meaning", () => {
  if ("moliere-le-spectacle-musical" !== "moliere-le-spectacle-musical") return;
  const sandbox = { window: {} };
  vm.runInNewContext(wordDataJs, sandbox);
  assert.match(indexHtml, /"title": "Molière"/);
  assert.match(indexHtml, /"titleZh": "莫里哀"/);
  assert.equal(sandbox.window.wordEntries["molière"].meaning, "莫里哀");
  assert.equal(sandbox.window.wordEntries["molière"].en, "Molière");
});

test("Moliere keeps split Chinese translations aligned with their French clauses", () => {
  if ("moliere-le-spectacle-musical" !== "moliere-le-spectacle-musical") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const lines = sandbox.window.songs.flatMap((song) => song.lines);
  const byId = new Map(lines.map((line) => [line.id, line]));

  assert.equal(byId.get("moliere-le-spectacle-musical-02-019-a").zh, "好啦");
  assert.equal(byId.get("moliere-le-spectacle-musical-02-019-b").zh, "可那又怎样？");
  assert.equal(byId.get("moliere-le-spectacle-musical-03-028").zh, "哦 我的爱人，那袭白裙");
  assert.equal(byId.get("moliere-le-spectacle-musical-08-041-a").zh, "不");
  assert.equal(byId.get("moliere-le-spectacle-musical-08-041-b").zh, "我没有选择（没有选择）");
  assert.equal(byId.get("moliere-le-spectacle-musical-09-003-a").zh, "我们曾跌倒");
  assert.equal(byId.get("moliere-le-spectacle-musical-09-003-b").zh, "也曾重新站起");

  const duplicateSplits = lines.slice(1).filter((line, index) => {
    const previous = lines[index];
    return /-[ab]$/.test(line.id)
      && /-[ab]$/.test(previous.id)
      && line.original !== previous.original
      && line.zh === previous.zh;
  });
  assert.equal(duplicateSplits.length, 0);
});

test("every word entry has IPA, Chinese meaning, English definition, and speak text", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(wordDataJs, sandbox);
  const missing = Object.entries(sandbox.window.wordEntries).filter(([, entry]) => !entry.ipa || !entry.meaning || !entry.en || !entry.speak);
  assert.deepEqual(missing.slice(0, 10), []);
});

test("word-card English gloss is short, and English pages hide it", () => {
  if ("fr" === "en") {
    assert.match(scriptJs, /config\.language !== "en"/);
    assert.doesNotMatch(scriptJs, /dom\.popover\.append\(head, ipa, meaning, en\)/);
    return;
  }

  const sandbox = { window: {} };
  vm.runInNewContext(wordDataJs, sandbox);
  const longGlosses = Object.entries(sandbox.window.wordEntries)
    .filter(([, entry]) => String(entry.en || "").length > 48);
  assert.deepEqual(longGlosses.slice(0, 10), []);
});

test("clickable song title and lyric words are wired", () => {
  assert.match(scriptJs, /renderClickableWords\(config\.title/);
  assert.match(scriptJs, /renderClickableWords\(song\.title/);
  assert.match(scriptJs, /renderClickableWords\(line\.original/);
  assert.match(scriptJs, /className = className/);
  assert.match(styleCss, /\.lyric-word/);
  assert.match(styleCss, /\.song-title-word/);
});

test("word-card IPA sits beside the word and translations keep English above Chinese", () => {
  assert.match(scriptJs, /term\.append\(word, ipa\)/);
  assert.match(styleCss, /\.popover-term\s*\{[\s\S]*display:\s*flex/);
  assert.ok(scriptJs.indexOf('en.className = "line-en"') < scriptJs.indexOf('zh.className = "line-zh"'));
  assert.match(styleCss, /h2\s*\{[\s\S]*font-size:\s*clamp\(1\.55rem, 3vw, 2\.65rem\)/);
});

test("clicking a word opens its card and automatically plays its cached pronunciation once", () => {
  assert.match(scriptJs, /showWord\(token, anchor, \{ autoplay: true \}\)/);
  assert.match(scriptJs, /function showWord\(token, anchor, \{ autoplay = false \} = \{\}\)/);
  assert.match(scriptJs, /const playWordPronunciation = \(\) => \{[\s\S]*?audioController\.runUserAction\(/);
  assert.match(scriptJs, /if \(autoplay\) playWordPronunciation\(\);/);
  assert.doesNotMatch(scriptJs, /popover-speak/);
  assert.match(scriptJs, /head\.append\(term\)/);
  assert.match(styleCss, /max-width:\s*min\(240px, calc\(100vw - 24px\)\)/);
});

test("page includes an unobtrusive return-to-top control", () => {
  assert.match(indexHtml, /id="backToTop"/);
  assert.match(scriptJs, /function bindBackToTop/);
  assert.match(scriptJs, /window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\)/);
  assert.match(styleCss, /\.back-to-top/);
});

test("sentence and word audio prefer cached local MP3 files", () => {
  assert.match(scriptJs, /MusicalAudio\.getCachedAudio\(src\)/);
  assert.match(scriptJs, /MusicalAudio\.preloadLocalAudio/);
  assert.match(scriptJs, /function withAudioVersion\(path, speechText\)/);
  assert.match(scriptJs, /withAudioVersion\([^\n]+line\.original\)/);
  assert.match(scriptJs, /\.mp3/);
  assert.match(scriptJs, /audio\/lines/);
  assert.match(scriptJs, /audio\/words/);
  assert.match(indexHtml, /\.\.\/shared\/audio-playback\.js/);
  assert.match(indexHtml, /id="songPlayButton"/);
  assert.match(indexHtml, /playlist-lines-mark/);
  assert.match(indexHtml, /playlist-stop-mark" x="8"/);
  assert.match(scriptJs, /MusicalAudio\.createController/);
  assert.match(scriptJs, /audioController\.runUserAction/);
  assert.match(scriptJs, /audioController\.toggleSequence/);
  assert.match(scriptJs, /function playLineToEnd/);
  assert.match(scriptJs, /function preloadLineAudio/);
  assert.match(scriptJs, /function followSequenceCard/);
  assert.match(scriptJs, /scrollIntoView/);
  assert.match(scriptJs, /audio\.addEventListener\("ended"/);
  assert.match(styleCss, /\.song-play-button/);
  assert.match(styleCss, /\.lyric-card\.is-sequence-active/);
  assert.match(audioBuilderJs, /build-natural-audio\.js/);
  assert.match(audioBuilderJs, /runBuild\(\{/);
  assert.match(audioBuilderJs, /MUSICAL_TTS_VOICE/);
  assert.match(audioBuilderJs, /kind:\s*"generated"/);
});

test("page includes shared search, rate, and persistent playlist controls", () => {
  assert.match(indexHtml, /\.\.\/shared\/playback-rate\.js/);
  assert.match(indexHtml, /\.\.\/shared\/lyrics-search\.js/);
  assert.match(indexHtml, /\.\.\/shared\/lyrics-page-tools\.js/);
  assert.match(indexHtml, /\.\.\/shared\/lyrics-page-tools\.css/);
  assert.match(scriptJs, /MusicalLyricsPageTools\.create/);
  assert.match(scriptJs, /pauseCurrent:\s*pauseCurrentPlayback/);
  assert.match(scriptJs, /resumeCurrent:\s*resumeCurrentPlayback/);
  assert.match(scriptJs, /gapMs:\s*window\.MusicalAudio\.SEQUENCE_GAP_MS \/ pageTools\.getRate\(\)/);
  assert.match(scriptJs, /is-sequence-stop/);
  assert.match(scriptJs, /navigateToSearchResult/);
});

test("narrow and mobile layouts override a persisted collapsed sidebar", () => {
  assert.match(styleCss, /@media \(max-width: 980px\)[\s\S]*\.app-shell,\s*[\s\S]*\.app-shell\.is-collapsed\s*\{[\s\S]*display:\s*block/);
  assert.match(styleCss, /\.toolbar\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*justify-content:\s*flex-start;/);
  assert.doesNotMatch(styleCss, /\.toolbar\s*\{[\s\S]{0,180}grid-template-columns:/);
  assert.match(styleCss, /@media \(max-width: 980px\)[\s\S]*\.lyric-card\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 38px;/);
  assert.match(scriptJs, /window\.matchMedia\("\(max-width: 980px\)"\)\.matches/);
  assert.match(scriptJs, /state\.sidebarCollapsed && !isNarrowLayout/);
  assert.match(scriptJs, /window\.addEventListener\("resize", syncSidebarState/);
  assert.match(styleCss, /overflow-wrap:\s*anywhere/);
});
