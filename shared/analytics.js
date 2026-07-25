(function initMusicalAnalytics(globalScope) {
  const MEASUREMENT_ID = "G-E49LJ5T1V6";
  const STAY_SECONDS = 30;
  const READ_THRESHOLDS = [25, 50, 75, 100];
  const FEATURE_NAMES = new Set([
    "translation_toggle",
    "english_toggle",
    "ipa_toggle",
    "analysis_toggle",
    "playlist_start",
    "playlist_complete",
  ]);
  const EVENT_FIELDS = {
    show_view: ["show_id", "show_name", "page_type"],
    song_view: ["show_id", "show_name", "song_id", "song_title", "song_order"],
    song_stay: ["show_id", "song_id", "stay_seconds"],
    song_read_progress: ["show_id", "song_id", "scroll_percent"],
    audio_click: ["show_id", "song_id", "audio_type", "line_id"],
    audio_start: ["show_id", "song_id", "audio_type", "line_id"],
    audio_complete: ["show_id", "song_id", "audio_type", "line_id"],
    feature_use: ["show_id", "feature_name"],
  };
  let analyticsScriptRequested = false;
  let configured = false;
  let currentTracker = null;

  function cleanText(value, maxLength = 120) {
    return String(value ?? "").trim().slice(0, maxLength);
  }

  function normalizeShowId(value) {
    return cleanText(value, 80)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function getViewportType(scope = globalScope) {
    const width = Number(scope.innerWidth) || 1280;
    if (width <= 767) return "mobile";
    if (width <= 1024) return "tablet";
    return "desktop";
  }

  function ensureGtagQueue(scope = globalScope) {
    scope.dataLayer = scope.dataLayer || [];
    if (typeof scope.gtag !== "function") {
      scope.gtag = function gtag() {
        scope.dataLayer.push(arguments);
      };
    }
    return scope.gtag;
  }

  function loadGoogleAnalytics(scope = globalScope) {
    const gtag = ensureGtagQueue(scope);
    if (!configured) {
      configured = true;
      gtag("js", new Date());
      gtag("config", MEASUREMENT_ID);
    }
    if (analyticsScriptRequested || !scope.document?.createElement) return;

    const requestScript = () => {
      if (analyticsScriptRequested) return;
      analyticsScriptRequested = true;
      const script = scope.document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
      script.dataset.musicalAnalytics = "true";
      scope.document.head?.append(script);
    };

    if (scope.document.readyState === "complete") {
      scope.setTimeout(requestScript, 0);
    } else {
      scope.addEventListener?.("load", requestScript, { once: true });
    }
  }

  function filterPayload(eventName, params, scope = globalScope) {
    const allowedFields = EVENT_FIELDS[eventName];
    if (!allowedFields) return null;
    const payload = {};
    allowedFields.forEach((field) => {
      const value = params[field];
      if (typeof value === "number" && Number.isFinite(value)) {
        payload[field] = value;
      } else if (typeof value === "string") {
        payload[field] = cleanText(value);
      }
    });
    payload.viewport_type = getViewportType(scope);
    return payload;
  }

  function emit(eventName, params, scope = globalScope) {
    const payload = filterPayload(eventName, params, scope);
    if (!payload) return false;
    try {
      ensureGtagQueue(scope)("event", eventName, payload);
      return true;
    } catch {
      return false;
    }
  }

  function normalizeSong(song) {
    if (!song) return null;
    const id = cleanText(song.id, 120);
    if (!id) return null;
    return {
      id,
      title: cleanText(song.title || song.name || "unknown"),
      order: Number(song.displayOrder || song.order) || 0,
    };
  }

  function createTracker(options = {}, scope = globalScope) {
    const showId = normalizeShowId(options.showId || options.show_id);
    const showName = cleanText(options.showName || options.show_name || showId);
    const pageType = cleanText(options.pageType || options.page_type || "lyrics_learning", 60);
    const getProgressElement = typeof options.getProgressElement === "function"
      ? options.getProgressElement
      : () => options.progressElement || null;
    const state = {
      activeSong: null,
      showViewSent: false,
      viewedSongs: new Set(),
      stayedSongs: new Set(),
      progressBySong: new Map(),
      stayTimer: 0,
      progressFrame: 0,
      audioSequence: 0,
      libraryEntries: new Set(),
      destroyed: false,
    };

    function baseSongParams(song = state.activeSong) {
      return {
        show_id: showId,
        show_name: showName,
        song_id: song?.id || "",
        song_title: song?.title || "",
        song_order: song?.order || 0,
      };
    }

    function trackShowView(overridePageType = pageType) {
      if (state.showViewSent || !showId) return false;
      state.showViewSent = true;
      return emit("show_view", {
        show_id: showId,
        show_name: showName,
        page_type: cleanText(overridePageType, 60),
      }, scope);
    }

    function clearStayTimer() {
      if (!state.stayTimer) return;
      scope.clearTimeout(state.stayTimer);
      state.stayTimer = 0;
    }

    function startStayTimer() {
      clearStayTimer();
      const song = state.activeSong;
      if (!song || state.stayedSongs.has(song.id) || scope.document?.visibilityState === "hidden") return;
      state.stayTimer = scope.setTimeout(() => {
        state.stayTimer = 0;
        if (
          state.destroyed ||
          scope.document?.visibilityState === "hidden" ||
          state.activeSong?.id !== song.id ||
          state.stayedSongs.has(song.id)
        ) return;
        state.stayedSongs.add(song.id);
        emit("song_stay", {
          show_id: showId,
          song_id: song.id,
          stay_seconds: STAY_SECONDS,
        }, scope);
      }, STAY_SECONDS * 1000);
    }

    function calculateReadProgress() {
      const song = state.activeSong;
      const element = getProgressElement();
      if (!song || !element || scope.document?.visibilityState === "hidden") return;
      const rect = element.getBoundingClientRect?.();
      if (!rect) return;
      const height = Math.max(Number(element.scrollHeight) || 0, Number(rect.height) || 0);
      if (!height) return;
      const top = Number(rect.top) + (Number(scope.scrollY) || 0);
      const viewportBottom = (Number(scope.scrollY) || 0) + (Number(scope.innerHeight) || 0);
      const percent = Math.max(0, Math.min(100, ((viewportBottom - top) / height) * 100));
      const sent = state.progressBySong.get(song.id) || new Set();
      READ_THRESHOLDS.forEach((threshold) => {
        if (percent < threshold || sent.has(threshold)) return;
        sent.add(threshold);
        emit("song_read_progress", {
          show_id: showId,
          song_id: song.id,
          scroll_percent: threshold,
        }, scope);
      });
      state.progressBySong.set(song.id, sent);
    }

    function scheduleReadProgress() {
      if (state.progressFrame || state.destroyed) return;
      const requestFrame = scope.requestAnimationFrame || ((callback) => scope.setTimeout(callback, 16));
      state.progressFrame = 1;
      requestFrame(() => {
        state.progressFrame = 0;
        calculateReadProgress();
      });
    }

    function songRendered(song) {
      const normalized = normalizeSong(song);
      if (!normalized) return false;
      const changed = state.activeSong?.id !== normalized.id;
      state.activeSong = normalized;
      if (changed) {
        clearStayTimer();
        if (!state.viewedSongs.has(normalized.id)) {
          state.viewedSongs.add(normalized.id);
          emit("song_view", baseSongParams(normalized), scope);
        }
        startStayTimer();
      }
      scheduleReadProgress();
      return changed;
    }

    function createAudioSession(meta = {}) {
      const song = state.activeSong;
      return {
        id: ++state.audioSequence,
        showId,
        songId: cleanText(meta.songId || song?.id || "", 120),
        audioType: cleanText(meta.audioType || "line", 40),
        lineId: cleanText(meta.lineId || "", 120),
        clicked: false,
        started: false,
        completed: false,
      };
    }

    function audioParams(session) {
      return {
        show_id: session.showId,
        song_id: session.songId,
        audio_type: session.audioType,
        line_id: session.lineId,
      };
    }

    function audioClick(meta = {}) {
      const session = meta.id ? meta : createAudioSession(meta);
      if (session.clicked) return session;
      session.clicked = true;
      emit("audio_click", audioParams(session), scope);
      return session;
    }

    function audioStart(sessionOrMeta = {}) {
      const session = sessionOrMeta.id ? sessionOrMeta : createAudioSession(sessionOrMeta);
      if (session.started) return session;
      session.started = true;
      emit("audio_start", audioParams(session), scope);
      return session;
    }

    function audioComplete(session) {
      if (!session?.started || session.completed) return false;
      session.completed = true;
      emit("audio_complete", audioParams(session), scope);
      return true;
    }

    function featureUse(featureName) {
      if (!FEATURE_NAMES.has(featureName)) return false;
      return emit("feature_use", {
        show_id: showId,
        feature_name: featureName,
      }, scope);
    }

    function trackLibraryEntry(show = {}) {
      const targetId = normalizeShowId(show.showId || show.id);
      if (!targetId || state.libraryEntries.has(targetId)) return false;
      state.libraryEntries.add(targetId);
      return emit("show_view", {
        show_id: targetId,
        show_name: cleanText(show.showName || show.originalTitle || show.title || targetId),
        page_type: "library_click",
      }, scope);
    }

    function handleVisibilityChange() {
      clearStayTimer();
      if (scope.document?.visibilityState !== "hidden") {
        startStayTimer();
        scheduleReadProgress();
      }
    }

    function destroy() {
      state.destroyed = true;
      clearStayTimer();
      scope.removeEventListener?.("scroll", scheduleReadProgress);
      scope.removeEventListener?.("resize", scheduleReadProgress);
      scope.document?.removeEventListener?.("visibilitychange", handleVisibilityChange);
    }

    scope.addEventListener?.("scroll", scheduleReadProgress, { passive: true });
    scope.addEventListener?.("resize", scheduleReadProgress, { passive: true });
    scope.document?.addEventListener?.("visibilitychange", handleVisibilityChange);
    if (options.trackShowView !== false) trackShowView();

    return {
      trackShowView,
      trackLibraryEntry,
      songRendered,
      scheduleReadProgress,
      createAudioSession,
      audioClick,
      audioStart,
      audioComplete,
      featureUse,
      destroy,
      getViewportType: () => getViewportType(scope),
    };
  }

  function initShow(options = {}) {
    loadGoogleAnalytics(globalScope);
    currentTracker?.destroy();
    currentTracker = createTracker(options, globalScope);
    return currentTracker;
  }

  function initLibrary() {
    loadGoogleAnalytics(globalScope);
    currentTracker?.destroy();
    currentTracker = createTracker({
      showId: "musical_library",
      showName: "音乐剧歌词展示架",
      pageType: "library",
      trackShowView: false,
    }, globalScope);
    return currentTracker;
  }

  const api = {
    MEASUREMENT_ID,
    STAY_SECONDS,
    READ_THRESHOLDS,
    FEATURE_NAMES,
    getViewportType,
    filterPayload,
    createTracker,
    initShow,
    initLibrary,
    loadGoogleAnalytics,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.MusicalAnalytics = api;
})(typeof window !== "undefined" ? window : globalThis);
