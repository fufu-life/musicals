(function initMusicalLyricsPageTools(globalScope) {
  function createIconButton(className, label, path) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
    return button;
  }

  function appendHighlightedText(container, value, query) {
    const text = String(value || "");
    const ranges = globalScope.MusicalLyricsSearch.getHighlightRanges(text, query);
    let cursor = 0;
    ranges.forEach((range) => {
      if (range.start > cursor) container.append(document.createTextNode(text.slice(cursor, range.start)));
      const mark = document.createElement("mark");
      mark.textContent = text.slice(range.start, range.end);
      container.append(mark);
      cursor = range.end;
    });
    if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
  }

  function create(options = {}) {
    const songs = options.songs || [];
    const hero = options.hero;
    const homeButton = options.homeButton;
    const titleRow = options.titleRow;
    const rateContainer = options.rateContainer || titleRow;
    const lyrics = options.lyrics;
    const mobilePicker = options.mobilePicker;
    const actionContainer = options.actionContainer;
    const mobileActionContainer = options.mobileActionContainer;
    if (!hero || !titleRow || !lyrics) throw new Error("Lyrics page tools require hero, title row, and lyrics elements");

    const heroActions = document.createElement("div");
    heroActions.className = "lyrics-tools-hero-actions";
    if (homeButton) {
      homeButton.before(heroActions);
      heroActions.append(homeButton);
    } else {
      hero.append(heroActions);
    }

    const searchForm = document.createElement("form");
    searchForm.className = "lyrics-tools-search";
    searchForm.setAttribute("role", "search");
    searchForm.noValidate = true;
    const searchToggle = createIconButton("lyrics-tools-search-toggle", "搜索歌词", '<circle cx="10.8" cy="10.8" r="5.8"/><path d="m15.2 15.2 4.2 4.2"/>');
    searchToggle.type = "submit";
    searchToggle.setAttribute("aria-expanded", "false");
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "搜索歌名或歌词";
    searchInput.setAttribute("aria-label", "搜索歌名或歌词");
    searchInput.disabled = true;
    const searchClose = createIconButton("lyrics-tools-search-close", "关闭歌词搜索", '<path d="m7 7 10 10M17 7 7 17"/>');
    searchForm.append(searchToggle, searchInput, searchClose);
    heroActions.prepend(searchForm);

    if (actionContainer || mobileActionContainer) {
      const mobileActionsQuery = window.matchMedia(options.mobileActionsQuery || "(max-width: 860px)");
      const placeHeroActions = () => {
        if (mobileActionsQuery.matches && mobileActionContainer) {
          mobileActionContainer.append(heroActions);
        } else if (actionContainer) {
          actionContainer.prepend(heroActions);
        }
      };
      placeHeroActions();
      mobileActionsQuery.addEventListener("change", placeHeroActions);
    }

    const results = document.createElement("section");
    results.className = "lyrics-tools-results";
    results.hidden = true;
    const resultsHeader = document.createElement("header");
    resultsHeader.className = "lyrics-tools-results-header";
    const resultsTitle = document.createElement("h2");
    resultsTitle.textContent = "搜索结果";
    const resultsSummary = document.createElement("p");
    resultsSummary.className = "lyrics-tools-results-summary";
    resultsSummary.setAttribute("role", "status");
    const resultsList = document.createElement("div");
    resultsList.className = "lyrics-tools-results-list";
    resultsHeader.append(resultsTitle, resultsSummary);
    results.append(resultsHeader, resultsList);
    lyrics.before(results);

    const rateButton = document.createElement("button");
    rateButton.type = "button";
    rateButton.className = "lyrics-tools-rate";
    rateButton.textContent = "1.0x";
    rateContainer.append(rateButton);

    const dock = document.createElement("aside");
    dock.className = "lyrics-tools-dock";
    dock.setAttribute("aria-label", "全曲播放控制");
    dock.hidden = true;
    const dockCopy = document.createElement("div");
    dockCopy.className = "lyrics-tools-dock-copy";
    const dockSong = document.createElement("span");
    dockSong.className = "lyrics-tools-dock-song";
    const dockProgress = document.createElement("strong");
    dockProgress.className = "lyrics-tools-dock-progress";
    dockProgress.setAttribute("aria-live", "polite");
    dockCopy.append(dockSong, dockProgress);
    const dockControls = document.createElement("div");
    dockControls.className = "lyrics-tools-dock-controls";
    const dockRate = document.createElement("button");
    dockRate.type = "button";
    dockRate.className = "lyrics-tools-dock-rate";
    const dockPause = createIconButton("lyrics-tools-dock-pause", "暂停全曲播放", '<path class="pause-mark" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/><path class="play-mark" d="M8 5.5v13l10-6.5z"/>');
    const dockStop = createIconButton("lyrics-tools-dock-stop", "停止全曲播放", '<rect x="6" y="6" width="12" height="12" rx="1.5"/>');
    dockControls.append(dockRate, dockPause, dockStop);
    dock.append(dockCopy, dockControls);
    document.body.append(dock);

    let controller = null;
    let searchOpen = false;
    let searchActive = false;
    const hideWhileSearching = (options.hideWhileSearching || []).filter(Boolean);
    const hiddenStates = new Map();
    let searchIndex = null;

    function getSearchIndex() {
      if (searchIndex) return searchIndex;
      searchIndex = globalScope.MusicalLyricsSearch.buildIndex(songs, {
        getSongOrder: (song) => Number(song.displayOrder || song.order) || 0,
        getSongTitleSecondary: options.getSongTitleSecondary || ((song) => song.titleZh || song.zhTitle || ""),
        getLinePrimary: options.getLinePrimary || ((line) => line.original || line.fr || line.en || line.text || ""),
        getLineSecondary: options.getLineSecondary || ((line) => [line.en, line.zh, line.simplified].filter(Boolean).join(" · ")),
      });
      return searchIndex;
    }

    const rateControl = globalScope.MusicalPlaybackRate.createControl({
      button: rateButton,
      storageKey: options.rateStorageKey,
      onChange(rate) {
        syncRate(rate);
        options.onRateChange?.(rate);
      },
    });

    function syncRate(rate) {
      const label = globalScope.MusicalPlaybackRate.formatRate(rate);
      dockRate.textContent = label;
      dockRate.setAttribute("aria-label", `选择播放速度，当前 ${label}`);
      dockRate.title = `播放速度：${label}`;
    }
    syncRate(rateControl.getRate());

    function setSearchOpen(open, focus = true) {
      searchOpen = open;
      searchForm.classList.toggle("is-open", open);
      searchToggle.setAttribute("aria-expanded", String(open));
      searchInput.disabled = !open;
      if (open && focus) requestAnimationFrame(() => searchInput.focus());
    }

    function closeSearch() {
      setSearchOpen(false, false);
      searchInput.value = "";
      searchActive = false;
      results.hidden = true;
      lyrics.hidden = false;
      if (mobilePicker) mobilePicker.hidden = false;
      hideWhileSearching.forEach((element) => {
        element.hidden = hiddenStates.get(element) ?? false;
      });
      hiddenStates.clear();
    }

    function renderSearch(queryValue) {
      const outcome = globalScope.MusicalLyricsSearch.searchIndex(getSearchIndex(), queryValue, { limit: 100 });
      const query = String(queryValue || "").trim();
      searchActive = true;
      results.hidden = false;
      lyrics.hidden = true;
      if (mobilePicker) mobilePicker.hidden = true;
      hideWhileSearching.forEach((element) => {
        if (!hiddenStates.has(element)) hiddenStates.set(element, element.hidden);
        element.hidden = true;
      });
      resultsList.replaceChildren();
      if (outcome.mode === "empty") {
        resultsSummary.textContent = "请输入歌词或歌名。";
        return;
      }
      if (!outcome.results.length) {
        resultsSummary.textContent = `没有找到与“${query}”匹配的歌曲或歌词。`;
        return;
      }
      const modeNote = outcome.mode === "fuzzy" ? "；已显示相近拼写" : "";
      const limitNote = outcome.truncated ? "；仅显示前 100 处" : "";
      resultsSummary.textContent = `找到 ${outcome.songCount} 首歌曲，共 ${outcome.total} 处匹配${modeNote}${limitNote}。`;
      const groups = new Map();
      outcome.results.forEach((record) => {
        if (!groups.has(record.songId)) groups.set(record.songId, { record, title: false, lines: [] });
        const group = groups.get(record.songId);
        if (record.type === "title") group.title = true;
        else group.lines.push(record);
      });
      groups.forEach((group) => {
        const section = document.createElement("section");
        section.className = "lyrics-tools-result-group";
        const heading = document.createElement("button");
        heading.type = "button";
        heading.className = "lyrics-tools-result-heading";
        const order = document.createElement("span");
        order.textContent = String(group.record.songOrder).padStart(2, "0");
        const title = document.createElement("strong");
        appendHighlightedText(title, group.record.songTitle, query);
        heading.append(order, title);
        heading.addEventListener("click", () => navigate(group.record.songId, ""));
        section.append(heading);
        group.lines.forEach((record) => {
          const line = document.createElement("button");
          line.type = "button";
          line.className = "lyrics-tools-result-line";
          const primary = document.createElement("span");
          appendHighlightedText(primary, record.primary, query);
          line.append(primary);
          if (record.secondary) {
            const secondary = document.createElement("small");
            appendHighlightedText(secondary, record.secondary, query);
            line.append(secondary);
          }
          line.addEventListener("click", () => navigate(record.songId, record.lineId));
          section.append(line);
        });
        resultsList.append(section);
      });
    }

    function navigate(songId, lineId) {
      closeSearch();
      options.onNavigate?.(songId, lineId);
    }

    searchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!searchOpen) setSearchOpen(true);
      else {
        await options.ensureSearchReady?.();
        searchIndex = null;
        renderSearch(searchInput.value);
      }
    });
    searchClose.addEventListener("click", closeSearch);
    dockRate.addEventListener("click", () => rateControl.toggleMenu(dockRate));
    dockPause.addEventListener("click", () => {
      if (controller?.isSequencePaused()) controller.resumeSequence();
      else controller?.pauseSequence();
    });
    dockStop.addEventListener("click", () => controller?.stopSequence());

    function setSequenceActive(active) {
      dock.hidden = !active;
      document.body.classList.toggle("has-lyrics-tools-dock", active);
      if (active) {
        dockSong.textContent = options.getCurrentSong?.()?.title || "";
        dockProgress.textContent = "准备播放";
        setSequencePaused(false);
      }
    }

    function setSequencePaused(paused) {
      dockPause.classList.toggle("is-paused", paused);
      dockPause.setAttribute("aria-label", paused ? "继续全曲播放" : "暂停全曲播放");
      dockPause.title = paused ? "继续全曲播放" : "暂停全曲播放";
      const saved = dockProgress.dataset.baseLabel;
      if (paused && !saved) {
        dockProgress.dataset.baseLabel = dockProgress.textContent;
        dockProgress.textContent = `${dockProgress.textContent} · 已暂停`;
      } else if (!paused && saved) {
        dockProgress.textContent = saved;
        delete dockProgress.dataset.baseLabel;
      }
    }

    return {
      connectController(nextController) { controller = nextController; },
      getRate: () => rateControl.getRate(),
      isSearchActive: () => searchActive,
      setProgress(index, total) { dockProgress.textContent = `第 ${index + 1} / ${total} 句`; },
      setSequenceActive,
      setSequencePaused,
    };
  }

  const api = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.MusicalLyricsPageTools = api;
})(typeof window !== "undefined" ? window : globalThis);
