(function () {
  const groupsRoot = document.querySelector("#languageGroups");
  const languageNav = document.querySelector("#languageNav");
  const countNode = document.querySelector("#showCount");
  const backToTop = document.querySelector("#libraryBackToTop");
  const copyrightNoticeButton = document.querySelector("#copyrightNoticeButton");
  const copyrightNotice = document.querySelector("#copyrightNotice");
  const analytics = window.MusicalAnalytics.initLibrary();
  const prefetchedPages = new Set();
  const pinyinInitials = {
    dazhuangwang: "D", hamilton: "H", "les-miserables": "B", "moulin-rouge": "H",
    chicago: "Z", "dear-evan-hansen": "Q", "six-the-musical": "L", suffs: "N",
    "sunset-boulevard": "R", "phantom-of-the-opera": "J", "love-never-dies": "Z",
    "elisabeth-das-musical": "Y", "mozart-das-musical": "M", "rouge-et-noir": "Y",
    starmania: "X", "les-souliers-rouges": "H", "la-legende-du-roi-arthur": "Y",
    "notre-dame-de-paris": "B", "mozart-opera-rock": "Y", "romeo-et-juliette": "L",
    "le-roi-soleil": "T", "1789-les-amants-de-la-bastille": "#", "don-juan": "T",
    "moliere-le-spectacle-musical": "M", "cyrano-de-bergerac": "D",
    "les-miserables-1980": "B", "les-miserables-cityprod-2017": "B",
  };
  const pinyinCollator = new Intl.Collator("zh-Hans-CN-u-co-pinyin", { sensitivity: "base" });

  function appendCoverTitle(cover, show) {
    if (show.image) {
      const image = document.createElement("img");
      image.className = "show-logo";
      image.src = show.image;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
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
    appendCoverTitle(cover, show);

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

  function setLibraryCursorMode(active) {
    document.body.classList.toggle("library-cursor-active", active);
    const cursor = document.querySelector(".spotlight-mouse");
    if (cursor) cursor.style.opacity = active ? "" : "0";
  }

  function renderLibrary() {
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
  window.addEventListener("scroll", updateActiveNavigation, { passive: true });
  backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  copyrightNoticeButton.addEventListener("click", () => {
    copyrightNotice.showModal();
    setLibraryCursorMode(false);
  });
  copyrightNotice.addEventListener("close", () => setLibraryCursorMode(true));
  copyrightNotice.addEventListener("click", (event) => {
    if (event.target === copyrightNotice) copyrightNotice.close();
  });
})();
