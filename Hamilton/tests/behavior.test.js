const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const indexHtml = fs.readFileSync("Hamilton/index.html", "utf8");
const scriptJs = fs.readFileSync("Hamilton/script.js", "utf8");
const styleCss = fs.readFileSync("Hamilton/style.css", "utf8");
const lyricsDataJs = fs.readFileSync("Hamilton/lyrics-data.js", "utf8");
const lyricsSourceMd = fs.readFileSync("../lyrics/Hamilton (Original Broadway Cast Recording) (3367211).md", "utf8");
const wordDataJs = fs.existsSync("Hamilton/word-data.js") ? fs.readFileSync("Hamilton/word-data.js", "utf8") : "";
const audioBuilderJs = fs.existsSync("Hamilton/scripts/build-audio.js")
  ? fs.readFileSync("Hamilton/scripts/build-audio.js", "utf8")
  : "";
const playbackRateJs = fs.readFileSync("shared/playback-rate.js", "utf8");
const lyricsSearchJs = fs.readFileSync("shared/lyrics-search.js", "utf8");
const pronunciationOverrides = JSON.parse(fs.readFileSync("scripts/tts-pronunciation-overrides.json", "utf8"));

test("favorites UI and state are fully removed", () => {
  const combined = `${indexHtml}\n${scriptJs}\n${styleCss}`;
  [
    "FAVORITES_KEY",
    "favorite",
    "Favorite",
    "onlyFavorites",
    "songFavorite",
    "song-favorite",
    "song-star",
    "收藏",
  ].forEach((term) => {
    assert.equal(combined.includes(term), false, `found removed favorite term: ${term}`);
  });
});

test("phonetics have a toolbar toggle matching the Chinese toggle behavior", () => {
  assert.match(indexHtml, /data-toggle="showIpa"[^>]*>音标<\/button>/);
  assert.match(indexHtml, /id="feedbackButton"[^>]*>反馈<\/button>/);
  assert.ok(indexHtml.indexOf('data-toggle="showIpa"') < indexHtml.indexOf('id="feedbackButton"'));
  assert.match(scriptJs, /settings:\s*\{\s*showZh:\s*true,\s*showIpa:\s*true,/);
  assert.match(scriptJs, /phonetic\.hidden\s*=\s*!state\.settings\.showIpa/);
  assert.match(scriptJs, /function getAlignedTokenIpa/);
  assert.match(scriptJs, /function formatLineIpaPart/);
  assert.match(styleCss, /\.word-phonetic/);
});

test("page mounts the shared feedback widget with current song selection", () => {
  assert.match(indexHtml, /\.\.\/shared\/feedback-widget\.js/);
  assert.match(indexHtml, /window\.MusicalFeedback\.mount/);
  assert.match(indexHtml, /trigger:\s*"#feedbackButton"/);
  assert.match(indexHtml, /window\.hamiltonLyricsRows/);
  assert.match(indexHtml, /getCurrentSongId:\s*\(\) =>/);
  assert.match(indexHtml, /getCurrentSong\(\)\?\.id/);
});

test("lyrics render before noncritical analysis and word data load", () => {
  assert.match(indexHtml, /<link rel="preload" href="word-data\.js" as="script" fetchpriority="low" \/>/);
  assert.doesNotMatch(indexHtml, /<script src="songs\.js"><\/script>/);
  assert.doesNotMatch(indexHtml, /<script src="word-data\.js"><\/script>/);
  assert.match(scriptJs, /renderCurrentSong\(\);\s*wordDictionaryReady = loadWordDictionary/);
  assert.match(scriptJs, /await loadScript\("word-data\.js", "high"\)/);
  assert.match(scriptJs, /await loadScript\("songs\.js", "low"\)/);
  assert.match(scriptJs, /showLoadingPopover\(part, button\);\s*await wordDictionaryReady/);
  assert.doesNotMatch(scriptJs, /await\s+(?:analysisDataReady|loadAnalysisData)/);
});

test("page includes the shared Google Analytics tag", () => {
  assert.match(indexHtml, /https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-E49LJ5T1V6/);
  assert.match(indexHtml, /gtag\('config', 'G-E49LJ5T1V6'\)/);
});

test("hero logo uses the transparent svg asset", () => {
  assert.match(indexHtml, /class="hero-mark" src="assets\/Hamilton-Logo-1\.svg"/);
  assert.doesNotMatch(indexHtml, /Hamilton-Logo\.jpg/);
});

test("page includes the Hamilton quill cursor interaction", () => {
  assert.match(indexHtml, /<canvas id="effectCanvas"/);
  assert.match(styleCss, /#effectCanvas\s*\{/);
  assert.match(styleCss, /cursor:\s*none !important/);
  assert.match(scriptJs, /initQuillCursor\(\)/);
  assert.match(scriptJs, /class GoldSpark/);
  assert.match(scriptJs, /function drawActualQuill/);
  assert.match(scriptJs, /mousemove/);
  assert.match(scriptJs, /mousedown/);
  assert.match(scriptJs, /mouseup/);
});

test("mobile lyric cards keep the line speaker away from the right edge", () => {
  assert.match(styleCss, /@media \(max-width: 860px\)[\s\S]*\.lyric-card\s*\{[\s\S]*padding:\s*14px;/);
  assert.match(styleCss, /@media \(max-width: 860px\)[\s\S]*\.line-actions\s*\{[\s\S]*justify-items:\s*center;/);
  assert.match(styleCss, /@media \(max-width: 860px\)[\s\S]*\.speak-button\s*\{[\s\S]*width:\s*34px;/);
  assert.match(styleCss, /\.en-line\s*\{[\s\S]*overflow-wrap:\s*anywhere;/);
  assert.match(styleCss, /\.lyric-word,[\s\S]*\.song-title-word\s*\{[\s\S]*white-space:\s*normal;/);
});

test("song switching uses the soft transition pattern", () => {
  assert.match(scriptJs, /function renderCurrentSongWithTransition/);
  assert.match(scriptJs, /is-song-changing/);
  assert.match(scriptJs, /is-song-settling/);
  assert.match(styleCss, /\.content\.is-song-changing/);
  assert.match(styleCss, /@keyframes lyric-card-soft-in/);
});

test("song titles and every lyric word use clickable word cards", () => {
  assert.match(scriptJs, /renderSongTitle\(/);
  assert.match(scriptJs, /renderEnglishTokens\(/);
  assert.match(scriptJs, /"song-title-word"/);
  assert.match(scriptJs, /"lyric-word"/);
  assert.match(scriptJs, /className\s*=\s*"popover-speak"/);
  assert.match(scriptJs, /getWordEntry\(/);
  assert.match(styleCss, /\.lyric-word/);
  assert.match(styleCss, /\.song-title-word/);
  assert.match(styleCss, /\.popover-ipa/);
});

test("sentence and word pronunciation prefer local audio files", () => {
  assert.match(scriptJs, /const audioState\s*=\s*\{\s*current:\s*null,/);
  assert.match(scriptJs, /function renderLine\(song, line\)/);
  assert.match(scriptJs, /renderLine\(song, line\)/);
  assert.match(scriptJs, /playEnglishAudio\(lineAudioPath, line\.en, \{ rateControlled: true \}\)/);
  assert.match(scriptJs, /playEnglishAudio\(wordAudioPath, text\)/);
  assert.match(scriptJs, /function playLocalAudio\(src, waitForEnd, \{ rate = 1, rateControlled = false \} = \{\}\)/);
  assert.match(scriptJs, /MusicalAudio\.getCachedAudio\(src\)/);
  assert.match(scriptJs, /MusicalAudio\.preloadLocalAudio/);
  assert.match(scriptJs, /\.mp3/);
  assert.match(scriptJs, /audio\/lines\/\$\{encodeURIComponent\(song\.id\)\}/);
  assert.match(scriptJs, /audio\/words\/\$\{encodeURIComponent\(key\)\}/);
  assert.match(indexHtml, /\.\.\/shared\/audio-playback\.js/);
  assert.match(indexHtml, /id="songPlayButton"/);
  assert.match(indexHtml, /playlist-stop-mark" x="8"/);
  assert.match(scriptJs, /MusicalAudio\.createController/);
  assert.match(scriptJs, /audioController\.runUserAction/);
  assert.match(scriptJs, /audioController\.toggleSequence/);
  assert.match(scriptJs, /function playLineToEnd/);
  assert.match(scriptJs, /function followSequenceCard/);
  assert.match(scriptJs, /scrollIntoView/);
  assert.match(scriptJs, /function preloadLineAudio/);
  assert.match(styleCss, /\.song-play-button/);
  assert.match(styleCss, /\.lyric-card\.is-sequence-active/);
});

test("approved playback-rate menu controls sentences and playlists but not word audio", () => {
  const feedbackIndex = indexHtml.indexOf('id="feedbackButton"');
  const playbackIndex = indexHtml.indexOf('class="toolbar-playback-tools"');
  assert.ok(feedbackIndex !== -1 && playbackIndex > feedbackIndex);
  assert.match(indexHtml, /class="toolbar-playback-tools"[\s\S]*id="songPlayButton"[\s\S]*id="playbackRateButton"[^>]*>1\.0x<\/button>/);
  assert.match(indexHtml, /\.\.\/shared\/playback-rate\.js/);
  assert.match(playbackRateJs, /\[0\.5, 0\.75, 1, 1\.25, 1\.5, 2, 3\]/);
  assert.match(playbackRateJs, /className = "musical-rate-menu"/);
  assert.match(playbackRateJs, /function toggleMenu/);
  assert.match(scriptJs, /storageKey:\s*PLAYBACK_RATE_KEY/);
  assert.match(scriptJs, /audio\.defaultPlaybackRate = rate/);
  assert.match(scriptJs, /audio\.playbackRate = rate/);
  assert.match(scriptJs, /playEnglishAudio\(lineAudioPath, line\.en, \{ rateControlled: true \}\)/);
  assert.match(scriptJs, /playEnglishAudio\(wordAudioPath, text\)/);
  assert.match(scriptJs, /gapMs:\s*window\.MusicalAudio\.SEQUENCE_GAP_MS \/ getPlaybackRate\(\)/);
  assert.match(scriptJs, /0\.82 \* rate/);
  assert.match(styleCss, /\.playback-rate-button/);
  assert.match(styleCss, /\.musical-rate-menu/);
  assert.match(scriptJs, /playbackRateControl\?\.toggleMenu\(refs\.playbackDockRate\)/);
});

test("full-song playback exposes a persistent pause and stop controller", () => {
  assert.match(indexHtml, /id="playbackDock"[\s\S]*id="playbackDockPause"[\s\S]*id="playbackDockStop"/);
  assert.match(indexHtml, /id="playbackDockProgress"[^>]*aria-live="polite"/);
  assert.match(scriptJs, /pauseCurrent:\s*pauseCurrentPlayback/);
  assert.match(scriptJs, /resumeCurrent:\s*resumeCurrentPlayback/);
  assert.match(scriptJs, /audioController\.pauseSequence\(\)/);
  assert.match(scriptJs, /audioController\.resumeSequence\(\)/);
  assert.match(scriptJs, /isSequenceActive\(\)[\s\S]*is-sequence-active/);
  assert.match(scriptJs, /第 \$\{index \+ 1\} \/ \$\{total\} 句/);
  assert.match(styleCss, /\.playback-dock\s*\{[\s\S]*position:\s*fixed/);
  assert.match(styleCss, /\.speak-button\.is-sequence-stop::before/);
  assert.match(styleCss, /body\.has-playback-dock \.back-to-top/);
});

test("lyrics search expands to the left of home and searches titles plus bilingual lyrics", () => {
  assert.ok(indexHtml.indexOf('id="lyricsSearchToggle"') < indexHtml.indexOf('class="home-button"'));
  assert.match(indexHtml, /id="lyricsSearchInput"[^>]*placeholder="搜索歌名或歌词"/);
  assert.match(indexHtml, /id="searchResults"[\s\S]*id="searchResultsSummary"[\s\S]*id="searchResultsList"/);
  assert.match(indexHtml, /\.\.\/shared\/lyrics-search\.js/);
  assert.match(lyricsSearchJs, /function normalizeSearchText/);
  assert.match(lyricsSearchJs, /function fuzzyScore/);
  assert.match(scriptJs, /MusicalLyricsSearch\.buildIndex\(songs/);
  assert.match(scriptJs, /getLinePrimary:\s*\(line\) => line\.en/);
  assert.match(scriptJs, /getLineSecondary:\s*\(line\) => line\.zh/);
  assert.match(scriptJs, /#search=\$\{encodeURIComponent\(query\)\}/);
  assert.match(scriptJs, /&line=\$\{encodeURIComponent\(lineId\)\}/);
  assert.match(scriptJs, /SEARCH_RESULT_LIMIT = 100/);
  assert.match(scriptJs, /没有找到匹配的歌曲或歌词/);
  assert.match(scriptJs, /请输入歌词或歌名/);
  assert.match(scriptJs, /is-search-target/);
});

test("search and playback controls have narrow-screen overflow guards", () => {
  assert.match(styleCss, /\.hero-actions\s*\{[\s\S]*max-width:\s*calc\(100% - 28px\)/);
  assert.match(styleCss, /\.lyrics-search-control\.is-open\s*\{[\s\S]*width:\s*min\(340px, calc\(100vw - 120px\)\)/);
  assert.match(styleCss, /@media \(max-width: 860px\)[\s\S]*\.lyrics-search-control\.is-open\s*\{[\s\S]*calc\(100vw - 100px\)/);
  assert.match(styleCss, /@media \(max-width: 360px\)/);
  assert.match(styleCss, /\.search-line-primary\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
});

test("timestamps and speaker names are metadata rather than spoken lyrics", () => {
  assert.match(scriptJs, /function parseLeadingLineMetadata/);
  assert.match(scriptJs, /\^\\d\{1,2\}:\\d\{2\}/);
  assert.match(scriptJs, /const speakerMatch = lyric\.match/);
  assert.match(scriptJs, /speakers\.push\(speaker\)/);
  assert.match(scriptJs, /pendingSpeakersBySong/);
  assert.match(scriptJs, /metadata\.english/);
  assert.match(scriptJs, /const structuredSpeakers = Array\.isArray\(row\.speakers\)/);
  assert.match(scriptJs, /structuredSpeakers\.length/);
  assert.match(scriptJs, /metadata\.speakers\.length/);
  assert.match(scriptJs, /\n\s+speakers,/);
  assert.match(scriptJs, /speakerTags\.className = "speaker-tags"/);
  assert.match(scriptJs, /tag\.className = "speaker-tag"/);
  assert.match(styleCss, /\.speaker-tags/);
  assert.match(styleCss, /\.speaker-tag/);
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(wordDataJs, sandbox);
  ["00", "06", "08", "66"].forEach((timestampPart) => {
    assert.equal(timestampPart in sandbox.window.hamiltonWordEntries, false);
  });

  const lyricsSandbox = { window: {} };
  require("node:vm").runInNewContext(lyricsDataJs, lyricsSandbox);
  const rows = lyricsSandbox.window.hamiltonLyricsRows;
  assert.equal(new Set(rows.map((row) => Number(row.song_order))).size, 46);
  assert.equal(Math.max(...rows.map((row) => Number(row.song_order))), 46);
  assert.ok(rows.every((row) => Array.isArray(row.speakers) && row.speakers.length > 0));
  assert.ok(
    rows.every((row) => row.speakers.every((speaker) => !/[A-Z]\d+$/.test(speaker))),
    "speaker labels must not contain glued reference footnotes",
  );
  const oneLastTime = rows.filter((row) => Number(row.song_order) === 32);
  assert.ok(
    oneLastTime.every((row) => !/^(?:\{[^}]+\}|\[(?:\d{1,2}:\d{2}(?:\.\d+)?|[A-Za-z ]+)\])/.test(row.english)),
    "One Last Time English lyrics must not include timestamps or role labels",
  );
  assert.ok(
    oneLastTime.every((row) => !/^(?:\[\d{1,2}:\d{2}(?:\.\d+)?\]|\[[A-Za-z ]+\])/.test(row.chinese_translation)),
    "One Last Time Chinese translations must not include timestamps or role labels",
  );
  const byLine = new Map(oneLastTime.map((row) => [String(row.line_index), row]));
  assert.equal(byLine.has("27"), false, "empty role-only placeholder should not render");
  ["66", "76"].forEach((lineIndex) => {
    assert.deepEqual(Array.from(byLine.get(lineIndex).speakers), ["HAMILTON", "WASHINGTON"]);
  });
  ["80", "82", "84", "86"].forEach((lineIndex) => {
    assert.deepEqual(Array.from(byLine.get(lineIndex).speakers), ["COMPANY"]);
  });
  assert.ok(
    oneLastTime.every((row) => row.english.length <= 120 && row.chinese_translation.length <= 80),
    "One Last Time must not retain oversized recital cards",
  );
  assert.equal(byLine.get("52").english, "Like the scripture says:");
  assert.equal(byLine.get("11").english, "Shh. Talk less");
  assert.match(scriptJs, /token\.classList\.add\("is-punctuation-attached"\)/);
  assert.match(styleCss, /\.en-line \.lyric-token\.is-punctuation-attached\s*\{[\s\S]*?margin-right:\s*0;/);

  const storyOfTonight = rows.filter((row) => Number(row.song_order) === 4);
  assert.deepEqual(
    Array.from(storyOfTonight.slice(0, 4), (row) => Array.from(row.speakers)),
    [
      ["HAMILTON"],
      ["LAFAYETTE/MULLIGAN/LAURENS"],
      ["HAMILTON"],
      ["LAFAYETTE/MULLIGAN/LAURENS"],
    ],
  );
});

test("all 46 songs keep bracketed speaker metadata out of source and rendered lyric fields", () => {
  const speakerPrefix = /^(?:[\[\(\{【（])(?:HAMILTON|BURR|LAURENS|LAFAYETTE|MULLIGAN|WASHINGTON|ANGELICA|ELIZA|PEGGY|COMPANY|ENSEMBLE|WOMEN|MEN|KING GEORGE|SEABURY|LEE|JEFFERSON|MADISON|REYNOLDS|PHILIP|EAKER|SCHUYLER SISTERS|CHOIRS|BOTH|MARIA|JAMES|FULL COMPANY|FULL ENSEMBLE|DOCTOR|GEORGE|DOLLY|MARTHA|MALE COMPANY|FEMALE VOTER|MALE VOTER|伯尔|杰斐逊|麦迪逊)(?:\s*(?:\/|&|AND|和|、)\s*(?:HAMILTON|BURR|JEFFERSON|MADISON|伯尔|杰斐逊|麦迪逊))*[\]\)\}】）]\s+\S/iu;
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(lyricsDataJs, sandbox);
  const rows = sandbox.window.hamiltonLyricsRows;
  assert.equal(new Set(rows.map((row) => row.song_order)).size, 46);
  for (const row of rows) {
    assert.doesNotMatch(row.english, speakerPrefix, `${row.song_order}:${row.line_index} English speaker leak`);
    assert.doesNotMatch(row.ipa, speakerPrefix, `${row.song_order}:${row.line_index} IPA speaker leak`);
    assert.doesNotMatch(row.chinese_translation, speakerPrefix, `${row.song_order}:${row.line_index} Chinese speaker leak`);
  }
  assert.doesNotMatch(lyricsSourceMd, /\| \d+ \| \((?:Burr|JEFFERSON|MADISON)\)\s+[^|]+ \|/);
  assert.doesNotMatch(lyricsSourceMd, /\| \d+ \| \[[A-Z\/]+\][^|]+ \|/);
  assert.doesNotMatch(lyricsSourceMd, /\| \d+ \| (?:HAMILTON|BURR|LAURENS|LAFAYETTE|MULLIGAN|WASHINGTON|JEFFERSON|MADISON)(?:\]|:)\s+[^|]+ \|/);
});

test("search history responds to browser back and forward navigation", () => {
  assert.match(scriptJs, /addEventListener\("hashchange", applyHashState\)/);
  assert.match(scriptJs, /addEventListener\("popstate", applyHashState\)/);
});

test("local audio build script covers lines and words", () => {
  assert.ok(audioBuilderJs, "Hamilton/scripts/build-audio.js should exist");
  assert.match(audioBuilderJs, /HAMILTON_TTS_VOICE/);
  assert.match(audioBuilderJs, /build-natural-audio\.js/);
  assert.match(audioBuilderJs, /runBuild\(\{/);
  assert.match(audioBuilderJs, /HAMILTON_TTS_RATE/);
  assert.match(audioBuilderJs, /kind:\s*"hamilton"/);
  assert.match(fs.readFileSync("shared/build-natural-audio.js", "utf8"), /MUSICAL_AUDIO_IDS/);
  assert.equal(pronunciationOverrides.Hamilton.lines["ham-02-001"], "Seventeen seventy-six. New York City");
  assert.equal(pronunciationOverrides.Hamilton.lines["ham-11-044"], "But Alexander, I'll never forget the first");
  assert.equal(pronunciationOverrides.Hamilton.words["1776"], "seventeen seventy-six");
  assert.equal(pronunciationOverrides.Hamilton.words["1780"], "seventeen eighty");
  assert.equal(pronunciationOverrides.Hamilton.words["1781"], "seventeen eighty-one");
  assert.equal(pronunciationOverrides.Hamilton.words["1789"], "seventeen eighty-nine");
  assert.equal(pronunciationOverrides.Hamilton.words["1800"], "eighteen hundred");
  assert.match(scriptJs, /"1776": \{ ipa: "\/ˌsɛvənˈtin ˌsɛvəti ˈsɪks\/"/);
  assert.match(scriptJs, /"ham-02-001": "\/ˌsɛvənˈtin-ˌsɛvəti-ˈsɪks nu jɔrk sɪti\/"/);
});

test("Hamilton uses aligned broad American IPA without corrupted symbols", () => {
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(lyricsDataJs, sandbox);
  const tokenRe = /[\p{L}]+(?:['’][\p{L}]+)?(?:-[\p{L}]+)*|\d+/gu;
  const rows = sandbox.window.hamiltonLyricsRows;
  const mismatched = rows.filter((row) => {
    const words = row.english.match(tokenRe) || [];
    const ipa = row.ipa.replace(/^\/|\/$/g, "").trim().split(/\s+/).filter(Boolean);
    return words.length !== ipa.length;
  });
  assert.equal(mismatched.length, 0);
  assert.doesNotMatch(rows.map((row) => row.ipa).join("\n"), /[?？�ʔɐᵻ]/);
  assert.ok(rows.every((row) => /^\/[^/]+\/$/.test(row.ipa)), "line IPA should only keep the outer slash pair");
});

test("word cards do not contain placeholder meanings", () => {
  const combined = `${scriptJs}\n${wordDataJs}`;
  [
    "word from the lyric line",
    "暂未收录",
    "not in the local glossary yet",
    "lyric term",
    "title word",
  ].forEach((term) => {
    assert.equal(combined.includes(term), false, `found placeholder meaning: ${term}`);
  });
  assert.doesNotMatch(wordDataJs, /专有名词：|歌词用词：|\[人名\]/);
});

test("English word cards do not render an English definition paragraph", () => {
  assert.doesNotMatch(scriptJs, /document\.createElement\("p"\)[\s\S]*popover-en/);
  assert.doesNotMatch(scriptJs, /refs\.wordPopover\.append\(head, meaning, en\)/);
});

test("generated word data includes meanings for every entry", () => {
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(wordDataJs, sandbox);
  const entries = Object.entries(sandbox.window.hamiltonWordEntries || {});
  assert.ok(entries.length > 0, "word data should contain entries");
  const missing = entries.filter(([, entry]) => !entry.meaning);
  assert.deepEqual(missing.slice(0, 10), []);
});

test("dropped-g lyric forms use the intended verbs instead of surnames", () => {
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(wordDataJs, sandbox);
  const entries = sandbox.window.hamiltonWordEntries;
  const expected = {
    askin: /询问|请求/,
    clerkin: /文书工作|职员/,
    comin: /来|到来/,
    goin: /去|前往|将要/,
    makin: /制作|促成|赚取/,
    nothin: /什么也没有|没有东西/,
    talkin: /说话|谈论/,
    workin: /工作|运作/,
  };

  Object.entries(expected).forEach(([word, meaning]) => {
    assert.ok(entries[word], `${word} should exist`);
    assert.match(entries[word].meaning, meaning);
    assert.doesNotMatch(entries[word].meaning, /人名|姓氏/);
  });
});

test("ordinary inflected words are not mistaken for acronyms", () => {
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(wordDataJs, sandbox);
  const entries = sandbox.window.hamiltonWordEntries;
  const expected = {
    aims: /瞄准|目标/,
    bets: /赌注|下注/,
    bucks: /美元|块钱/,
    gets: /得到|变得|到达/,
    ideas: /想法|观念/,
    lets: /让|允许/,
    pops: /爸爸|老爸/,
  };
  const acronymNoise = /考试|工业管理系统|政府电子|电信服务|设计奖|地方交易系统|大众音乐会/;

  Object.entries(expected).forEach(([word, meaning]) => {
    assert.ok(entries[word], `${word} should exist`);
    assert.match(entries[word].meaning, meaning);
    assert.doesNotMatch(entries[word].meaning, acronymNoise);
  });
});

test("French lyric words keep reviewed Chinese meanings and French IPA", () => {
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(wordDataJs, sandbox);
  const entries = sandbox.window.hamiltonWordEntries;
  assert.match(entries.ami.meaning, /朋友/);
  assert.equal(entries.ami.ipa, "/ami/");
  assert.match(entries["c'est"].meaning, /这是|那是/);
  assert.equal(entries["c'est"].ipa, "/sɛ/");
  assert.match(entries.pièce.meaning, /作品|一部分/);
  assert.equal(entries.pièce.ipa, "/pjɛs/");
  assert.match(entries.résistance.meaning, /抵抗|精华/);
  assert.equal(entries.résistance.ipa, "/ʁezistɑ̃s/");
  ["pi%C3%A8ce.mp3", "r%C3%A9sistance.mp3"].forEach((filename) => {
    const audioPath = `Hamilton/audio/words/${filename}`;
    assert.ok(fs.existsSync(audioPath), `${audioPath} should exist`);
    assert.ok(fs.statSync(audioPath).size > 512, `${audioPath} should not be empty`);
  });
});

test("reviewed Hamilton lyric translations have no blanks or fallback text", () => {
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(lyricsDataJs, sandbox);
  const rows = sandbox.window.hamiltonLyricsRows;
  const unresolved = rows.filter((row) =>
    !row.chinese_translation?.trim()
    || /暂未|未收录|待校对|translation unavailable|word from the lyric line/i.test(row.chinese_translation),
  );
  assert.equal(unresolved.length, 0);

  const translationFor = (songId, lineIndex) => rows.find(
    (row) => row.song_id === songId && row.line_index === String(lineIndex),
  )?.chinese_translation;
  assert.equal(translationFor("01-alexander-hamilton", 5), "长大后竟成为英雄和学者？");
  assert.match(translationFor("01-alexander-hamilton", 41), /记账做工|文书/);
  assert.match(translationFor("01-alexander-hamilton", 56), /侧台/);
  assert.equal(translationFor("02-aaron-burr-sir", 47), "是我！");
  assert.equal(translationFor("26-take-a-break", 1), "一 二 三 四");
  assert.match(translationFor("46-who-lives-who-dies-who-tells-your-story", 64), /第一所私立孤儿院/);
  assert.match(translationFor("46-who-lives-who-dies-who-tells-your-story", 74), /我的故事/);
});

test("reviewed translations preserve gendered lyrics without adding degrading wording", () => {
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(lyricsDataJs, sandbox);
  const byLine = new Map(sandbox.window.hamiltonLyricsRows.map((row) => [`${row.song_order}:${row.line_index}`, row]));
  assert.equal(byLine.get("2:49").chinese_translation, "正忙得起劲、乐在其中；听说你母亲还问：“再来一次？”");
  assert.equal(byLine.get("2:52").chinese_translation, "隔着四层紧身胸衣，亲热起来也不容易……");
  assert.equal(byLine.get("2:40").chinese_translation, "塞缪尔·亚当斯的酒我都能喝下两品脱，正喝第三杯呢！");
  assert.equal(byLine.get("2:44").chinese_translation, "我就是革命阵营里的兰斯洛特！");
  assert.equal(byLine.get("11:52").chinese_translation, "你给我的感觉，是一位从不安于现状的女性");
  assert.equal(byLine.get("11:97").chinese_translation, "在那里，我唯一的“职责”就是嫁给有钱人；");
  assert.equal(byLine.get("27:65").chinese_translation, "还有，只要价钱合适，你可以继续和我被辱骂为“妓女”的妻子来往");
  const translations = sandbox.window.hamiltonLyricsRows.map((row) => row.chinese_translation).join("\n");
  ["器大活好", "神魂颠倒", "搞起来", "放荡的老婆", "不会满足的女人", "世家女孩", "荡妇的儿子"].forEach((phrase) => {
    assert.equal(translations.includes(phrase), false, `unreviewed degrading wording remains: ${phrase}`);
  });
  const aaronBurrSirTranslations = sandbox.window.hamiltonLyricsRows
    .filter((row) => Number(row.song_order) === 2)
    .map((row) => row.chinese_translation)
    .join("\n");
  assert.doesNotMatch(aaronBurrSirTranslations, /[「」]/, "song translations must not contain glossary notes");
});

test("common do verb forms use lyric-appropriate definitions", () => {
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(wordDataJs, sandbox);
  const does = sandbox.window.hamiltonWordEntries.does;
  assert.ok(does, "does should exist in generated word data");
  assert.match(does.en, /third-person singular of do|auxiliary verb/);
  assert.doesNotMatch(does.en, /Department|Energy|female|mammals|buck/i);
  assert.doesNotMatch(does.meaning, /能源部|雌鹿/);
});

test("generated word data avoids dictionary domain noise", () => {
  assert.doesNotMatch(wordDataJs, /\[(?:计|医|化|经|法)\]/);
  assert.doesNotMatch(wordDataJs, /Adam and Eve/i);
});

test("common function words use lyric-appropriate entries", () => {
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(wordDataJs, sandbox);
  const entries = sandbox.window.hamiltonWordEntries;
  const expected = {
    a: /article|determiner/i,
    am: /be verb|first-person/i,
    are: /be verb|plural/i,
    as: /conjunction|preposition/i,
    at: /preposition/i,
    be: /be verb/i,
    he: /pronoun/i,
    his: /pronoun|possessive/i,
    i: /pronoun/i,
    is: /be verb|third-person/i,
    it: /pronoun/i,
    or: /conjunction/i,
    was: /be verb|past tense/i,
    were: /be verb|past tense/i,
  };
  const wrongSense = /blood group|radioactive|transuranic|arsenic|Samoa|square meters|hospital|programing language|Department|Energy/i;

  Object.entries(expected).forEach(([word, pattern]) => {
    assert.ok(entries[word], `${word} should exist`);
    assert.match(entries[word].en, pattern, `${word} should use a grammar-friendly English definition`);
    assert.doesNotMatch(`${entries[word].meaning}\n${entries[word].en}`, wrongSense, `${word} has a mismatched dictionary sense`);
  });
});

test("context-sensitive Hamilton terms avoid misleading first dictionary senses", () => {
  const sandbox = { window: {} };
  require("node:vm").runInNewContext(wordDataJs, sandbox);
  const entries = sandbox.window.hamiltonWordEntries;
  const expected = {
    "angelica's": /given name/,
    adams: /surname/,
    dropped: /drop/,
    founding: /founding|establishing/,
    got: /get/,
    kid: /child|young person/,
    providence: /divine care|fate|foresight/,
    "self-starter": /proactive|self-motivated/,
    slaves: /slave|enslaved/,
  };
  const wrongSense = /plant|Adam and Eve|drop kick|enzyme|goat|Rhode Island|electric starting motor|Slavs/i;

  Object.entries(expected).forEach(([word, pattern]) => {
    assert.ok(entries[word], `${word} should exist`);
    assert.match(entries[word].en, pattern, `${word} should use the Hamilton lyric sense`);
    assert.doesNotMatch(`${entries[word].meaning}\n${entries[word].en}`, wrongSense, `${word} has a misleading dictionary sense`);
  });
});
