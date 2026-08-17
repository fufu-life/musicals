(() => {
  const STORAGE_KEY = "musical-site-display-settings:v1";
  const DEFAULTS = Object.freeze({ theme: "dark", cursor: "custom" });
  const script = document.currentScript;
  const page = String(script?.dataset.musicalPage || "library").toLowerCase();
  // [场景底, 歌词面, 高亮块, 主强调, 正文, 次级文字, 意象色]
  const profiles = {
    library: ["#c9bda8", "#e2d8c6", "#cbae6c", "#61471f", "#29251f", "#625a4e", "#8a682e"],
    dazhuangwang: ["#ccd8cd", "#e6e6d5", "#d7c58f", "#275f50", "#16382f", "#52675f", "#9a7a2f"],
    hamilton: ["#d8c8a2", "#eee4cb", "#ddc78f", "#3b2c16", "#251e14", "#62533a", "#9a751f"],
    "jesus-christ-superstar-1996-london": ["#c9a575", "#e1c7a4", "#c98972", "#8a3429", "#2b211a", "#68523d", "#8a6a32"],
    "les-miserables": ["#aeb9be", "#d5d3c8", "#c58a82", "#37576b", "#1f2b32", "#4d5d64", "#a33a42"],
    "moulin-rouge": ["#cba3a0", "#e2c2b5", "#cd8586", "#961c2d", "#341e22", "#65444b", "#b77a2a"],
    chicago: ["#c3aa99", "#dfc8b6", "#ce797a", "#941f2a", "#211b18", "#5b483f", "#2b201b"],
    "dear-evan-hansen": ["#9fcbd7", "#d7e7e9", "#a8d4df", "#1b5e70", "#17323a", "#46616a", "#b48a24"],
    "six-the-musical": ["#c5acd0", "#e0d0e4", "#d5b657", "#742881", "#302039", "#68516f", "#b32976"],
    suffs: ["#d1c29d", "#e6dcc0", "#d8bd73", "#6b4779", "#302817", "#6b6044", "#a57a20"],
    "sunset-boulevard": ["#b6aea1", "#d8d0c3", "#c99a61", "#764318", "#272420", "#574f48", "#9f6a24"],
    "phantom-of-the-opera": ["#afaead", "#e2ded7", "#d2bbb7", "#760d18", "#171516", "#565153", "#8a682e"],
    "love-never-dies": ["#b7a9bc", "#d9ccd7", "#d7b46d", "#6d3e75", "#2d2532", "#5c4d63", "#a78032"],
    "elisabeth-das-musical": ["#a8a9b7", "#d7d8e0", "#bfc5d3", "#4d3b66", "#22212b", "#555565", "#6f758c"],
    "mozart-das-musical": ["#c9b3a3", "#e1d3c3", "#d58c80", "#a33435", "#2f211e", "#6a514a", "#7c642e"],
    "tanz-der-vampire": ["#b9adb1", "#d8ccce", "#ca7886", "#7d2439", "#2d2025", "#5b4a50", "#9a2740"],
    "ludwig-ii-sehnsucht-nach-dem-paradies": ["#a8bed0", "#d3dee5", "#c9b477", "#345d87", "#1d2c3a", "#4a5e70", "#8a6d2a"],
    "dracula-das-musical": ["#a7b4b8", "#cbd3d2", "#c9857c", "#671f2b", "#202a2e", "#47575e", "#8a5a2e"],
    "rebecca-das-musical": ["#a9babd", "#d3dcda", "#c4a878", "#415e68", "#1d2b30", "#4b5d62", "#8b5a2b"],
    "the-greatest-showman": ["#c4a98f", "#e0cbb2", "#d2a659", "#87352a", "#302319", "#604a3a", "#a77924"],
    "epic-the-musical": ["#95b9bd", "#cce0dd", "#c5ad70", "#1f6478", "#182c35", "#435d66", "#987b32"],
    "come-from-away": ["#93a9c4", "#d2dce3", "#e0c35d", "#174a80", "#172b45", "#465b6e", "#b48c12"],
    rent: ["#aaa69c", "#d4d0c4", "#c68a75", "#8a242a", "#24221f", "#55524d", "#2a2521"],
    "tick-tick-boom": ["#dfe1c9", "#f2f2e3", "#e9e6b1", "#4c5132", "#252820", "#5f644d", "#87923e"],
    wicked: ["#aec39f", "#d4e0c9", "#c7a7b2", "#326c3f", "#1d3022", "#4b604e", "#9a4d77"],
    hadestown: ["#bba081", "#d9c6a8", "#c88262", "#7c3324", "#2b2118", "#5c4938", "#993b2e"],
    "les-dix-commandements": ["#c4b797", "#e1d7c3", "#d0b573", "#285e85", "#19313f", "#595848", "#8f6b2c"],
    "rouge-et-noir": ["#b8afab", "#ddd4ce", "#c6aaa3", "#7a0f1e", "#201719", "#5a4948", "#b2132a"],
    "le-petit-prince-2cd": ["#a9c5d6", "#d6e5e8", "#e0c887", "#2d6381", "#1d2d3a", "#4a616e", "#a34a42"],
    starmania: ["#8faab5", "#c8d7db", "#bfc67a", "#2f5d70", "#202e35", "#465d67", "#8a3f73"],
    "les-souliers-rouges": ["#b1b1c9", "#d5d5e2", "#c88998", "#7e2e46", "#2b2636", "#595469", "#a12946"],
    "la-legende-du-roi-arthur": ["#a6b8b6", "#d0dcda", "#c7b06e", "#365b55", "#20322f", "#495f5b", "#9a7c2b"],
    "notre-dame-de-paris": ["#c1b39f", "#ddd2c3", "#d2a15f", "#8b4a34", "#2d2721", "#5f5245", "#a23b31"],
    "mozart-opera-rock": ["#a4c6c4", "#cee1dc", "#d89cab", "#7e2d5e", "#1f3031", "#496460", "#a63779"],
    "romeo-et-juliette": ["#9daec6", "#d9e0e8", "#d5b7b8", "#274e86", "#1c2738", "#495a70", "#9c1f2e"],
    "le-roi-soleil": ["#c8bea5", "#e4ddca", "#d8b54e", "#2f5781", "#20303e", "#625b4d", "#a88217"],
    "1789-les-amants-de-la-bastille": ["#c3aa97", "#decdc0", "#d09a75", "#8c382e", "#30221d", "#604b42", "#315b74"],
    "don-juan": ["#b7a5a5", "#d7c8c6", "#c9786d", "#742b31", "#2c2021", "#5a484a", "#8c6a2f"],
    "moliere-le-spectacle-musical": ["#c8b7a1", "#e4d8c8", "#d6a06f", "#285f89", "#192a3a", "#5a4e45", "#c2672d"],
    "cyrano-de-bergerac": ["#a8afba", "#d4d6db", "#c89a9e", "#6b2b3c", "#24252b", "#55565f", "#8b3043"],
    "les-miserables-1980": ["#b8b6ad", "#d8d4c9", "#c5a87b", "#792d2a", "#252722", "#555650", "#a42932"],
    "les-miserables-cityprod-2017": ["#8f9fb8", "#d0dae7", "#c8878f", "#315688", "#1d2a3c", "#495b70", "#9a2e3a"],
  };

  function normalize(value) {
    return {
      theme: value?.theme === "light" ? "light" : "dark",
      cursor: value?.cursor === "native" ? "native" : "custom",
    };
  }

  function read() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch {
      return { ...DEFAULTS };
    }
  }

  function apply(settings) {
    const normalized = normalize(settings);
    const profile = profiles[page] || profiles.library;
    const root = document.documentElement;
    root.dataset.musicalPage = page;
    root.dataset.musicalTheme = normalized.theme;
    root.dataset.musicalCursor = normalized.cursor;
    root.style.setProperty("--musical-light-bg", profile[0]);
    root.style.setProperty("--musical-light-panel", profile[1]);
    root.style.setProperty("--musical-light-highlight", profile[2]);
    root.style.setProperty("--musical-light-accent", profile[3]);
    root.style.setProperty("--musical-light-ink", profile[4]);
    root.style.setProperty("--musical-light-muted", profile[5]);
    root.style.setProperty("--musical-light-motif", profile[6]);
    return normalized;
  }

  apply(read());
  window.MusicalDisplaySettings = {
    storageKey: STORAGE_KEY,
    defaults: DEFAULTS,
    page,
    profiles,
    normalize,
    read,
    apply,
    current: () => normalize({
      theme: document.documentElement.dataset.musicalTheme,
      cursor: document.documentElement.dataset.musicalCursor,
    }),
    customCursorEnabled: () => document.documentElement.dataset.musicalCursor !== "native",
  };
})();
