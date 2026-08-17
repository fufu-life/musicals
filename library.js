(function () {
  const groupsRoot = document.querySelector("#languageGroups");
  const languageNav = document.querySelector("#languageNav");
  const countNode = document.querySelector("#showCount");
  const backToTop = document.querySelector("#libraryBackToTop");
  const copyrightNoticeButton = document.querySelector("#copyrightNoticeButton");
  const copyrightNotice = document.querySelector("#copyrightNotice");
  const versionHistory = [
    {
      date: "2026-06-21",
      title: "《大状王》歌词上线",
      summary: "首个公开剧目歌词页面上线，提供粤语歌词、中文翻译、粤拼提示和唱段朗读。",
    },
    {
      date: "2026-06-27",
      title: "《摇滚红与黑》歌词上线",
      summary: "上线法语歌词、中文翻译、逐行音标、单词学习提示和唱段播放。",
    },
    {
      date: "2026-07-07",
      title: "《汉密尔顿》歌词上线",
      summary: "上线英语歌词、翻译、发音/词卡和唱段播放页面。",
    },
    {
      date: "2026-07-17",
      title: "提供逐句朗读、整曲播放与歌词同步",
      summary: "新增逐句朗读、整曲顺序播放、暂停/停止、当前歌词跟随播放，以及更快的网页音频加载体验。",
    },
    {
      date: "2026-07-22",
      title: "全站学习工具上线：歌词搜索、倍速与悬浮播放条",
      summary: "新增歌词和中文翻译搜索、命中定位、1.0× 至 3.0× 倍速，以及可暂停、继续、停止的悬浮播放条。",
    },
    {
      date: "2026-07-25",
      title: "《莫里哀》《摇滚莫扎特》《罗密欧与朱丽叶》歌词上线",
      summary: "三部法语剧目歌词页面上线，分别提供歌词、翻译、发音提示和唱段播放。",
    },
    {
      date: "2026-07-28",
      title: "唱段人标签与歌词分层上线",
      summary: "唱段人以独立标签显示，歌词正文、音标、词卡、搜索和朗读内容不再重复混入角色名。",
    },
    {
      date: "2026-08-02",
      title: "《剧院魅影》《真爱不死》歌词上线",
      summary: "两部英语剧目歌词页面上线，提供各自的歌词、翻译、发音提示和唱段播放。",
    },
    {
      date: "2026-08-09",
      title: "《伊丽莎白》《蝴蝶梦》《莫扎特！》歌词上线",
      summary: "三部德语剧目歌词页面上线，提供对应的歌词、翻译、发音提示和唱段播放。",
    },
    {
      date: "2026-08-17",
      title: "浅色模式与显示原生鼠标功能上线",
      summary: "新增浅色模式，并支持在剧目专属鼠标与系统原生鼠标之间切换。",
    },
  ];
  const analytics = window.MusicalAnalytics?.initLibrary?.() || {
    trackLibraryEntry() {},
  };
  const prefetchedPages = new Set();
  const pinyinInitials = {
    dazhuangwang: "D", hamilton: "H", "les-miserables": "B", "moulin-rouge": "H",
    chicago: "Z", "dear-evan-hansen": "Q", "six-the-musical": "L", suffs: "N",
    "sunset-boulevard": "R", "phantom-of-the-opera": "J", "love-never-dies": "Z",
    "elisabeth-das-musical": "Y", "mozart-das-musical": "M", "rouge-et-noir": "Y",
    "tanz-der-vampire": "X", "ludwig-ii-sehnsucht-nach-dem-paradies": "L",
    "dracula-das-musical": "D", "rebecca-das-musical": "H", "the-greatest-showman": "M", "epic-the-musical": "E",
    starmania: "X", "les-souliers-rouges": "H", "la-legende-du-roi-arthur": "Y",
    "notre-dame-de-paris": "B", "mozart-opera-rock": "Y", "romeo-et-juliette": "L",
    "le-roi-soleil": "T", "1789-les-amants-de-la-bastille": "#", "don-juan": "T",
    "moliere-le-spectacle-musical": "M", "cyrano-de-bergerac": "D",
    "les-miserables-1980": "B", "les-miserables-cityprod-2017": "B",
    "jesus-christ-superstar-1996-london": "Y", "le-petit-prince-2cd": "X",
    "come-from-away": "Y", rent: "J", "tick-tick-boom": "D", wicked: "M", hadestown: "M",
    "les-dix-commandements": "S",
  };
  const pinyinCollator = new Intl.Collator("zh-Hans-CN-u-co-pinyin", { sensitivity: "base" });

  function appendCoverTitle(cover, show, eager = false) {
    if (show.image) {
      const image = document.createElement("img");
      image.className = "show-logo";
      image.src = show.image;
      image.alt = "";
      image.loading = eager ? "eager" : "lazy";
      image.decoding = "async";
      if (eager) image.fetchPriority = "high";
      cover.append(image);
      return;
    }

    const title = document.createElement("div");
    title.className = "cover-title";
    const strong = document.createElement("strong");
    show.coverLines.forEach((line, index) => {
      if (index > 0) strong.append(document.createElement("br"));
      strong.append(document.createTextNode(line));
    });
    const originalTitle = document.createElement("span");
    originalTitle.textContent = show.originalTitle;
    title.append(strong, originalTitle);
    cover.append(title);
  }

  function prefetchShowPage(show) {
    if (window.location.protocol === "file:") return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    [show.href, ...(show.prefetch || [])].forEach((href) => {
      if (prefetchedPages.has(href)) return;
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = href;
      document.head.append(link);
      prefetchedPages.add(href);
    });
  }

  function createCard(show, initial, isInitialCard) {
    const card = document.createElement("a");
    card.className = `show-card ${show.cardClass}`;
    card.href = show.href;
    card.dataset.initial = initial;
    if (isInitialCard) card.id = `letter-${show.language}-${initial}`;

    const cover = document.createElement("div");
    cover.className = "cover";
    cover.setAttribute("aria-hidden", "true");
    appendCoverTitle(cover, show, isInitialCard);

    const copy = document.createElement("div");
    copy.className = "show-copy";
    const meta = document.createElement("span");
    meta.className = "show-meta";
    meta.textContent = show.meta.join(" / ");
    const title = document.createElement("strong");
    title.textContent = show.title;
    copy.append(meta, title);
    card.append(cover, copy);
    card.addEventListener("click", () => analytics.trackLibraryEntry({
      showId: show.id,
      showName: show.originalTitle || show.title,
    }));
    card.addEventListener("pointerenter", () => prefetchShowPage(show), { once: true });
    card.addEventListener("focus", () => prefetchShowPage(show), { once: true });
    return card;
  }

  function createAnchor(href, label, className) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.className = className;
    anchor.textContent = label;
    return anchor;
  }

  function groupShowsByInitial(shows) {
    return shows
      .slice()
      .sort((left, right) => pinyinCollator.compare(left.sortTitle || left.title, right.sortTitle || right.title))
      .reduce((groups, show) => {
        const initial = pinyinInitials[show.id] || "#";
        if (!groups.has(initial)) groups.set(initial, []);
        groups.get(initial).push(show);
        return groups;
      }, new Map());
  }

  function createGroup(language, shows) {
    const section = document.createElement("section");
    section.className = "language-group";
    section.id = `language-${language.id}`;
    section.setAttribute("aria-labelledby", `${language.id}-heading`);

    const heading = document.createElement("div");
    heading.className = "language-heading";
    const title = document.createElement("h2");
    title.id = `${language.id}-heading`;
    title.textContent = language.label;
    const count = document.createElement("span");
    count.textContent = `${shows.length} 部`;
    heading.append(title, count);

    const initialGroups = groupShowsByInitial(shows);
    const alphaNav = document.createElement("nav");
    alphaNav.className = "alpha-nav";
    alphaNav.setAttribute("aria-label", `${language.label}首字母索引`);
    const alphabet = [...initialGroups.keys()].sort((left, right) => left === "#" ? -1 : right === "#" ? 1 : left.localeCompare(right));
    alphabet.forEach((initial) => {
      const link = createAnchor(`#letter-${language.id}-${initial}`, initial, "alpha-link");
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const target = section.querySelector(`#letter-${language.id}-${initial}`);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        const cards = [...section.querySelectorAll(`.show-card[data-initial="${initial}"]`)];
        cards.forEach((card) => card.classList.remove("is-letter-highlight"));
        requestAnimationFrame(() => cards.forEach((card) => card.classList.add("is-letter-highlight")));
        window.setTimeout(() => cards.forEach((card) => card.classList.remove("is-letter-highlight")), 1200);
      });
      alphaNav.append(link);
    });

    const displayCase = document.createElement("div");
    displayCase.className = "display-case";
    const collection = document.createElement("div");
    collection.className = "collection";
    alphabet.forEach((initial) => {
      initialGroups.get(initial).forEach((show, index) => collection.append(createCard(show, initial, index === 0)));
    });
    displayCase.append(collection);
    section.append(heading, alphaNav, displayCase);
    return section;
  }

  function updateActiveNavigation() {
    const groups = [...groupsRoot.querySelectorAll(".language-group")];
    let current = groups[0];
    groups.forEach((group) => {
      if (group.getBoundingClientRect().top <= 120) current = group;
    });
    if (!current) return;
    languageNav.querySelectorAll("a").forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === `#${current.id}`));
    backToTop.classList.toggle("is-visible", window.scrollY > 420);
  }

  function setLibraryOverlayOpen(name, open) {
    window.LibraryCursorController?.setOverlay(name, open);
  }

  function mountVersionHistory() {
    if (document.querySelector("#versionHistoryControl")) return;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "version-history-trigger";
    trigger.setAttribute("aria-label", "打开版本历程");
    trigger.title = "版本历程";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "versionHistoryDialog");
    trigger.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 5v14M7 7h10M7 12h7M7 17h10" />
        <circle cx="7" cy="5" r="1.5" />
        <circle cx="7" cy="12" r="1.5" />
        <circle cx="7" cy="19" r="1.5" />
      </svg>`;

    const control = document.createElement("div");
    control.id = "versionHistoryControl";
    control.className = "version-history-control";
    control.append(trigger);

    const dialog = document.createElement("dialog");
    dialog.id = "versionHistoryDialog";
    dialog.className = "version-history-dialog";
    dialog.setAttribute("aria-labelledby", "versionHistoryTitle");

    const inner = document.createElement("div");
    inner.className = "version-history-dialog-inner";

    const head = document.createElement("div");
    head.className = "version-history-dialog-head";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h2");
    title.id = "versionHistoryTitle";
    title.textContent = "版本历程";
    titleWrap.append(title);

    const closeForm = document.createElement("form");
    closeForm.method = "dialog";
    const close = document.createElement("button");
    close.type = "submit";
    close.className = "version-history-dialog-close";
    close.setAttribute("aria-label", "关闭版本历程");
    close.textContent = "×";
    closeForm.append(close);
    head.append(titleWrap, closeForm);

    const list = document.createElement("ol");
    list.className = "version-history-list";
    versionHistory.slice().reverse().forEach((entry) => {
      const item = document.createElement("li");
      item.className = "version-history-item";
      const date = document.createElement("time");
      date.className = "version-history-date";
      date.dateTime = entry.date;
      date.textContent = entry.date;
      const itemTitle = document.createElement("h3");
      itemTitle.textContent = entry.title;
      const summary = document.createElement("div");
      summary.className = "version-history-item-summary";
      summary.textContent = entry.summary;
      item.append(date, itemTitle, summary);
      list.append(item);
    });

    inner.append(head, list);
    dialog.append(inner);
    document.body.append(dialog);

    const displaySettings = document.querySelector("#musicalDisplaySettings");
    if (copyrightNoticeButton?.parentElement) {
      copyrightNoticeButton.after(control);
    } else if (displaySettings?.parentElement) {
      displaySettings.after(control);
    } else {
      document.body.append(control);
    }

    function closeHistory() {
      trigger.setAttribute("aria-expanded", "false");
      setLibraryOverlayOpen("version-history", false);
    }

    trigger.addEventListener("click", () => {
      setLibraryOverlayOpen("version-history", true);
      dialog.showModal();
      trigger.setAttribute("aria-expanded", "true");
    });
    dialog.addEventListener("close", closeHistory);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  function renderLibrary() {
    if (!Array.isArray(window.libraryShows) || !Array.isArray(window.libraryLanguages)) return;

    const availableShows = window.location.protocol === "file:"
      ? window.libraryShows
      : window.libraryShows.filter((show) => show.deployed);

    countNode.textContent = String(availableShows.length);
    const groups = window.libraryLanguages.flatMap((language) => {
      const shows = availableShows.filter((show) => show.language === language.id);
      return shows.length ? [createGroup(language, shows)] : [];
    });
    groupsRoot.replaceChildren(...groups);
    languageNav.replaceChildren(...groups.map((group) => {
      const language = window.libraryLanguages.find((item) => `language-${item.id}` === group.id);
      return createAnchor(`#${group.id}`, language.label, "language-link");
    }));
    updateActiveNavigation();
  }

  renderLibrary();
  mountVersionHistory();
  window.addEventListener("scroll", updateActiveNavigation, { passive: true });
  backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  copyrightNoticeButton.addEventListener("click", () => {
    setLibraryOverlayOpen("copyright", true);
    copyrightNotice.showModal();
  });
  copyrightNotice.addEventListener("close", () => setLibraryOverlayOpen("copyright", false));
  copyrightNotice.addEventListener("click", (event) => {
    if (event.target === copyrightNotice) copyrightNotice.close();
  });
})();
