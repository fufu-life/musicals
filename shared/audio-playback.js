(function initMusicalAudio(globalScope) {
  const MINIMUM_INTERVAL_MS = 800;
  const SEQUENCE_GAP_MS = 500;
  const BUSY_DELAY_MS = 160;
  const AUDIO_CACHE_LIMIT = 96;
  const SPEECH_VOICE_WAIT_MS = 800;
  const audioCache = new Map();
  const preloadRequests = new WeakSet();
  const guardedSyntheses = new WeakSet();
  const SPEECH_LANGUAGE_TAGS = Object.freeze({
    de: "de-DE",
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    it: "it-IT",
    ja: "ja-JP",
    ko: "ko-KR",
    pt: "pt-BR",
    yue: "zh-HK",
    zh: "zh-CN",
  });
  const PREFERRED_SPEECH_VOICES = Object.freeze({
    de: ["Anna", "Petra", "Katja", "Marlene", "Vicki"],
    en: ["Samantha", "Ava", "Allison", "Kathy", "Karen", "Moira", "Tessa", "Microsoft Jenny", "Microsoft Aria"],
    es: ["Mónica", "Monica", "Paulina", "Luciana"],
    fr: ["Audrey", "Amélie", "Amelie", "Marie", "Denise", "Hortense", "Julie", "Céline", "Lea", "Léa"],
    it: ["Alice", "Federica", "Elsa"],
    ja: ["Kyoko", "O-Ren", "Hina"],
    ko: ["Yuna", "Sora", "SunHi", "Heami"],
    pt: ["Luciana", "Joana", "Fernanda"],
    yue: ["Sinji", "Sin-Ji", "善怡"],
    zh: ["Tingting", "Ting-Ting", "Meijia", "Mei-Jia", "婷婷", "美佳"],
  });
  const FEMALE_VOICE_HINT = /female|woman|girl|samantha|audrey|anna|yuna|sinji|tingting|meijia/i;
  const REJECTED_VOICE_HINT = /albert|alex|daniel|fred|ralph|thomas|nicolas|markus|hans|aaron|arthur|jorge|diego|paul|david|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|junior|organ|superstar|trinoids|whisper|wobble|zarvox/i;

  function getSpeechLanguage(language) {
    const value = String(language || "en").trim().replace(/_/gu, "-");
    const lower = value.toLocaleLowerCase("en-US");
    if (lower === "yue" || lower.startsWith("yue-") || lower === "zh-hk") return "zh-HK";
    if (lower.includes("-")) {
      const [base, region] = lower.split("-");
      return region ? `${base}-${region.toLocaleUpperCase("en-US")}` : value;
    }
    return SPEECH_LANGUAGE_TAGS[lower] || value || "en-US";
  }

  function getVoiceProfile(language) {
    const tag = getSpeechLanguage(language).toLocaleLowerCase("en-US");
    if (tag === "zh-hk") return "yue";
    return tag.split("-")[0];
  }

  function selectPreferredVoice(voices, language) {
    const targetLanguage = getSpeechLanguage(language);
    const targetLower = targetLanguage.toLocaleLowerCase("en-US");
    const targetBase = targetLower.split("-")[0];
    const candidates = Array.from(voices || []).filter((voice) => (
      String(voice?.lang || "").replace(/_/gu, "-").toLocaleLowerCase("en-US").split("-")[0] === targetBase
    ));
    const ordered = [
      ...candidates.filter((voice) => String(voice.lang).replace(/_/gu, "-").toLocaleLowerCase("en-US") === targetLower),
      ...candidates.filter((voice) => String(voice.lang).replace(/_/gu, "-").toLocaleLowerCase("en-US") !== targetLower),
    ];
    const preferredNames = PREFERRED_SPEECH_VOICES[getVoiceProfile(targetLanguage)] || [];
    for (const preferredName of preferredNames) {
      const match = ordered.find((voice) => String(voice.name || "").toLocaleLowerCase("en-US").includes(
        preferredName.toLocaleLowerCase("en-US"),
      ));
      if (match) return match;
    }
    return (
      ordered.find((voice) => FEMALE_VOICE_HINT.test(String(voice.name || ""))) ||
      ordered.find((voice) => voice.localService && !REJECTED_VOICE_HINT.test(String(voice.name || ""))) ||
      ordered.find((voice) => !REJECTED_VOICE_HINT.test(String(voice.name || ""))) ||
      null
    );
  }

  function installPreferredSpeechVoice(synthesis, options = {}) {
    if (
      !synthesis ||
      typeof synthesis.speak !== "function" ||
      typeof synthesis.getVoices !== "function" ||
      guardedSyntheses.has(synthesis)
    ) {
      return false;
    }

    const waitMs = options.waitMs ?? SPEECH_VOICE_WAIT_MS;
    const schedule = options.schedule || ((callback, ms) => globalScope.setTimeout(callback, ms));
    const cancelSchedule = options.cancelSchedule || ((timer) => globalScope.clearTimeout(timer));
    const nativeSpeak = synthesis.speak.bind(synthesis);
    const nativeCancel = typeof synthesis.cancel === "function" ? synthesis.cancel.bind(synthesis) : null;
    const pending = new Set();

    function availableVoices() {
      try {
        return synthesis.getVoices() || [];
      } catch {
        return [];
      }
    }

    function applyVoice(utterance) {
      const language = getSpeechLanguage(utterance?.lang);
      const voice = selectPreferredVoice(availableVoices(), language);
      if (utterance) utterance.lang = language;
      if (utterance && voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || language;
      }
      return voice;
    }

    function clearPending(item) {
      if (!pending.has(item)) return;
      pending.delete(item);
      if (item.timer !== null) cancelSchedule(item.timer);
      synthesis.removeEventListener?.("voiceschanged", item.onVoicesChanged);
    }

    synthesis.speak = (utterance) => {
      const voice = applyVoice(utterance);
      const voicesLoaded = availableVoices().length > 0;
      if (voice || voicesLoaded || waitMs <= 0) {
        nativeSpeak(utterance);
        return;
      }

      const item = { timer: null, onVoicesChanged: null };
      const finish = () => {
        clearPending(item);
        applyVoice(utterance);
        nativeSpeak(utterance);
      };
      item.onVoicesChanged = () => {
        if (availableVoices().length) finish();
      };
      pending.add(item);
      synthesis.addEventListener?.("voiceschanged", item.onVoicesChanged);
      item.timer = schedule(finish, waitMs);
    };

    if (nativeCancel) {
      synthesis.cancel = () => {
        [...pending].forEach(clearPending);
        return nativeCancel();
      };
    }

    guardedSyntheses.add(synthesis);
    availableVoices();
    return true;
  }

  function trimAudioCache() {
    for (const [key, audio] of audioCache) {
      if (audioCache.size <= AUDIO_CACHE_LIMIT) break;
      if (!audio.paused && !audio.ended) continue;
      audioCache.delete(key);
    }
  }

  function getCachedAudio(src) {
    if (!src) return null;
    const key = String(src);
    let audio = audioCache.get(key);
    if (audio?.error) {
      audioCache.delete(key);
      audio = null;
    }
    if (!audio) {
      if (typeof globalScope.Audio !== "function") return null;
      audio = new globalScope.Audio(key);
      audio.preload = "auto";
    } else {
      audioCache.delete(key);
    }
    audioCache.set(key, audio);
    trimAudioCache();
    return audio;
  }

  function preloadLocalAudio(src) {
    const audio = getCachedAudio(src);
    if (audio?.readyState === 0 && !preloadRequests.has(audio)) {
      preloadRequests.add(audio);
      audio.load?.();
    }
    return audio;
  }

  function clearAudioCache() {
    audioCache.forEach((audio) => audio.pause?.());
    audioCache.clear();
  }

  function setButtonBusy(button, busy) {
    if (!button) return;
    button.classList.toggle("is-audio-loading", busy);
    if (busy) {
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-busy");
    }
  }

  function setSequenceButton(button, active) {
    if (!button) return;
    button.classList.toggle("is-playing", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "停止连续播放本曲" : "连续播放本曲");
    button.title = active ? "停止连续播放本曲" : "连续播放本曲";
  }

  function createController(options = {}) {
    const minimumIntervalMs = options.minimumIntervalMs ?? MINIMUM_INTERVAL_MS;
    const now = options.now || (() => globalScope.performance.now());
    const delay = options.delay || ((ms) => new Promise((resolve) => globalScope.setTimeout(resolve, ms)));
    const busyDelayMs = options.busyDelayMs ?? BUSY_DELAY_MS;
    const schedule = options.schedule || ((callback, ms) => globalScope.setTimeout(callback, ms));
    const cancelSchedule = options.cancelSchedule || ((timer) => globalScope.clearTimeout(timer));
    const stopCurrent = options.stopCurrent || (() => {});
    const pauseCurrent = options.pauseCurrent || (() => {});
    const resumeCurrent = options.resumeCurrent || (() => {});
    let lastAcceptedAt = Number.NEGATIVE_INFINITY;
    let userRequestPending = false;
    let sequenceActive = false;
    let sequencePaused = false;
    let sequenceToken = 0;
    let sequenceButton = null;
    let resumeSequenceWaiters = [];

    function releasePausedSequence() {
      const waiters = resumeSequenceWaiters;
      resumeSequenceWaiters = [];
      waiters.forEach((resolve) => resolve());
    }

    function waitUntilSequenceResumes(token) {
      if (!sequencePaused || !sequenceActive || token !== sequenceToken) return Promise.resolve();
      return new Promise((resolve) => resumeSequenceWaiters.push(resolve));
    }

    function setSequencePaused(paused) {
      if (!sequenceActive || sequencePaused === paused) return false;
      sequencePaused = paused;
      if (paused) pauseCurrent();
      else {
        resumeCurrent();
        releasePausedSequence();
      }
      options.onSequencePauseChange?.(paused);
      return true;
    }

    function stopSequence() {
      if (!sequenceActive) return false;
      sequenceActive = false;
      sequencePaused = false;
      sequenceToken += 1;
      releasePausedSequence();
      stopCurrent();
      setSequenceButton(sequenceButton, false);
      sequenceButton = null;
      options.onSequenceStateChange?.(false);
      options.onSequencePauseChange?.(false);
      options.onItemClear?.();
      return true;
    }

    function stopAll() {
      if (!stopSequence()) {
        sequenceToken += 1;
        stopCurrent();
        options.onItemClear?.();
      }
    }

    async function runUserAction(button, action) {
      const acceptedAt = now();
      if (userRequestPending || acceptedAt - lastAcceptedAt < minimumIntervalMs) {
        return false;
      }

      lastAcceptedAt = acceptedAt;
      stopSequence();
      userRequestPending = true;
      let busyTimer = null;
      if (busyDelayMs <= 0) {
        setButtonBusy(button, true);
      } else {
        busyTimer = schedule(() => {
          busyTimer = null;
          if (userRequestPending) setButtonBusy(button, true);
        }, busyDelayMs);
      }
      try {
        await action();
        return true;
      } finally {
        if (busyTimer !== null) cancelSchedule(busyTimer);
        userRequestPending = false;
        setButtonBusy(button, false);
      }
    }

    function toggleSequence({
      button,
      items,
      playItem,
      onItemStart,
      onItemEnd,
      onItemError,
      onComplete,
      gapMs = SEQUENCE_GAP_MS,
    }) {
      if (sequenceActive) {
        stopSequence();
        return Promise.resolve(false);
      }

      const acceptedAt = now();
      if (userRequestPending || acceptedAt - lastAcceptedAt < minimumIntervalMs) {
        return Promise.resolve(false);
      }

      lastAcceptedAt = acceptedAt;
      stopCurrent();
      sequenceActive = true;
      sequencePaused = false;
      sequenceButton = button || null;
      const token = ++sequenceToken;
      setSequenceButton(sequenceButton, true);
      options.onSequenceStateChange?.(true);

      return (async () => {
        for (let index = 0; index < items.length; index += 1) {
          if (!sequenceActive || token !== sequenceToken) break;
          await waitUntilSequenceResumes(token);
          if (!sequenceActive || token !== sequenceToken) break;
          const item = items[index];
          onItemStart?.(item, index, items[index + 1] || null);
          try {
            await playItem(item, index);
          } catch (error) {
            onItemError?.(error, item, index);
          }
          onItemEnd?.(item, index);
          const hasNextItem = index < items.length - 1;
          if (hasNextItem && gapMs > 0 && sequenceActive && token === sequenceToken) {
            await delay(gapMs);
            await waitUntilSequenceResumes(token);
          }
        }

        if (sequenceActive && token === sequenceToken) {
          sequenceActive = false;
          sequencePaused = false;
          setSequenceButton(sequenceButton, false);
          sequenceButton = null;
          options.onSequenceStateChange?.(false);
          options.onSequencePauseChange?.(false);
          options.onItemClear?.();
          onComplete?.();
        }
        return true;
      })();
    }

    return {
      runUserAction,
      toggleSequence,
      pauseSequence: () => setSequencePaused(true),
      resumeSequence: () => setSequencePaused(false),
      stopSequence,
      stopAll,
      isSequenceActive: () => sequenceActive,
      isSequencePaused: () => sequencePaused,
      isUserRequestPending: () => userRequestPending,
    };
  }

  const api = {
    MINIMUM_INTERVAL_MS,
    SEQUENCE_GAP_MS,
    BUSY_DELAY_MS,
    AUDIO_CACHE_LIMIT,
    SPEECH_VOICE_WAIT_MS,
    createController,
    getCachedAudio,
    preloadLocalAudio,
    clearAudioCache,
    getSpeechLanguage,
    selectPreferredVoice,
    installPreferredSpeechVoice,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.MusicalAudio = api;
  if (globalScope.speechSynthesis) installPreferredSpeechVoice(globalScope.speechSynthesis);
})(typeof window !== "undefined" ? window : globalThis);
