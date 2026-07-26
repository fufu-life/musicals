const SETTINGS_KEY = "moliere-le-spectacle-musical-display-settings";
const CURRENT_SONG_KEY = "moliere-le-spectacle-musical-current-song";
const SIDEBAR_KEY = "moliere-le-spectacle-musical-sidebar-collapsed";
const PLAYBACK_RATE_KEY = "moliere-le-spectacle-musical-playback-rate";
const TOKEN_RE = /\p{L}+(?:['’]\p{L}+)*(?:-\p{L}+)*/gu;

const songs = window.songsInitial || window.songs || [];
let fullSongsReady = null;
let wordEntries = {};
let wordDataReady = null;
let wordDataLoaded = false;
const config = window.pageConfig || {};

const state = {
  settings: readSettings(),
  sidebarCollapsed: localStorage.getItem(SIDEBAR_KEY) === "true",
  currentSongId: localStorage.getItem(CURRENT_SONG_KEY) || "",
  audio: null,
  audioFinish: null,
  speechFinish: null,
  preloadAudio: null,
  rateControlled: false,
};

const dom = {
  shell: document.querySelector(".app-shell"),
  content: document.querySelector(".content"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  songSelect: document.getElementById("songSelect"),
  showTitle: document.getElementById("showTitle"),
  songList: document.getElementById("songList"),
  songTitle: document.getElementById("songTitle"),
  titleRow: document.querySelector(".song-title-row"),
  playbackTools: document.querySelector(".toolbar-playback-tools"),
  songPlayButton: document.getElementById("songPlayButton"),
  songSubtitle: document.getElementById("songSubtitle"),
  lyrics: document.getElementById("lyrics"),
  popover: document.getElementById("wordPopover"),
  backToTop: document.getElementById("backToTop"),
  hero: document.querySelector(".hero"),
  homeButton: document.querySelector(".home-button"),
  mobilePicker: document.querySelector(".mobile-picker"),
};

const analytics = window.MusicalAnalytics.initShow({
  showId: config.slug,
  showName: config.title,
  pageType: "lyrics_learning",
  getProgressElement: () => dom.lyrics,
});

const pageTools = window.MusicalLyricsPageTools.create({
  songs,
  rateStorageKey: PLAYBACK_RATE_KEY,
  hero: dom.hero,
  homeButton: dom.homeButton,
  titleRow: dom.titleRow,
  rateContainer: dom.playbackTools,
  lyrics: dom.lyrics,
  mobilePicker: dom.mobilePicker,
  getCurrentSong,
  getSongTitleSecondary: (song) => song.titleZh || "",
  getLinePrimary: (line) => line.original || "",
  getLineSecondary: (line) => [line.en, line.zh].filter(Boolean).join(" · "),
  ensureSearchReady: ensureFullSongs,
  onNavigate: navigateToSearchResult,
  onRateChange(rate) {
    if (state.audio && state.rateControlled) {
      state.audio.defaultPlaybackRate = rate;
      state.audio.playbackRate = rate;
    }
  },
});

const audioController = window.MusicalAudio.createController({
  stopCurrent: stopCurrentPlayback,
  pauseCurrent: pauseCurrentPlayback,
  resumeCurrent: resumeCurrentPlayback,
  onSequenceStateChange: pageTools.setSequenceActive,
  onSequencePauseChange: pageTools.setSequencePaused,
  onItemClear: clearSequenceHighlight,
});
pageTools.connectController(audioController);

init();

function init() {
  if (!state.currentSongId && songs[0]) state.currentSongId = songs[0].id;
  dom.showTitle.append(renderClickableWords(config.title || "", "song-title-word"));
  renderSongList();
  renderSong();
  if (!getCurrentSong()?.lines.length) {
    ensureFullSongs().then(renderSong);
  }
  scheduleDeferredWordData();
  bindToggles();
  bindSidebar();
  bindBackToTop();
  dom.songPlayButton?.addEventListener("click", toggleCurrentSongPlayback);
  syncSidebarState();
  initThemedCursor();
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".word-popover") && !event.target.closest(".lyric-word") && !event.target.closest(".song-title-word")) {
      hidePopover();
    }
  });
}

function loadScript(src, fetchPriority = "auto") {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.fetchPriority = fetchPriority;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.append(script);
  });
}

async function loadFullSongs() {
  await loadScript("songs.js", "high");
  const fullSongs = window.songs || [];
  if (!fullSongs.length) throw new Error("Full song data is empty");
  songs.splice(0, songs.length, ...fullSongs);
  renderSongList();
}

function ensureFullSongs() {
  if (!fullSongsReady) {
    fullSongsReady = loadFullSongs().catch((error) => {
      fullSongsReady = null;
      console.error("Deferred full song data failed to load", error);
      throw error;
    });
  }
  return fullSongsReady;
}

async function loadDeferredWordData() {
  await loadScript("word-data.js", "low");
  wordEntries = window.wordEntries || {};
  wordDataLoaded = true;
  if (state.settings.showIpa) renderSong();
  syncWordAvailability();
}

function ensureWordDataReady() {
  if (!wordDataReady) {
    wordDataReady = loadDeferredWordData().catch((error) => {
      console.error("Deferred word data failed to load", error);
    });
  }
  return wordDataReady;
}

function scheduleDeferredWordData() {
  const start = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(ensureWordDataReady, { timeout: 3000 });
    } else {
      window.setTimeout(ensureWordDataReady, 1200);
    }
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

function readSettings() {
  const defaultShowEn = config.showEnglishToggle !== false;
  try {
    return { showZh: true, showIpa: true, showEn: defaultShowEn, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { showZh: true, showIpa: true, showEn: defaultShowEn };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function bindToggles() {
  const featureNames = {
    showZh: "translation_toggle",
    showEn: "english_toggle",
    showIpa: "ipa_toggle",
  };
  document.querySelectorAll("[data-toggle]").forEach((button) => {
    const key = button.dataset.toggle;
    button.classList.toggle("is-active", Boolean(state.settings[key]));
    button.setAttribute("aria-pressed", String(Boolean(state.settings[key])));
    button.addEventListener("click", () => {
      state.settings[key] = !state.settings[key];
      button.classList.toggle("is-active", Boolean(state.settings[key]));
      button.setAttribute("aria-pressed", String(Boolean(state.settings[key])));
      saveSettings();
      renderSong();
      if (featureNames[key]) analytics.featureUse(featureNames[key]);
    });
  });
}

function bindSidebar() {
  dom.sidebarToggle?.addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem(SIDEBAR_KEY, String(state.sidebarCollapsed));
    syncSidebarState();
  });
  dom.songSelect?.addEventListener("change", (event) => selectSong(event.target.value));
  window.addEventListener("resize", syncSidebarState, { passive: true });
}

function bindBackToTop() {
  if (!dom.backToTop) return;
  const sync = () => {
    dom.backToTop.hidden = window.scrollY < Math.max(420, window.innerHeight * 0.65);
  };
  window.addEventListener("scroll", sync, { passive: true });
  dom.backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  sync();
}

function syncSidebarState() {
  const isNarrowLayout = window.matchMedia("(max-width: 980px)").matches;
  dom.shell?.classList.toggle("is-collapsed", state.sidebarCollapsed && !isNarrowLayout);
  if (!dom.sidebarToggle) return;
  dom.sidebarToggle.textContent = state.sidebarCollapsed ? "›" : "‹";
  dom.sidebarToggle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  dom.sidebarToggle.setAttribute("aria-label", state.sidebarCollapsed ? "展开歌曲列表" : "收起歌曲列表");
}

function renderSongList() {
  dom.songList.replaceChildren(...songs.map((song) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `song-button${song.id === state.currentSongId ? " is-active" : ""}`;
    const order = document.createElement("span");
    order.className = "song-order";
    order.textContent = String(song.displayOrder || song.order).padStart(2, "0");
    const title = document.createElement("strong");
    title.textContent = song.title;
    const sub = document.createElement("span");
    sub.textContent = song.titleZh || "";
    button.append(order, title, sub);
    button.addEventListener("click", () => selectSong(song.id));
    return button;
  }));

  if (dom.songSelect) {
    dom.songSelect.replaceChildren(...songs.map((song) => {
      const option = document.createElement("option");
      option.value = song.id;
      option.textContent = `${String(song.displayOrder || song.order).padStart(2, "0")}  ${song.title}`;
      option.selected = song.id === state.currentSongId;
      return option;
    }));
  }
}

async function selectSong(songId) {
  if (songId === state.currentSongId) return;
  const target = songs.find((song) => song.id === songId);
  if (!target?.lines.length) await ensureFullSongs();
  audioController.stopAll();
  state.currentSongId = songId;
  localStorage.setItem(CURRENT_SONG_KEY, songId);
  renderSongList();
  hidePopover();
  renderCurrentSongWithTransition();
  resetSongScrollPosition();
}

function navigateToSearchResult(songId, lineId = "") {
  const song = songs.find((item) => item.id === songId);
  if (!song) return;
  audioController.stopAll();
  state.currentSongId = songId;
  localStorage.setItem(CURRENT_SONG_KEY, songId);
  renderSongList();
  hidePopover();
  renderSong();
  if (!lineId) {
    resetSongScrollPosition();
    return;
  }
  requestAnimationFrame(() => {
    const card = Array.from(dom.lyrics.querySelectorAll(".lyric-card")).find((item) => item.dataset.lineId === lineId);
    card?.classList.add("is-search-target");
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => card?.classList.remove("is-search-target"), 1800);
  });
}

function resetSongScrollPosition() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function renderCurrentSongWithTransition() {
  if (!dom.content) {
    renderSong();
    return;
  }
  dom.content.classList.remove("is-song-settling");
  dom.content.classList.add("is-song-changing");
  window.setTimeout(() => {
    renderSong();
    dom.content.classList.remove("is-song-changing");
    dom.content.classList.add("is-song-settling");
    window.setTimeout(() => dom.content.classList.remove("is-song-settling"), 360);
  }, 170);
}

function renderSong() {
  const song = getCurrentSong();
  if (!song) return;
  dom.songTitle.replaceChildren(renderClickableWords(song.title, "song-title-word"));
  dom.songSubtitle.textContent = song.titleZh || "";
  dom.songPlayButton.disabled = !song.lines.length;
  dom.lyrics.replaceChildren(...song.lines.map((line) => renderLine(song, line)));
  analytics.songRendered(song);
}

function getCurrentSong() {
  return songs.find((item) => item.id === state.currentSongId) || songs[0] || null;
}

function renderLine(song, line) {
  const card = document.createElement("article");
  card.className = "lyric-card";
  card.dataset.lineId = line.id;
  const main = document.createElement("div");
  main.className = "line-main";

  if (line.speaker) {
    const speaker = document.createElement("p");
    speaker.className = "line-speaker";
    speaker.textContent = line.speaker;
    main.append(speaker);
  }

  const original = document.createElement("p");
  original.className = "line-original";
  original.append(renderClickableWords(line.original, "lyric-word", { showPhonetics: true, line }));
  main.append(original);

  const en = document.createElement("p");
  en.className = "line-en";
  en.hidden = !state.settings.showEn || !line.en;
  en.textContent = line.en;
  main.append(en);

  const zh = document.createElement("p");
  zh.className = "line-zh";
  zh.hidden = !state.settings.showZh;
  zh.textContent = line.zh;
  main.append(zh);

  const actions = document.createElement("div");
  actions.className = "line-actions";
  const speak = document.createElement("button");
  speak.type = "button";
  speak.className = "speak-button";
  speak.setAttribute("aria-label", "播放整句发音");
  speak.textContent = "▶";
  const lineAudioPath = getLineAudioPath(song, line);
  const primeLineAudio = () => window.MusicalAudio.preloadLocalAudio(lineAudioPath);
  speak.addEventListener("pointerenter", primeLineAudio, { once: true });
  speak.addEventListener("focus", primeLineAudio, { once: true });
  speak.addEventListener("click", () => {
    if (audioController.isSequenceActive() && card.classList.contains("is-sequence-active")) {
      audioController.stopSequence();
      return;
    }
    audioController.runUserAction(
      speak,
      () => {
        const audioSession = analytics.audioClick({ audioType: "line", lineId: line.id });
        return playAudio(lineAudioPath, line.original, { rateControlled: true, analyticsSession: audioSession });
      },
    );
  });
  actions.append(speak);

  card.append(main, actions);
  return card;
}

function renderClickableWords(text, className, options = {}) {
  const fragment = document.createDocumentFragment();
  const wordParts = Array.from(String(text || "").matchAll(TOKEN_RE)).map((match) => match[0]);
  const ipaParts = splitIpa(options.line?.ipa || "");
  let lastIndex = 0;
  let wordIndex = 0;
  for (const match of String(text || "").matchAll(TOKEN_RE)) {
    if (match.index > lastIndex) fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
    const token = match[0];
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = token;
    button.dataset.wordKey = normalizeKey(token);
    if (wordDataLoaded && !wordEntries[button.dataset.wordKey]) {
      button.disabled = true;
      button.classList.add("is-word-unavailable");
    }
    button.addEventListener("click", async (event) => {
      const anchor = event.currentTarget;
      showWordLoading(token, anchor);
      await ensureWordDataReady();
      if (!anchor.isConnected) return;
      showWord(token, anchor, { autoplay: true });
    });
    if (options.showPhonetics) {
      const tokenWrap = document.createElement("span");
      tokenWrap.className = "lyric-token";
      const phonetic = document.createElement("span");
      phonetic.className = "word-phonetic";
      phonetic.hidden = !state.settings.showIpa;
      phonetic.textContent = getAlignedWordIpa(token, wordIndex, wordParts.length, ipaParts);
      tokenWrap.append(button, phonetic);
      fragment.append(tokenWrap);
    } else {
      fragment.append(button);
    }
    wordIndex += 1;
    lastIndex = match.index + token.length;
  }
  if (lastIndex < String(text).length) fragment.append(document.createTextNode(String(text).slice(lastIndex)));
  return fragment;
}

function syncWordAvailability() {
  document.querySelectorAll(".lyric-word[data-word-key], .song-title-word[data-word-key]").forEach((button) => {
    const available = Boolean(wordEntries[button.dataset.wordKey]);
    button.disabled = !available;
    button.classList.toggle("is-word-unavailable", !available);
  });
}

function getAlignedWordIpa(token, wordIndex, wordCount, ipaParts) {
  if (ipaParts.length === wordCount && ipaParts[wordIndex]) return formatLineIpaPart(ipaParts[wordIndex], wordIndex, wordCount);
  const entry = wordEntries[normalizeKey(token)];
  return formatLineIpaPart(entry?.ipa || "", wordIndex, wordCount);
}

function formatLineIpaPart(value, wordIndex, wordCount) {
  const bare = stripIpaSlashes(value);
  if (!bare || /见|标题词/u.test(bare)) return "";
  const prefix = wordIndex === 0 ? "/" : "";
  const suffix = wordIndex === wordCount - 1 ? "/" : "";
  return `${prefix}${bare}${suffix}`;
}

function splitIpa(ipa) {
  return stripIpaSlashes(ipa)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function stripIpaSlashes(value) {
  return String(value || "").replace(/^\/|\/$/g, "").trim();
}

function showWord(token, anchor, { autoplay = false } = {}) {
  const key = normalizeKey(token);
  const entry = wordEntries[key];
  if (!entry) {
    hidePopover();
    anchor.disabled = true;
    anchor.classList.add("is-word-unavailable");
    return;
  }
  dom.popover.replaceChildren();

  const head = document.createElement("div");
  head.className = "popover-head";
  const term = document.createElement("div");
  term.className = "popover-term";
  const word = document.createElement("p");
  word.className = "popover-word";
  word.textContent = token;
  const ipa = document.createElement("p");
  ipa.className = "popover-ipa";
  ipa.textContent = entry.ipa || "";
  const wordAudioPath = getWordAudioPath(key);
  window.MusicalAudio.preloadLocalAudio(wordAudioPath);
  const playWordPronunciation = () => {
    audioController.runUserAction(
      anchor,
      () => {
        const audioSession = analytics.audioClick({ audioType: "word", lineId: "" });
        return playAudio(wordAudioPath, entry.speak || token, { analyticsSession: audioSession });
      },
    );
  };
  term.append(word, ipa);
  head.append(term);
  const meaning = document.createElement("p");
  meaning.className = "popover-meaning";
  meaning.textContent = entry.meaning || "";
  const en = document.createElement("p");
  en.className = "popover-en";
  en.textContent = entry.en || "";
  dom.popover.append(head, meaning);
  if (config.language !== "en" && entry.en) {
    dom.popover.append(en);
  }

  const rect = anchor.getBoundingClientRect();
  const top = Math.min(window.innerHeight - 20, rect.bottom + 10);
  const left = Math.min(window.innerWidth - 332, Math.max(12, rect.left));
  dom.popover.style.top = `${top}px`;
  dom.popover.style.left = `${Math.max(12, left)}px`;
  dom.popover.hidden = false;
  if (autoplay) playWordPronunciation();
}

function showWordLoading(token, anchor) {
  dom.popover.replaceChildren();
  const word = document.createElement("p");
  word.className = "popover-word";
  word.textContent = token;
  const loading = document.createElement("p");
  loading.className = "popover-meaning";
  loading.textContent = "正在加载词义…";
  dom.popover.append(word, loading);

  const rect = anchor.getBoundingClientRect();
  const top = Math.min(window.innerHeight - 20, rect.bottom + 10);
  const left = Math.min(window.innerWidth - 332, Math.max(12, rect.left));
  dom.popover.style.top = `${top}px`;
  dom.popover.style.left = `${Math.max(12, left)}px`;
  dom.popover.hidden = false;
}

function hidePopover() {
  dom.popover.hidden = true;
}

function normalizeKey(token) {
  return String(token || "")
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR")
    .replace(/[’‘`]/gu, "'")
    .replace(/'/g, "")
    .replace(/[^\p{L}-]/gu, "")
    .trim();
}

function getLineAudioPath(song, line) {
  return withAudioVersion(`audio/lines/${encodeURIComponent(song.id)}/${encodeURIComponent(line.id)}.mp3`, line.original);
}

function getWordAudioPath(key) {
  return withAudioVersion(`audio/words/${encodeURIComponent(key)}.mp3`, wordEntries[key]?.speak || key);
}

function withAudioVersion(path, speechText) {
  let hash = 2166136261;
  for (const character of String(speechText || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${path}?v=${(hash >>> 0).toString(36)}`;
}

function stopCurrentPlayback() {
  if (state.audioFinish) {
    const finish = state.audioFinish;
    state.audioFinish = null;
    finish();
  }
  if (state.audio) {
    state.audio.pause();
    state.audio.currentTime = 0;
    state.audio = null;
  }
  state.rateControlled = false;
  if (state.speechFinish) {
    const finish = state.speechFinish;
    state.speechFinish = null;
    finish();
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  state.preloadAudio = null;
}

function pauseCurrentPlayback() {
  if (state.audio && !state.audio.paused) state.audio.pause();
  if ("speechSynthesis" in window && speechSynthesis.speaking) speechSynthesis.pause();
}

function resumeCurrentPlayback() {
  if (state.audio?.paused) {
    Promise.resolve(state.audio.play()).catch(() => audioController.stopSequence());
  }
  if ("speechSynthesis" in window && speechSynthesis.paused) speechSynthesis.resume();
}

async function playAudio(src, text, { rateControlled = false, analyticsSession = null } = {}) {
  try {
    await playLocalAudio(src, false, { rateControlled, analyticsSession });
  } catch {
    await playSpeech(text, false, { rateControlled, analyticsSession });
  }
}

function playLocalAudio(src, waitForEnd, { rateControlled = false, analyticsSession = null } = {}) {
  if (!src) return Promise.reject(new Error("Missing audio source"));
  stopCurrentPlayback();
  const audio = window.MusicalAudio.getCachedAudio(src);
  if (!audio) return Promise.reject(new Error("Audio playback unavailable"));
  const rate = rateControlled ? pageTools.getRate() : 1;
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  state.audio = audio;
  state.rateControlled = rateControlled;
  if (!waitForEnd) {
    return Promise.resolve(audio.play()).then(() => {
      if (analyticsSession) {
        analytics.audioStart(analyticsSession);
        audio.addEventListener("ended", () => analytics.audioComplete(analyticsSession), { once: true });
      }
    });
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      if (state.audio === audio) state.audio = null;
      if (state.audioFinish === stopAndResolve) state.audioFinish = null;
      if (error) reject(error);
      else resolve();
    };
    const handleEnded = () => {
      if (analyticsSession) analytics.audioComplete(analyticsSession);
      finish();
    };
    const handleError = () => finish(new Error("Audio playback failed"));
    const stopAndResolve = () => finish();
    state.audioFinish = stopAndResolve;
    audio.addEventListener("ended", handleEnded, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    Promise.resolve(audio.play())
      .then(() => {
        if (analyticsSession) analytics.audioStart(analyticsSession);
      })
      .catch(finish);
  });
}

function playSpeech(text, waitForEnd, { rateControlled = false, analyticsSession = null } = {}) {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function") {
    return Promise.reject(new Error("Speech synthesis unavailable"));
  }
  stopCurrentPlayback();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = config.language === "en" ? "en-US" : config.language === "de" ? "de-DE" : "fr-FR";
  utterance.rate = rateControlled ? pageTools.getRate() : 1;
  utterance.onstart = () => {
    if (analyticsSession) analytics.audioStart(analyticsSession);
  };
  if (!waitForEnd) {
    utterance.onend = () => {
      if (analyticsSession) analytics.audioComplete(analyticsSession);
    };
    speechSynthesis.speak(utterance);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (state.speechFinish === stopAndResolve) state.speechFinish = null;
      if (error) reject(error);
      else resolve();
    };
    const stopAndResolve = () => finish();
    state.speechFinish = stopAndResolve;
    utterance.onend = () => {
      if (analyticsSession) analytics.audioComplete(analyticsSession);
      finish();
    };
    utterance.onerror = () => finish(new Error("Speech synthesis failed"));
    speechSynthesis.speak(utterance);
  });
}

async function playLineToEnd(song, line) {
  const analyticsSession = analytics.createAudioSession({ audioType: "line", lineId: line.id });
  try {
    await playLocalAudio(getLineAudioPath(song, line), true, { rateControlled: true, analyticsSession });
  } catch {
    await playSpeech(line.original, true, { rateControlled: true, analyticsSession });
  }
}

function toggleCurrentSongPlayback() {
  const song = getCurrentSong();
  if (!song?.lines.length) return;
  const wasActive = audioController.isSequenceActive();
  const playlistSession = wasActive ? null : analytics.createAudioSession({ audioType: "playlist", lineId: "" });
  const sequence = audioController.toggleSequence({
    button: dom.songPlayButton,
    items: song.lines,
    playItem: (line) => playLineToEnd(song, line),
    gapMs: window.MusicalAudio.SEQUENCE_GAP_MS / pageTools.getRate(),
    onItemStart: (line, index, nextLine) => {
      setSequenceHighlight(line.id, index, song.lines.length);
      if (nextLine) preloadLineAudio(song, nextLine);
    },
    onComplete: () => {
      if (playlistSession) analytics.audioComplete(playlistSession);
      analytics.featureUse("playlist_complete");
    },
  });
  if (!wasActive && audioController.isSequenceActive()) {
    analytics.audioClick(playlistSession);
    analytics.audioStart(playlistSession);
    analytics.featureUse("playlist_start");
  }
  return sequence;
}

function preloadLineAudio(song, line) {
  const audio = window.MusicalAudio.preloadLocalAudio(getLineAudioPath(song, line));
  state.preloadAudio = audio;
}

function setSequenceHighlight(lineId, index, total) {
  clearSequenceHighlight();
  const card = Array.from(dom.lyrics.querySelectorAll(".lyric-card")).find((item) => item.dataset.lineId === lineId);
  if (card) {
    card.classList.add("is-sequence-active");
    const button = card.querySelector(".speak-button");
    button?.classList.add("is-sequence-stop");
    button?.setAttribute("aria-label", "停止全曲播放");
    button?.setAttribute("title", "停止全曲播放");
  }
  pageTools.setProgress(index, total);
  followSequenceCard(card);
}

function followSequenceCard(card) {
  if (!card) return;
  const rect = card.getBoundingClientRect();
  const topBoundary = Math.min(180, window.innerHeight * 0.24);
  const bottomBoundary = window.innerHeight - Math.min(150, window.innerHeight * 0.2);
  if (rect.top >= topBoundary && rect.bottom <= bottomBoundary) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  card.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
}

function clearSequenceHighlight() {
  dom.lyrics?.querySelectorAll(".lyric-card.is-sequence-active").forEach((card) => {
    card.classList.remove("is-sequence-active");
    const button = card.querySelector(".speak-button");
    button?.classList.remove("is-sequence-stop");
    button?.setAttribute("aria-label", "播放整句发音");
    button?.setAttribute("title", "播放整句发音");
  });
}

function initThemedCursor() {
  if (window.referenceCursorActive) return;
  const canvas = document.getElementById("effectCanvas");
  if (!canvas || window.matchMedia("(pointer: coarse)").matches) return;
  const ctx = canvas.getContext("2d");
  const effect = config.effect || {};
  const colors = {
    primary: effect.primary || "#d8b15b",
    secondary: effect.secondary || "#ffffff",
  };
  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, px: window.innerWidth / 2, py: window.innerHeight / 2, down: false };
  const particles = [];
  const bursts = [];
  const maxParticles = 54;
  const maxBursts = 30;
  let time = 0;
  let lastTrailAt = 0;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function addTrail(x, y, dx, dy) {
    const trail = effect.trail || "stoneDust";
    const letters = String(config.title || "Lyrics").replace(/s+/g, "").split("");
    const base = {
      x,
      y,
      vx: -dx * 0.025 + (Math.random() - 0.5) * 0.65,
      vy: -dy * 0.025 + (Math.random() - 0.5) * 0.65,
      life: 1,
      size: 2 + Math.random() * 3.5,
      rot: Math.random() * Math.PI,
      kind: trail,
      text: trail === "letters" ? letters[Math.floor(Math.random() * letters.length)] : "",
      color: trail === "petals"
        ? [colors.primary, colors.secondary, "#f7f1ee"][Math.floor(Math.random() * 3)]
        : (Math.random() > 0.55 ? colors.primary : colors.secondary),
    };
    particles.push(base);
    if (particles.length > maxParticles) particles.splice(0, particles.length - maxParticles);
  }

  function addBurst(x, y) {
    const click = effect.click || "rings";
    if (click === "letterfall") {
      String(config.title || "Cyrano").replace(/s+/g, "").split("").forEach((letter, index) => {
        const angle = Math.PI * (0.15 + Math.random() * 0.7);
        const speed = 0.45 + Math.random() * 0.85;
        bursts.push({ x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 8, vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed, life: 1, radius: 5, angle: (Math.random() - 0.5) * 0.25, delay: index * 2, kind: click, text: letter, color: index % 2 ? colors.primary : colors.secondary });
      });
      return;
    }
    const ringKinds = new Set(["roseWindowGlow", "loveRipples", "sunHalo", "moonHalo"]);
    if (ringKinds.has(click)) {
      const count = click === "roseWindowGlow" ? 2 : 3;
      for (let index = 0; index < count; index += 1) {
        bursts.push({ x, y, vx: 0, vy: 0, life: 1, radius: 8 + index * 8, angle: 0, delay: index * 3, kind: click, color: index % 2 ? colors.primary : colors.secondary });
      }
      return;
    }

    const count = click === "tricolorConfetti" ? 12 : click === "dawnRays" ? 10 : click === "inkDrops" ? 9 : 6;
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + (Math.random() - 0.5) * 0.18;
      const speed = click === "curtainFold" ? 0.25 : 0.7 + Math.random() * 1.45;
      bursts.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        radius: 5,
        angle,
        kind: click,
        color: click === "tricolorConfetti" ? ["#244a9b", "#f7f7f2", "#c92535"][index % 3] : (index % 2 ? colors.primary : colors.secondary),
      });
    }
    if (bursts.length > maxBursts) bursts.splice(0, bursts.length - maxBursts);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", (event) => {
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (Math.hypot(dx, dy) >= 5 && event.timeStamp - lastTrailAt >= 14) {
      addTrail(pointer.x, pointer.y, dx, dy);
      lastTrailAt = event.timeStamp;
    }
  });
  window.addEventListener("mousedown", () => {
    pointer.down = true;
    addBurst(pointer.x, pointer.y);
  });
  window.addEventListener("mouseup", () => {
    pointer.down = false;
  });

  function tick() {
    time += 1;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    drawParticles(ctx, particles, bursts, colors);
    drawCursorIcon(ctx, pointer, effect.icon || "star", colors, time);
    requestAnimationFrame(tick);
  }

  resize();
  tick();
}

function drawParticles(ctx, particles, bursts, colors) {
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const p = particles[index];
    p.life -= p.kind === "bladeGlint" ? 0.11 : p.kind === "metalSparks" ? 0.075 : 0.032;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.kind === "petals" ? 0.025 : p.kind === "goldDust" || p.kind === "metalSparks" || p.kind === "stoneDust" ? 0.045 : 0.008;
    p.rot += p.kind === "petals" ? 0.055 : 0.025;
    if (p.life <= 0) {
      particles.splice(index, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    if (p.kind === "petals") {
      ctx.scale(1.6, 0.72);
      ctx.beginPath();
      ctx.moveTo(-p.size, 0);
      ctx.quadraticCurveTo(0, -p.size, p.size, 0);
      ctx.quadraticCurveTo(0, p.size * 0.7, -p.size, 0);
      ctx.fill();
    } else if (p.kind === "bladeGlint" || p.kind === "metalSparks") {
      ctx.lineWidth = p.kind === "bladeGlint" ? 1.1 : 1.35;
      ctx.beginPath();
      ctx.moveTo(-p.size * 2.4, 0);
      ctx.lineTo(p.size * 2.4, 0);
      ctx.stroke();
    } else if (p.kind === "goldDust" || p.kind === "spotlight" || p.kind === "smoke") {
      ctx.globalCompositeOperation = "screen";
      const spread = p.kind === "spotlight" ? 4.2 : p.kind === "smoke" ? 3.4 : 2.6;
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * spread);
      gradient.addColorStop(0, p.color);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * spread, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "staffGlow") {
      ctx.globalCompositeOperation = "screen";
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(-2, 2, p.size * 0.7, 0, Math.PI * 2);
      ctx.moveTo(p.size * 0.7 - 2, 2);
      ctx.lineTo(p.size * 0.7 - 2, -p.size * 2.1);
      ctx.stroke();
    } else if (p.kind === "letters") {
      ctx.font = "14px Georgia, serif";
      ctx.fillText(p.text, 0, 0);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  for (let index = bursts.length - 1; index >= 0; index -= 1) {
    const b = bursts[index];
    if (b.delay > 0) {
      b.delay -= 1;
      continue;
    }
    b.life -= b.kind === "letterfall" ? 0.025 : /Glow|Ripples|Halo/.test(b.kind) ? 0.045 : 0.065;
    b.x += b.vx;
    b.y += b.vy;
    b.vy += b.kind === "letterfall" ? 0.018 : b.kind === "tricolorConfetti" || b.kind === "inkDrops" ? 0.05 : 0.006;
    b.radius += /Glow|Ripples|Halo/.test(b.kind) ? 0.75 : 0.35;
    if (b.life <= 0) {
      bursts.splice(index, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = b.life;
    ctx.strokeStyle = b.color;
    ctx.fillStyle = b.color;
    ctx.lineWidth = 1.05;
    if (b.kind === "letterfall") {
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle + Math.sin(b.life * 8) * 0.15);
      ctx.font = "15px Georgia, serif";
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 8;
      ctx.fillText(b.text, 0, 0);
    } else if (["roseWindowGlow", "loveRipples", "sunHalo", "moonHalo"].includes(b.kind)) {
      ctx.globalCompositeOperation = "screen";
      ctx.shadowColor = b.color;
      ctx.shadowBlur = b.kind === "sunHalo" ? 18 : 10;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.stroke();
      if (b.kind === "roseWindowGlow") {
        for (let ray = 0; ray < 12; ray += 1) {
          const angle = (Math.PI * 2 * ray) / 12;
          ctx.beginPath();
          ctx.moveTo(b.x + Math.cos(angle) * b.radius * 0.45, b.y + Math.sin(angle) * b.radius * 0.45);
          ctx.lineTo(b.x + Math.cos(angle) * b.radius, b.y + Math.sin(angle) * b.radius);
          ctx.stroke();
        }
      }
    } else if (b.kind === "tricolorConfetti") {
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle + (1 - b.life) * 2);
      ctx.fillRect(-4, -2, 8, 4);
    } else if (b.kind === "inkDrops") {
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.kind === "dawnRays") {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 13, b.y - b.vy * 13);
      ctx.stroke();
    } else if (b.kind === "crossedBlades") {
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 8, b.y - b.vy * 8);
      ctx.lineTo(b.x + b.vx * 5, b.y + b.vy * 5);
      ctx.stroke();
    } else if (b.kind === "curtainFold") {
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 10 + (1 - b.life) * 24, b.angle, b.angle + Math.PI / 3);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 5, b.y - b.vy * 5);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawCursorIcon(ctx, pointer, icon, colors, time) {
  ctx.save();
  ctx.translate(pointer.x, pointer.y);
  ctx.scale(pointer.down ? 0.88 : 1, pointer.down ? 0.88 : 1);
  ctx.strokeStyle = colors.secondary;
  ctx.fillStyle = colors.primary;
  ctx.lineWidth = 2;
  ctx.shadowColor = colors.primary;
  ctx.shadowBlur = 12;
  ctx.translate(16, 16);
  ctx.rotate(Math.PI);

  if (icon === "key") {
    ctx.rotate(-Math.PI / 4);
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.moveTo(6, 0);
    ctx.lineTo(27, 0);
    ctx.moveTo(20, 0);
    ctx.lineTo(20, 7);
    ctx.moveTo(25, 0);
    ctx.lineTo(25, 5);
    ctx.stroke();
  } else if (icon === "roseWindow") {
    ctx.rotate(time * 0.0015);
    ctx.lineWidth = 1.25;
    for (let index = 0; index < 12; index += 1) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.bezierCurveTo(-4, -7, -5, -13, 0, -17);
      ctx.bezierCurveTo(5, -13, 4, -7, 0, -3);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.moveTo(6, 0);
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.stroke();
  } else if (icon === "flag") {
    ctx.beginPath();
    ctx.moveTo(-12, 16);
    ctx.lineTo(-12, -18);
    ctx.moveTo(-12, -15);
    ctx.bezierCurveTo(-1, -22, 8, -11, 19, -17);
    ctx.lineTo(17, 1);
    ctx.bezierCurveTo(6, 7, -2, -3, -12, 3);
    ctx.stroke();
  } else if (icon === "musicNote") {
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(-5, 11, 7, 5, -0.25, 0, Math.PI * 2);
    ctx.moveTo(2, 11);
    ctx.lineTo(2, -20);
    ctx.bezierCurveTo(12, -16, 16, -11, 16, -3);
    ctx.stroke();
  } else if (icon === "star") {
    drawStar(ctx, 0, 0, 7, 17, 5);
  } else if (icon === "quill") {
    ctx.rotate(-0.7);
    ctx.beginPath();
    ctx.ellipse(0, -8, 7, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(0, 22);
    ctx.stroke();
  } else if (icon === "rose") {
    for (let index = 0; index < 8; index += 1) {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = index % 2 ? colors.primary : colors.secondary;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.bezierCurveTo(7, -7, 15, -5, 16, 0);
      ctx.bezierCurveTo(12, 5, 6, 5, 2, 0);
      ctx.fill();
    }
    ctx.fillStyle = colors.secondary;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (icon === "sun") {
    ctx.lineWidth = 1.2;
    for (let index = 0; index < 16; index += 1) {
      ctx.rotate(Math.PI / 8);
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(0, -18 - (index % 2) * 3);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-3, -1, 1.2, 0, Math.PI * 2);
    ctx.arc(3, -1, 1.2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (icon === "gear") {
    ctx.rotate(time * 0.003);
    ctx.lineWidth = 2;
    for (let index = 0; index < 10; index += 1) {
      ctx.rotate(Math.PI / 5);
      ctx.strokeRect(-2, -21, 4, 7);
    }
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.moveTo(6, 0);
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.stroke();
  } else if (icon === "rapier") {
    ctx.rotate(-Math.PI / 4);
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(-16, 16);
    ctx.lineTo(22, -22);
    ctx.lineTo(27, -27);
    ctx.moveTo(-12, 8);
    ctx.lineTo(-4, 16);
    ctx.moveTo(-14, 12);
    ctx.bezierCurveTo(-22, 5, -18, -3, -7, -5);
    ctx.bezierCurveTo(1, 2, -2, 12, -12, 12);
    ctx.stroke();
  } else if (icon === "mask") {
    ctx.fillStyle = colors.primary;
    ctx.beginPath();
    ctx.moveTo(-17, -12);
    ctx.quadraticCurveTo(-3, -18, 0, -4);
    ctx.quadraticCurveTo(3, -18, 17, -12);
    ctx.quadraticCurveTo(15, 10, 0, 17);
    ctx.quadraticCurveTo(-15, 10, -17, -12);
    ctx.fill();
    ctx.fillStyle = colors.secondary;
    ctx.beginPath();
    ctx.ellipse(-7, -3, 4, 2, -0.2, 0, Math.PI * 2);
    ctx.ellipse(7, -3, 4, 2, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.secondary;
    ctx.beginPath();
    ctx.arc(0, 4, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (icon === "moon") {
    ctx.fillStyle = colors.secondary;
    ctx.beginPath();
    ctx.arc(0, 0, 14, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(6, 0, 14, Math.PI * 1.5, Math.PI * 0.5, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawStar(ctx, x, y, inner, outer, points) {
  ctx.beginPath();
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 ? inner : outer;
    const angle = -Math.PI / 2 + (index * Math.PI) / points;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}
