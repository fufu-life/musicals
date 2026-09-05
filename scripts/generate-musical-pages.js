const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const vm = require("node:vm");
const { writeFileAtomic } = require("./generator-write-guard.js");

const ROOT = path.resolve(__dirname, "..");
let generationWritesEnabled = false;
const CURSOR_ASSET_VERSION = "20260830-legally-blonde-balance-1";
const SHARED_UI_ASSET_VERSION = "20260830-derived-light-profiles-4";
const LYRICS_ROOT = path.resolve(ROOT, "..", "lyrics");
const LEGACY_OUTPUT_ROOT = path.resolve(ROOT, "..", "outputs", "lyrics-web");
const ROUGE_SCRIPT = path.join(ROOT, "rouge-et-noir", "script.js");
const ROUGE_SONGS = path.join(ROOT, "rouge-et-noir", "songs.js");
const FREEDICT_GLOSSARY = path.join(ROOT, "scripts", "freedict-french-glossary.json");
const GOOGLE_ENGLISH_GLOSSARY = path.join(ROOT, "scripts", "google-english-glossary.json");
const AUTO_WORD_GLOSSARY = path.join(ROOT, "scripts", "auto-word-glossary.json");
const MANUAL_WORD_GLOSSARY = path.join(ROOT, "scripts", "manual-word-overrides.json");
const WAVE2_MANUAL_WORD_GLOSSARY = path.join(ROOT, "scripts", "manual-word-overrides-wave2.json");
const BATCH_WORD_GLOSSARY = path.join(ROOT, "scripts", "batch-word-overrides.json");
const ELISION_WORD_GLOSSARY = path.join(ROOT, "scripts", "elision-word-overrides.json");
const REVIEWED_LINE_OVERRIDES = path.resolve(ROOT, "..", "scripts", "reviewed_normalized_line_overrides.json");
const REQUIRED_LINE_REVIEW_KEYS = {
  "jesus-christ-superstar-1996-london": "jcs",
  "le-petit-prince-2cd": "lpp",
};
const LINE_MERGE_OVERRIDES = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts", "line-merge-overrides.json"), "utf8"),
);
const LINE_SEGMENT_OVERRIDES = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts", "line-segment-overrides.json"), "utf8"),
);
const MERGED_LINE_TEXT_OVERRIDES = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts", "merged-line-text-overrides.json"), "utf8"),
);
const MAX_REVIEWED_LINE_MERGE_ROWS = 4;
const MAX_REVIEWED_LINE_MERGE_WORDS = 18;
const REVIEWED_LONG_LINE_MERGE_START_IDS = new Set([
  "mozart-das-musical-48-031",
  "mozart-das-musical-48-047",
]);
const INSTRUMENTAL_MARKERS = new Set([
  "instrumental",
  "instrumental music",
  "instrumental only",
  "music only",
  "orchestral",
  "纯音乐",
  "纯音乐，请欣赏",
  "纯器乐",
  "器乐",
  "器乐曲",
]);
const existingLineIpaCache = new Map();

function parseHexColor(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value || ""));
  if (!match) return null;
  return [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16));
}

function mixHexColors(base, target, targetWeight) {
  const baseChannels = parseHexColor(base);
  const targetChannels = parseHexColor(target);
  if (!baseChannels || !targetChannels) {
    throw new Error(`Light-theme colors must use six-digit hex values: ${base}, ${target}`);
  }
  const weight = Math.min(1, Math.max(0, Number(targetWeight)));
  const channels = baseChannels.map((channel, index) => (
    Math.round(channel * (1 - weight) + targetChannels[index] * weight)
  ));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function relativeColorLuminance(value) {
  const channels = parseHexColor(value);
  if (!channels) return 0;
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function colorContrastRatio(first, second) {
  const firstLuminance = relativeColorLuminance(first);
  const secondLuminance = relativeColorLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function darkenForLightSurface(color, surface, minimumContrast) {
  let candidate = parseHexColor(color) ? color.toLowerCase() : "#49333f";
  for (let step = 0; step < 24 && colorContrastRatio(candidate, surface) < minimumContrast; step += 1) {
    candidate = mixHexColors(candidate, "#000000", 0.08);
  }
  return candidate;
}

function deriveLightProfile(show) {
  const fields = ["bg", "panel", "highlight", "accent", "ink", "muted", "motif"];
  if (show.lightTheme) {
    const profile = fields.map((field) => show.lightTheme[field]);
    if (profile.some((color) => !parseHexColor(color))) {
      throw new Error(`${show.slug} lightTheme must define seven six-digit hex colors`);
    }
    return profile.map((color) => color.toLowerCase());
  }

  const theme = show.theme || {};
  const background = mixHexColors(theme.bg || "#201820", "#ffffff", 0.9);
  const panel = mixHexColors(theme.panel || theme.bg || "#2c202c", "#ffffff", 0.95);
  const highlight = mixHexColors(theme.highlight || theme.accent || "#c9a6b6", "#ffffff", 0.48);
  const accent = darkenForLightSurface(theme.accent || show.effect?.primary, panel, 4.5);
  const ink = darkenForLightSurface(mixHexColors(theme.bg || "#201820", "#000000", 0.08), background, 7);
  const muted = darkenForLightSurface(mixHexColors(ink, panel, 0.25), panel, 4.5);
  const motif = darkenForLightSurface(show.effect?.primary || theme.accent, panel, 3);
  return [background, panel, highlight, accent, ink, muted, motif];
}

const SHOWS = [
  {
    slug: "notre-dame-de-paris",
    source: "Notre-Dame de Paris (501410).md",
    title: "Notre-Dame de Paris",
    titleZh: "巴黎圣母院",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.png",
    effect: { icon: "roseWindow", trail: "stoneDust", click: "roseWindowGlow", primary: "#b98a54", secondary: "#d9c39a" },
    theme: {
      bg: "#120806",
      panel: "#23110b",
      accent: "#d74d2f",
      highlight: "#d9a85f",
      ink: "#f8efe3",
      muted: "rgba(248, 239, 227, 0.68)",
      serif: '"Times New Roman", "Songti SC", serif',
    },
  },
  {
    slug: "les-miserables",
    source: "Les Miserables - The Musical That Swept the World (10th Anniversary Concert at the Royal Albert Hall (501546).md",
    title: "Les Misérables",
    titleZh: "悲惨世界",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.png",
    showEnglishToggle: false,
    displayOrderOverrides: {
      18: 19,
      19: 20,
      20: 21,
      21: 22,
      22: 23,
      23: 24,
      24: 25,
      25: 26,
      26: 27,
      27: 28,
      28: 29,
      29: 30,
      30: 31,
      32: 32,
      33: 33,
      34: 34,
      35: 35,
      36: 36,
      37: 37,
      38: 18,
      39: 38,
      40: 39,
    },
    effect: { icon: "flag", trail: "smoke", click: "dawnRays", primary: "#c92535", secondary: "#f1d792" },
    theme: {
      bg: "#071021",
      panel: "#101827",
      accent: "#b8202e",
      highlight: "#d6b25e",
      ink: "#f3ead7",
      muted: "rgba(243, 234, 215, 0.7)",
      serif: 'Garamond, "Times New Roman", "Songti SC", serif',
    },
  },
  {
    slug: "mozart-opera-rock",
    source: "Mozart L'opera Rock (Complete Recording) (500659).md",
    title: "Mozart, l'opéra rock",
    titleZh: "摇滚莫扎特",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.png",
    effect: { icon: "musicNote", trail: "staffGlow", click: "inkDrops", primary: "#f03c96", secondary: "#60e6d1" },
    theme: {
      bg: "#06141b",
      panel: "#0b2230",
      accent: "#f03c96",
      highlight: "#e8eef2",
      ink: "#f4fbff",
      muted: "rgba(244, 251, 255, 0.66)",
      serif: 'Montserrat, "Avenir Next", "PingFang SC", sans-serif',
    },
  },
  {
    slug: "romeo-et-juliette",
    source: "Roméo & Juliette de la Haine à l'Amour en Live (145210).md",
    title: "Roméo et Juliette",
    titleZh: "罗密欧与朱丽叶",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.png",
    effect: { icon: "rose", trail: "petals", click: "loveRipples", primary: "#b91932", secondary: "#3159b7" },
    theme: {
      bg: "#06133a",
      panel: "#0d1e4d",
      accent: "#c91f2c",
      highlight: "#f7f1ee",
      ink: "#f5f7ff",
      muted: "rgba(245, 247, 255, 0.68)",
      serif: '"Cormorant Garamond", "Times New Roman", "Songti SC", serif',
    },
  },
  {
    slug: "le-roi-soleil",
    source: "Le Roi Soleil (Le spectacle original) [L'intégrale] (501009).md",
    title: "Le Roi Soleil",
    titleZh: "太阳王",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.png",
    effect: { icon: "sun", trail: "goldDust", click: "sunHalo", primary: "#e6bd57", secondary: "#fff1b0" },
    theme: {
      bg: "#071a48",
      panel: "#102b68",
      accent: "#f5c542",
      highlight: "#e05222",
      ink: "#fff7d6",
      muted: "rgba(255, 247, 214, 0.7)",
      serif: '"Playfair Display", "Times New Roman", "Songti SC", serif',
    },
  },
  {
    slug: "1789-les-amants-de-la-bastille",
    source: "1789_ Les Amants de La Bastille (Intégrale Deluxe) (34515302).md",
    title: "1789: Les Amants de la Bastille",
    titleZh: "1789：巴士底狱的恋人",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.png",
    effect: { icon: "cocarde", trail: "revolutionDust", click: "revolutionGlow", primary: "#b72e38", secondary: "#f2e7d3" },
    theme: {
      bg: "#21090d",
      panel: "#3b1118",
      accent: "#b72e38",
      highlight: "#f2e7d3",
      ink: "#f6efe6",
      muted: "rgba(242, 231, 211, 0.7)",
      serif: 'Oswald, Arial, "PingFang SC", sans-serif',
    },
  },
  {
    slug: "don-juan",
    source: "Don Juan (Les plus grands succès du spectacle musical de Félix Gray) (39727394).md",
    title: "Don Juan",
    titleZh: "唐璜",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.png",
    effect: { icon: "rapier", trail: "bladeGlint", click: "crossedBlades", primary: "#8d1627", secondary: "#e8d6b2" },
    theme: {
      bg: "#050813",
      panel: "#0d1220",
      accent: "#c51622",
      highlight: "#d8dce8",
      ink: "#f5f1e8",
      muted: "rgba(245, 241, 232, 0.68)",
      serif: 'Georgia, "Songti SC", serif',
    },
  },
  {
    slug: "moliere-le-spectacle-musical",
    source: "Molière, le spectacle musical (185278333).md",
    title: "Molière",
    titleZh: "莫里哀",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.png",
    effect: { icon: "mask", trail: "spotlight", click: "curtainFold", primary: "#dc712c", secondary: "#75a5d8" },
    theme: {
      bg: "#061b4f",
      panel: "#0d2d75",
      accent: "#e7762e",
      highlight: "#f1d2aa",
      ink: "#f8fbff",
      muted: "rgba(248, 251, 255, 0.68)",
      serif: 'Poppins, "Avenir Next", "PingFang SC", sans-serif',
    },
  },
  {
    slug: "cyrano-de-bergerac",
    source: "Cyrano de Bergerac Le Spectacle Musical (146352430).md",
    title: "Cyrano de Bergerac",
    titleZh: "大鼻子情圣",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.png",
    effect: { icon: "moon", trail: "letters", click: "letterfall", primary: "#d8bfa0", secondary: "#8f3542" },
    theme: {
      bg: "#12080b",
      panel: "#241116",
      accent: "#8f3542",
      highlight: "#d8bfa0",
      ink: "#f4ece4",
      muted: "rgba(226, 210, 200, 0.72)",
      serif: 'Lora, "Times New Roman", "Songti SC", serif',
    },
  },
  {
    slug: "moulin-rouge",
    source: "Moulin Rouge! The Musical (Original Broadway Cast Recording) (81375858).md",
    title: "Moulin Rouge! The Musical",
    titleZh: "红磨坊",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.png",
    showEnglishToggle: false,
    effect: { icon: "stage", trail: "cabaretGlow", click: "marqueeBurst", primary: "#d5233f", secondary: "#f4c76f" },
    theme: {
      bg: "#0b0205",
      panel: "#24070d",
      accent: "#e21d2a",
      highlight: "#d9a34b",
      ink: "#fff3df",
      muted: "rgba(244, 218, 184, 0.74)",
      line: "rgba(217, 163, 75, 0.32)",
      shadow: "rgba(0, 0, 0, 0.56)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: '"Bodoni 72 Smallcaps", "Bodoni 72", Didot, Georgia, serif',
      lyricFont: '"Bodoni 72", Didot, Georgia, "Songti SC", serif',
      radius: "6px",
      titleTracking: "0.015em",
      bodyPattern: "repeating-linear-gradient(90deg, transparent 0 58px, rgba(217, 163, 75, 0.035) 59px 60px), radial-gradient(ellipse at 50% -8%, rgba(226, 29, 42, 0.25), transparent 36rem)",
      heroPattern: "linear-gradient(128deg, rgba(226, 29, 42, 0.2), transparent 42%), repeating-linear-gradient(90deg, rgba(217, 163, 75, 0.055) 0 1px, transparent 1px 18px)",
      visualPattern: "linear-gradient(145deg, rgba(226, 29, 42, 0.2), transparent 48%), radial-gradient(circle at 50% 22%, rgba(217, 163, 75, 0.2), transparent 58%)",
      visualFilter: "drop-shadow(0 16px 22px rgba(0, 0, 0, 0.5)) saturate(1.08)",
    },
  },
  {
    slug: "the-greatest-showman",
    source: "The Greatest Showman (Original Motion Picture Soundtrack) (36674183)/The Greatest Showman (Original Motion Picture Soundtrack) (36674183).md",
    sourceFormat: "english-chinese-single",
    title: "The Greatest Showman",
    titleZh: "马戏之王",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.png",
    showEnglishToggle: false,
    effect: { icon: "stage", trail: "goldSparkleRosePetal", click: "marqueeBurst", primary: "#d59b3a", secondary: "#e75b3c" },
    theme: {
      bg: "#0c0807",
      panel: "#24130f",
      accent: "#d59b3a",
      highlight: "#f2d18a",
      ink: "#fff5df",
      muted: "rgba(244, 222, 187, 0.74)",
      line: "rgba(242, 209, 138, 0.3)",
      shadow: "rgba(0, 0, 0, 0.58)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: 'Didot, "Bodoni 72", Georgia, serif',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "5px",
      titleTracking: "0.02em",
      bodyPattern: "radial-gradient(ellipse at 50% 0%, rgba(213, 155, 58, 0.25), transparent 34rem), repeating-linear-gradient(90deg, transparent 0 64px, rgba(242, 209, 138, 0.03) 65px 66px)",
      heroPattern: "linear-gradient(124deg, rgba(213, 155, 58, 0.2), transparent 48%), radial-gradient(circle at 84% 18%, rgba(231, 91, 60, 0.15), transparent 16rem)",
      visualPattern: "conic-gradient(from 180deg at 50% 20%, rgba(213, 155, 58, 0.2), rgba(231, 91, 60, 0.14), rgba(213, 155, 58, 0.2))",
      visualFilter: "drop-shadow(0 18px 24px rgba(0, 0, 0, 0.58)) saturate(1.08)",
    },
  },
  {
    slug: "chicago",
    source: "Chicago The Musical (New Broadway Cast Recording (1997)) (72099621)/Chicago The Musical (New Broadway Cast Recording (1997)) (72099621).md",
    sourceFormat: "paired-english",
    title: "Chicago",
    titleZh: "芝加哥",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.png",
    showEnglishToggle: false,
    effect: { icon: "star", trail: "cabaretGlow", click: "marqueeBurst", primary: "#c51f2b", secondary: "#f3d39a" },
    theme: {
      bg: "#080708",
      panel: "#171316",
      accent: "#c51f2b",
      highlight: "#f3d39a",
      ink: "#fff8ee",
      muted: "rgba(238, 220, 201, 0.72)",
      line: "rgba(217, 171, 105, 0.28)",
      shadow: "rgba(0, 0, 0, 0.62)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: '"Avenir Next Condensed", "Arial Narrow", sans-serif',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "3px",
      titleTracking: "0.045em",
      bodyPattern: "radial-gradient(ellipse at 16% -10%, rgba(197, 31, 43, 0.23), transparent 32rem), repeating-linear-gradient(90deg, transparent 0 72px, rgba(243, 211, 154, 0.025) 73px 74px)",
      heroPattern: "radial-gradient(circle at 84% 18%, rgba(243, 211, 154, 0.13) 0 2px, transparent 3px), linear-gradient(125deg, rgba(197, 31, 43, 0.2), transparent 55%)",
      visualPattern: "radial-gradient(circle at 50% 20%, rgba(197, 31, 43, 0.2), transparent 66%)",
      visualFilter: "drop-shadow(0 18px 24px rgba(0, 0, 0, 0.64))",
    },
  },
  {
    slug: "dear-evan-hansen",
    source: "Dear Evan Hansen (Original Motion Picture Soundtrack) (133703534)/Dear Evan Hansen (Original Motion Picture Soundtrack) (133703534).md",
    sourceFormat: "paired-english",
    title: "Dear Evan Hansen",
    titleZh: "致埃文·汉森",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.png",
    showEnglishToggle: false,
    effect: { icon: "key", trail: "letters", click: "letterfall", primary: "#2676a8", secondary: "#edf5f7" },
    theme: {
      bg: "#07141b",
      panel: "#102732",
      accent: "#2a7aaa",
      highlight: "#dceef2",
      ink: "#f7fbfc",
      muted: "rgba(207, 229, 234, 0.74)",
      line: "rgba(145, 205, 221, 0.27)",
      shadow: "rgba(0, 8, 15, 0.56)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: '"Noteworthy", "Bradley Hand", "Marker Felt", sans-serif',
      lyricFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      radius: "5px",
      titleTracking: "0.006em",
      bodyPattern: "repeating-linear-gradient(-7deg, transparent 0 36px, rgba(181, 224, 234, 0.035) 37px 38px), radial-gradient(ellipse at 86% 0%, rgba(42, 122, 170, 0.28), transparent 34rem)",
      heroPattern: "repeating-linear-gradient(-7deg, transparent 0 27px, rgba(220, 238, 242, 0.06) 28px 29px), linear-gradient(128deg, rgba(42, 122, 170, 0.22), transparent 60%)",
      visualPattern: "linear-gradient(118deg, rgba(42, 122, 170, 0.2), transparent 56%), repeating-linear-gradient(-7deg, transparent 0 20px, rgba(220, 238, 242, 0.055) 21px 22px)",
      visualFilter: "drop-shadow(0 16px 22px rgba(0, 0, 0, 0.46))",
    },
  },
  {
    slug: "six-the-musical",
    source: "Six_ The Musical (Studio Cast Recording) (73307227)/Six_ The Musical (Studio Cast Recording) (73307227).md",
    sourceFormat: "paired-english",
    title: "SIX",
    titleZh: "六位王后",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.webp",
    showEnglishToggle: false,
    effect: { icon: "star", trail: "neonTrail", click: "starBurst", primary: "#d52ba6", secondary: "#f2c94c" },
    theme: {
      bg: "#10051c",
      panel: "#25103a",
      accent: "#d52ba6",
      highlight: "#f2c94c",
      ink: "#fff8ff",
      muted: "rgba(226, 207, 239, 0.76)",
      line: "rgba(221, 111, 215, 0.3)",
      shadow: "rgba(6, 0, 18, 0.62)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: 'Impact, "Arial Black", "Avenir Next Condensed", sans-serif',
      lyricFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      radius: "8px",
      titleTracking: "0.055em",
      bodyPattern: "linear-gradient(135deg, rgba(213, 43, 166, 0.15), transparent 35%), repeating-linear-gradient(45deg, transparent 0 58px, rgba(242, 201, 76, 0.03) 59px 60px)",
      heroPattern: "linear-gradient(122deg, rgba(213, 43, 166, 0.24), transparent 48%), radial-gradient(circle at 82% 18%, rgba(242, 201, 76, 0.13), transparent 16rem)",
      visualPattern: "conic-gradient(from 0deg at 50% 50%, rgba(213, 43, 166, 0.22), rgba(242, 201, 76, 0.09), rgba(98, 64, 190, 0.2), rgba(213, 43, 166, 0.22))",
      visualFilter: "drop-shadow(0 0 18px rgba(213, 43, 166, 0.38)) drop-shadow(0 14px 20px rgba(0, 0, 0, 0.52))",
    },
  },
  {
    slug: "suffs",
    source: "Suffs (Original Broadway Cast Recording) (198263623)/Suffs (Original Broadway Cast Recording) (198263623).md",
    sourceFormat: "paired-english",
    title: "Suffs",
    titleZh: "女子当参政",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.png",
    showEnglishToggle: false,
    effect: { icon: "flag", trail: "none", click: "subtleRing", primary: "#f0c62b", secondary: "#7e4fa1" },
    theme: {
      bg: "#12100b",
      panel: "#282113",
      accent: "#e3ba25",
      highlight: "#af86c8",
      ink: "#fff9df",
      muted: "rgba(229, 218, 177, 0.74)",
      line: "rgba(240, 198, 43, 0.3)",
      shadow: "rgba(0, 0, 0, 0.54)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: 'Rockwell, "Courier New", serif',
      lyricFont: 'Georgia, "Iowan Old Style", "Songti SC", serif',
      radius: "2px",
      titleTracking: "0.018em",
      bodyPattern: "repeating-linear-gradient(0deg, transparent 0 48px, rgba(240, 198, 43, 0.03) 49px 50px), radial-gradient(ellipse at 84% 0%, rgba(126, 79, 161, 0.26), transparent 32rem)",
      heroPattern: "linear-gradient(118deg, rgba(240, 198, 43, 0.18), transparent 46%), repeating-linear-gradient(-4deg, transparent 0 24px, rgba(175, 134, 200, 0.05) 25px 26px)",
      visualPattern: "linear-gradient(138deg, rgba(240, 198, 43, 0.2), transparent 52%), linear-gradient(42deg, rgba(126, 79, 161, 0.19), transparent 58%)",
      visualFilter: "drop-shadow(0 16px 20px rgba(0, 0, 0, 0.5))",
    },
  },
  {
    slug: "sunset-boulevard",
    source: "Sunset Boulevard US [ 2005 remastered (set) ] [US 1994 _ Musical _Sunset Boulevard_] (34473330)/Sunset Boulevard US [ 2005 remastered (set) ] [US 1994 _ Musical _Sunset Boulevard_] (34473330).md",
    sourceFormat: "paired-english",
    title: "Sunset Boulevard",
    titleZh: "日落大道",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.jpg",
    showEnglishToggle: false,
    effect: { icon: "moon", trail: "none", click: "sunHalo", primary: "#d78024", secondary: "#f1d7a2" },
    theme: {
      bg: "#070707",
      panel: "#171310",
      accent: "#c46d20",
      highlight: "#e9cf99",
      ink: "#f8f2e8",
      muted: "rgba(218, 207, 186, 0.72)",
      line: "rgba(221, 180, 113, 0.26)",
      shadow: "rgba(0, 0, 0, 0.68)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: 'Didot, "Bodoni 72", Georgia, serif',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "2px",
      titleTracking: "0.025em",
      bodyPattern: "linear-gradient(180deg, rgba(196, 109, 32, 0.18), transparent 18rem), repeating-linear-gradient(90deg, transparent 0 78px, rgba(233, 207, 153, 0.025) 79px 80px)",
      heroPattern: "linear-gradient(112deg, rgba(196, 109, 32, 0.2), transparent 46%), repeating-linear-gradient(90deg, transparent 0 19px, rgba(233, 207, 153, 0.045) 20px 21px)",
      visualPattern: "radial-gradient(ellipse at 50% 72%, rgba(215, 128, 36, 0.28), transparent 58%), linear-gradient(180deg, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.34))",
      visualFilter: "drop-shadow(0 18px 24px rgba(0, 0, 0, 0.7)) sepia(0.08)",
    },
  },
  {
    slug: "elisabeth-das-musical",
    source: "Elisabeth - Das Musical - Gesamtaufnahme Live - Jubiläumsfassung (37313354).md",
    title: "Elisabeth",
    titleZh: "伊丽莎白",
    language: "de",
    voice: "de",
    audioVoice: "Anna",
    logo: "assets/show-logo.png",
    effect: { icon: "quill", trail: "silverDust", click: "crownGlow", primary: "#b5b2bf", secondary: "#d8b56d" },
    theme: {
      bg: "#07060d",
      panel: "#15121f",
      accent: "#67547e",
      highlight: "#e6e2ed",
      ink: "#f8f5fb",
      muted: "rgba(205, 197, 218, 0.72)",
      line: "rgba(190, 181, 208, 0.28)",
      shadow: "rgba(0, 0, 0, 0.58)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: '"Snell Roundhand", "Apple Chancery", cursive',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "4px",
      titleTracking: "0.012em",
      bodyPattern: "repeating-linear-gradient(105deg, transparent 0 42px, rgba(163, 145, 190, 0.025) 43px 44px), radial-gradient(ellipse at 82% 0%, rgba(103, 84, 126, 0.26), transparent 34rem)",
      heroPattern: "conic-gradient(from 205deg at 88% 108%, rgba(159, 139, 184, 0.16), transparent 8deg 18deg, rgba(230, 226, 237, 0.055) 19deg 23deg, transparent 24deg 35deg), linear-gradient(118deg, rgba(36, 25, 52, 0.82), transparent 58%)",
      visualPattern: "conic-gradient(from 205deg at 50% 110%, rgba(159, 139, 184, 0.2), transparent 8deg 18deg, rgba(230, 226, 237, 0.08) 19deg 23deg, transparent 24deg 35deg)",
      visualFilter: "drop-shadow(0 18px 24px rgba(0, 0, 0, 0.62)) contrast(1.06)",
    },
  },
  {
    slug: "tanz-der-vampire",
    source: "../outputs/german_musicals/Tanz der Vampire/lyrics/Tanz der Vampire 全曲目歌词.md",
    sourceFormat: "german-triple",
    legacyOutputSlug: "tanz-der-vampire",
    title: "Tanz der Vampire",
    titleZh: "吸血鬼之舞",
    language: "de",
    voice: "de",
    audioVoice: "Anna",
    logo: "assets/show-logo.png",
    fullSongsFile: "songs-full.js",
    effect: { icon: "moon", trail: "silverDust", click: "crownGlow", primary: "#a32643", secondary: "#d8b56d" },
    theme: {
      bg: "#08050c",
      panel: "#1b101b",
      accent: "#a32643",
      highlight: "#d8b56d",
      ink: "#f8eff1",
      muted: "rgba(232, 213, 220, 0.72)",
      line: "rgba(216, 181, 109, 0.28)",
      shadow: "rgba(0, 0, 0, 0.62)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: 'Didot, "Bodoni 72", Georgia, serif',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "5px",
      titleTracking: "0.018em",
      bodyPattern: "radial-gradient(ellipse at 78% 0%, rgba(163, 38, 67, 0.24), transparent 34rem), repeating-linear-gradient(90deg, transparent 0 64px, rgba(216, 181, 109, 0.025) 65px 66px)",
      heroPattern: "linear-gradient(124deg, rgba(163, 38, 67, 0.2), transparent 50%), radial-gradient(circle at 84% 18%, rgba(216, 181, 109, 0.13), transparent 15rem)",
      visualPattern: "radial-gradient(circle at 50% 22%, rgba(163, 38, 67, 0.24), transparent 64%), linear-gradient(160deg, rgba(216, 181, 109, 0.08), transparent 58%)",
      visualFilter: "drop-shadow(0 18px 24px rgba(0, 0, 0, 0.62)) saturate(1.08)",
    },
  },
  {
    slug: "ludwig-ii-sehnsucht-nach-dem-paradies",
    source: "../outputs/german_musicals/Ludwig II - Sehnsucht nach dem Paradies/lyrics/Ludwig II - Sehnsucht nach dem Paradies 全曲目歌词.md",
    sourceFormat: "german-triple",
    legacyOutputSlug: "ludwig-ii-sehnsucht-nach-dem-paradies",
    title: "Ludwig II - Sehnsucht nach dem Paradies",
    titleZh: "路德维希二世：向往天堂",
    language: "de",
    voice: "de",
    audioVoice: "Anna",
    logo: "assets/show-logo.jpg",
    effect: { icon: "crown", trail: "diamondDust", click: "softDiamondGlow", primary: "#8aa4c8", secondary: "#e6d6a0" },
    theme: {
      bg: "#07101b",
      panel: "#102034",
      accent: "#6f90b8",
      highlight: "#e6d6a0",
      ink: "#f2f5fb",
      muted: "rgba(211, 224, 239, 0.72)",
      line: "rgba(230, 214, 160, 0.28)",
      shadow: "rgba(0, 4, 12, 0.58)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: '"Snell Roundhand", "Apple Chancery", cursive',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "4px",
      titleTracking: "0.01em",
      bodyPattern: "radial-gradient(ellipse at 14% 0%, rgba(111, 144, 184, 0.24), transparent 33rem), repeating-linear-gradient(105deg, transparent 0 46px, rgba(230, 214, 160, 0.025) 47px 48px)",
      heroPattern: "linear-gradient(118deg, rgba(111, 144, 184, 0.2), transparent 48%), radial-gradient(circle at 82% 16%, rgba(230, 214, 160, 0.14), transparent 15rem)",
      visualPattern: "radial-gradient(ellipse at 50% 20%, rgba(111, 144, 184, 0.24), transparent 62%), linear-gradient(160deg, rgba(230, 214, 160, 0.08), transparent 58%)",
      visualFilter: "drop-shadow(0 18px 24px rgba(0, 0, 0, 0.6)) contrast(1.04)",
    },
  },
  {
    slug: "dracula-das-musical",
    source: "../outputs/german_musicals/Dracula/lyrics/Dracula 全曲目歌词.md",
    sourceFormat: "german-triple",
    legacyOutputSlug: "dracula",
    title: "Dracula - Das Musical",
    titleZh: "德古拉",
    language: "de",
    voice: "de",
    audioVoice: "Anna",
    logo: "assets/show-logo.jpg",
    effect: { icon: "chandelier", trail: "crystalGlint", click: "pressGlow", primary: "#8f1d2c", secondary: "#d7b36a" },
    theme: {
      bg: "#080609",
      panel: "#1b1118",
      accent: "#8f1d2c",
      highlight: "#d7b36a",
      ink: "#f8f0e8",
      muted: "rgba(225, 207, 195, 0.72)",
      line: "rgba(215, 179, 106, 0.28)",
      shadow: "rgba(0, 0, 0, 0.68)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: 'Didot, "Bodoni 72", Georgia, serif',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "3px",
      titleTracking: "0.022em",
      bodyPattern: "radial-gradient(ellipse at 84% 0%, rgba(143, 29, 44, 0.26), transparent 34rem), repeating-linear-gradient(90deg, transparent 0 70px, rgba(215, 179, 106, 0.024) 71px 72px)",
      heroPattern: "linear-gradient(126deg, rgba(143, 29, 44, 0.22), transparent 50%), radial-gradient(circle at 82% 18%, rgba(215, 179, 106, 0.12), transparent 16rem)",
      visualPattern: "radial-gradient(ellipse at 50% 16%, rgba(143, 29, 44, 0.28), transparent 60%), linear-gradient(180deg, rgba(215, 179, 106, 0.08), transparent 58%)",
      visualFilter: "drop-shadow(0 18px 24px rgba(0, 0, 0, 0.72)) sepia(0.08)",
    },
  },
  {
    slug: "rebecca-das-musical",
    source: "../outputs/german_musicals/Rebecca/lyrics/Rebecca 全曲目歌词.md",
    sourceFormat: "german-triple",
    legacyOutputSlug: "rebecca",
    title: "Rebecca",
    titleZh: "蝴蝶梦",
    language: "de",
    voice: "de",
    audioVoice: "Anna",
    logo: "assets/show-logo.png",
    fullSongsFile: "songs-full.js",
    effect: { icon: "rebeccaR", trail: "neonSpark", click: "subtleRipple", primary: "#426a91", secondary: "#c9a75a" },
    theme: {
      bg: "#071019",
      panel: "#10202d",
      accent: "#426a91",
      highlight: "#c9a75a",
      ink: "#eff5f7",
      muted: "rgba(207, 224, 231, 0.72)",
      line: "rgba(201, 167, 90, 0.27)",
      shadow: "rgba(0, 5, 12, 0.62)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: 'Didot, "Bodoni 72", Georgia, serif',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "4px",
      titleTracking: "0.018em",
      bodyPattern: "radial-gradient(ellipse at 18% 0%, rgba(66, 106, 145, 0.25), transparent 34rem), repeating-linear-gradient(90deg, transparent 0 58px, rgba(201, 167, 90, 0.025) 59px 60px)",
      heroPattern: "linear-gradient(122deg, rgba(66, 106, 145, 0.22), transparent 48%), radial-gradient(circle at 84% 16%, rgba(201, 167, 90, 0.13), transparent 15rem)",
      visualPattern: "linear-gradient(138deg, rgba(66, 106, 145, 0.22), transparent 52%), radial-gradient(circle at 50% 18%, rgba(201, 167, 90, 0.14), transparent 62%)",
      visualFilter: "drop-shadow(0 18px 24px rgba(0, 0, 0, 0.62)) contrast(1.05)",
    },
  },
  {
    slug: "starmania",
    source: "Starmania (Live Intégral 1979) (179767).md",
    title: "Starmania",
    titleZh: "星幻",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.png",
    effect: { icon: "musicNote", trail: "neonTrail", click: "starBurst", primary: "#3fb6d8", secondary: "#f0d65d" },
    theme: {
      bg: "#051019",
      panel: "#102637",
      accent: "#4b9fbd",
      highlight: "#d7edf3",
      ink: "#f5fbfd",
      muted: "rgba(190, 216, 226, 0.73)",
      line: "rgba(135, 199, 219, 0.3)",
      shadow: "rgba(0, 8, 16, 0.55)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: '"Avenir Next Condensed", "Arial Narrow", "DIN Condensed", sans-serif',
      lyricFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      radius: "2px",
      titleTracking: "0.055em",
      bodyPattern: "linear-gradient(112deg, transparent 0 40%, rgba(126, 205, 228, 0.1) 40.5% 41%, transparent 41.5%), repeating-linear-gradient(90deg, transparent 0 66px, rgba(190, 225, 235, 0.025) 67px 68px)",
      heroPattern: "linear-gradient(112deg, transparent 0 38%, rgba(145, 218, 236, 0.16) 38.5% 39%, transparent 39.5%), linear-gradient(180deg, rgba(75, 159, 189, 0.13), transparent 56%)",
      visualPattern: "linear-gradient(112deg, transparent 0 44%, rgba(210, 241, 248, 0.18) 44.5% 45%, transparent 45.5%), linear-gradient(180deg, rgba(75, 159, 189, 0.2), transparent 66%)",
      visualFit: "cover",
      visualPosition: "50% 18%",
      visualWidth: "100%",
      visualHeight: "100%",
      visualTabletHeight: "340px",
      visualPadding: "0px",
      visualFrameRadius: "1px",
      visualFilter: "saturate(0.9) contrast(1.08)",
    },
  },
  {
    slug: "epic-the-musical",
    source: "../outputs/musicals/Epic- The Musical/lyrics/Epic- The Musical 全曲目歌词.md",
    sourceFormat: "english-chinese-columns",
    title: "EPIC",
    titleZh: "EPIC",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.png",
    showEnglishToggle: false,
    effect: { icon: "musicNote", trail: "seaStarlight", click: "softOceanWave", primary: "#2d9fb6", secondary: "#f0d58b" },
    theme: {
      bg: "#06131c",
      panel: "#0d2630",
      accent: "#2d9fb6",
      highlight: "#f0d58b",
      ink: "#f5f4ea",
      muted: "rgba(214, 235, 232, 0.74)",
      line: "rgba(151, 213, 214, 0.28)",
      shadow: "rgba(0, 8, 18, 0.64)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: 'Cinzel, "Times New Roman", "Songti SC", serif',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "6px",
      titleTracking: "0.06em",
      bodyPattern: "radial-gradient(ellipse at 50% 0%, rgba(45, 159, 182, 0.22), transparent 34rem), repeating-linear-gradient(0deg, transparent 0 31px, rgba(151, 213, 214, 0.035) 32px 33px)",
      heroPattern: "linear-gradient(135deg, rgba(45, 159, 182, 0.22), transparent 48%), radial-gradient(circle at 85% 10%, rgba(240, 213, 139, 0.16), transparent 18rem)",
      visualPattern: "radial-gradient(circle at 50% 50%, rgba(45, 159, 182, 0.18), transparent 64%), linear-gradient(155deg, rgba(240, 213, 139, 0.1), transparent 48%)",
      visualFit: "contain",
      visualPosition: "50% 50%",
      visualWidth: "min(250px, 100%)",
      visualHeight: "210px",
      visualPadding: "0px",
      visualFilter: "drop-shadow(0 16px 22px rgba(0, 0, 0, 0.52)) saturate(1.05)",
    },
  },
  {
    slug: "mozart-das-musical",
    source: "Mozart!-Das Musical-Gesamtaufnahme (Original Cast Wien) (35123377).md",
    title: "Mozart! Das Musical",
    titleZh: "莫扎特！",
    language: "de",
    voice: "de",
    audioVoice: "Anna",
    logo: "assets/show-logo.png",
    effect: { icon: "quill", trail: "inkTrail", click: "scoreBurst", primary: "#d6a52f", secondary: "#f2ead5" },
    theme: {
      bg: "#100d0f",
      panel: "#241a1d",
      accent: "#c91d2b",
      highlight: "#f0e9e2",
      ink: "#fff9f2",
      muted: "rgba(221, 207, 202, 0.72)",
      line: "rgba(225, 205, 201, 0.28)",
      shadow: "rgba(0, 0, 0, 0.54)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: '"Noteworthy", "Bradley Hand", "Marker Felt", cursive',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "5px",
      titleTracking: "0.006em",
      bodyPattern: "linear-gradient(118deg, transparent 0 22%, rgba(201, 29, 43, 0.1) 22.5% 23%, transparent 23.5% 72%, rgba(240, 233, 226, 0.035) 72.5% 73%, transparent 73.5%), radial-gradient(ellipse at 12% 0%, rgba(201, 29, 43, 0.18), transparent 30rem)",
      heroPattern: "linear-gradient(118deg, rgba(201, 29, 43, 0.17) 0 1.5%, transparent 2% 68%, rgba(240, 233, 226, 0.055) 68.5% 69%, transparent 69.5%), linear-gradient(145deg, rgba(46, 31, 36, 0.9), transparent 68%)",
      visualPattern: "linear-gradient(118deg, rgba(201, 29, 43, 0.18) 0 2%, transparent 2.5% 72%, rgba(240, 233, 226, 0.07) 72.5% 73.5%, transparent 74%)",
      visualFilter: "drop-shadow(0 16px 20px rgba(0, 0, 0, 0.52)) contrast(1.04)",
    },
  },
  {
    slug: "phantom-of-the-opera",
    source: "Phantom Of The Opera (25th Anniversary Box Set_ 4CD) (103948).md",
    title: "The Phantom of the Opera",
    titleZh: "剧院魅影",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.png",
    sourceOrderMax: 21,
    showEnglishToggle: false,
    effect: { icon: "rose", trail: "candleSmoke", click: "chandelierGlow", primary: "#c7ab67", secondary: "#f1eee7" },
    theme: {
      bg: "#030303",
      panel: "#111011",
      accent: "#7d1119",
      highlight: "#f0edef",
      ink: "#fbf8f5",
      muted: "rgba(207, 201, 202, 0.7)",
      line: "rgba(229, 224, 225, 0.25)",
      shadow: "rgba(0, 0, 0, 0.68)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: 'Didot, "Bodoni 72", Georgia, serif',
      lyricFont: '"Iowan Old Style", Baskerville, Georgia, "Songti SC", serif',
      radius: "2px",
      titleTracking: "0.018em",
      bodyPattern: "repeating-radial-gradient(circle at 84% -8%, transparent 0 34px, rgba(240, 237, 239, 0.025) 35px 36px), linear-gradient(128deg, rgba(125, 17, 25, 0.12), transparent 32%)",
      heroPattern: "repeating-radial-gradient(circle at 88% 0%, transparent 0 28px, rgba(240, 237, 239, 0.04) 29px 30px), linear-gradient(122deg, rgba(125, 17, 25, 0.16), transparent 45%)",
      visualPattern: "repeating-radial-gradient(circle at 50% -18%, transparent 0 23px, rgba(240, 237, 239, 0.075) 24px 25px), radial-gradient(circle at 50% 32%, rgba(125, 17, 25, 0.13), transparent 60%)",
      visualFilter: "drop-shadow(0 18px 24px rgba(0, 0, 0, 0.7)) contrast(1.12)",
    },
  },
  {
    slug: "love-never-dies",
    contentSlug: "phantom-of-the-opera",
    source: "Phantom Of The Opera (25th Anniversary Box Set_ 4CD) (103948).md",
    title: "Love Never Dies",
    titleZh: "真爱不死",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-title-logo.webp",
    sourceOrderMin: 22,
    showEnglishToggle: false,
    effect: { icon: "rose", trail: "candleSmoke", click: "chandelierGlow", primary: "#4c9cc0", secondary: "#e8f4f7" },
    theme: {
      bg: "#080329",
      panel: "#1a1045",
      accent: "#7454ae",
      highlight: "#e2b15d",
      ink: "#faf6ff",
      muted: "rgba(217, 205, 236, 0.75)",
      line: "rgba(209, 181, 225, 0.3)",
      shadow: "rgba(2, 0, 24, 0.62)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: 'Didot, "Bodoni 72", Georgia, serif',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "12px",
      titleTracking: "0.012em",
      bodyPattern: "repeating-radial-gradient(circle at 86% 8%, transparent 0 34px, rgba(226, 177, 93, 0.045) 35px 36px), radial-gradient(ellipse at 18% 0%, rgba(116, 84, 174, 0.28), transparent 34rem)",
      heroPattern: "repeating-radial-gradient(circle at 88% 10%, transparent 0 26px, rgba(226, 177, 93, 0.075) 27px 28px), linear-gradient(125deg, rgba(116, 84, 174, 0.22), transparent 58%)",
      visualPattern: "repeating-radial-gradient(circle at 50% 16%, transparent 0 22px, rgba(226, 177, 93, 0.12) 23px 24px), linear-gradient(180deg, rgba(116, 84, 174, 0.16), transparent 74%)",
      visualFit: "contain",
      visualPosition: "50% 50%",
      visualWidth: "min(250px, 100%)",
      visualHeight: "96px",
      visualFilter: "drop-shadow(0 10px 16px rgba(2, 0, 24, 0.42)) saturate(1.04) contrast(1.04)",
    },
  },
  {
    slug: "les-souliers-rouges",
    source: "Les souliers rouges (34867633).md",
    title: "Les Souliers Rouges",
    titleZh: "红舞鞋",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.png",
    effect: { icon: "rose", trail: "ribbonTrail", click: "shoeSpark", primary: "#b51f2e", secondary: "#f0d8c6" },
    theme: {
      bg: "#05082b",
      panel: "#11164b",
      accent: "#e21b38",
      highlight: "#f1e8df",
      ink: "#fbfbff",
      muted: "rgba(206, 211, 236, 0.75)",
      line: "rgba(204, 211, 242, 0.28)",
      shadow: "rgba(0, 2, 28, 0.58)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: '"Snell Roundhand", "Apple Chancery", cursive',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "10px",
      titleTracking: "0.006em",
      bodyPattern: "radial-gradient(circle at 12% 18%, rgba(255, 255, 255, 0.18) 0 1px, transparent 2px), radial-gradient(circle at 78% 10%, rgba(255, 255, 255, 0.12) 0 1px, transparent 2px), radial-gradient(circle at 90% 54%, rgba(255, 255, 255, 0.1) 0 1px, transparent 2px), linear-gradient(135deg, rgba(226, 27, 56, 0.1), transparent 34%)",
      heroPattern: "radial-gradient(circle at 82% 16%, rgba(255, 255, 255, 0.18) 0 1px, transparent 2px), radial-gradient(circle at 70% 68%, rgba(255, 255, 255, 0.12) 0 1px, transparent 2px), linear-gradient(125deg, rgba(226, 27, 56, 0.17), transparent 50%)",
      visualPattern: "radial-gradient(circle at 22% 16%, rgba(255, 255, 255, 0.24) 0 1px, transparent 2px), radial-gradient(circle at 78% 28%, rgba(255, 255, 255, 0.18) 0 1px, transparent 2px), linear-gradient(180deg, rgba(17, 22, 75, 0.08), rgba(5, 8, 43, 0.28))",
      visualFit: "cover",
      visualPosition: "50% 36%",
      visualWidth: "100%",
      visualHeight: "100%",
      visualTabletHeight: "360px",
      visualPadding: "0px",
      visualFrameRadius: "7px",
      visualFilter: "saturate(1.08) contrast(1.03)",
    },
  },
  {
    slug: "la-legende-du-roi-arthur",
    source: "La légende du Roi Arthur (34664427).md",
    title: "La Légende du Roi Arthur",
    titleZh: "亚瑟王传奇",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.png",
    effect: { icon: "rapier", trail: "bladeGlint", click: "crownRays", primary: "#65793b", secondary: "#d7bb67" },
    theme: {
      bg: "#071317",
      panel: "#102832",
      accent: "#547f8d",
      highlight: "#d5b85d",
      ink: "#f6f2df",
      muted: "rgba(199, 216, 216, 0.72)",
      line: "rgba(207, 183, 100, 0.3)",
      shadow: "rgba(0, 7, 11, 0.6)",
      bodyFont: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
      displayFont: 'Copperplate, "Copperplate Gothic Light", Georgia, serif',
      lyricFont: 'Baskerville, "Iowan Old Style", Georgia, "Songti SC", serif',
      radius: "4px",
      titleTracking: "0.035em",
      bodyPattern: "repeating-linear-gradient(0deg, transparent 0 72px, rgba(213, 184, 93, 0.03) 73px 74px), repeating-linear-gradient(90deg, transparent 0 132px, rgba(132, 179, 188, 0.028) 133px 134px), radial-gradient(ellipse at 80% 0%, rgba(84, 127, 141, 0.24), transparent 34rem)",
      heroPattern: "repeating-linear-gradient(0deg, transparent 0 54px, rgba(213, 184, 93, 0.045) 55px 56px), linear-gradient(125deg, rgba(84, 127, 141, 0.2), transparent 58%)",
      visualPattern: "linear-gradient(180deg, rgba(84, 127, 141, 0.08), rgba(7, 19, 23, 0.28)), repeating-linear-gradient(90deg, transparent 0 80px, rgba(213, 184, 93, 0.05) 81px 82px)",
      visualFit: "cover",
      visualPosition: "50% 66%",
      visualWidth: "100%",
      visualHeight: "100%",
      visualTabletHeight: "340px",
      visualPadding: "0px",
      visualFrameRadius: "2px",
      visualFilter: "saturate(0.88) contrast(1.08)",
    },
  },
  {
    slug: "les-miserables-1980",
    source: "Les Misérables (1980法语原创概念专辑) 网页数据源.md",
    title: "Les Misérables",
    titleZh: "悲惨世界（1980法语原创概念专辑）",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.jpg",
    effect: { icon: "flag", trail: "smoke", click: "dawnRays", primary: "#b33a35", secondary: "#e6c472" },
    theme: { bg: "#1a1110", panel: "#2a1815", accent: "#b33a35", highlight: "#e6c472", ink: "#fff3df", muted: "rgba(255, 243, 223, 0.7)", serif: 'Garamond, "Times New Roman", "Songti SC", serif' },
  },
  {
    slug: "les-miserables-cityprod-2017",
    source: "Les Misérables (2017 Cityprod法语版) 网页数据源.md",
    title: "Les Misérables en Concert",
    titleZh: "悲惨世界（2017 Cityprod法语版）",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.jpg",
    effect: { icon: "flag", trail: "letters", click: "dawnRays", primary: "#9d2733", secondary: "#ead9aa" },
    theme: { bg: "#0c1420", panel: "#172335", accent: "#b33a35", highlight: "#ead9aa", ink: "#f6f2e8", muted: "rgba(246, 242, 232, 0.7)", serif: 'Garamond, "Times New Roman", "Songti SC", serif' },
  },
  {
    slug: "jesus-christ-superstar-1996-london",
    source: "Jesus Christ Superstar (1996 London Cast) 网页数据源.md",
    title: "Jesus Christ Superstar",
    titleZh: "耶稣基督万世巨星（1996伦敦卡司录音）",
    language: "en",
    voice: "en-gb",
    audioVoice: "Daniel",
    logo: "assets/show-logo.png",
    showEnglishToggle: false,
    effect: { icon: "star", trail: "none", click: "subtleRing", primary: "#d5a23c", secondary: "#efe1b1" },
    theme: {
      bg: "#110c08",
      panel: "#24160f",
      accent: "#a63c2d",
      highlight: "#d9ad53",
      ink: "#f7edda",
      muted: "rgba(247, 237, 218, 0.68)",
      serif: 'Baskerville, "Times New Roman", "Songti SC", serif',
    },
  },
  {
    slug: "le-petit-prince-2cd",
    source: "Le Petit Prince (2CD访华首演纪念盘) 网页数据源.md",
    title: "Le Petit Prince",
    titleZh: "小王子（2CD访华首演纪念盘）",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.png",
    effect: { icon: "star", trail: "goldDust", click: "sunHalo", primary: "#e3bd58", secondary: "#9ecbe8" },
    theme: {
      bg: "#071326",
      panel: "#10233d",
      accent: "#d59b3a",
      highlight: "#f0d783",
      ink: "#f6f1df",
      muted: "rgba(225, 234, 239, 0.72)",
      serif: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
    },
  },
  {
    slug: "come-from-away",
    source: "Come From Away (Original Broadway Cast Recording) 网页数据源.md",
    legacyOutputSlug: "come-from-away",
    title: "Come From Away",
    titleZh: "来自远方",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.jpg",
    showEnglishToggle: false,
    effect: { icon: "globe", trail: "none", click: "none", primary: "#2d9fb6", secondary: "#e3bd58" },
    theme: {
      bg: "#07171c",
      panel: "#102b32",
      accent: "#2d9fb6",
      highlight: "#e3bd58",
      ink: "#effafa",
      muted: "rgba(216, 239, 240, 0.72)",
      serif: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
    },
  },
  {
    slug: "rent",
    source: "Rent (Original Broadway Cast) 网页数据源.md",
    legacyOutputSlug: "rent",
    title: "Rent",
    titleZh: "吉屋出租",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.jpg",
    showEnglishToggle: false,
    effect: { icon: "musicNote", trail: "neonSpark", click: "subtleRipple", primary: "#c51d49", secondary: "#f0d65d" },
    theme: {
      bg: "#10070f",
      panel: "#26101f",
      accent: "#c51d49",
      highlight: "#f0d65d",
      ink: "#fff4ef",
      muted: "rgba(246, 220, 222, 0.72)",
      serif: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
    },
  },
  {
    slug: "tick-tick-boom",
    source: "tick, tick...BOOM! (Original Off-Broadway Cast Recording) 网页数据源.md",
    legacyOutputSlug: "tick-tick-boom",
    title: "tick, tick...BOOM!",
    titleZh: "倒数时刻",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.jpg",
    showEnglishToggle: false,
    effect: { icon: "clock", trail: "clockTicks", click: "clockShockwave", primary: "#f3b33d", secondary: "#f5e4a8" },
    theme: {
      bg: "#12100a",
      panel: "#282113",
      accent: "#e3ba25",
      highlight: "#af86c8",
      ink: "#fff9df",
      muted: "rgba(229, 218, 177, 0.74)",
      serif: 'Rockwell, "Courier New", serif',
    },
  },
  {
    slug: "wicked",
    source: "Wicked (Original Broadway Cast Recording 2003) 网页数据源.md",
    legacyOutputSlug: "wicked",
    title: "Wicked",
    titleZh: "魔法坏女巫",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.jpg",
    showEnglishToggle: false,
    effect: { icon: "mask", trail: "magicDust", click: "softGreenRipple", primary: "#8dc63f", secondary: "#f4f0df" },
    theme: {
      bg: "#090f08",
      panel: "#162211",
      accent: "#8dc63f",
      highlight: "#f4f0df",
      ink: "#f8f6e9",
      muted: "rgba(218, 231, 190, 0.72)",
      serif: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
    },
  },
  {
    slug: "hadestown",
    source: "Hadestown (Original Broadway Cast Recording) 网页数据源.md",
    legacyOutputSlug: "hadestown",
    title: "Hadestown",
    titleZh: "冥界",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.jpg",
    showEnglishToggle: false,
    effect: { icon: "rose", trail: "thornEmbers", click: "crispShockwave", primary: "#b33a2c", secondary: "#e9d3a0" },
    theme: {
      bg: "#110b08",
      panel: "#21140e",
      accent: "#b33a2c",
      highlight: "#e9d3a0",
      ink: "#f7eee0",
      muted: "rgba(229, 202, 171, 0.72)",
      serif: 'Baskerville, "Times New Roman", "Songti SC", serif',
    },
  },
  {
    slug: "sound-of-music-the",
    source: "The Sound of Music (Music From the NBC Television Event) (2720138)/The Sound of Music (Music From the NBC Television Event) (2720138).md",
    legacyOutputSlug: "sound-of-music-the",
    title: "The Sound of Music",
    titleZh: "音乐之声",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.jpg",
    showEnglishToggle: false,
    sourceFormat: "paired-english-loose",
    looseSkipLeadingRows: { 1: 2 },
    effect: { icon: "musicNote", trail: "none", click: "softDiamondGlow", primary: "#4fb6d7", secondary: "#cfeff7" },
    theme: {
      bg: "#07151c",
      panel: "#112b35",
      accent: "#4fb6d7",
      highlight: "#8fb9cc",
      ink: "#f7f3e6",
      muted: "rgba(221, 232, 224, 0.72)",
      serif: 'Baskerville, "Times New Roman", "Songti SC", serif',
    },
  },
  {
    slug: "matilda",
    source: "Matilda The Musical (Original London Cast 2011) (207463)/Matilda The Musical (Original London Cast 2011) (207463).md",
    legacyOutputSlug: "matilda",
    title: "Matilda The Musical",
    titleZh: "玛蒂尔达",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-logo.jpg",
    showEnglishToggle: false,
    sourceFormat: "paired-english-loose",
    looseMergeLeadingSourceRows: [11],
    looseTrailingNotePatterns: { 14: [/Wikipedia/iu] },
    looseSpeakerMarkers: ["Miss Honey", "Miss Honey/ Matilda/ Escapologist"],
    effect: { icon: "book", trail: "none", click: "subtleRing", primary: "#df72a6", secondary: "#e8c56a" },
    theme: {
      bg: "#170c18",
      panel: "#2d162b",
      accent: "#df72a6",
      highlight: "#e8c56a",
      ink: "#fff4f7",
      muted: "rgba(245, 216, 231, 0.74)",
      serif: 'Georgia, "Songti SC", serif',
    },
  },
  {
    slug: "les-dix-commandements",
    source: "Les Dix Commandements (2000 French Cast) 网页数据源.md",
    legacyOutputSlug: "les-dix-commandements-com-die-musicale",
    title: "Les Dix Commandements",
    titleZh: "十诫",
    language: "fr",
    voice: "fr-fr",
    audioVoice: "Audrey",
    logo: "assets/show-logo.jpg",
    showEnglishToggle: false,
    effect: { icon: "sun", trail: "goldDust", click: "sunHalo", primary: "#1d8aa6", secondary: "#f0e6c5" },
    theme: {
      bg: "#08131c",
      panel: "#102737",
      accent: "#1d8aa6",
      highlight: "#f0e6c5",
      ink: "#f5f7ef",
      muted: "rgba(199, 225, 232, 0.72)",
      serif: '"Times New Roman", "Songti SC", serif',
    },
  },
  {
    slug: "legally-blonde",
    source: "Legally Blonde (2007 Broadway Production) 网页数据源.md",
    legacyOutputSlug: "legally-blonde",
    title: "Legally Blonde",
    titleZh: "律政俏佳人",
    language: "en",
    voice: "en-us",
    audioVoice: "Samantha",
    logo: "assets/show-title-logo-sharp-v2.webp",
    showEnglishToggle: false,
    sourceFormat: "english-chinese-columns",
    effect: { icon: "scales", trail: "none", click: "subtleRing", primary: "#d72d78", secondary: "#f3c4d8" },
    theme: {
      bg: "#180b16",
      panel: "#2b1325",
      accent: "#d72d78",
      highlight: "#f3c4d8",
      ink: "#fff3f8",
      muted: "rgba(255, 220, 236, 0.72)",
      serif: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
    },
    lightTheme: {
      bg: "#fff1f7",
      panel: "#fffafd",
      highlight: "#f7d2e4",
      accent: "#9f1f58",
      ink: "#321423",
      muted: "#6c4b5d",
      motif: "#c82b71",
    },
  },
];
const WAVE2_SHOW_SLUGS = new Set([
  "moulin-rouge",
  "elisabeth-das-musical",
  "tanz-der-vampire",
  "ludwig-ii-sehnsucht-nach-dem-paradies",
  "dracula-das-musical",
  "rebecca-das-musical",
  "the-greatest-showman",
  "epic-the-musical",
  "starmania",
  "mozart-das-musical",
  "phantom-of-the-opera",
  "love-never-dies",
  "les-souliers-rouges",
  "la-legende-du-roi-arthur",
  "chicago",
  "dear-evan-hansen",
  "six-the-musical",
  "suffs",
  "sunset-boulevard",
  "les-miserables-1980",
  "les-miserables-cityprod-2017",
  "jesus-christ-superstar-1996-london",
  "le-petit-prince-2cd",
  "come-from-away",
  "rent",
  "tick-tick-boom",
  "wicked",
  "hadestown",
  "sound-of-music-the",
  "matilda",
  "les-dix-commandements",
  "legally-blonde",
]);

const SONG_TITLE_TRANSLATIONS = {
  "sound-of-music-the": {
    Preludium: "前奏曲",
    "The Sound of Music": "音乐之声",
    Maria: "玛丽亚",
    "My Favorite Things": "我最喜欢的东西",
    "Do-Re-Mi": "哆来咪",
    "Sixteen Going On Seventeen": "十六岁与十七岁",
    "The Lonely Goatherd": "孤独的牧羊人",
    "How Can Love Survive?": "爱如何生存？",
    "Reprise: The Sound of Music": "音乐之声（重唱）",
    "The Grand Waltz": "盛大华尔兹",
    "Ländler": "伦德勒舞曲",
    "So Long, Farewell": "再见，再见",
    "Climb Ev'ry Mountain": "攀登每一座山",
    "No Way To Stop It": "无法阻止",
    "Something Good": "美好事物",
    "Processional & Maria (The Wedding)": "婚礼进行曲与玛丽亚（婚礼）",
    "Reprise: Sixteen Going On Seventeen": "十六岁与十七岁（重唱）",
    "Reprise: Do-Re-Mi (The Concert)": "哆来咪（音乐会重唱）",
    "Edelweiss (The Concert)": "雪绒花（音乐会）",
    "Reprise: So Long, Farewell (The Concert)": "再见，再见（音乐会重唱）",
    "Finale Ultimo: Climb Ev'ry Mountain": "终曲：攀登每一座山",
    "End Credits": "片尾字幕",
  },
  matilda: {
    Miracle: "奇迹",
    Naughty: "淘气鬼",
    "School Song": "校歌",
    Pathetic: "可悲",
    "The Hammer": "锤子",
    Loud: "喧闹",
    "This Little Girl": "这个小女孩",
    Bruce: "布鲁斯",
    Telly: "电视",
    "Entr'acte": "幕间曲",
    "When I Grow Up": "当我长大",
    "I'm Here": "我在这里",
    "The Smell Of Rebellion": "叛逆的气息",
    Quiet: "安静",
    "My House": "我的家",
    "Revolting Children": "叛逆的孩子们",
    "When I Grow Up (Reprise)": "当我长大（重唱）",
  },
  "the-greatest-showman": {
    "The Greatest Show": "最伟大的表演",
    "A Million Dreams": "一百万个梦想",
    "A Million Dreams (Reprise)": "一百万个梦想（重唱）",
    "Come Alive": "焕发生命",
    "The Other Side": "另一面",
    "Never Enough": "永远不够",
    "This Is Me": "这就是我",
    "Rewrite The Stars": "改写星辰",
    Tightrope: "钢索",
    "Never Enough (Reprise)": "永远不够（重唱）",
    "From Now On": "从今以后",
  },
  "epic-the-musical": {
    "The Horse and the Infant": "木马与婴儿",
    "Just A Man": "不过是个凡人",
    "Full Speed Ahead": "全速前进",
    "Open Arms": "张开双臂",
    "Warrior of the Mind": "心智战士",
    Polyphemus: "波吕斐摩斯",
    Survive: "求生",
    "Remember Them": "铭记他们",
    "My Goodbye": "我的告别",
    Storm: "风暴",
    "Luck Runs Out": "好运耗尽",
    "Keep Your Friends Close": "亲近你的朋友",
    Ruthlessness: "冷酷无情",
    Puppeteer: "提线木偶师",
    "Wouldn't You Like": "你难道不想吗",
    "Done For": "你完了",
    "There Are Other Ways": "还有别的办法",
    "The Underworld": "冥界",
    "No Longer You": "你已不再是你",
    Monster: "怪物",
    Suffering: "苦难",
    "Different Beast": "另一头野兽",
    Scylla: "斯库拉",
    Mutiny: "哗变",
    "Thunder Bringer": "雷霆之神",
    Legendary: "传奇",
    "Little Wolf": "小狼",
    "We'd Be Fine": "我们会没事的",
    "Love in Paradise": "天堂之爱",
    "God Games": "众神游戏",
    "Not Sorry For Loving You": "不为爱你道歉",
    Dangerous: "危险",
    Charybdis: "卡律布狄斯",
    "Get in the Water": "下水来",
    "600 Strike": "六百击",
    "The Challenge": "挑战",
    "Hold Them Down": "将他们压制",
    Odysseus: "奥德修斯",
    "I Can't Help But Wonder": "我禁不住猜想",
    "Would You Fall In Love With Me Again": "你还会再次爱上我吗",
  },
  "jesus-christ-superstar-1996-london": {
    "Heaven on their minds": "他们心中的天堂",
    "What's the buzz-Strange thing Mystifying": "怎么回事／奇怪又费解",
    "Everything's alright": "一切安好",
    "This Jesus must die": "耶稣必须死",
    Hosanna: "和散那",
    "Simon Zeolotes": "奋锐党人西门",
    "Pilate's dream": "彼拉多的梦",
    "The temple": "圣殿",
    "Everything's alright (Reprise)": "一切安好（重唱）",
    "I don't know how to love him": "我不知该如何爱他",
    "Damned for all time-Blood money": "永世受诅／血钱",
    "The last supper": "最后的晚餐",
    Gethsemane: "客西马尼",
    "The arrest": "逮捕",
    "Peter's denial": "彼得不认主",
    "Pilate and Christ": "彼拉多与基督",
    "King Herod's song": "希律王之歌",
    "Judas' death": "犹大之死",
    "Trial before Pilate (Including the 39 lashes)": "彼拉多审判（含三十九鞭）",
    Superstar: "超级巨星",
    Crucifixion: "受难",
  },
  "le-petit-prince-2cd": {
    "Avion Dans La Nuit / Lever De Soleil / Dessine-Moi Un Mouton / Coucher De Soleil": "夜航／日出／给我画只绵羊／日落",
    "L'allumeur De RÉVerbÈRes": "点灯人",
    "Lever De Soleil / Retour Dans Le DÉSert : 8È Jour Coucher De Soleil": "日出／重返沙漠：第八天／日落",
    "Lever De Soleil / Retour Dans Le DÉSert: 8È Jour Coucher De Soleil": "日出／重返沙漠：第八天／日落",
    "Le DÉPart": "离别",
  },
  "come-from-away": {
    "Welcome To the Rock": "欢迎来到岩石",
    "38 Planes": "38架飞机",
    "Blankets and Bedding": "毯子和床上用品",
    "28 Hours / Wherever We Are": "28小时／无论我们身在何处",
    "Darkness and Trees": "黑暗与树木",
    "On the Bus": "在巴士上",
    "Darkness and Trees (Reprise)": "黑暗与树木（重唱）",
    "Lead Us Out of the Night": "带领我们走出黑夜",
    "Phoning Home": "打电话回家",
    "Costume Party": "化装舞会",
    "I Am Here": "我在这里",
    Prayer: "祈祷",
    "On the Edge": "在边缘",
    "Screech In": "尖叫入会",
    "Me and the Sky": "我和天空",
    "The Dover Fault": "多佛断层",
    "Stop the World": "让世界停止",
    "38 Planes (Reprise) / Somewhere In the Middle of Nowhere": "38架飞机（重唱）／荒无人烟之地",
    "Something's Missing": "少了些什么",
    "10 Years Later": "十年之后",
    Finale: "终曲",
    "Screech Out": "尖叫出场",
  },
  rent: {
    "Tune Up #1": "调音#1",
    "Voice Mail #1": "语音留言#1",
    "Tune Up #2": "调音#2",
    Rent: "吉屋出租",
    "You Okay Honey?": "你还好吗，亲爱的？",
    "Tune Up #3": "调音#3",
    "One Song Glory": "一曲荣耀",
    "Light My Candle": "点燃我的蜡烛",
    "Voice Mail #2": "语音留言#2",
    "Today 4 U": "今天为你",
    "You'll See": "你会看到",
    "Tango: Maureen": "探戈：莫琳",
    "Life Support": "生命支持",
    "Out Tonight": "今晚出门",
    "Another Day": "另一天",
    "Will I?": "会是我吗？",
    "On The Street": "街头",
    "Santa Fe": "圣菲",
    "I'll Cover You": "我会照顾你",
    "We're Okay": "我们没事",
    "Christmas Bells": "圣诞钟声",
    "Over The Moon": "欣喜若狂",
    "La Vie Boheme": "波希米亚生活",
    "I Should Tell You": "我应该告诉你",
    "La Vie Boheme B": "波希米亚生活B",
    "Seasons Of Love": "爱的四季",
    "Happy New Year": "新年快乐",
    "Voice Mail #3": "语音留言#3",
    "Happy New Year B": "新年快乐B",
    "Take Me Or Leave Me": "要么接受我，要么离开我",
    "Seasons Of Love B": "爱的四季B",
    "Without You": "没有你",
    "Voice Mail #4": "语音留言#4",
    Contact: "接触",
    "I'll Cover You (Reprise)": "我会照顾你（重唱）",
    Halloween: "万圣节",
    "Goodbye Love": "告别，爱",
    "What You Own": "你拥有的东西",
    "Voice Mail #5": "语音留言#5",
    Finale: "终曲",
    "Your Eyes": "你的眼睛",
    "Finale B": "终曲B",
  },
  "tick-tick-boom": {
    "30/90": "30/90",
    "Green Green Dress": "绿色连衣裙",
    Sugar: "糖",
    "See Her Smile": "看见她的笑容",
    "Come to Your Senses": "唤醒你的感官",
    Why: "为什么",
    "Louder Than Words": "言语之外",
  },
  wicked: {
    "Dear Old Shiz": "古老的希兹",
    "The Wizard And I": "巫师与我",
    "What Is This Feeling?": "这是什么感觉？",
    "Something Bad": "坏事",
    "Dancing Through Life": "载歌载舞的人生",
    Popular: "受欢迎",
    "I'm Not That Girl": "我不是那种女孩",
    "One Short Day": "短暂的一天",
    "A Sentimental Man": "多愁善感的人",
    "Defying Gravity": "挑战重力",
    "Thank Goodness": "谢天谢地",
    "I'm Not That Girl (Reprise)": "我不是那种女孩（重唱）",
    "As Long As You're Mine": "只要你属于我",
    "No Good Deed": "没有善举",
    "March Of The Witch Hunters": "女巫猎人进行曲",
    "For Good": "永远改变",
    Finale: "终曲",
  },
  hadestown: {
    "Road to Hell": "通往地狱之路",
    "Any Way the Wind Blows": "风往哪边吹",
    "Come Home with Me": "和我回家",
    "Wedding Song": "婚礼之歌",
    "Epic I": "史诗I",
    "Livin' it Up on Top": "在顶端欢庆",
    "All I've Ever Known (Intro)": "我所知道的一切（序）",
    "All I've Ever Known": "我所知道的一切",
    "Way Down Hadestown": "深入冥界",
    "A Gathering Storm": "风暴将至",
    "Epic II": "史诗II",
    Chant: "圣歌",
    "Hey, Little Songbird": "嘿，小鸣鸟",
    "When the Chips are Down (Intro)": "当筹码落定（序）",
    "When the Chips are Down": "当筹码落定",
    "Gone, I'm Gone": "离开，我要离开",
    "Wait for Me (Intro)": "等我（序）",
    "Wait for Me": "等我",
    "Why We Build the Wall": "我们为何筑墙",
    "Why We Build the Wall (Outro)": "我们为何筑墙（尾声）",
    "Our Lady of the Underground": "地下女王",
    "Way Down Hadestown (Reprise)": "深入冥界（重唱）",
    Flowers: "鲜花",
    "Come Home with Me (Reprise)": "和我回家（重唱）",
    "Papers (Intro)": "文件（序）",
    "Nothing Changes": "什么都不会改变",
    "If it's True": "如果这是真的",
    "How Long?": "还有多久？",
    "Chant (Reprise)": "圣歌（重唱）",
    "Promises": "承诺",
    "Word to the Wise": "智者之言",
    "His Kiss, the Riot": "他的吻，暴乱",
    "Wait for Me (Reprise) (Intro)": "等我（重唱序）",
    "Wait for Me (Reprise)": "等我（重唱）",
    "Doubt Comes In": "怀疑来袭",
    "Road to Hell (Reprise)": "通往地狱之路（重唱）",
    "We Raise our Cups": "我们举杯",
  },
  "les-dix-commandements": {
    "Je laisse à l'abandon": "我把你遗弃",
    "Il s'appellera Moïse": "他将被命名为摩西",
    "Le dilemme": "两难",
    "À chacun son rêve": "各自的梦想",
    "La peine maximum": "最高刑罚",
    "Oh Moïse": "噢，摩西",
    "Il est celui que je voulais": "他就是我想要的人",
    "Mais tu t'en vas": "但你要离开",
    "Laisse mon peuple s'en aller": "让我的人民离去",
    "L-I-B-R-E": "自由",
    "Devant la mer": "面对大海",
    "Mon frère": "我的兄弟",
    "Les dix commandements": "十诫",
    "L'envie d'aimer": "爱的渴望",
  },
  "moulin-rouge": {
    "Welcome To The Moulin Rouge!": "欢迎来到红磨坊！",
    "The Sparkling Diamond": "璀璨钻石",
    "Shut Up And Raise Your Glass": "闭嘴，举杯",
    Firework: "烟花",
    "Your Song": "你的歌",
    "So Exciting! (The Pitch Song)": "太精彩了！（提案之歌）",
    "Sympathy For The Duke": "同情公爵",
    "Nature Boy": "自然之子",
    "Elephant Love Medley": "大象爱之串烧",
    "Backstage Romance": "后台罗曼史",
    "Come What May": "无论如何",
    "Only Girl In A Material World": "物质世界里唯一的女孩",
    Chandelier: "水晶吊灯",
    "El Tango De Roxanne": "罗克珊探戈",
    "Crazy Rolling": "疯狂翻滚",
    "Your Song Reprise": "你的歌（重唱）",
    "Finale (Come What May)": "终曲（无论如何）",
    "More More More! (Encore)": "更多、更多、更多！（返场）",
  },
  "elisabeth-das-musical": {
    "Wie Du": "像你一样",
    "Schön, euch alle zu seh'n": "很高兴见到大家",
    "Rondo - schwarzer Prinz": "回旋曲——黑王子",
    "Jedem gibt er das seine": "他给每个人应得的一切",
    "Sie passt nicht": "她不合适",
    "Liebe mit Gaffern": "围观者眼中的爱情",
    "Stationen einer Ehe": "一段婚姻的历程",
    Debrezin: "德布勒森",
    "Die fröhliche Apokalypse": "欢快的末日",
    "Kind oder nicht!": "还算不算孩子！",
    "Elisabeth, mach auf": "伊丽莎白，开门",
    "Uns're Kaiserin soll sich wiegen": "让我们的皇后称一称体重",
    "Ich gehör nur mir (Reprise)": "我只属于我自己（重唱）",
    Kitsch: "便宜货",
    "Der letzte Tanz": "最后一舞",
    "Nichts ist schwer": "世上无难事",
    "Ich gehör nur mir": "我只属于我自己",
    "Die Schatten werden länger": "阴霾渐袭",
    Éljen: "万岁",
    Nervenklinik: "精神病院",
    "Salon in der Hofburg": "霍夫堡宫的沙龙",
    "Wir oder sie": "我们还是她",
    "Das Wolf'sche Etablissement": "沃尔夫夫人的场所",
    "Die Maladie": "疾病",
    "Die letzte Chance": "最后的机会",
    "Ist das nun dein Lohn (Bellaria)": "这就是你的报偿吗（贝拉里亚）",
    "Die Schatten werden länger (Reprise)": "阴霾渐袭（重唱）",
    "Rudolf, ich bin ausser mir": "鲁道夫，我失去理智了",
    Hass: "仇恨",
    "Wie du (Reprise)": "像你一样（重唱）",
    "Wenn ich dein Spiegel wär": "如果我是你的镜子",
    "Mayerling-Walzer (Instrumental)": "梅耶林圆舞曲（器乐）",
    Totenklage: "悼亡曲",
    "Mein neues Sortiment": "我的新货品",
    "Boote in der Nacht": "夜航的船",
    "Alle Fragen sind gestellt (Reprise)": "所有问题都已问尽（重唱）",
    "Das Attentat": "刺杀",
    "Der Schleier fällt": "面纱落下",
  },
  starmania: {
    Ouverture: "序曲",
    "Sadia Et Johnny": "萨迪娅与强尼",
    "La serveuse et les clients": "女服务生与顾客们",
    "La complainte de la serveuse automate": "自动女服务生的哀歌",
    "Communique De L' Evangeliste Ⅱ": "新闻播报Ⅱ",
    "La chanson de ziggy": "齐吉之歌",
    "Le coup de téléphone": "那通电话",
    "Interview de johnny rockfort": "强尼·罗克福的访谈",
    "Communique De L' Evangeliste Ⅲ": "新闻播报Ⅲ",
    "Le meeting de zéro janvier": "泽罗·让维耶的集会",
    "Le bulletin special de télé capitale": "首都电视台特别新闻",
    "Besoin D' Amour": "需要爱",
    "Communique de l'evangelisteⅣ": "新闻播报Ⅳ",
    "Marie-jeanne et les clients du cafe": "玛丽-让娜与咖啡馆顾客",
    "Les adieux d'un *** symbol": "一位性感偶像的告别",
    "Le telegramme de zéro a stella": "泽罗给斯黛拉的电报",
    "Communiqué de l'Evangéliste et Marie-Jeanne": "新闻播报与玛丽-让娜",
    "S. o. s d'un terrien en detresse": "一个绝望地球人的求救",
    "Jingle De Stella": "斯黛拉的广告歌",
    "Le debat televise": "电视辩论",
    "*** shops, cinemas pornos": "性用品商店与色情影院",
    "Les parents de cristal": "克里斯塔尔的父母",
    "Quand on a plus rien a perdre": "当我们再无可失",
    "Les Uns contre les Autres": "人与人彼此对抗",
    "La Demande de Zéro à Stella": "泽罗向斯黛拉求婚",
    "ego trip": "自我之旅",
    "Communiqué de l'évangéliste": "新闻播报",
    "Petite Musique Terrienne": "地球小调",
    "Communique De L' Evangeliste Ⅵ": "新闻播报Ⅵ",
    "Communique De L' Évangéliste Ⅱ": "新闻播报Ⅱ",
    "Communique De L' Évangéliste Ⅲ": "新闻播报Ⅲ",
    "Communique de l'évangélisteⅣ": "新闻播报Ⅳ",
    "Communique De L' Évangéliste Ⅵ": "新闻播报Ⅵ",
    "Marie-jeanne et les clients du café": "玛丽-让娜与咖啡馆顾客",
    "Le télégramme de zéro a stella": "泽罗给斯黛拉的电报",
    "S. o. s d'un terrien en détresse": "一个绝望地球人的求救信号",
    "Le débat télévisé": "电视辩论",
    "*** shops, cinémas pornos": "色情商店与成人电影院",
    Monopolis: "垄断城",
    "Ce soir on danse à dnalizan (suite)": "今晚在纳利赞起舞（续）",
    "Le Monde Est Stone": "世界已石化",
    "La Victoire de Zéro Janvier": "泽罗·让维耶的胜利",
    "Le rêve de Stella Spotlight": "斯黛拉·聚光灯的梦",
    Final: "终曲",
  },
  "rebecca-das-musical": {
    "Zeit in einer Flasche": "序曲/瓶中时光",
    "Zeit in einer Flasche (Live)": "序曲/瓶中时光",
    "Gott, warum?": "上天，为什么",
    "Gott, warum? (Live)": "上天，为什么",
    "Hilf mir durch die Nacht": "助我度过沉沉黑夜",
    "I’m an American Woman": "我是一个美国女人",
    "I'm An American Woman": "我是一个美国女人",
    Rebecca: "瑞贝卡",
  },
  "mozart-das-musical": {
    "Entr'acte": "幕间曲",
    Prolog: "序幕",
    "Was für ein Kind!": "这是怎样的孩子！",
    "Ah, das Fräulein Mozart!": "啊，莫扎特小姐！",
    "Eine ehrliche Familie": "一个正直的家庭",
    "Niemand applaudiert": "无人鼓掌",
    "Was für ein grausames Leben": "多么残酷的人生",
    "In Salzburg ist Winter": "萨尔茨堡正值寒冬",
    "Ein bissel für's Hirn und ein bissel für's Herz": "给头脑一点，也给心一点",
    "Gold von den Sternen": "来自群星的黄金",
    "Niemand liebt dich so wie ich (Reprise)": "没人比我更爱你（重唱）",
    "Wien wird mich um ihn beneiden": "维也纳会因他而嫉妒我",
    "Halten sie den Atem an!": "请屏住呼吸！",
    "Ich bin extraordinär": "我非同凡响",
    "Weil du so bist, wie du bist": "因为你就是你",
    "Wir zwei zusammen": "我们两人在一起",
    "Ich bleibe in Wien!": "我要留在维也纳！",
    "Entrґacte": "幕间曲",
    "Hier In Wien!": "就在维也纳！",
    "Du Hast Ihn An Der Angel": "你把他钓到手了",
    "Dich Kennen Heisst Dich Lieben": "认识你就是爱上你",
    "Ha! Ein Liebesnest!": "哈！一个爱巢！",
    "Dich Kennen Heisst Dich Lieben (Reprise)": "认识你就是爱上你（重唱）",
    "Wer Ist Wer?": "谁是谁？",
    "Der Prinz Ist Fort": "王子走了",
    "Overture / Irgendwo wird immer getanzt": "序曲/ 总有一处可尽情起舞",
    "Irgendwo Wird Immer Getanzt": "序曲/ 总有一处可尽情起舞",
    "Mozart-Zitat (Ouvertüre \"Titus\")": "莫扎特引曲（《狄托的仁慈》序曲）",
    "Wie kann es möglich sein?": "怎会如此？",
    "Wie Kann Es Möglich Sein?": "怎会如此？",
    "Warum Kannst Du Mich Nicht Lieben?": "你为什么不能爱我？",
    "Mozarts Verwirrung": "莫扎特的迷惘",
    "Gold Von Den Sternen (Reprise)": "来自群星的黄金（重唱）",
    Bettelbriefe: "乞求信",
    "Papa Ist Tot": "爸爸死了",
    "Schliess dein Herz in Eisen ein": "紧锁心扉，坚如磐石",
    "Schliess Dein Herz In Eisen Ein (Reprise)": "紧锁心扉，坚如磐石（重唱）",
    "Irgendwo Wird Immer Getanzt (Reprise)": "总有某处在起舞（重唱）",
    "Der Einfache Weg": "简单的道路",
    "Mozart, Mozart!": "莫扎特，莫扎特！",
    "Mozarts Tod": "莫扎特之死",
    "Wie wird man seinen Schatten los?": "如何逃离自己的阴影？",
    "Wie Wird Man Seinen Schatten Los? (Finale)": "如何逃离自己的阴影？（终曲）",
  },
  "phantom-of-the-opera": {
    "All I Ask Of You": "我对你唯一的请求",
    "All I Ask Of You (Reprise)": "我对你唯一的请求（重唱）",
    "Prologue (Live)": "序幕（现场）",
    "Overture (Live)": "序曲（现场）",
    "Think Of Me (Live)": "想念我（现场）",
    "Angel Of Music (Live)": "音乐天使（现场）",
    "The Phantom Of The Opera (Live)": "剧院魅影（现场）",
    "The Music Of The Night (Live)": "夜之乐章（现场）",
    "I Remember .../Stranger Than You Dream It ... (Live)": "我记得……／比你梦中更陌生……（现场）",
    "I Remember.../Stranger Than You Dream It... (Live)": "我记得……／比你梦中更陌生……（现场）",
    "Magical Lasso (Live)": "魔法套索（现场）",
    "Notes .../Prima Donna (Live)": "信件……／首席女高音（现场）",
    "Notes.../Prima Donna (Live)": "信件……／首席女高音（现场）",
    "Poor Fool,He Makes Me Laugh (Live)": "可怜的傻瓜，他逗我发笑（现场）",
    "Why Have You Brought Me Here (Live)": "你为何带我来这里（现场）",
    "All I Ask Of You (Live)": "我对你唯一的请求（现场）",
    "Phantom Of The Opera (Live)": "剧院魅影（现场）",
    "Entr'Acte (Live)": "幕间曲（现场）",
    "Masquerade/Why So Silent (Live)": "假面舞会／为何如此沉默（现场）",
    "Wishing You Were Somehow Here Again (Live)": "愿你能再次回到这里（现场）",
    "Wandering Child .../Bravo,Monsieur ... (Live)": "迷途的孩子……／好极了，先生……（现场）",
    "Wandering Child.../Bravo,Monsieur... (Live)": "迷途的孩子……／好极了，先生……（现场）",
    "The Point Of No Return (Live)": "不归点（现场）",
    "Down Once More .../Track Down This Murderer ... (Live)": "再次下行……／追捕这个凶手……（现场）",
    "Down Once More.../Track Down This Murderer... (Live)": "再次下行……／追捕这个凶手……（现场）",
    Prologue: "序幕",
    "The Coney Island Waltz": "康尼岛圆舞曲",
    "That's The Place That You Ruined,You Fool!": "那就是你毁掉的地方，蠢货！",
    "Heaven By The Sea": "海滨天堂",
    "Only For Him / Only For You": "只为他／只为你",
    "The Aerie": "高巢",
    "Giry Confronts The Phantom / 'Til I Hear You Sing (Reprise)": "吉里质问魅影／直到听见你的歌声（重唱）",
    "Christine Disembarks": "克里斯汀下船",
    "What A Dreadful Town!...": "多么可怕的小镇！……",
    "Look With Your Heart": "用心去看",
    "Beneath A Moonless Sky": "在无月的天空下",
    "Once Upon Another Time": "曾在另一个时光",
    "Mother Please,I'm Scared!": "妈妈，求你了，我害怕！",
    "Dear Old Friend": "亲爱的老朋友",
    Beautiful: "美丽",
    "The Beauty Underneath": "潜藏之美",
    "The Phantom Confronts Christine": "魅影质问克里斯汀",
    "Entr'acte": "幕间曲",
    "Why Does She Love Me?": "她为什么爱我？",
    "Devil Take The Hindmost": "魔鬼带走落后者",
    "Heaven By The Sea (Reprise)": "海滨天堂（重唱）",
    "Bathing Beauty": "沐浴美人",
    "Before The Performance": "演出之前",
    "Love Never Dies": "真爱不死",
    "Ah,Christine!...": "啊，克里斯汀！……",
    "Ah, Christine!...": "啊，克里斯汀！……",
    "Gustave! Gustave!...": "古斯塔夫！古斯塔夫！……",
    "Please Miss Giry,I Want To Go Back...": "求你了，吉里小姐，我想回去……",
    "Poor Fool, He Makes Me Laugh (Live)": "可怜的傻瓜，他逗我发笑（现场）",
    "Wandering Child.../Bravo, Monsieur... (Live)": "迷途的孩子……／好极了，先生……（现场）",
    "That's The Place That You Ruined, You Fool!": "那就是你毁掉的地方，蠢货！",
    "Mother Please, I'm Scared!": "妈妈，求你了，我害怕！",
    "Please Miss Giry, I Want To Go Back...": "求你了，吉里小姐，我想回去……",
  },
  "les-souliers-rouges": {
    "Rêve d'opéra": "歌剧之梦",
    "Viens danser": "来跳舞吧",
    "Je tombe amoureux": "我坠入爱河",
    "Je sais": "我知道",
    "Vivre ou ne pas vivre": "活着，还是不活",
  },
  "la-legende-du-roi-arthur": {
    "Quelque chose de magique": "某种魔法",
    "Wake Up": "醒来",
    "Faire comme si": "假装若无其事",
    "Au diable": "见鬼去吧",
    "Je me relève": "我重新站起",
    "Rêver l'impossible": "梦想不可能",
    "A l'enfant": "致孩子",
    "Il est temps": "时候到了",
    "Promis c'est juré": "说定了，我发誓",
    "Tu vas le payer": "你会付出代价",
    "Dors, Morgane dors": "睡吧，摩根，睡吧",
    "Un nouveau départ": "新的开始",
    "Qui suis-je ?": "我是谁？",
    "Qui suis-je?": "我是谁？",
    "A nos voeux sacrés": "致我们的神圣誓言",
    "La Danse des guerriers (Instrumental)": "战士之舞（器乐）",
    "Le Monde est parfait": "世界完美无缺",
    "Le Chant du dragon (Instrumental)": "龙之歌（器乐）",
    "Jeux dangereux (Instrumental)": "危险游戏（器乐）",
    "Il est temps (Version troupe)": "时候到了（全体版）",
    "Tant de haine": "如此多的仇恨",
    "L'Ouverture d'Excalibur (Instrumental)": "王者之剑序曲（器乐）",
  },
  "1789-les-amants-de-la-bastille": {
    "Allez viens (c'est bientôt la fin)": "来吧（结局将近）",
  },
  "cyrano-de-bergerac": {
    "Marchand de rimes": "诗韵商人",
    "Je viens à toi": "我奔向你",
    "Je connais la chanson": "我熟悉这首歌",
  },
  "don-juan": {
    "L'homme qui a tout": "拥有一切的男人",
    "Cœur de pierre": "铁石心肠",
    "Du plaisir": "欢愉",
    "Les amoureux de Séville": "塞维利亚的恋人们",
    "Changer": "改变",
    "Je pense à lui": "我想念他",
    "Seul": "孤独",
    "Tristesa andalucia": "安达卢西亚的悲伤",
    "Don juan est mort": "唐璜死了",
    "On veut de l'amour": "我们渴望爱",
    "L'amour est plus fort": "爱更强大",
  },
  "le-roi-soleil": {
    "Personne n'est personne": "人人皆非无名之辈",
    "Et vice Versailles": "反之亦凡尔赛",
    "Tant qu'on rêve encore": "只要我们仍在梦想",
    "Je fais de toi mon essentiel (Version acoustique)": "你是我的全部（原声版）",
  },
  "les-miserables": {
    "Prologue": "序曲",
    "On Parole/The Bishop": "假释途中／主教",
    "Valjean's Soliloquy": "冉阿让独白",
    "At the End of the Day": "一日将尽",
    "I Dreamed a Dream": "我曾有梦",
    "Lovely Ladies": "可爱的姑娘们",
    "Fantine's Arrest": "芳汀被捕",
    "Runaway Cart": "失控的马车",
    "Who Am I? - The Trial": "我是谁？／审判",
    "Fantine's Death": "芳汀之死",
    "Confrontation": "对峙",
    "Castle on a Cloud": "云端城堡",
    "Master of the House": "酒馆主人",
    "Bargain - Waltz of Treachery": "交易／背叛圆舞曲",
    "Look Down": "低头看",
    "Stars": "繁星",
    "ABC Café/Red and Black": "ABC咖啡馆／红与黑",
    "Rue Plumet - In My Life": "卜吕梅街／在我生命中",
    "Heart Full of Love": "满怀爱意",
    "Attack on Rue Plumet": "卜吕梅街遇袭",
    "One Day More!": "只待明日！",
    "Building the Barricade/On My Own": "筑起街垒／形单影只",
    "Back at the Barricade": "重回街垒",
    "Javert's Arrival/Little People": "沙威到来／小人物",
    "Little Fall of Rain": "一阵小雨",
    "Night of Anguish": "苦痛之夜",
    "First Attack": "第一次进攻",
    "Drink with Me": "与我共饮",
    "Bring Him Home": "带他回家",
    "Second Attack/The Final Battle": "第二次进攻／最终战役",
    "Dog Eats Dog": "弱肉强食",
    "Javert's Suicide": "沙威自尽",
    "Turning": "转过街角",
    "Empty Chairs at Empty Tables": "空桌椅",
    "Every Day/A Heart Full of Love (Reprise)": "每一天／满怀爱意（重唱）",
    "Wedding Chorale/Beggars at the Feast": "婚礼赞歌／宴席上的乞丐",
    "Do You Hear the People Sing?": "听啊，人民在歌唱",
    "Epilogue (Finale)": "尾声（终曲）",
    "Encore: One Day More": "安可：只待明日",
  },
  "romeo-et-juliette": {
    "Ouverture": "序曲",
    "La haine": "仇恨",
    "Un jour": "有一天",
    "Tu dois te marier": "你必须结婚",
    "Les rois du monde": "世界之王",
    "J'ai peur": "我害怕",
    "C'est pas ma faute": "这不是我的错",
    "Le poète": "诗人",
    "Le balcon": "阳台",
    "Les beaux, les laids": "美人与丑人",
    "Et voilà qu'elle aime": "她竟然爱上了",
    "Aimer": "相爱",
    "On dit dans la rue": "街头传言",
    "C'est le jour": "时辰已到",
    "Le duel": "决斗",
    "Mort de Mercutio": "茂丘西奥之死",
    "Le pouvoir": "权力",
    "Duo du désespoir": "绝望二重唱",
    "Demain": "明天",
    "Le poison": "毒药",
    "Comment lui dire": "如何告诉他",
    "La mort de la Juliette": "朱丽叶之死",
    "J'sais plus": "我已不知所措",
    "Les rois du monde (Rappels)": "世界之王（返场）",
  },
};

const SONG_TITLE_OVERRIDES = {
  starmania: {
    "Il Se Passe Quelque Chose à Monopolis": "垄断城出大事了",
  },
};

// Keep published audio paths stable when a source heading is corrected.
const SONG_ID_OVERRIDES = {
  "phantom-of-the-opera": {
    12: "12-all-i-ask-of-you-live",
    13: "13-all-i-ask-of-you-live",
  },
};

const LINE_TEXT_OVERRIDES = {
  "la-legende-du-roi-arthur-01-001": { zh: "我曾看见邪恶的仙女" },
  "la-legende-du-roi-arthur-01-002": { zh: "挡住我的去路" },
  "la-legende-du-roi-arthur-01-003": { zh: "尝过那有毒的滋味", en: "Tasted the toxic effects" },
  "la-legende-du-roi-arthur-01-004": { zh: "来自男人与他们的毒液", en: "Of men and their venom" },
  "la-legende-du-roi-arthur-01-005": { zh: "我逆转风向，倒转时间", en: "I defeated the wind, reversed time" },
  "la-legende-du-roi-arthur-01-007": { zh: "我消灭心魔，直面磨难", en: "Killed my demons, braved the torments" },
  "la-legende-du-roi-arthur-01-011": { zh: "就像一片磁场" },
  "la-legende-du-roi-arthur-01-012": { zh: "无法解释" },
  "la-legende-du-roi-arthur-01-014": { zh: "挑战着一切法则" },
  "la-legende-du-roi-arthur-01-017": { zh: "我看见我们英勇的灵魂" },
  "la-legende-du-roi-arthur-01-029": { zh: "就像一片磁场" },
  "la-legende-du-roi-arthur-01-032": { zh: "挑战着一切法则" },
  "la-legende-du-roi-arthur-01-041": { zh: "就像一片磁场" },
  "la-legende-du-roi-arthur-01-044": { zh: "挑战着一切法则" },
  "la-legende-du-roi-arthur-06-004": { zh: "被缠绵的思绪迷住" },
  "la-legende-du-roi-arthur-06-039": { zh: "你会越来越明白，不必拐弯抹角", en: "You will know more often, without beating around the bush" },
  "la-legende-du-roi-arthur-17-010": { zh: "别怪我" },
  "la-legende-du-roi-arthur-17-011": { zh: "因渴望而越过界限", en: "For desiring to the point of transgression" },
  "starmania-02-001": { zh: "这里是" },
  "starmania-02-002": { zh: "西半球的首都" },
  "starmania-02-003": { zh: "垄断城" },
  "starmania-02-004": { zh: "有事正在发生" },
  "starmania-02-005": { zh: "在垄断城" },
  "starmania-02-006": { zh: "这座从来无事发生的城市" },
  "starmania-02-007": { zh: "人们只会在" },
  "starmania-02-008": { zh: "丢了狗的时候报警" },
  "starmania-02-009": { zh: "有事正在发生" },
  "starmania-02-010": { zh: "在垄断城" },
  "starmania-02-011": { zh: "这座新城" },
  "starmania-02-012": { zh: "这座模范城市" },
  "starmania-02-013": { zh: "有着地下通道" },
  "starmania-02-014": { zh: "和空调" },
  "starmania-02-015": { zh: "还有玻璃大楼" },
  "starmania-02-016": { zh: "过滤着光线" },
  "starmania-02-017": { zh: "郊区则由" },
  "starmania-02-018": { zh: "太阳能供暖" },
  "starmania-02-019": { zh: "那里不再有夏天" },
  "starmania-02-020": { zh: "也不再有冬天" },
  "starmania-02-021": { zh: "有事正在发生" },
  "starmania-02-022": { zh: "在垄断城" },
  "starmania-02-023": { zh: "这座看起来" },
  "starmania-02-024": { zh: "是为人类幸福而建的城市" },
  "starmania-02-025": { zh: "如今也进入了" },
  "starmania-02-026": { zh: "恐怖时刻" },
  "starmania-02-027": { zh: "人们不再独自外出" },
  "starmania-02-028": { zh: "无论在纽约还是罗马" },
  "starmania-02-029": { zh: "当太阳落下" },
  "starmania-02-030": { zh: "整个西方都在恐惧" },
  "starmania-02-031": { zh: "有事正在发生" },
  "starmania-02-032": { zh: "在垄断城" },
  "starmania-02-033": { zh: "有事正在发生" },
  "starmania-02-034": { zh: "在垄断城" },
  "starmania-02-035": { zh: "当太阳落下" },
  "starmania-02-036": { zh: "整个西方都在恐惧" },
};

const MISSING_SOURCE_TRANSLATIONS = {
  "the-greatest-showman": {
    Woah: "呜哦",
  },
};

const SHOW_WORD_OVERRIDES = {
  "notre-dame-de-paris": {
    "porterait-elle": ["会穿着吗", "would it wear", "Porterait-elle", "/pɔʁtəʁɛtɛl/"],
    protégeront: ["将保护", "will protect", "protégeront", "/pʁoteʒʁɔ̃/"],
  },
  "les-miserables-1980": {
    fra: ["会做；将会", "will do", "f'ra", "/fʁa/"],
    fsait: ["做；制造（口语省略）", "did / made", "f'sait", "/fəzɛ/"],
    jmennuie: ["我感到无聊", "I am bored", "j'm'ennuie", "/ʒmɑ̃nɥi/"],
    pauvmonsieur: ["可怜的先生", "poor sir", "Pauv'monsieur", "/pov məsjø/"],
    prouvra: ["将证明", "will prove", "prouv'ra", "/pʁuvʁa/"],
    quce: ["这；那（口语省略）", "this / that", "qu'ce", "/k sə/"],
    quchez: ["在……家；在……那里（口语省略）", "at / in", "qu'chez", "/k ʃe/"],
    qujaffranchisse: ["让我去启蒙；教化", "that I enlighten", "qu'j'affranchisse", "/k ʒafʁɑ̃ʃis/"],
    "qulà-haut": ["在上头；在天上", "up there", "qu'là-haut", "/k la o/"],
    qule: ["这；那；定冠词（口语省略）", "the / that", "qu'le", "/k lə/"],
    rvoir: ["再见到；再看见", "see again", "r'voir", "/ʁəvwaʁ/"],
    "vlà": ["瞧；来了（口语）", "there is / here comes", "v'là", "/vla/"],
    votbon: ["你的善心", "your good heart", "vot'bon", "/vɔ bɔ̃/"],
  },
  "le-roi-soleil": {
    acoustique: ["原声的；不插电的", "acoustic", "acoustique"],
    acoustiques: ["原声的；不插电的", "acoustic", "acoustiques"],
    aeternam: ["永恒的（拉丁语）", "eternal", "aeternam"],
    "anne-laure": ["安娜-洛尔（人名）", "Anne-Laure", "Anne-Laure"],
    "apprends-moi": ["教教我；告诉我", "teach me", "Apprends-moi"],
    aurais: ["本会有；本可以", "would have", "aurais"],
    "aurais-tu": ["你会有吗；你本会……吗", "would you have", "aurais-tu"],
    bengdadadada: ["蹦哒哒哒哒（节奏拟声）", "rhythmic vocalization", "bengdadadada"],
    "blé": ["小麦；麦子", "wheat", "blé", "/ble/"],
    bonus: ["附加的；加收的", "bonus", "bonus"],
    dona: ["赐予（拉丁语）", "grant", "dona"],
    ex: ["从；出自（拉丁语）", "from / out of", "ex"],
    "fait-on": ["人们是否做；是否会", "does one do", "fait-on"],
    feat: ["合作演唱； featuring 的缩写", "featuring", "feat"],
    girbal: ["吉尔巴尔（姓氏）", "Girbal", "Girbal"],
    ha: ["哈；笑声或感叹声", "ha", "ha"],
    hymnus: ["赞美诗（拉丁语）", "hymn", "hymnus"],
    indicible: ["难以言喻的", "indescribable", "indicible"],
    invincible: ["不可战胜的；无敌的", "invincible", "invincible"],
    jaurais: ["我本会有；我本可以", "I would have", "j'aurais"],
    jerusalem: ["耶路撒冷", "Jerusalem", "Jérusalem"],
    luceat: ["愿……照耀（拉丁语）", "may it shine", "luceat"],
    nouvelle: ["新的；新出现的", "new", "nouvelle", "/nuvɛl/"],
    "nœud": ["活结；绞索", "noose; slipknot", "nœud", "/nø/"],
    orationem: ["祈祷（拉丁语）", "prayer", "orationem"],
    oserais: ["敢；会敢", "would dare", "oserais"],
    "oserais-tu": ["你敢吗", "would you dare", "oserais-tu"],
    panurge: ["盲从者；随大流的人", "blind follower", "Panurge"],
    puisquil: ["既然他/它；因为他/它", "since he / it", "puisqu'il"],
    "quavons-nous": ["我们有什么；我们做了什么", "what have we", "qu'avons-nous"],
    repartir: ["重新出发；再次启程", "to set out again", "repartir"],
    requiem: ["安息；安魂曲", "rest / requiem", "requiem"],
    "sécroule": ["倒塌；崩溃", "collapses", "s'écroule"],
    "serai-je": ["我会是……吗", "will I be", "serai-je"],
    sio: ["西奥（姓氏）", "Sio", "Sio"],
    veniet: ["将来到（拉丁语）", "will come", "veniet"],
    versaille: ["凡尔赛", "Versailles", "Versailles"],
    versailles: ["凡尔赛", "Versailles", "Versailles"],
    version: ["版本", "version", "version"],
    versions: ["版本", "versions", "versions"],
    victoria: ["维多利亚（人名）", "Victoria", "Victoria"],
    viendrais: ["会来；本会来", "would come", "viendrais"],
    "viendrais-tu": ["你会来吗", "would you come", "viendrais-tu"],
    "voudrais-tu": ["你愿意吗；你想要吗", "would you like", "voudrais-tu"],
  },
  "tick-tick-boom": {
    "clean-up": ["清理打者；四棒打者", "cleanup batter", "clean-up", "/ˈkliːnʌp/"],
  },
};

const SHOW_LYRIC_CORRECTIONS = {
  "the-greatest-showman": [
    [/^CThink of that your only option$/gu, "Think of that your only option"],
    [/\bI gonna send a flood\b/gu, "I'm gonna send a flood"],
    [/\bnightsky\b/gu, "night sky"],
    [/\ball that you now\b/gu, "all that you know"],
    [/\bWhats waited\b/gu, "What's waited"],
  ],
  "moulin-rouge": [
    [/Dancing and the way we go to/gu, "Dancing, and away we go..."],
    [/The most less lascivious racketeer around/gu, "The most lascivious racketeer around"],
    [/\bchocalata\b/giu, "chocolata"],
  ],
  "wicked": [
    [/^What is it\?\s*:\s*what's wrong\?$/gu, "What is it? What's wrong?"],
  ],
  "elisabeth-das-musical": [
    [/^_Die$/gu, ""],
    [/^_?Wie das$/gu, "Wie das?"],
    [/Ratschl\?gen/gu, "Ratschlägen"],
    [/\?sterreich/gu, "Österreich"],
    [/franz\?sisch/gu, "französisch"],
    [/K\?\s*fig/gu, "Käfig"],
    [/qu\?lt/gu, "quält"],
    [/Sch\?\s*nheit/gu, "Schönheit"],
    [/w\?\s*hrend/gu, "während"],
    [/h\?ren/gu, "hören"],
    [/verh\?\s*hnen/gu, "verhöhnen"],
    [/h\?\s*rt/gu, "hört"],
    [/pers\?\s*nlich/gu, "persönlich"],
    [/Majest\?\s*t/gu, "Majestät"],
    [/f\?\s*llt/gu, "fällt"],
    [/L\?\s*sch/gu, "Lösch"],
    [/geh\?\s*rst/gu, "gehörst"],
    [/geh\?\s*r/gu, "gehör"],
    [/Seht das Mädchen ench an/gu, "Seht das Mädchen euch an"],
    [/La\?\s*mich befreit sein/gu, "Lass mich frei sein"],
    [/\bAnsonstrm\b/gu, "Ansonsten"],
    [/\bavancienrt\b/gu, "avanciert"],
    [/\bbeitmachen\b/gu, "mitmachen"],
    [/\bBetrugerin\b/gu, "Betrügerin"],
    [/\bbloβ\b/gu, "bloß"],
    [/\bBrüden\b/gu, "Brüdern"],
    [/\bdeisem\b/gu, "diesem"],
    [/\bDeutchland\b/gu, "Deutschland"],
    [/\beinzuschliessen\b/gu, "einzuschließen"],
    [/\bElisabet(?:h|rth)?\b/gu, "Elisabeth"],
    [/\berwaten\b/gu, "erwarten"],
    [/\bgehoer\b/gu, "gehör"],
    [/\bgehoerst\b/gu, "gehörst"],
    [/\bgehoert\b/gu, "gehöre"],
    [/\bgeöhr\b/gu, "gehör"],
    [/\bGetu\b/gu, "Getue"],
    [/\bHifle\b/gu, "Hilfe"],
    [/\bHintermännar\b/gu, "Hintermänner"],
    [/\biher\b/gu, "ihrer"],
    [/\bJundenweiber\b/gu, "Judenweiber"],
    [/\bkinderkram\b/gu, "Kinderkram"],
    [/\bkummert\b/gu, "kümmert"],
    [/\blaenger\b/gu, "länger"],
    [/\bLäsung\b/gu, "Lösung"],
    [/\bLieratur\b/gu, "Literatur"],
    [/\blrrenhäuser\b/gu, "Irrenhäuser"],
    [/\bMärch\b/gu, "Märchen"],
    [/\bmeinesdeines\b/gu, "meines"],
    [/\bmur\b/gu, "nur"],
    [/\bparlie\b/gu, "parliert"],
    [/\bperque\b/gu, "perché"],
    [/\bplätzlich\b/gu, "plötzlich"],
    [/\bRoamntico\b/gu, "romantico"],
    [/\bsammeit\b/gu, "sammelt"],
    [/\bSchatzkammerfiel\b/gu, "Schatzkammer fiel"],
    [/\bScheusslich\b/gu, "Scheußlich"],
    [/franz\?\s*sisch/gu, "französisch"],
    [/\bsorechen\b/gu, "sprechen"],
    [/\bSussichten\b/gu, "Aussichten"],
    [/\buntertehn\b/gu, "unterstehn"],
    [/\bUrgarn\b/gu, "Ungarn"],
    [/\bveraendern\b/gu, "verändern"],
    [/\bverruckt\b/gu, "verrückt"],
    [/\bversdteh'n\b/gu, "versteh'n"],
    [/\bWahnsinnein\b/gu, "Wahnsinn ein"],
    [/Elisabrth/gu, "Elisabeth"],
    [/bloβ/gu, "bloß"],
    [/\bLa\?\s*mich/gu, "Lass mich"],
    [/qu\?\s*lt/gu, "quält"],
    [/Ratschl\?\s*gen/gu, "Ratschlägen"],
    [/von\?\s*sterreich/gu, "von Österreich"],
    [/\?\s*sterreich/gu, "Österreich"],
    [/Verla\?\s+die Schatten/gu, "Verlass die Schatten"],
    [/c'é/gu, "c'è"],
    [/\bcosi\b/gu, "così"],
    [/\bQue bel progetto/gu, "Che bel progetto"],
    [/\bgeschen'n\b/gu, "gescheh'n"],
    [/\bretouschier'n\b/gu, "retuschier'n"],
  ],
  "mozart-das-musical": [
    [/\s*【Mozart】\s*/gu, " / "],
    [/【Ich mit dich】/gu, "(Ich mit dir)"],
    [/\)\s*\(/gu, ") / ("],
    [/h\?ren/gu, "hören"],
    [/\bGlaeser\b/gu, "Gläser"],
    [/\bHoeflichkeit\b/gu, "Höflichkeit"],
    [/\bkaem\b/gu, "käme"],
    [/\bbalg ziehn\b/gu, "bald ziehn"],
    [/\bGehalt wir fürstlich\b/gu, "Gehalt wird fürstlich"],
    [/\bkriegem\b/gu, "kriege"],
    [/\bsir fördern\b/gu, "sie fördern"],
    [/\bDarür\b/gu, "Dafür"],
    [/\bFur eine Hausfrau\b/gu, "Für eine Hausfrau"],
    [/\bhoerst\b/gu, "hörst"],
    [/\bwarden der ich bin\b/gu, "werden, der ich bin"],
    [/\bso namlich an\b/gu, "so nämlich an"],
    [/\bEr friss je aus der Hand\b/gu, "Er frisst dir aus der Hand"],
    [/\baufgefordet\b/gu, "aufgefordert"],
    [/\bAusgeloescht\b/gu, "Ausgelöscht"],
    [/\bausgestossnen\b/gu, "ausgestoßenen"],
    [/\bbegeistet\b/gu, "begeistert"],
    [/\bBerzeihn\b/gu, "Verzeih'n"],
    [/\bbetrachen\b/gu, "betrachten"],
    [/\bblod\b/gu, "blöd"],
    [/\bCÄCILLA\b/gu, "CÄCILIA"],
    [/\bEntrґacte\b/gu, "Entr'acte"],
    [/\bEntshuldigen\b/gu, "Entschuldigen"],
    [/\bEumindest\b/gu, "Zumindest"],
    [/\bEweimal\b/gu, "Zweimal"],
    [/\bfaellt\b/gu, "fällt"],
    [/\bfreudliches\b/gu, "freundliches"],
    [/\bFusstritt\b/gu, "Fußtritt"],
    [/\bgefaelligst\b/gu, "gefälligst"],
    [/\bglücklish\b/gu, "glücklich"],
    [/\bHolfkompositeur\b/gu, "Hofkompositeur"],
    [/\bhor\b/gu, "hör"],
    [/\bIetzt\b/gu, "Jetzt"],
    [/\bIhrnach\b/gu, "Ihr nach"],
    [/\bKleidungstück\b/gu, "Kleidungsstück"],
    [/\bKnödeschädel\b/gu, "Knödelschädel"],
    [/\bKoeche\b/gu, "Köche"],
    [/\bKurscher\b/gu, "Kutscher"],
    [/\bMaximillian\b/gu, "Maximilian"],
    [/\bMorgan\b/gu, "Morgen"],
    [/\bSowiel\b/gu, "Soviel"],
    [/\bTraushein\b/gu, "Trauschein"],
    [/\bverhuten\b/gu, "verhüten"],
    [/\bverkümmen\b/gu, "verkümmern"],
    [/\bverschmaeht\b/gu, "verschmäht"],
    [/\bwolt\b/gu, "wollt"],
    [/\bwrid\b/gu, "wird"],
    [/entl\s+a\s+sst/gu, "entlässt"],
    [/\bhoern\b/gu, "hören"],
    [/\bhoert\b/gu, "hört"],
    [/\bJaehzorn\b/gu, "Jähzorn"],
    [/\bwaere\b/gu, "wäre"],
    [/\bdam Grafen\b/gu, "dem Grafen"],
    [/\bDamon\b/gu, "Dämon"],
    [/\bEcoutez\b/gu, "Écoutez"],
    [/\bmein'arme Weib\b/gu, "mein armes Weib"],
    [/\bMeissner\b/gu, "Meißner"],
    [/\bverzirh'n\b/gu, "verzier'n"],
    [/\bwurd ich danach gehn\b/gu, "würd ich danach geh'n"],
  ],
  starmania: [
    [/qu'on gratigne/gu, "qu'on égratigne"],
    [/\bdécus\b/gu, "déçus"],
    [/\brienJ'ai\b/gu, "rien. J'ai"],
    [/\bcontrole\b/gu, "contrôle"],
    [/\bimposеrons\b/gu, "imposerons"],
    [/nе/gu, "ne"],
    [/\beuxIls\b/gu, "eux. Ils"],
    [/\bcomplex Zéro\b/gu, "complexe Zéro"],
    [/\blassive\b/gu, "lascive"],
    [/\bChapplin\b/gu, "Chaplin"],
    [/\bgarcons\b/gu, "garçons"],
    [/\bgarcon\b/gu, "garçon"],
    [/\bje said\b/giu, "je sais"],
    [/\bsix Symbol\b/giu, "sex-symbol"],
    [/cafe/gu, "café"],
    [/cinemas/gu, "cinémas"],
    [/Conference/gu, "Conférence"],
    [/debat/gu, "débat"],
    [/detresse/gu, "détresse"],
    [/Etes-vous/gu, "Êtes-vous"],
    [/Etoiles/gu, "Étoiles"],
    [/Evangeliste/gu, "Évangéliste"],
    [/l'evangeliste/gu, "l'évangéliste"],
    [/telegramme/gu, "télégramme"],
    [/televise/gu, "télévisé"],
  ],
  "phantom-of-the-opera": [
    [/a great black hole served as the nose/giu, "A great black hole serves as the nose"],
    [/Shoot the shoots/gu, "Shoot the chutes"],
    [/\bbeated\b/gu, "beaten"],
    [/boss'whim/gu, "boss's whim"],
    [/\bCalet\b/gu, "Calais"],
    [/\bcollonades\b/gu, "colonnades"],
    [/\bgotWhat\b/gu, "got. What"],
    [/\bgreedious\b/gu, "greedy"],
    [/\bIcaressed\b/gu, "I caressed"],
    [/\bIunatic\b/gu, "lunatic"],
    [/Lady'sheart/gu, "Lady's heart"],
    [/\bloathesome\b/gu, "loathsome"],
    [/\bmeanians\b/gu, "menials"],
    [/\bmonsie ur\b/giu, "Monsieur"],
    [/\bmonsie\b/gu, "Monsieur"],
    [/\bmonsieurs\b/gu, "messieurs"],
    [/\bSwiring\b/gu, "Swirling"],
    [/\bthrought\b/gu, "through"],
    [/\bungreatful\b/gu, "ungrateful"],
    [/\bvipler\b/gu, "viper"],
    [/\bguida nce\b/giu, "guidance"],
  ],
  "les-souliers-rouges": [
    [/Les muscles brulées/gu, "Les muscles brûlés"],
    [/^éternelle audition$/gu, "Éternelle audition"],
    [/^A bout/gu, "À bout"],
    [/Je ne vous connaissait pas/gu, "Je ne vous connaissais pas"],
  ],
  "la-legende-du-roi-arthur": [
    [/conna\?tre/gu, "connaître"],
    [/conna\? tre/gu, "connaître"],
    [/conna tre/gu, "connaître"],
    [/^J'ai dé fait le vent inversé le temps$/gu, "J'ai défait le vent, inversé le temps"],
    [/^Tué mes dé mons bravé les tourments$/gu, "Tué mes démons, bravé les tourments"],
    [/Des hommes et leurs venins/gu, "Des hommes et leur venin"],
    [/Go té/gu, "Goûté"],
    [/fé es malé fiques/gu, "fées maléfiques"],
    [/\bdé fait\b/gu, "défait"],
    [/\bdé mons\b/gu, "démons"],
    [/\bmagné tique\b/gu, "magnétique"],
    [/\bdé fie\b/gu, "défie"],
    [/é soté rique/gu, "ésotérique"],
    [/dé fié/gu, "défié"],
    [/d'é bats/gu, "d'ébats"],
    [/\bEnsorcelé e\b/gu, "Ensorcelée"],
    [/\bpensé es\b/gu, "pensées"],
    [/Emmè ne/gu, "Emmène"],
    [/possé der/gu, "posséder"],
    [/dé sirer/gu, "désirer"],
    [/\bdé tour\b/gu, "détour"],
    [/\bdé lit\b/gu, "délit"],
    [/océ an/gu, "océan"],
    [/\bames\b/gu, "âmes"],
    [/\bame\b/gu, "âme"],
    [/gouté/gu, "goûté"],
    [/\bentraine\b/gu, "entraîne"],
    [/au delà-des/gu, "au-delà des"],
    [/au delà/gu, "au-delà"],
    [/\bFautil\b/gu, "Faut-il"],
    [/frolé/gu, "frôlé"],
    [/\brennaïtre\b/gu, "renaître"],
    [/\bpévenir\b/gu, "prévenir"],
    [/\bsourir\b/gu, "sourire"],
    [/\bchateau\b/gu, "château"],
    [/\bBati\b/gu, "Bâti"],
    [/\bsurcroit\b/gu, "surcroît"],
    [/\bEcrire\b/gu, "Écrire"],
    [/\bbalancais\b/gu, "balançais"],
    [/\bD'avalon\b/gu, "d'Avalon"],
    [/\bd'Huther\b/gu, "d'Uther"],
    [/\bRoi Hutère\b/gu, "Roi Uther"],
    [/^\]Dam/gu, "Dam"],
    [/Ce qu'il n'aurait jamais du/gu, "Ce qu'il n'aurait jamais dû"],
    [/Perdu le trone qui m'était du/gu, "Perdu le trône qui m'était dû"],
    [/Cette fois, c'est sur/gu, "Cette fois, c'est sûr"],
  ],
  "notre-dame-de-paris": [
    [/fian\?\s*ailles/gu, "fiançailles"],
    [/pa\?\s*enne/gu, "païenne"],
    [/pa\?\s*ens/gu, "païens"],
    [/\bBoussu\b/gu, "Bossu"],
    [/\bPheobus\b/gu, "Phoebus"],
    [/\bLaiss'moi\b/gu, "Laisse-moi"],
    [/\bVoila\b/gu, "Voilà"],
  ],
  "mozart-opera-rock": [
    [/fl\?\s*te/gu, "flûte"],
  ],
  "romeo-et-juliette": [
    [/c\?\s*ur/gu, "cœur"],
    [/\bMecrutio\b/gu, "Mercutio"],
    [/\bC'nest\b/gu, "Ce n'est"],
    [/M'a-t'il/gu, "M'a-t-il"],
  ],
  "1789-les-amants-de-la-bastille": [
    [/conna\?\s*t/gu, "connaît"],
    [/c\?\s*ur/gu, "cœur"],
    [/çauchemard/giu, "cauchemar"],
    [/D'avair/gu, "D'avoir"],
    [/d'um corps/gu, "d'un corps"],
    [/\bPourqoui\b/gu, "Pourquoi"],
    [/\bEr de l'Autriche\b/gu, "Et de l'Autriche"],
    [/\bFl mèneta les tiens\b/gu, "Il mènera les tiens"],
    [/\bJu vois la vertu\b/gu, "Tu vois la vertu"],
    [/\bVtiles\b/gu, "Utiles"],
    [/\bEnter nos mains\b/gu, "Entre nos mains"],
  ],
  "cyrano-de-bergerac": [
    [/\bChang'ment\b/gu, "Changement"],
  ],
};

const COMMON_FRENCH = {
  "molière": ["莫里哀", "Molière", "Molière"],
  a: ["有；已经", "has / have", "a"],
  "à": ["向；在；到", "to / at", "à", "/a/"],
  au: ["向……；在……；给……", "to the / at the", "au"],
  aux: ["向……；在……；给……", "to the / at the", "aux"],
  avec: ["和；带着；用", "with", "avec"],
  avoir: ["有；拥有；经历", "to have", "avoir"],
  beau: ["美的；漂亮的；美好", "beautiful / fine", "beau"],
  belle: ["美丽的；漂亮的", "beautiful", "belle"],
  bien: ["好；确实；很", "well / good", "bien"],
  bon: ["好的；善良的；可口的", "good", "bon"],
  car: ["因为", "because", "car"],
  ce: ["这；那；这个", "this / that", "ce"],
  ces: ["这些；那些", "these / those", "ces"],
  cet: ["这个；那个", "this / that", "cet"],
  cette: ["这个；那个", "this / that", "cette"],
  chaque: ["每个；每一", "each / every", "chaque"],
  comme: ["像；如同；作为", "like / as", "comme"],
  comment: ["如何；怎么", "how", "comment"],
  dans: ["在……里；进入", "in / into", "dans"],
  de: ["的；从；由", "of / from", "de"],
  des: ["一些；……的；从这些", "some / of the", "des"],
  deux: ["二；两个", "two", "deux"],
  doit: ["必须；应该", "must / has to", "doit"],
  donc: ["所以；那么", "so / therefore", "donc"],
  du: ["……的；一些；从……", "of the / some", "du"],
  elle: ["她；它", "she / it", "elle"],
  elles: ["她们；它们", "they", "elles"],
  en: ["在……中；对此；以……", "in / of it", "en"],
  encore: ["再次；仍然；还", "again / still", "encore"],
  enfin: ["终于；总算", "finally / at last", "enfin"],
  entre: ["在……之间；进入", "between / among / enters", "entre"],
  est: ["是；位于", "is", "est"],
  et: ["和；并且", "and", "et"],
  être: ["是；存在；成为", "to be", "être"],
  fait: ["做；使；事实", "does / makes / fact", "fait"],
  femme: ["女人；妻子", "woman / wife", "femme"],
  femmes: ["女人们；妻子们", "women / wives", "femmes"],
  homme: ["男人；人", "man / human being", "homme"],
  hommes: ["男人们；人们", "men / human beings", "hommes"],
  il: ["他；它", "he / it", "il"],
  ils: ["他们；它们", "they", "ils"],
  je: ["我", "I", "je"],
  jour: ["日子；一天；白昼", "day", "jour"],
  la: ["这；那；她；阴性定冠词", "the / her", "la"],
  le: ["这；那；他；阳性定冠词", "the / him", "le"],
  les: ["这些；那些；定冠词复数", "the", "les"],
  leur: ["他们的；给他们", "their / to them", "leur"],
  leurs: ["他们的；她们的", "their", "leurs"],
  lui: ["他；她；给他/她", "him / her / to him", "lui"],
  ma: ["我的", "my", "ma"],
  mais: ["但是", "but", "mais"],
  me: ["我；给我；使我", "me", "me"],
  mes: ["我的", "my", "mes"],
  moi: ["我；我自己", "me / myself", "moi"],
  mon: ["我的", "my", "mon"],
  monde: ["世界；世人", "world / people", "monde"],
  ne: ["不；否定结构的一部分", "not", "ne"],
  nos: ["我们的", "our", "nos"],
  notre: ["我们的", "our", "notre"],
  nous: ["我们", "we / us", "nous"],
  nuit: ["夜晚", "night", "nuit"],
  on: ["人们；我们；有人", "one / people / we", "on"],
  ont: ["有；已经", "have", "ont"],
  ou: ["或者", "or", "ou"],
  "où": ["哪里；在……的地方", "where", "où"],
  oui: ["是；愿意；同意", "yes", "oui"],
  par: ["被；通过；由；每", "by / through", "par"],
  pas: ["不；不是；脚步", "not / step", "pas"],
  plus: ["更多；更；不再", "more / no longer", "plus"],
  pour: ["为了；给；对于", "for / in order to", "pour"],
  pourquoi: ["为什么", "why", "pourquoi"],
  quand: ["当……时候；什么时候", "when", "quand"],
  que: ["那；什么；引导从句", "that / what", "que"],
  quel: ["什么；哪一个；多么", "what / which", "quel"],
  quelle: ["什么；哪一个；多么", "what / which", "quelle"],
  qui: ["谁；引导从句", "who / that", "qui"],
  rien: ["什么也没有；无事", "nothing", "rien"],
  sa: ["他/她的", "his / her", "sa"],
  sans: ["没有；不带", "without", "sans"],
  se: ["自己；相互", "oneself", "se"],
  ses: ["他/她的；其", "his / her", "ses"],
  si: ["如果；如此；是的", "if / so / yes", "si"],
  son: ["他/她/一个人的", "his / her / one's", "son"],
  sont: ["是；处于", "are", "sont"],
  sous: ["在……之下", "under", "sous"],
  sur: ["在……上；关于", "on / upon", "sur"],
  ta: ["你的", "your", "ta"],
  tant: ["如此多；这么", "so much / so many", "tant"],
  te: ["你；给你", "you", "te"],
  tes: ["你的", "your", "tes"],
  toi: ["你；你自己", "you / yourself", "toi"],
  ton: ["你的", "your", "ton"],
  tous: ["所有；全部", "all", "tous"],
  tout: ["全部；一切", "all / everything", "tout"],
  toute: ["全部的；整个的", "all / whole", "toute"],
  toutes: ["所有；全部", "all", "toutes"],
  très: ["很；非常", "very", "très"],
  tu: ["你", "you", "tu"],
  un: ["一个；一位", "a / one", "un"],
  une: ["一个；一位", "a / one", "une"],
  va: ["去；走向；将要", "goes / is going to", "va"],
  vers: ["朝向；向", "toward", "vers"],
  vie: ["生命；生活", "life", "vie"],
  vient: ["来到；来自", "comes", "vient"],
  voir: ["看见；理解", "to see", "voir"],
  vois: ["看见；明白", "see", "vois"],
  vont: ["去；将要", "go / are going", "vont"],
  votre: ["你们的；您的", "your", "votre"],
  vous: ["你；你们；您", "you", "vous"],
};

const COMMON_GERMAN = {
  aber: ["但是", "but", "aber"],
  alle: ["所有人；全部", "all / everyone", "alle"],
  als: ["作为；当……时；比", "as / when / than", "als"],
  auch: ["也；还", "also / too", "auch"],
  auf: ["在……上；向上", "on / upon", "auf"],
  aus: ["从……出来；来自", "out of / from", "aus"],
  bei: ["在……旁；在……那里", "at / with", "bei"],
  bin: ["是", "am", "bin"],
  bist: ["是", "are", "bist"],
  da: ["那里；因为", "there / since", "da"],
  das: ["这；那个；定冠词", "that / the", "das"],
  dass: ["……这一事实；引导从句", "that", "dass"],
  dein: ["你的", "your", "dein"],
  deine: ["你的", "your", "deine"],
  dem: ["这个；那个；定冠词第三格", "the / that", "dem"],
  den: ["这个；那个；定冠词", "the", "den"],
  denn: ["因为；那么", "because / then", "denn"],
  der: ["这；那；定冠词", "the / that", "der"],
  des: ["……的；定冠词第二格", "of the", "des"],
  dich: ["你", "you", "dich"],
  die: ["这；那；定冠词", "the", "die"],
  dir: ["给你；对你", "to you", "dir"],
  doch: ["可是；毕竟；确实", "yet / after all", "doch"],
  du: ["你", "you", "du"],
  ein: ["一个", "a / one", "ein"],
  eine: ["一个", "a / one", "eine"],
  einen: ["一个", "a / one", "einen"],
  einer: ["一个；某人", "one / someone", "einer"],
  er: ["他", "he", "er"],
  es: ["它；这", "it", "es"],
  für: ["为了；给", "for", "für"],
  haben: ["有；拥有", "to have", "haben"],
  hat: ["有", "has", "hat"],
  ich: ["我", "I", "ich"],
  ihr: ["她；她的；你们", "her / you", "ihr"],
  im: ["在……里面", "in the", "im"],
  in: ["在……里；进入", "in / into", "in"],
  ist: ["是", "is", "ist"],
  kein: ["没有；不是任何", "no / not any", "kein"],
  keine: ["没有；不是任何", "no / not any", "keine"],
  man: ["人们；有人", "one / people", "man"],
  mein: ["我的", "my", "mein"],
  meine: ["我的", "my", "meine"],
  mich: ["我", "me", "mich"],
  mit: ["和；带着；用", "with", "mit"],
  muss: ["必须", "must", "muss"],
  nicht: ["不；没有", "not", "nicht"],
  nichts: ["什么也没有", "nothing", "nichts"],
  noch: ["还；仍然；再", "still / yet", "noch"],
  nur: ["只；仅仅", "only", "nur"],
  oder: ["或者", "or", "oder"],
  ohne: ["没有；不带", "without", "ohne"],
  schon: ["已经；确实", "already / indeed", "schon"],
  sein: ["是；他的", "to be / his", "sein"],
  sie: ["她；他们；您", "she / they / you", "sie"],
  sind: ["是", "are", "sind"],
  so: ["这样；如此", "so / like this", "so"],
  über: ["在……上方；关于", "over / about", "über"],
  um: ["围绕；为了", "around / in order to", "um"],
  und: ["和；并且", "and", "und"],
  uns: ["我们", "us", "uns"],
  unser: ["我们的", "our", "unser"],
  von: ["从；属于", "from / of", "von"],
  vor: ["在……前；以前", "before / in front of", "vor"],
  war: ["曾是", "was", "war"],
  was: ["什么；……的事", "what", "was"],
  weil: ["因为", "because", "weil"],
  wenn: ["如果；当……时", "if / when", "wenn"],
  wer: ["谁", "who", "wer"],
  wie: ["如何；像；多么", "how / like", "wie"],
  wir: ["我们", "we", "wir"],
  wird: ["将会；变成", "will / becomes", "wird"],
  wo: ["哪里", "where", "wo"],
  zu: ["向；到；太；去做", "to / too", "zu"],
  zum: ["向这个；为了", "to the / for", "zum"],
  zur: ["向这个；为了", "to the / for", "zur"],
};

Object.assign(COMMON_FRENCH, {
  âme: ["灵魂", "soul", "âme"],
  âmes: ["灵魂", "souls", "âmes"],
  amour: ["爱；爱情", "love", "amour"],
  amours: ["爱情；恋情", "loves", "amours"],
  ange: ["天使", "angel", "ange"],
  anges: ["天使", "angels", "anges"],
  avenir: ["未来", "future", "avenir"],
  beauté: ["美；美丽", "beauty", "beauté"],
  bonheur: ["幸福；快乐", "happiness", "bonheur"],
  chanson: ["歌曲；歌", "song", "chanson"],
  chansons: ["歌曲", "songs", "chansons"],
  chant: ["歌声；歌唱", "song / singing", "chant"],
  chemin: ["道路；路径", "path / road", "chemin"],
  ciel: ["天空；天堂", "sky / heaven", "ciel"],
  corps: ["身体", "body", "corps"],
  cœur: ["心；内心", "heart", "cœur"],
  coeur: ["心；内心", "heart", "cœur"],
  cœurs: ["心；内心", "hearts", "cœurs"],
  coeurs: ["心；内心", "hearts", "cœurs"],
  désir: ["欲望；渴望", "desire", "désir"],
  désire: ["渴望；想要", "desires / wants", "désire"],
  désirée: ["被渴望的；想要的", "desired / wanted", "désirée"],
  désirent: ["渴望；想要", "desire / want", "désirent"],
  désirer: ["渴望；想要", "to desire / to want", "désirer"],
  désirs: ["欲望；渴望", "desires", "désirs"],
  desir: ["欲望；渴望", "desire", "désir"],
  desire: ["渴望；想要", "desires / wants", "désire"],
  desiree: ["被渴望的；想要的", "desired / wanted", "désirée"],
  desirent: ["渴望；想要", "desire / want", "désirent"],
  desirer: ["渴望；想要", "to desire / to want", "désirer"],
  desirs: ["欲望；渴望", "desires", "désirs"],
  d: ["字母 D；歌词音节", "letter D / lyric syllable", "D"],
  dieu: ["上帝；神", "God / god", "Dieu"],
  douleur: ["痛苦；疼痛", "pain", "douleur"],
  douleurs: ["痛苦；疼痛", "pains", "douleurs"],
  enfant: ["孩子", "child", "enfant"],
  enfants: ["孩子们", "children", "enfants"],
  envie: ["欲望；愿望；羡慕", "desire / wish / envy", "envie"],
  envies: ["欲望；愿望", "desires / wishes", "envies"],
  espoir: ["希望", "hope", "espoir"],
  étoile: ["星星；明星", "star", "étoile"],
  étoiles: ["星星", "stars", "étoiles"],
  feu: ["火；火焰", "fire", "feu"],
  fille: ["女孩；女儿", "girl / daughter", "fille"],
  filles: ["女孩们；女儿们", "girls / daughters", "filles"],
  fils: ["儿子", "son", "fils"],
  fleur: ["花", "flower", "fleur"],
  fleurs: ["花", "flowers", "fleurs"],
  folie: ["疯狂", "madness", "folie"],
  frère: ["兄弟", "brother", "frère"],
  frères: ["兄弟们", "brothers", "frères"],
  histoire: ["故事；历史", "story / history", "histoire"],
  histoires: ["故事；历史", "stories / histories", "histoires"],
  joie: ["喜悦；快乐", "joy", "joie"],
  larme: ["眼泪", "tear", "larme"],
  larmes: ["眼泪", "tears", "larmes"],
  liberté: ["自由", "freedom", "liberté"],
  lumière: ["光；光明", "light", "lumière"],
  lumières: ["光；灯光", "lights", "lumières"],
  lune: ["月亮", "moon", "lune"],
  main: ["手", "hand", "main"],
  mains: ["手", "hands", "mains"],
  mal: ["痛苦；恶；坏", "pain / evil", "mal"],
  mère: ["母亲", "mother", "mère"],
  moment: ["时刻；片刻", "moment", "moment"],
  mort: ["死亡；死神", "death", "mort"],
  morts: ["死者；死亡", "dead / deaths", "morts"],
  mot: ["词；话语", "word", "mot"],
  mots: ["词语；话语", "words", "mots"],
  nom: ["名字", "name", "nom"],
  ombre: ["影子；阴影", "shadow", "ombre"],
  ombres: ["影子；阴影", "shadows", "ombres"],
  passé: ["过去", "past", "passé"],
  père: ["父亲", "father", "père"],
  peur: ["恐惧；害怕", "fear", "peur"],
  plaisir: ["快乐；愉悦", "pleasure", "plaisir"],
  plaisirs: ["快乐；愉悦", "pleasures", "plaisirs"],
  porte: ["门", "door / gate", "porte"],
  portes: ["门", "doors / gates", "portes"],
  prière: ["祈祷；祷告", "prayer", "prière"],
  prières: ["祈祷；祷告", "prayers", "prières"],
  raison: ["理性；理由", "reason", "raison"],
  regard: ["目光；眼神", "look / gaze", "regard"],
  rêve: ["梦；梦想", "dream", "rêve"],
  rêves: ["梦；梦想", "dreams", "rêves"],
  r: ["字母 R；歌词音节", "letter R / lyric syllable", "R"],
  roi: ["国王", "king", "roi"],
  sang: ["血；血液", "blood", "sang"],
  secret: ["秘密", "secret", "secret"],
  sœur: ["姐妹；妹妹/姐姐", "sister", "sœur"],
  soeur: ["姐妹；妹妹/姐姐", "sister", "sœur"],
  soleil: ["太阳", "sun", "soleil"],
  terre: ["土地；大地；地球", "earth / land", "terre"],
  tête: ["头；脑袋", "head", "tête"],
  tour: ["塔；轮次；转弯", "tower / turn", "tour"],
  tours: ["塔；轮次；转弯", "towers / turns", "tours"],
  ville: ["城市", "city", "ville"],
  voix: ["声音；嗓音", "voice", "voix"],
  x: ["字母 X；歌词音节", "letter X / lyric syllable", "X"],
  yeux: ["眼睛", "eyes", "yeux"],
});

Object.assign(COMMON_FRENCH, {
  "a-t-il": ["他/它有吗；是否", "has he / does it", "a-t-il"],
  abandonn: ["被抛弃的；遗弃", "abandoned", "abandonné"],
  abri: ["庇护；避难处", "shelter", "abri"],
  accourt: ["跑来；赶来", "runs up", "accourt"],
  accusée: ["被控告的；被指责的", "accused", "accusée"],
  adore: ["热爱；崇拜", "adores / loves", "adore"],
  ai: ["有；已经（avoir 第一人称）", "have", "ai"],
  aiguille: ["针；指针", "needle / hand", "aiguille"],
  ailles: ["去（aller 虚拟式）", "go", "ailles"],
  aim: ["爱；喜欢", "love / like", "aimer"],
  aimait: ["爱；喜欢", "loved / liked", "aimait"],
  aimante: ["有爱意的；慈爱的", "loving", "aimante"],
  aime: ["爱；喜欢", "love / like", "aime"],
  aimé: ["被爱的；爱过", "loved", "aimé"],
  alentours: ["周围；附近", "surroundings", "alentours"],
  alléluia: ["哈利路亚", "hallelujah", "alléluia"],
  alléluias: ["哈利路亚", "hallelujahs", "alléluias"],
  allure: ["姿态；样子；步态", "appearance / gait", "allure"],
  amantes: ["情人；恋人", "lovers", "amantes"],
  amants: ["情人；恋人", "lovers", "amants"],
  amies: ["朋友", "friends", "amies"],
  amoureux: ["相爱的；恋人", "in love / lover", "amoureux"],
  anathème: ["诅咒；谴责", "curse / anathema", "anathème"],
  années: ["年份；岁月", "years", "années"],
  anonymes: ["匿名的；无名的", "anonymous", "anonymes"],
  ans: ["年；岁", "years old / years", "ans"],
  apparaître: ["出现；显现", "to appear", "apparaître"],
  appelle: ["叫；呼唤", "calls", "appelle"],
  arbre: ["树", "tree", "arbre"],
  archers: ["弓箭手", "archers", "archers"],
  armure: ["盔甲", "armor", "armure"],
  arrêter: ["停止；逮捕", "to stop / to arrest", "arrêter"],
  arriver: ["到达；发生", "to arrive / happen", "arriver"],
  arrives: ["到达；发生", "arrive / happen", "arrives"],
  artistes: ["艺术家；艺人", "artists", "artistes"],
  as: ["有（avoir 第二人称）", "have", "as"],
  astre: ["星体；天体", "star / heavenly body", "astre"],
  atours: ["装饰；盛装", "finery", "atours"],
  attend: ["等待；期待", "waits / expects", "attend"],
  aucun: ["没有任何；无一", "no / none", "aucun"],
  aura: ["将有；光环", "will have / aura", "aura"],
  auras: ["你将有", "will have", "auras"],
  auront: ["他们将有", "will have", "auront"],
  avais: ["曾有；曾经", "had", "avais"],
  avait: ["曾有；曾经", "had", "avait"],
  bal: ["舞会", "ball / dance", "bal"],
  barreaux: ["栏杆；铁窗", "bars", "barreaux"],
  bataille: ["战斗；斗争", "battle", "bataille"],
  beaux: ["美丽的；漂亮的", "beautiful", "beaux"],
  blessures: ["伤口；伤痛", "wounds", "blessures"],
  blanche: ["白色的", "white", "blanche"],
  blâme: ["责备；谴责", "blame", "blâme"],
  bleu: ["蓝色的；蓝色", "blue", "bleu"],
  boire: ["喝", "to drink", "boire"],
  bouche: ["嘴", "mouth", "bouche"],
  brillent: ["闪耀；发亮", "shine", "brillent"],
  briser: ["打破；粉碎", "to break", "briser"],
  c: ["这；那（ce 的省略）", "it / this", "c'"],
  ca: ["这；那", "this / that", "ça"],
  cache: ["隐藏；藏住", "hides", "cache"],
  cage: ["笼子", "cage", "cage"],
  celles: ["那些；那些人/物", "those", "celles"],
  cent: ["一百", "hundred", "cent"],
  cesse: ["停止", "stops / ceases", "cesse"],
  changer: ["改变", "to change", "changer"],
  chanter: ["唱歌", "to sing", "chanter"],
  chants: ["歌声；圣歌", "songs / chants", "chants"],
  chaud: ["热的；温暖的", "hot / warm", "chaud"],
  chemins: ["道路；路径", "paths / roads", "chemins"],
  cherche: ["寻找；追求", "seeks / looks for", "cherche"],
  chercher: ["寻找；追求", "to seek / look for", "chercher"],
  chez: ["在……家；在……那里", "at the home of / among", "chez"],
  chien: ["狗", "dog", "chien"],
  cieux: ["天空；天堂", "heavens", "cieux"],
  citoyens: ["公民", "citizens", "citoyens"],
  combats: ["战斗；斗争", "fights / battles", "combats"],
  comprends: ["理解；明白", "understand", "comprends"],
  connais: ["认识；知道", "know", "connais"],
  condamné: ["被判罪的；被谴责的", "condemned", "condamné"],
  condamne: ["谴责；判罪", "condemns", "condamne"],
  coule: ["流动；流逝", "flows", "coule"],
  cour: ["宫廷；院子", "court / courtyard", "cour"],
  cours: ["课程；过程；河道", "course / class", "cours"],
  couronne: ["王冠；加冕", "crown", "couronne"],
  cri: ["喊声；呼喊", "cry / shout", "cri"],
  crime: ["罪行", "crime", "crime"],
  crimes: ["罪行", "crimes", "crimes"],
  cris: ["喊声；呼喊", "cries / shouts", "cris"],
  cru: ["相信过；以为", "believed", "cru"],
  danse: ["舞蹈；跳舞", "dance", "danse"],
  danser: ["跳舞", "to dance", "danser"],
  debout: ["站着；起来", "standing / up", "debout"],
  défaites: ["失败；败仗", "defeats", "défaites"],
  depuis: ["自从；以来", "since / for", "depuis"],
  dessus: ["在上面；上方", "above / on top", "dessus"],
  devenir: ["成为", "to become", "devenir"],
  devant: ["在……前面；面对", "in front of / before", "devant"],
  déteste: ["讨厌；憎恨", "hates", "déteste"],
  doigts: ["手指", "fingers", "doigts"],
  dieux: ["众神", "gods", "dieux"],
  différences: ["差异；不同", "differences", "différences"],
  diras: ["你将说", "will say", "diras"],
  discours: ["演说；话语", "speech / discourse", "discours"],
  dois: ["必须；欠", "must / owe", "dois"],
  donne: ["给；赋予", "gives", "donne"],
  donné: ["给过的；被给予的", "given", "donné"],
  donnent: ["给；赋予", "give", "donnent"],
  droits: ["权利；正直的", "rights / straight", "droits"],
  enfance: ["童年", "childhood", "enfance"],
  entier: ["整个的；完整的", "whole / entire", "entier"],
  erreurs: ["错误", "errors", "erreurs"],
  été: ["夏天；曾经是", "summer / been", "été"],
  était: ["曾是；当时是", "was", "était"],
  étrange: ["奇怪的；陌生的", "strange", "étrange"],
  facile: ["容易的", "easy", "facile"],
  façon: ["方式；方法", "way / manner", "façon"],
  fer: ["铁", "iron", "fer"],
  ferai: ["我将做", "will do / make", "ferai"],
  fête: ["节日；庆典", "party / feast", "fête"],
  fil: ["线；丝线", "thread", "fil"],
  finit: ["结束；完成", "finishes / ends", "finit"],
  fois: ["次；回", "time / times", "fois"],
  force: ["力量；强迫", "strength / force", "force"],
  fout: ["搞砸；粗俗语", "damn / messes with", "fout"],
  fous: ["疯狂的；疯子", "mad / fools", "fous"],
  fragile: ["脆弱的", "fragile", "fragile"],
  gammes: ["音阶；练习曲", "scales", "gammes"],
  garde: ["守卫；保留", "keeps / guard", "garde"],
  grand: ["大的；伟大的", "great / big", "grand"],
  grande: ["大的；伟大的", "great / big", "grande"],
  grandes: ["大的；伟大的", "great / big", "grandes"],
  grandir: ["成长；变大", "to grow", "grandir"],
  grandi: ["成长了；长大了", "grown", "grandi"],
  grands: ["大的；伟大的", "great / big", "grands"],
  hais: ["憎恨", "hate", "hais"],
  heureux: ["幸福的；快乐的", "happy", "heureux"],
  ici: ["这里", "here", "ici"],
  idées: ["想法；主意", "ideas", "idées"],
  image: ["图像；形象", "image", "image"],
  jeux: ["游戏；玩笑", "games", "jeux"],
  jours: ["日子；白天", "days", "jours"],
  juré: ["发誓的；陪审员", "sworn / juror", "juré"],
  justice: ["正义；司法", "justice", "justice"],
  laissé: ["留下；让", "left / let", "laissé"],
  langue: ["语言；舌头", "language / tongue", "langue"],
  lève: ["升起；举起", "raises / rises", "lève"],
  libre: ["自由的", "free", "libre"],
  lignes: ["线；行", "lines", "lignes"],
  longtemps: ["长久地；很久", "for a long time", "longtemps"],
  mâle: ["男性；雄性的", "male", "mâle"],
  malheureux: ["不幸的；悲伤的", "unhappy / unfortunate", "malheureux"],
  marche: ["走；行进；台阶", "walk / march / step", "marche"],
  maris: ["丈夫", "husbands", "maris"],
  mémoire: ["记忆；记忆力", "memory", "mémoire"],
  mensonge: ["谎言", "lie", "mensonge"],
  mer: ["海", "sea", "mer"],
  mêmes: ["相同的；自己", "same / selves", "mêmes"],
  mets: ["放；摆；菜肴", "put / dish", "mets"],
  mieux: ["更好；最好", "better", "mieux"],
  milieu: ["中间；环境", "middle / milieu", "milieu"],
  mirage: ["海市蜃楼；幻象", "mirage", "mirage"],
  misères: ["苦难；贫困", "miseries", "misères"],
  moi: ["我；我自己", "me / myself", "moi"],
  moitié: ["一半", "half", "moitié"],
  mur: ["墙", "wall", "mur"],
  murs: ["墙", "walls", "murs"],
  musique: ["音乐", "music", "musique"],
  n: ["不（ne 的省略）", "not", "n'"],
  nature: ["自然；本性", "nature", "nature"],
  ni: ["也不；既不", "nor / neither", "ni"],
  nuits: ["夜晚", "nights", "nuits"],
  ouvert: ["打开的；开放的", "open", "ouvert"],
  pages: ["页；页面", "pages", "pages"],
  pareil: ["相同的；一样的", "same / alike", "pareil"],
  parvis: ["教堂前广场", "forecourt", "parvis"],
  pardonne: ["原谅", "forgives", "pardonne"],
  passage: ["通道；经过；段落", "passage", "passage"],
  passe: ["经过；过去；发生", "passes / goes by", "passe"],
  pensées: ["思想；想法", "thoughts", "pensées"],
  pensent: ["认为；思考", "think", "pensent"],
  perds: ["失去；迷失", "lose", "perds"],
  permis: ["允许的；许可证", "allowed / permit", "permis"],
  personne: ["人；没有人", "person / nobody", "personne"],
  peut: ["能够；可能", "can / may", "peut"],
  pied: ["脚；底部", "foot", "pied"],
  pleurs: ["哭泣；眼泪", "weeping / tears", "pleurs"],
  pluie: ["雨", "rain", "pluie"],
  poids: ["重量；负担", "weight", "poids"],
  poser: ["放下；提出", "to place / ask", "poser"],
  posé: ["放下的；平静的", "placed / calm", "posé"],
  pourrais: ["能够；可以", "could", "pourrais"],
  pourrait: ["能够；可能", "could / might", "pourrait"],
  printemps: ["春天", "spring", "printemps"],
  prison: ["监狱；囚禁", "prison", "prison"],
  prisons: ["监狱；囚禁", "prisons", "prisons"],
  prix: ["价格；奖赏；代价", "price / prize", "prix"],
  promesses: ["承诺；诺言", "promises", "promesses"],
  promis: ["承诺的；许诺", "promised", "promis"],
  putain: ["妓女；粗俗感叹", "whore / damn", "putain"],
  quitte: ["离开；抛下", "leaves", "quitte"],
  raconte: ["讲述；叙述", "tells / recounts", "raconte"],
  regrets: ["遗憾；后悔", "regrets", "regrets"],
  ressemble: ["像；相似", "resembles", "ressemble"],
  retour: ["返回；回归", "return", "retour"],
  rêver: ["做梦；梦想", "to dream", "rêver"],
  rêvé: ["梦见的；梦想的", "dreamed", "rêvé"],
  robe: ["裙子；长袍", "dress / robe", "robe"],
  rois: ["国王们", "kings", "rois"],
  route: ["道路；路线", "road / route", "route"],
  rue: ["街道", "street", "rue"],
  rues: ["街道", "streets", "rues"],
  sais: ["知道；会", "know", "sais"],
  salut: ["你好；拯救", "hello / salvation", "salut"],
  satin: ["缎子", "satin", "satin"],
  seconde: ["秒；第二的", "second", "seconde"],
  semble: ["似乎；看起来", "seems", "semble"],
  sera: ["将是", "will be", "sera"],
  seras: ["你将是", "will be", "seras"],
  serments: ["誓言", "oaths", "serments"],
  serons: ["我们将是", "will be", "serons"],
  seront: ["他们将是", "will be", "seront"],
  solitaire: ["孤独的", "solitary / lonely", "solitaire"],
  sombres: ["阴暗的；忧郁的", "dark / gloomy", "sombres"],
  sommes: ["是；我们是", "are / we are", "sommes"],
  sonne: ["响起；敲响", "rings", "sonne"],
  souvenirs: ["回忆；纪念品", "memories / souvenirs", "souvenirs"],
  souviens: ["记得；回想", "remember", "souviens"],
  suffit: ["足够；够了", "is enough", "suffit"],
  surtout: ["尤其；特别", "especially / above all", "surtout"],
  su: ["知道过；懂得", "known", "su"],
  t: ["你；给你（te 的省略）", "you", "t'"],
  taire: ["使沉默；闭嘴", "to silence / be quiet", "taire"],
  tard: ["晚；迟", "late", "tard"],
  tellement: ["如此；这么", "so much / so", "tellement"],
  tendre: ["温柔的；伸出", "tender / to stretch", "tendre"],
  tendresse: ["温柔；柔情", "tenderness", "tendresse"],
  tiens: ["拿着；属于你；喂", "hold / yours", "tiens"],
  tourne: ["转动；转身", "turns", "tourne"],
  vent: ["风", "wind", "vent"],
  vies: ["生命；生活", "lives", "vies"],
  violence: ["暴力；强烈", "violence", "violence"],
  vis: ["生活；看见；螺丝", "live / saw", "vis"],
  voudrait: ["想要；愿意", "would like", "voudrait"],
  voudrais: ["想要；愿意", "would like", "voudrais"],
  voulait: ["想要；愿意", "wanted", "voulait"],
  y: ["那里；在其中", "there / in it", "y"],
});

const COMMON_ENGLISH = {
  a: ["不定冠词；一个", "indefinite article", "a"],
  all: ["全部；所有", "all / everything", "all"],
  am: ["是；be 的第一人称单数现在式", "first-person singular of be", "am"],
  an: ["不定冠词；一个", "indefinite article", "an"],
  and: ["和；并且", "and", "and"],
  are: ["是；be 的复数或第二人称现在式", "plural / second-person form of be", "are"],
  as: ["作为；像……一样；当……时", "as / like / while", "as"],
  be: ["是；成为；存在", "to be", "be"],
  but: ["但是；除了", "but / except", "but"],
  by: ["被；通过；在……旁边", "by / through", "by"],
  do: ["做；用于疑问、否定或强调", "do; auxiliary verb", "do"],
  does: ["do 的第三人称单数；用于疑问、否定或强调", "third-person singular of do; auxiliary verb", "does"],
  for: ["为了；给；因为", "for", "for"],
  from: ["从；来自", "from", "from"],
  he: ["他", "he", "he"],
  her: ["她；她的", "her", "her"],
  his: ["他的", "his", "his"],
  i: ["我", "I", "I"],
  in: ["在……里面；进入", "in / into", "in"],
  is: ["是；be 的第三人称单数现在式", "third-person singular of be", "is"],
  it: ["它；这件事", "it", "it"],
  me: ["我；给我", "me", "me"],
  my: ["我的", "my", "my"],
  no: ["不；没有", "no", "no"],
  not: ["不；没有", "not", "not"],
  of: ["……的；属于", "of", "of"],
  on: ["在……上；关于；继续", "on", "on"],
  or: ["或者；否则", "or", "or"],
  she: ["她", "she", "she"],
  so: ["所以；如此", "so", "so"],
  that: ["那个；那件事；引导从句", "that", "that"],
  the: ["定冠词；这个/那个", "definite article", "the"],
  their: ["他们的；她们的", "their", "their"],
  them: ["他们；她们；它们", "them", "them"],
  they: ["他们；她们；它们", "they", "they"],
  to: ["到；向；为了；不定式标记", "to", "to"],
  was: ["是；be 的过去式", "past tense of be", "was"],
  we: ["我们", "we", "we"],
  were: ["是；be 的过去式", "past tense of be", "were"],
  what: ["什么；多么", "what", "what"],
  who: ["谁；……的人", "who", "who"],
  with: ["和；带着；用", "with", "with"],
  you: ["你；你们", "you", "you"],
  your: ["你的；你们的", "your", "your"],
};

function main() {
  const summary = [];

  const requestedSlug = process.argv.find((arg) => arg.startsWith("--show="))?.slice("--show=".length);
  const dryRun = process.argv.includes("--dry-run");
  const writeRequested = process.argv.includes("--write");
  const preflightOnly = process.argv.includes("--preflight");
  const allowContentChanges = process.argv.includes("--allow-content-changes");
  const allRequested = process.argv.includes("--all");
  const textOnly = process.argv.includes("--text-only");
  const stylesOnly = process.argv.includes("--styles-only");
  const cursorsOnly = process.argv.includes("--cursors-only");
  const testsOnly = process.argv.includes("--tests-only");
  const indexOnly = process.argv.includes("--index-only");
  const scriptsOnly = process.argv.includes("--scripts-only");
  const initialDataOnly = process.argv.includes("--initial-data-only");
  if ((dryRun && writeRequested) || (preflightOnly && (dryRun || writeRequested))) {
    throw new Error("Use exactly one of --dry-run, --preflight, or --write");
  }
  if (!dryRun && !preflightOnly && !writeRequested) {
    throw new Error(
      "Generation is read-only by default. Run --dry-run or --preflight first, then rerun with --write "
      + "and a narrow --show=<slug> or explicit output mode.",
    );
  }
  if (writeRequested && !requestedSlug && !allRequested) {
    throw new Error("Bulk generation requires explicit --all; otherwise use --show=<slug>");
  }
  generationWritesEnabled = writeRequested;
  const selectedShows = requestedSlug ? SHOWS.filter((show) => show.slug === requestedSlug) : SHOWS;
  if (requestedSlug && selectedShows.length === 0) throw new Error(`Unknown show slug: ${requestedSlug}`);

  selectedShows.forEach((show) => {
    if (cursorsOnly) {
      if (WAVE2_SHOW_SLUGS.has(show.slug)) {
        writeFile(path.join(ROOT, "shared", "cursors"), `${show.slug}.js`, renderReferenceCursor(show));
        summary.push({ slug: show.slug, cursor: "built" });
      }
      return;
    }
    if (testsOnly) {
      const testDir = path.join(ROOT, show.slug, "tests");
      fs.mkdirSync(testDir, { recursive: true });
      writeFile(testDir, "behavior.test.js", renderTests(show));
      summary.push({ slug: show.slug, tests: "built" });
      return;
    }
    if (indexOnly) {
      const outDir = path.join(ROOT, show.slug);
      fs.mkdirSync(outDir, { recursive: true });
      writeFile(outDir, "index.html", renderIndex(show));
      summary.push({ slug: show.slug, index: "built" });
      return;
    }
    if (scriptsOnly) {
      const outDir = path.join(ROOT, show.slug);
      fs.mkdirSync(outDir, { recursive: true });
      writeFile(outDir, "script.js", renderScript(show));
      summary.push({ slug: show.slug, script: "built" });
      return;
    }
    if (initialDataOnly) {
      const outDir = path.join(ROOT, show.slug);
      const songs = loadWindowArray(path.join(outDir, "songs.js"), "songs");
      writeFile(outDir, "songs-initial.js", `window.songsInitial=${JSON.stringify(buildInitialSongs(songs))};\n`);
      summary.push({ slug: show.slug, initialData: "built" });
      return;
    }
    if (stylesOnly) {
      const outDir = path.join(ROOT, show.slug);
      fs.mkdirSync(outDir, { recursive: true });
      writeFile(outDir, "style.css", renderStyle(show));
      summary.push({ slug: show.slug, styles: "built" });
      return;
    }
    const sourcePath = path.join(LYRICS_ROOT, show.source);
    const songs = parseMarkdown(sourcePath, show);
    assertLyricsReadyForGeneration(songs, show, { requireComplete: !dryRun });
    if (dryRun) {
      const lines = songs.flatMap((song) => song.lines);
      const missingTitles = songs.filter((song) => !song.titleZh).map((song) => song.title);
      if (missingTitles.length) {
        console.error(`${show.slug} missing Chinese song titles: ${JSON.stringify(missingTitles)}`);
      }
      summary.push({
        slug: show.slug,
        songs: songs.length,
        lines: lines.length,
        words: "not-built",
        missingTitleZh: missingTitles.length,
        missingIpa: lines.filter((line) => !line.ipa).length,
        missingZh: lines.filter((line) => !line.zh).length,
        missingEn: show.language === "en" ? 0 : lines.filter((line) => !line.en).length,
      });
      return;
    }
    if (writeRequested) assertNoUnreviewedContentChanges(songs, show, { allowContentChanges });
    assertReviewedSourceLines(songs, show);
    const outDir = path.join(ROOT, show.slug);
    if (textOnly && writeRequested) {
      assertSourceWordCardsReady(songs, show, loadExistingWordEntries(outDir));
      fs.mkdirSync(outDir, { recursive: true });
      const runtimeSongs = show.fullSongsFile ? buildInitialSongs(songs) : songs;
      let songsRuntimeSource = `window.songs=${JSON.stringify(runtimeSongs)};\n`;
      if (show.fullSongsFile) {
        songsRuntimeSource += `window.fullSongsFile=${JSON.stringify(show.fullSongsFile)};\n`;
        writeFile(outDir, show.fullSongsFile, `window.songs=${JSON.stringify(songs)};\n`);
      }
      writeFile(outDir, "songs.js", songsRuntimeSource);
      writeFile(outDir, "songs-initial.js", `window.songsInitial=${JSON.stringify(buildInitialSongs(songs))};\n`);
      summary.push({
        slug: show.slug,
        songs: songs.length,
        lines: songs.reduce((total, song) => total + song.lines.length, 0),
        words: "not-built",
      });
      return;
    }
    const glossaryShow = show.contentSlug ? { ...show, slug: show.contentSlug } : show;
    const rougeGlossary = loadRougeGlossary();
    const freedictGlossary = loadFreedictGlossary();
    const englishGlossary = loadEnglishGlossary();
    const previousWordEntries = {
      ...loadLegacyEnglishWordEntries(show),
      ...loadLegacyWordEntries(show),
      ...loadExistingWordEntries(outDir),
    };
    const wordEntries = buildWordEntries(glossaryShow, songs, rougeGlossary, freedictGlossary, englishGlossary, previousWordEntries);
    assertSourceWordCardsReady(songs, show, wordEntries);
    if (preflightOnly) {
      summary.push({
        slug: show.slug,
        songs: songs.length,
        lines: songs.reduce((total, song) => total + song.lines.length, 0),
        words: Object.keys(wordEntries).length,
        preflight: "passed",
      });
      return;
    }

    fs.mkdirSync(path.join(outDir, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(outDir, "tests"), { recursive: true });
    fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });
    fs.mkdirSync(path.join(outDir, "audio", "lines"), { recursive: true });
    fs.mkdirSync(path.join(outDir, "audio", "words"), { recursive: true });

    writeFile(outDir, "index.html", renderIndex(show));
    writeFile(outDir, "style.css", renderStyle(show));
    writeFile(outDir, "script.js", renderScript(show));
    const runtimeSongs = show.fullSongsFile ? buildInitialSongs(songs) : songs;
    let songsRuntimeSource = "window.songs=" + JSON.stringify(runtimeSongs) + ";\n";
    if (show.fullSongsFile) {
      songsRuntimeSource += "window.fullSongsFile=" + JSON.stringify(show.fullSongsFile) + ";\n";
      writeFile(outDir, show.fullSongsFile, "window.songs=" + JSON.stringify(songs) + ";\n");
    }
    writeFile(outDir, "songs.js", songsRuntimeSource);
    writeFile(outDir, "songs-initial.js", `window.songsInitial=${JSON.stringify(buildInitialSongs(songs))};\n`);
    writeFile(outDir, "word-data.js", `window.wordEntries=${JSON.stringify(wordEntries)};\n`);
    writeFile(path.join(outDir, "scripts"), "build-audio.js", renderAudioBuilder(show));
    writeFile(path.join(outDir, "tests"), "behavior.test.js", renderTests(show));
    if (WAVE2_SHOW_SLUGS.has(show.slug)) {
      writeFile(path.join(ROOT, "shared", "cursors"), `${show.slug}.js`, renderReferenceCursor(show));
    }

    summary.push({
      slug: show.slug,
      songs: songs.length,
      lines: songs.reduce((total, song) => total + song.lines.length, 0),
      words: Object.keys(wordEntries).length,
    });
  });

  console.table(summary);
}

function findStructuralLyricCandidates(songs) {
  const candidates = [];
  songs.forEach((song) => {
    (song.lines || []).forEach((line) => {
      const text = String(line.original || "");
      const reasons = [];
      if (/\([^():]{1,30}:\s/u.test(text)) {
        reasons.push("embedded-speaker-label");
      }
      if (text.match(/\([^)]*\)/gu)?.some((value) => value.length > 140)) {
        reasons.push("oversized-parenthetical");
      }
      if ((text.match(/\(/gu) || []).length !== (text.match(/\)/gu) || []).length) {
        reasons.push("unbalanced-parentheses");
      }
      if (reasons.length) {
        candidates.push({
          song: song.order,
          line: line.id,
          text,
          reasons,
        });
      }
    });
  });
  return candidates;
}

function assertLyricsReadyForGeneration(songs, show, { requireComplete = false } = {}) {
  const candidates = findStructuralLyricCandidates(songs);
  if (candidates.length) {
    const details = candidates
      .slice(0, 20)
      .map((item) => `${item.line} [${item.reasons.join(", ")}] ${item.text}`)
      .join("\n");
    throw new Error(
      `${show.slug} has ${candidates.length} unresolved structural lyric candidates. `
      + `Review parallel voices and line segmentation before page or audio generation:\n${details}`,
    );
  }

  if (!requireComplete || !show.language) return;
  const missing = [];
  songs.forEach((song) => {
    (song.lines || []).forEach((line) => {
      if (!line.original) missing.push(`${line.id}:original`);
      if (!line.ipa) missing.push(`${line.id}:ipa`);
      if (!line.zh && !(show.allowedMissingZhIds || []).includes(line.id)) {
        missing.push(`${line.id}:zh`);
      }
      if (show.language !== "en" && show.showEnglishToggle !== false && !line.en) {
        missing.push(`${line.id}:en`);
      }
    });
  });
  if (missing.length) {
    throw new Error(
      `${show.slug} has ${missing.length} missing required lyric fields; refusing to overwrite generated data:\n`
      + missing.slice(0, 30).join("\n"),
    );
  }
}

function assertNoUnreviewedContentChanges(songs, show, { allowContentChanges = false } = {}) {
  if (allowContentChanges) return;
  const existingFile = path.join(ROOT, show.slug, "songs.js");
  if (!fs.existsSync(existingFile)) return;
  const existingSongs = loadWindowArray(existingFile, "songs");
  const fields = ["speaker", "original", "ipa", "zh", "en", "note"];
  const existingLines = new Map(existingSongs.flatMap((song) => song.lines || []).map((line) => [line.id, line]));
  const generatedLines = new Map(songs.flatMap((song) => song.lines || []).map((line) => [line.id, line]));
  const changes = [];
  for (const id of new Set([...existingLines.keys(), ...generatedLines.keys()])) {
    const before = existingLines.get(id);
    const after = generatedLines.get(id);
    if (!before) {
      changes.push(`${id}:added`);
      continue;
    }
    if (!after) {
      changes.push(`${id}:removed`);
      continue;
    }
    const changedFields = fields.filter((field) => String(before[field] || "") !== String(after[field] || ""));
    if (changedFields.length) changes.push(`${id}:${changedFields.join(",")}`);
  }
  if (changes.length) {
    throw new Error(
      `${show.slug} would change ${changes.length} existing lyric rows; refusing an implicit content overwrite:\n`
      + `${changes.slice(0, 30).join("\n")}\n`
      + "Review the diff, then rerun with --allow-content-changes only when the content change is intentional.",
    );
  }
}

function reviewedLineKey(song, line) {
  return `${song.sourceOrder}:${line.sourceLineIndex ?? line.lineIndex}`;
}

function assertReviewedSourceLines(songs, show) {
  const reviewKey = REQUIRED_LINE_REVIEW_KEYS[show.slug];
  if (!reviewKey) return;
  const ledger = JSON.parse(fs.readFileSync(REVIEWED_LINE_OVERRIDES, "utf8"));
  const reviewed = new Set(Object.keys(ledger[reviewKey] || {}));
  const unreviewed = songs.flatMap((song) => (song.lines || [])
    .filter((line) => !reviewed.has(reviewedLineKey(song, line)))
    .map((line) => `${line.id} (${reviewedLineKey(song, line)})`));
  if (unreviewed.length) {
    throw new Error(
      `${show.slug} source review gate blocked page generation: ${unreviewed.length} lyric lines remain unreviewed.\n`
      + `${unreviewed.slice(0, 30).join("\n")}\n`
      + "Finish the authoritative-source review before generating or overwriting this page.",
    );
  }
}

function loadExistingWordEntries(outDir) {
  try {
    return loadWindowObject(path.join(outDir, "word-data.js"), "wordEntries");
  } catch {
    return {};
  }
}

function loadLegacyWordEntries(show) {
  if (!show.legacyOutputSlug) return {};
  try {
    return loadWindowObject(
      path.join(LEGACY_OUTPUT_ROOT, show.legacyOutputSlug, "word-data.js"),
      "wordEntries",
    );
  } catch {
    return {};
  }
}

function loadLegacyEnglishWordEntries(show) {
  if (show.language !== "en") return {};
  const entries = {};
  SHOWS
    .filter((candidate) => candidate.language === "en" && candidate.slug !== show.slug)
    .forEach((candidate) => {
      try {
        Object.assign(
          entries,
          loadWindowObject(path.join(ROOT, candidate.slug, "word-data.js"), "wordEntries"),
        );
      } catch {
        // A missing legacy page dictionary is not a reason to block another page.
      }
    });
  if (fs.existsSync(LEGACY_OUTPUT_ROOT)) {
    fs.readdirSync(LEGACY_OUTPUT_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => {
        try {
          const legacyEntries = loadWindowObject(
            path.join(LEGACY_OUTPUT_ROOT, entry.name, "word-data.js"),
            "wordEntries",
          );
          Object.entries(legacyEntries).forEach(([key, wordEntry]) => {
            if (!entries[key]) entries[key] = wordEntry;
          });
        } catch {
          // A legacy output without a dictionary is not a blocking input.
        }
      });
  }
  return entries;
}

function requiredWordKeys(songs) {
  return new Set(songs.flatMap((song) => [song.title, ...(song.lines || []).map((line) => line.original)])
    .flatMap((text) => collectTokens(text))
    .map((token) => normalizeKey(token))
    .filter(Boolean));
}

function isReviewedWordCard(entry) {
  if (!entry || entry.needsReview) return false;
  const fields = [entry.ipa, entry.meaning, entry.en, entry.speak];
  if (fields.some((value) => !String(value || "").trim())) return false;
  return !/(?:词义：|暂未|待补|proper noun)/iu.test(`${entry.meaning}\n${entry.en}`);
}

function assertSourceWordCardsReady(songs, show, wordEntries) {
  const unresolved = [...requiredWordKeys(songs)]
    .filter((key) => !isReviewedWordCard(wordEntries[key]));
  if (unresolved.length) {
    throw new Error(
      `${show.slug} word-card gate blocked page generation: ${unresolved.length} clickable tokens lack reviewed cards.\n`
      + `${unresolved.slice(0, 30).join(", ")}\n`
      + "Resolve each card in the canonical glossary, then rerun --preflight before --write.",
    );
  }
}

function loadWindowArray(file, key) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox);
  const value = sandbox.window[key];
  if (!Array.isArray(value) || !value.length) {
    throw new Error(`No ${key} data found in ${file}; refusing to overwrite initial data`);
  }
  return value;
}

function loadWindowObject(file, key) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox);
  const value = sandbox.window[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`No ${key} object found in ${file}`);
  }
  return value;
}

function buildInitialSongs(songs) {
  return songs.map((song, index) => index === 0 ? song : { ...song, lines: [] });
}

function existingLineIpa(show, lineId, original, sourceIpa = "") {
  if (!existingLineIpaCache.has(show.slug)) {
    const file = path.join(ROOT, show.slug, "songs.js");
    const cache = new Map();
    try {
      loadWindowArray(file, "songs").forEach((song) => song.lines.forEach((line) => {
        cache.set(line.id, { original: line.original, ipaKey: ipaCacheKey(line.original), ipa: line.ipa });
      }));
    } catch {
      // A first generation has no prior page data to reuse.
    }
    existingLineIpaCache.set(show.slug, cache);
  }
  const previous = existingLineIpaCache.get(show.slug).get(lineId);
  if (String(sourceIpa || "").trim() && previous?.ipa && String(sourceIpa).trim() !== previous.ipa) return "";
  return previous?.ipaKey === ipaCacheKey(original) && previous.ipa ? previous.ipa : "";
}

function ipaCacheKey(text) {
  return String(text || "")
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR")
    .replace(/[.,!?;:…'"“”‘’()[\]{}—–-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function loadRougeGlossary() {
  const glossary = {};

  if (!fs.existsSync(ROUGE_SCRIPT)) return glossary;
  const source = fs.readFileSync(ROUGE_SCRIPT, "utf8");
  const match = source.match(/const COMMON_WORD_GLOSSARY = (\{[\s\S]*?\n\});/);
  try {
    if (match) {
      mergeGlossaryObject(glossary, vm.runInNewContext(`(${match[1]})`, {}));
    }
  } catch {
    // Keep going; the per-song glossary below is more valuable for content words.
  }

  if (!fs.existsSync(ROUGE_SONGS)) return glossary;
  try {
    const context = { window: {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(ROUGE_SONGS, "utf8"), context);
    (context.window.songs || []).forEach((song) => {
      mergeGlossaryObject(glossary, song.wordGlossary || {});
      (song.lines || []).forEach((line) => {
        ((line.analysis || {}).words || []).forEach((word) => {
          if (!word.fr || !word.zh || !word.en) return;
          addGlossaryEntry(glossary, word.fr, {
            zh: word.zh,
            en: word.en,
            speak: word.fr,
          });
        });
      });
    });
  } catch {
    return glossary;
  }

  return glossary;
}

function loadFreedictGlossary() {
  if (!fs.existsSync(FREEDICT_GLOSSARY)) return {};
  try {
    return JSON.parse(fs.readFileSync(FREEDICT_GLOSSARY, "utf8"));
  } catch {
    return {};
  }
}

function loadEnglishGlossary() {
  const glossary = {};
  try {
    if (fs.existsSync(GOOGLE_ENGLISH_GLOSSARY)) {
      mergeGlossaryObject(glossary, JSON.parse(fs.readFileSync(GOOGLE_ENGLISH_GLOSSARY, "utf8")));
    }
  } catch {
    // The per-show dictionaries below remain usable when the shared cache is absent.
  }
  SHOWS.filter((show) => show.language === "en").forEach((show) => {
    const file = path.join(ROOT, show.slug, "word-data.js");
    if (!fs.existsSync(file)) return;
    try {
      const entries = loadWindowObject(file, "wordEntries");
      Object.entries(entries).forEach(([key, entry]) => {
        if (entry.needsReview || !entry.meaning || !entry.en || !entry.ipa || !entry.speak) return;
        if (/专有名词|proper noun|暂未收录|词义：|结合本句|语境/i.test(`${entry.meaning} ${entry.en}`)) return;
        addGlossaryEntry(glossary, entry.speak || key, {
          zh: entry.meaning,
          en: entry.en,
          ipa: entry.ipa,
          speak: entry.speak || key,
        });
      });
    } catch {
      // One malformed generated dictionary must not block the remaining shows.
    }
  });
  return glossary;
}

function mergeGlossaryObject(target, source) {
  Object.entries(source || {}).forEach(([key, entry]) => {
    addGlossaryEntry(target, entry.speak || key, {
      zh: entry.zh || entry.meaning,
      en: entry.en,
      ipa: entry.ipa,
      speak: entry.speak || key,
    });
  });
}

function addGlossaryEntry(target, term, entry) {
  const tokens = collectTokens(term);
  const candidates = tokens.length ? tokens : [term];

  candidates.forEach((candidate) => {
    const key = normalizeKey(candidate);
    if (!key || target[key] || !entry.zh || !entry.en) return;
    target[key] = {
      zh: entry.zh,
      en: shortEnglishGloss(entry.en),
      ipa: entry.ipa,
      speak: normalizeSpeak(candidate),
    };

    const singular = singularFrenchKey(key);
    if (singular && !target[singular]) {
      target[singular] = {
        zh: String(entry.zh).replace(/们/g, ""),
        en: singularEnglishGloss(entry.en),
        ipa: entry.ipa,
        speak: normalizeSpeak(candidate).replace(/s$/i, ""),
      };
    }
  });
}

function parseMarkdown(file, show) {
  if (show.sourceFormat === "paired-english-loose") {
    return parseLoosePairedEnglishMarkdown(file, show);
  }
  if (show.sourceFormat === "paired-english") {
    return parsePairedEnglishMarkdown(file, show);
  }
  if (show.sourceFormat === "german-triple") {
    return parseGermanTripleMarkdown(file, show);
  }
  if (show.sourceFormat === "english-chinese-single") {
    return parseEnglishChineseSingleColumnMarkdown(file, show);
  }
  if (show.sourceFormat === "english-chinese-columns") {
    return parseEnglishChineseColumnsMarkdown(file, show);
  }
  const contentShow = show.contentSlug ? { ...show, slug: show.contentSlug } : show;
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const songs = [];
  let current = null;
  let currentTitleZh = "";
  let header = null;
  let pendingSpeaker = "";

  lines.forEach((raw) => {
    const heading = raw.match(/^##\s+(\d+)\.\s+(.+?)\s*$/);
    if (heading) {
      const sourceTitle = normalizeGeneratedLineText(contentShow, heading[2].trim(), "original");
      const order = Number(heading[1]);
      current = {
        order,
        id: SONG_ID_OVERRIDES[show.slug]?.[order] || slugify(`${heading[1]}-${sourceTitle}`),
        sourceTitle,
        title: stripSongTitleVersionSuffix(sourceTitle),
        titleZh: "",
        lines: [],
      };
      songs.push(current);
      currentTitleZh = "";
      header = null;
      pendingSpeaker = "";
      return;
    }

    if (!current) return;

    const zhTitle = raw.match(/^中文歌名：(.+?)\s*$/);
    if (zhTitle) {
      currentTitleZh = zhTitle[1].trim();
      current.titleZh = currentTitleZh === "未提供" ? "" : stripSongTitleVersionSuffix(currentTitleZh);
      return;
    }

    const pageInclusion = raw.match(/^-\s*网页收录：(.+?)\s*$/);
    if (pageInclusion) {
      current.excludeFromPage = /^(?:否|不|no|false)/iu.test(pageInclusion[1].trim());
      return;
    }

    if (!raw.startsWith("|")) return;
    const cells = splitMarkdownRow(raw);
    if (!cells.length) return;
    if (cells.some((cell) => /^---/.test(cell))) return;
    if (cells.includes("行号")) {
      header = cells;
      return;
    }
    if (!header || !/^\d+$/.test(cells[0] || "")) return;

    const row = rowByHeader(header, cells);
    const original = row["法语歌词（校订）"] || row["德语歌词（校订）"] || row["英文歌词（校订）"] || "";
    const note = cleanReleaseNote(row["备注"] || "");
    const noteSpeaker = normalizeSpeakerForShow(contentShow, extractNoteSpeaker(note));
    if (!original.trim()) {
      pendingSpeaker = noteSpeaker || pendingSpeaker;
      return;
    }
    if (/^--.*--$/u.test(original.trim())) return;
    if (!/^\s*(?:\[|【)/u.test(original) && isKnownSourceRole(original, contentShow) && !/[:：]\s*\S/u.test(cleanCell(original))) {
      pendingSpeaker = cleanCell(original).replace(/[:：]\s*$/u, "") || pendingSpeaker;
      return;
    }
    const bracketedLyric = original.trim().match(/^\s*(?:\[([^\]]{1,500})\]|【([^】]{1,500})】)\s*$/u);
    const hasAlignedText = Boolean(
      cleanCell(row["法语音标（IPA）"] || row["德语音标（IPA）"] || row["英文音标（IPA）"] || "")
      || cleanCell(row["中文翻译（校订）"] || "")
      || cleanCell(row["English Translation"] || ""),
    );
    const speakerCell = bracketedLyric && hasAlignedText && !isStandaloneBracketedSpeakerRow(original, row, contentShow)
      ? { speaker: "", text: (bracketedLyric[1] || bracketedLyric[2] || "").trim() }
      : extractSpeaker(original, contentShow);
    if (!speakerCell.text) {
      pendingSpeaker = speakerCell.speaker || pendingSpeaker;
      return;
    }
    const zhSource = bracketedLyric ? stripOuterBrackets(row["中文翻译（校订）"] || "") : (row["中文翻译（校订）"] || "");
    const enSource = bracketedLyric ? stripOuterBrackets(row["English Translation"] || "") : (row["English Translation"] || "");
    if (isTranslationRoleOnly(zhSource, contentShow)) return;
    const zhTranslationSpeaker = extractTranslationSpeaker(zhSource, contentShow);
    const enTranslationSpeaker = extractTranslationSpeaker(enSource, contentShow);
    const translationSpeaker = speakerCell.speaker || noteSpeaker
      ? { speaker: "", text: "" }
      : [zhTranslationSpeaker, enTranslationSpeaker].find((entry) => entry.speaker) || { speaker: "", text: "" };
    const speaker = speakerCell.speaker || noteSpeaker || translationSpeaker.speaker;
    const cleanedOriginal = cleanLineCell(contentShow, speakerCell.text, "original");
    if (!cleanedOriginal) return;

    const lineNumber = Number(cells[0]);
    const lineId = `${contentShow.slug}-${String(current.order).padStart(2, "0")}-${String(lineNumber).padStart(3, "0")}`;
    const textOverride = LINE_TEXT_OVERRIDES[lineId] || {};
    current.lines.push({
      id: lineId,
      lineIndex: lineNumber,
      speaker: speaker || pendingSpeaker,
      original: cleanedOriginal,
      ipa: stripSpeakerIpaPrefix(
        contentShow,
        row["法语音标（IPA）"] || row["德语音标（IPA）"] || row["英文音标（IPA）"] || "",
        speaker,
      ),
      zh: normalizeGeneratedLineText(contentShow, textOverride.zh ?? cleanLineCell(contentShow, zhTranslationSpeaker.speaker ? zhTranslationSpeaker.text : stripTranslationSpeaker(
        zhSource,
        speaker,
        contentShow,
      ), "zh"), "zh"),
      en: normalizeGeneratedLineText(contentShow, textOverride.en ?? cleanLineCell(contentShow, enTranslationSpeaker.speaker ? enTranslationSpeaker.text : stripTranslationSpeaker(
        enSource,
        speaker,
        contentShow,
      ), "en"), "en"),
      note: noteSpeaker ? "" : note,
    });
    pendingSpeaker = "";
  });

  return finalizeParsedSongs(contentShow, show, songs);
}

function parseGermanTripleMarkdown(file, show) {
  const contentShow = show.contentSlug ? { ...show, slug: show.contentSlug } : show;
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const songs = [];
  let current = null;
  let currentLineNumber = 0;
  let header = null;

  lines.forEach((raw) => {
    const heading = raw.match(/^#\s+(\d+)\.?\s+(.+?)\s*$/u);
    if (heading) {
      const sourceTitle = normalizeGeneratedLineText(contentShow, heading[2].trim(), "original");
      const order = Number(heading[1]);
      current = {
        order,
        id: slugify(`${heading[1]}-${sourceTitle}`),
        sourceTitle,
        title: stripSongTitleVersionSuffix(sourceTitle),
        titleZh: "",
        lines: [],
      };
      songs.push(current);
      currentLineNumber = 0;
      header = null;
      return;
    }

    if (!current) return;

    const sourceTitle = raw.match(/^-\s*原歌名：(.+?)\s*$/u);
    if (sourceTitle) {
      current.sourceTitle = cleanCell(sourceTitle[1]);
      current.title = stripSongTitleVersionSuffix(current.sourceTitle);
      return;
    }
    const zhTitle = raw.match(/^-?\s*中文歌名：(.+?)\s*$/u);
    if (zhTitle) {
      const value = cleanCell(zhTitle[1]);
      current.titleZh = value === "未提供" ? "" : stripSongTitleVersionSuffix(value);
      return;
    }
    const pageInclusion = raw.match(/^-\s*网页收录：(.+?)\s*$/u);
    if (pageInclusion) {
      current.excludeFromPage = /^(?:否|不|no|false)/iu.test(pageInclusion[1].trim());
      return;
    }

    if (!raw.startsWith("|")) return;
    const cells = splitMarkdownRow(raw);
    if (!cells.length || cells.some((cell) => /^---/u.test(cell))) return;
    if (cells.includes("德语") && cells.includes("英文") && cells.includes("中文")) {
      header = cells;
      return;
    }
    if (!header) return;

    const row = rowByHeader(header, cells);
    const originalCell = row["德语"] || "";
    const speakerCell = extractGermanTripleSpeaker(originalCell, contentShow);
    currentLineNumber += 1;
    if (!speakerCell.text.trim()) return;
    if (/^(?:\.\.\.|…|—+)$/u.test(speakerCell.text.trim())) return;
    if (/^--.*--$/u.test(speakerCell.text.trim())) return;

    const lineId = `${contentShow.slug}-${String(current.order).padStart(2, "0")}-${String(currentLineNumber).padStart(3, "0")}`;
    const textOverride = LINE_TEXT_OVERRIDES[lineId] || {};
    const original = cleanLineCell(contentShow, speakerCell.text, "original");
    if (!original) return;
    const translationSpeaker = speakerCell.speaker
      ? { speaker: "", text: "" }
      : extractTranslationSpeaker(row["中文"] || "", contentShow);
    if (!speakerCell.speaker && translationSpeaker.speaker && !translationSpeaker.text) return;
    current.lines.push({
      id: lineId,
      lineIndex: currentLineNumber,
      speaker: speakerCell.speaker || translationSpeaker.speaker,
      original,
      ipa: existingLineIpa(contentShow, lineId, original) || ipaFor(original, contentShow.voice),
      en: normalizeGeneratedLineText(contentShow, textOverride.en ?? cleanLineCell(contentShow, stripGermanTripleTranslationSpeaker(row["英文"] || "", speakerCell.speaker, "en", contentShow), "en"), "en"),
      zh: normalizeGeneratedLineText(contentShow, textOverride.zh ?? cleanLineCell(contentShow, translationSpeaker.speaker
        ? translationSpeaker.text
        : stripGermanTripleTranslationSpeaker(row["中文"] || "", speakerCell.speaker, "zh", contentShow), "zh"), "zh"),
      note: "",
    });
  });

  return finalizeParsedSongs(contentShow, show, songs);
}

function parseEnglishChineseColumnsMarkdown(file, show) {
  const contentShow = show.contentSlug ? { ...show, slug: show.contentSlug } : show;
  const rows = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const songs = [];
  let current = null;
  let inLyricTable = false;
  let pendingSpeaker = "";
  let sourceLineIndex = 0;

  const flushSong = () => {
    if (!current) return;
    current.sourceTitle = cleanConfiguredSongTitle(show, current.sourceTitle || current.title);
    current.title = current.sourceTitle;
    delete current.dataRowSeen;
  };

  rows.forEach((raw) => {
    const heading = raw.match(/^##\s+(\d+)\.?\s+(.+?)\s*$/u);
    if (heading) {
      flushSong();
      const headingTitle = normalizeGeneratedLineText(contentShow, cleanCell(heading[2]), "original");
      current = {
        order: Number(heading[1]),
        id: slugify(`${heading[1]}-${headingTitle}`),
        sourceTitle: headingTitle,
        title: headingTitle,
        titleZh: "",
        lines: [],
        dataRowSeen: false,
      };
      songs.push(current);
      inLyricTable = false;
      pendingSpeaker = "";
      sourceLineIndex = 0;
      return;
    }

    if (!current) return;

    const sourceTitle = raw.match(/^-\s*原歌名：(.+?)\s*$/u);
    if (sourceTitle) {
      current.sourceTitle = cleanCell(sourceTitle[1]);
      current.title = stripSongTitleVersionSuffix(current.sourceTitle);
      return;
    }
    const translatedTitle = raw.match(/^-?\s*中文歌名：(.+?)\s*$/u);
    if (translatedTitle) {
      const value = cleanCell(translatedTitle[1]);
      current.titleZh = value === "未提供" ? "" : stripSongTitleVersionSuffix(value);
      return;
    }
    const pageInclusion = raw.match(/^-\s*网页收录：(.+?)\s*$/u);
    if (pageInclusion) {
      current.excludeFromPage = /^(?:否|不|no|false)/iu.test(pageInclusion[1].trim());
      return;
    }

    if (!raw.startsWith("|")) return;
    const cells = splitMarkdownRow(raw);
    if (cells.length < 2 || cells.some((cell) => /^---/u.test(cell))) return;
    if (cells[0] === "英文" && cells[1] === "中文") {
      inLyricTable = true;
      return;
    }
    if (!inLyricTable) return;

    const originalRaw = cleanCell(cells[0]);
    const zhRaw = cleanCell(cells[1]);
    if (!originalRaw || !zhRaw) return;
    if (!current.dataRowSeen) {
      current.dataRowSeen = true;
      if (originalRaw === current.sourceTitle) return;
    }
    if (isEnglishSourceStageDirection(originalRaw)) return;
    sourceLineIndex += 1;

    const speakerCell = extractSpeaker(originalRaw, contentShow);
    if (isEmbeddedSourceRoleOnlyLine(speakerCell, zhRaw, contentShow)
      || isTranslationRoleOnly(zhRaw, contentShow)) return;
    if (!speakerCell.text) {
      pendingSpeaker = speakerCell.speaker || pendingSpeaker;
      return;
    }
    const speaker = speakerCell.speaker || pendingSpeaker;
    const original = cleanLineCell(contentShow, speakerCell.text, "original");
    const zh = cleanLineCell(contentShow, stripTranslationSpeaker(zhRaw, speaker, contentShow), "zh");
    if (!original || !zh) return;

    const lineIndex = sourceLineIndex;
    const lineId = `${contentShow.slug}-${String(current.order).padStart(2, "0")}-${String(lineIndex).padStart(3, "0")}`;
    const textOverride = LINE_TEXT_OVERRIDES[lineId] || {};
    current.lines.push({
      id: lineId,
      lineIndex,
      speaker,
      original,
      ipa: existingLineIpa(contentShow, lineId, original) || ipaFor(original, contentShow.voice),
      zh: normalizeGeneratedLineText(contentShow, textOverride.zh ?? zh, "zh"),
      en: "",
      note: "",
    });
    pendingSpeaker = "";
  });
  flushSong();

  return finalizeParsedSongs(contentShow, show, songs);
}

function isEnglishSourceStageDirection(value) {
  const clean = cleanCell(value);
  if (/^\[\s*instrumental(?:\s+(?:interlude|break))?\s*\]$/iu.test(clean)) return true;
  if (/^\[[^\]]+\]\s*\([^)]*\)$/u.test(clean)) {
    return /\b(?:open|opens|opening|pick(?:s)?\s+up|drop(?:s|ped)?|raise(?:s|d)?|walk(?:s|ed)?|enter(?:s|ed)?|exit(?:s|ed)?)\b/iu.test(clean);
  }
  return /^\[[^\]]*\b(?:open|opens|opening|pick(?:s)?\s+up|drop(?:s|ped)?|raise(?:s|d)?|walk(?:s|ed)?|enter(?:s|ed)?|exit(?:s|ed)?)\b[^\]]*\]$/iu.test(clean);
}

function parseEnglishChineseSingleColumnMarkdown(file, show) {
  const contentShow = show.contentSlug ? { ...show, slug: show.contentSlug } : show;
  const rows = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const songs = [];
  let current = null;
  let inLyricTable = false;

  const flushSong = () => {
    if (!current) return;
    let lineIndex = 0;
    for (let index = 0; index < current.rawRows.length; index += 1) {
      const originalRaw = cleanCell(current.rawRows[index]);
      if (!originalRaw || /\p{Script=Han}/u.test(originalRaw)) continue;
      const nextRaw = cleanCell(current.rawRows[index + 1] || "");
      const hasAlignedChinese = /\p{Script=Han}/u.test(nextRaw);
      const zhSource = hasAlignedChinese
        ? nextRaw
        : MISSING_SOURCE_TRANSLATIONS[contentShow.slug]?.[originalRaw] || "";
      if (hasAlignedChinese) index += 1;
      if (!zhSource) {
        throw new Error(`${show.slug} track ${current.order} has no Chinese translation for: ${originalRaw}`);
      }
      lineIndex += 1;
      if (isTranslationRoleOnly(zhSource, contentShow)) continue;
      const lineId = `${contentShow.slug}-${String(current.order).padStart(2, "0")}-${String(lineIndex).padStart(3, "0")}`;
      const textOverride = LINE_TEXT_OVERRIDES[lineId] || {};
      const original = cleanLineCell(contentShow, originalRaw, "original");
      if (!original) continue;
      current.lines.push({
        id: lineId,
        lineIndex,
        speaker: "",
        original,
        ipa: existingLineIpa(contentShow, lineId, original) || ipaFor(original, contentShow.voice),
        zh: normalizeGeneratedLineText(contentShow, textOverride.zh ?? cleanLineCell(contentShow, zhSource, "zh"), "zh"),
        en: "",
        note: "",
      });
    }
    current.title = cleanConfiguredSongTitle(show, current.sourceTitle || current.title);
    delete current.rawRows;
  };

  rows.forEach((raw) => {
    const heading = raw.match(/^##\s+(\d+)\.\s+(.+?)\s*$/u);
    if (heading) {
      flushSong();
      const headingTitle = cleanCell(heading[2]);
      current = {
        order: Number(heading[1]),
        id: slugify(`${heading[1]}-${headingTitle}`),
        sourceTitle: headingTitle,
        title: headingTitle,
        titleZh: "",
        lines: [],
        rawRows: [],
      };
      songs.push(current);
      inLyricTable = false;
      return;
    }
    if (!current) return;
    const sourceTitle = raw.match(/^-\s*原歌名：(.+?)\s*$/u);
    if (sourceTitle) {
      current.sourceTitle = cleanCell(sourceTitle[1]);
      return;
    }
    const translatedTitle = raw.match(/^-\s*中文歌名：(.+?)\s*$/u);
    if (translatedTitle) {
      const value = cleanCell(translatedTitle[1]);
      current.titleZh = value === "未提供" ? "" : value;
      return;
    }
    if (/^\|\s*歌词\s*\|$/u.test(raw)) {
      inLyricTable = true;
      return;
    }
    if (!inLyricTable || /^\|\s*---\s*\|$/u.test(raw)) return;
    const lyricCell = raw.match(/^\|\s?(.*?)\s?\|$/u);
    if (lyricCell) current.rawRows.push(lyricCell[1].replace(/\\\|/g, "|").trim());
  });
  flushSong();

  return finalizeParsedSongs(contentShow, show, songs);
}

function stripGermanTripleTranslationSpeaker(value, sourceSpeaker, field, show) {
  const clean = cleanCell(value);
  if (!sourceSpeaker) return clean;
  const bracketed = clean.match(/^\s*(?:\[([^\]]{1,48})\]|【([^】]{1,48})】)\s*[:：]\s*(.+)$/u);
  if (bracketed) return bracketed[3].trim();
  const labelled = clean.match(/^([^:：]{1,24})[:：]\s*(.+)$/u);
  if (!labelled) return clean;
  const label = labelled[1].trim();
  const parsed = extractTranslationSpeaker(clean, show);
  const chineseRole = /(?:先生|女士|小姐|夫人|伯爵|公爵|男爵|王子|公主|国王|女王|妈妈|爸爸|合唱|众)$/u.test(label);
  if (parsed.speaker || (field === "zh" && chineseRole)) return labelled[2].trim();
  return clean;
}

function parseLoosePairedEnglishMarkdown(file, show) {
  const text = fs.readFileSync(file, "utf8");
  const rows = text.split(/\r?\n/);
  const songs = [];
  let current = null;
  let lyricRows = [];
  let inLyricTable = false;
  let activeSpeaker = "";

  const flushSong = () => {
    if (!current) return;
    const trailingPatterns = show.looseTrailingNotePatterns?.[current.order] || [];
    let sourceRows = lyricRows.filter((row) => !trailingPatterns.some((pattern) => pattern.test(row.text)));
    const leadingRowsToSkip = Number(show.looseSkipLeadingRows?.[current.order] || 0);
    sourceRows = sourceRows.slice(leadingRowsToSkip);

    const instrumentalRow = sourceRows.find((row) => isInstrumentalMarkerText(row.text));
    if (instrumentalRow) {
      current.lines.push({
        id: `${show.slug}-${String(current.order).padStart(2, "0")}-001`,
        lineIndex: 1,
        speaker: "",
        original: instrumentalRow.text,
        ipa: "",
        zh: instrumentalRow.text,
        en: "",
        note: "",
      });
    } else {
      const filteredRows = [];
      sourceRows.forEach((row) => {
        const speaker = looseStandaloneSpeaker(row.text, show);
        if (speaker) {
          activeSpeaker = speaker;
          return;
        }
        filteredRows.push(row);
      });

      if ((show.looseSingleLanguageSongOrders || []).includes(current.order)) {
        filteredRows.forEach((row) => {
          const original = cleanLineCell(show, row.text, "original");
          if (!original) return;
          const lineIndex = current.lines.length + 1;
          const lineId = `${show.slug}-${String(current.order).padStart(2, "0")}-${String(lineIndex).padStart(3, "0")}`;
          current.lines.push({
            id: lineId,
            lineIndex,
            speaker: activeSpeaker,
            original,
            ipa: existingLineIpa(show, lineId, original) || ipaFor(original, show.voice),
            zh: "",
            en: "",
            note: "",
          });
        });
      } else {
        const mergeLeadingRows = (show.looseMergeLeadingSourceRows || []).includes(current.order);
        if (mergeLeadingRows && filteredRows.length >= 3
          && !/\p{Script=Han}/u.test(filteredRows[0].text)
          && !/\p{Script=Han}/u.test(filteredRows[1].text)
          && /\p{Script=Han}/u.test(filteredRows[2].text)) {
          filteredRows.splice(0, 2, {
            ...filteredRows[0],
            text: `${filteredRows[0].text} ${filteredRows[1].text}`,
          });
        }
        if (filteredRows.length % 2 !== 0) {
          throw new Error(`${show.slug} track ${current.order} has an odd loose paired lyric row count (${filteredRows.length})`);
        }
        for (let index = 0; index < filteredRows.length; index += 2) {
          const originalRaw = cleanCell(filteredRows[index].text);
          const translationRaw = cleanCell(filteredRows[index + 1].text);
          if (!originalRaw || !translationRaw) continue;
          const speakerCell = extractSpeaker(originalRaw, show);
          if (isEmbeddedSourceRoleOnlyLine(speakerCell, translationRaw, show)) continue;
          const translationSpeaker = speakerCell.speaker
            ? { speaker: "", text: "" }
            : extractTranslationSpeaker(translationRaw, show);
          const speaker = speakerCell.speaker || translationSpeaker.speaker || activeSpeaker;
          const original = cleanLineCell(show, speakerCell.text, "original");
          const zh = cleanLineCell(show, translationSpeaker.speaker
            ? translationSpeaker.text
            : stripTranslationSpeaker(translationRaw, speaker, show), "zh");
          if (!original || !zh) continue;
          const lineIndex = current.lines.length + 1;
          const lineId = `${show.slug}-${String(current.order).padStart(2, "0")}-${String(lineIndex).padStart(3, "0")}`;
          current.lines.push({
            id: lineId,
            lineIndex,
            speaker,
            original,
            ipa: existingLineIpa(show, lineId, original) || ipaFor(original, show.voice),
            zh,
            en: "",
            note: "",
          });
        }
      }
    }
    current.sourceTitle = cleanConfiguredSongTitle(show, current.sourceTitle || current.title);
    current.title = current.sourceTitle;
    activeSpeaker = "";
  };

  rows.forEach((raw) => {
    const heading = raw.match(/^##\s+(\d+)\.\s+(.+?)\s*$/);
    if (heading) {
      flushSong();
      const headingTitle = cleanCell(heading[2]);
      current = {
        order: Number(heading[1]),
        id: slugify(`${heading[1]}-${headingTitle}`),
        sourceTitle: headingTitle,
        title: headingTitle,
        titleZh: "",
        lines: [],
      };
      songs.push(current);
      lyricRows = [];
      inLyricTable = false;
      activeSpeaker = "";
      return;
    }
    if (!current) return;

    const sourceTitle = raw.match(/^[-–—]\s*原歌名：(.+?)\s*$/u);
    if (sourceTitle) {
      current.sourceTitle = cleanCell(sourceTitle[1]);
      return;
    }
    const translatedTitle = raw.match(/^[-–—]\s*中文歌名：(.+?)\s*$/u);
    if (translatedTitle) {
      const titleZh = cleanCell(translatedTitle[1]);
      current.titleZh = titleZh === "未提供" ? "" : titleZh;
      return;
    }
    const pageInclusion = raw.match(/^[-–—]\s*网页收录：(.+?)\s*$/u);
    if (pageInclusion) {
      current.excludeFromPage = /^(?:否|不|no|false)/iu.test(pageInclusion[1].trim());
      return;
    }
    if (/^\|\s*歌词\s*\|$/u.test(raw)) {
      inLyricTable = true;
      return;
    }
    if (!inLyricTable || /^\|\s*---\s*\|$/u.test(raw)) return;
    const lyricCell = raw.match(/^\|\s?(.*?)\s?\|\s*$/u);
    if (lyricCell) {
      lyricRows.push({
        text: cleanCell(lyricCell[1].replace(/\\\|/g, "|")),
        sourceLineIndex: lyricRows.length + 1,
      });
    }
  });
  flushSong();

  return finalizeParsedSongs(show, show, songs);
}

function looseStandaloneSpeaker(value, show) {
  const clean = cleanCell(value);
  const staged = clean.match(/^\((.*)\s*[-–—]\s*(?:spoken|sung)\)$/iu);
  if (staged) return staged[1].trim().replace(/\s+/gu, " ");
  const bracketed = clean.match(/^\((.*)\)$/u);
  if (!bracketed) return "";
  const candidate = bracketed[1].trim().replace(/\s+/gu, " ");
  const configured = show.looseSpeakerMarkers || [];
  return configured.some((label) => label.replace(/\s+/gu, " ").toLocaleLowerCase() === candidate.toLocaleLowerCase())
    ? candidate
    : "";
}

function parsePairedEnglishMarkdown(file, show) {
  const text = fs.readFileSync(file, "utf8");
  const rows = text.split(/\r?\n/);
  const songs = [];
  let current = null;
  let lyricRows = [];
  let inLyricTable = false;
  let pendingSpeaker = "";

  const flushSong = () => {
    if (!current) return;
    if (lyricRows.length % 2 !== 0) {
      throw new Error(`${show.slug} track ${current.order} has an odd paired lyric row count`);
    }
    for (let index = 0; index < lyricRows.length; index += 2) {
      const originalRaw = cleanCell(lyricRows[index]);
      const translationRaw = cleanCell(lyricRows[index + 1]);
      if (!originalRaw || !translationRaw) continue;
      if (/^(?:[-—_.…]+|instrumental)$/iu.test(originalRaw)) continue;
      if (isTranslationRoleOnly(translationRaw, show)) continue;
      const speakerCell = extractSpeaker(originalRaw, show);
      if (!speakerCell.text) {
        pendingSpeaker = speakerCell.speaker || pendingSpeaker;
        continue;
      }
      const translationSpeaker = speakerCell.speaker
        ? { speaker: "", text: "" }
        : extractTranslationSpeaker(translationRaw, show);
      const speaker = speakerCell.speaker || translationSpeaker.speaker || pendingSpeaker;
      const original = cleanLineCell(show, speakerCell.text, "original");
      const zh = cleanLineCell(show, translationSpeaker.speaker ? translationSpeaker.text : stripTranslationSpeaker(translationRaw, speaker, show), "zh");
      if (!original || !zh) continue;
      const lineIndex = index / 2 + 1;
      const lineId = `${show.slug}-${String(current.order).padStart(2, "0")}-${String(lineIndex).padStart(3, "0")}`;
      current.lines.push({
        id: lineId,
        lineIndex,
        speaker,
        original,
        ipa: existingLineIpa(show, lineId, original) || ipaFor(original, show.voice),
        zh,
        en: "",
        note: "",
      });
      pendingSpeaker = "";
    }
    current.sourceTitle = cleanConfiguredSongTitle(show, current.sourceTitle || current.title);
    current.title = current.sourceTitle;
  };

  rows.forEach((raw) => {
    const heading = raw.match(/^##\s+(\d+)\.\s+(.+?)\s*$/);
    if (heading) {
      flushSong();
      const headingTitle = cleanCell(heading[2]);
      current = {
        order: Number(heading[1]),
        id: slugify(`${heading[1]}-${headingTitle}`),
        sourceTitle: headingTitle,
        title: headingTitle,
        titleZh: "",
        lines: [],
      };
      songs.push(current);
      lyricRows = [];
      inLyricTable = false;
      pendingSpeaker = "";
      return;
    }
    if (!current) return;

    const sourceTitle = raw.match(/^-\s*原歌名：(.+?)\s*$/);
    if (sourceTitle) {
      current.sourceTitle = cleanCell(sourceTitle[1]);
      return;
    }
    const translatedTitle = raw.match(/^-\s*中文歌名：(.+?)\s*$/);
    if (translatedTitle) {
      current.titleZh = cleanCell(translatedTitle[1]);
      return;
    }
    const pageInclusion = raw.match(/^-\s*网页收录：(.+?)\s*$/);
    if (pageInclusion) {
      current.excludeFromPage = /^(?:否|不|no|false)/iu.test(pageInclusion[1].trim());
      return;
    }
    if (/^\|\s*歌词\s*\|$/u.test(raw)) {
      inLyricTable = true;
      return;
    }
    if (!inLyricTable || /^\|\s*---\s*\|$/u.test(raw)) return;
    const lyricCell = raw.match(/^\|\s?(.*?)\s?\|\s*$/u);
    if (lyricCell) lyricRows.push(lyricCell[1].replace(/\\\|/g, "|").trim());
  });
  flushSong();

  return finalizeParsedSongs(show, show, songs);
}

function cleanConfiguredSongTitle(show, value) {
  let title = stripSongTitleVersionSuffix(value);
  if (show.slug === "dear-evan-hansen") {
    title = title.replace(/\s*\(From\s+(?:the\s+)?[“"]Dear Evan Hansen[”"]\s+Original Motion Picture Soundtrack\)\s*$/iu, "");
  }
  if (show.slug === "six-the-musical") {
    title = title.replace(/\s*\(feat\.\s+[^)]+\)\s*$/iu, "");
  }
  if (show.slug === "sunset-boulevard") {
    title = title.replace(/\s*[\[(]US 1994\s*\/\s*Musical\s+[“"]Sunset Boulevard[”"][\])]\s*$/iu, "");
  }
  return title.trim();
}

function finalizeParsedSongs(contentShow, show, songs) {
  const classifiedSongs = songs
    .map((song) => ({
      ...song,
      lines: song.lines.filter((line) => !isInstrumentalPlaceholderLine(line)),
      explicitlyInstrumental: song.lines.some((line) => isInstrumentalPlaceholderLine(line))
        || /(?:\binstrumental\b|纯音乐|纯器乐|器乐曲)/iu.test(`${song.sourceTitle || ""} ${song.title || ""} ${song.titleZh || ""}`),
    }));

  const emptyUnclassifiedSongs = classifiedSongs.filter((song) => {
    const inConfiguredRange = (show.sourceOrderMin === undefined || song.order >= show.sourceOrderMin)
      && (show.sourceOrderMax === undefined || song.order <= show.sourceOrderMax);
    return inConfiguredRange
      && !song.excludeFromPage
      && !song.explicitlyInstrumental
      && song.lines.length === 0;
  });
  if (emptyUnclassifiedSongs.length) {
    const details = emptyUnclassifiedSongs
      .map((song) => `${String(song.order).padStart(2, "0")} "${song.sourceTitle || song.title}"`)
      .join(", ");
    throw new Error(
      `${show.slug} track ${details} has no lyric rows and is not explicitly instrumental or excluded. `
      + "Restore it from the authoritative or reviewed local source; if no local source exists, research and record an online source before generation.",
    );
  }

  const renderedSongs = classifiedSongs
    .filter((song) => !song.excludeFromPage)
    .filter((song) => song.lines.length > 0)
    .filter((song) => show.sourceOrderMin === undefined || song.order >= show.sourceOrderMin)
    .filter((song) => show.sourceOrderMax === undefined || song.order <= show.sourceOrderMax)
    .map((song, index) => {
      const { sourceTitle, excludeFromPage, explicitlyInstrumental, ...displaySong } = song;
      const translatedTitle = SONG_TITLE_OVERRIDES[contentShow.slug]?.[sourceTitle]
        || song.titleZh
        || SONG_TITLE_TRANSLATIONS[show.slug]?.[sourceTitle]
        || SONG_TITLE_TRANSLATIONS[contentShow.slug]?.[sourceTitle]
        || SONG_TITLE_OVERRIDES[contentShow.slug]?.[song.title]
        || SONG_TITLE_TRANSLATIONS[show.slug]?.[song.title]
        || SONG_TITLE_TRANSLATIONS[contentShow.slug]?.[song.title]
        || "";
      return {
        ...displaySong,
        titleZh: stripSongTitleVersionSuffix(translatedTitle),
        sourceOrder: song.order,
        displayOrder: show.displayOrderOverrides?.[song.order] || index + 1,
      };
    })
    .sort((left, right) => left.displayOrder - right.displayOrder);

  return normalizeSongsForShow(contentShow, renderedSongs);
}

function isInstrumentalMarkerText(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[\[(（【]\s*/u, "")
    .replace(/\s*[\])）】]$/u, "")
    .replace(/[。.!！;；:：]+$/gu, "")
    .replace(/\s+/g, " ");
  return INSTRUMENTAL_MARKERS.has(normalized);
}

function isInstrumentalPlaceholderLine(line) {
  const texts = [line.original, line.zh, line.en]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return texts.length > 0 && texts.every(isInstrumentalMarkerText);
}

function normalizeSongsForShow(show, songs) {
  return songs.map((song) => {
    let lines = show.slug === "le-roi-soleil" && song.sourceOrder === 2
      ? splitRoiSoleilOpening(song.lines, show)
      : normalizeGeneratedSongLines(show, song.lines);
    if (show.slug === "1789-les-amants-de-la-bastille" && song.sourceOrder === 2) {
      lines = merge1789OpeningLines(lines, show);
    }
    return {
      ...song,
      lines: mergeReviewedLineWraps(lines, show).map((line) => ({
        ...line,
        original: normalizeGeneratedLineText(show, line.original, "original"),
        zh: normalizeGeneratedLineText(show, line.zh, "zh"),
        en: normalizeGeneratedLineText(show, line.en, "en"),
      })),
    };
  });
}

function mergeReviewedLineWraps(lines, show) {
  const groups = new Map(
    (LINE_MERGE_OVERRIDES[show.slug] || []).map((ids) => [ids[0], ids]),
  );
  const merged = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const ids = groups.get(line.id);
    if (!ids) {
      merged.push(line);
      index += 1;
      continue;
    }
    const members = lines.slice(index, index + ids.length);
    const actualIds = members.map((member) => member.id);
    if (actualIds.join("\n") !== ids.join("\n")) {
      throw new Error(`Line merge mismatch for ${show.slug}: expected ${ids.join(", ")}; got ${actualIds.join(", ")}`);
    }
    if (!isSafeReviewedLineMerge(members)) {
      merged.push(line);
      index += 1;
      continue;
    }
    const textOverride = MERGED_LINE_TEXT_OVERRIDES[line.id] || {};
    const joinedOriginal = members.map((member) => member.original).join(" ")
      .replace(/\s+([,.;!?…])/gu, "$1")
      .trim();
    const original = textOverride.original || joinedOriginal;
    const joinedEnglish = members.map((member) => member.en).filter(Boolean).join(" ")
      .replace(/\s+([,.;!?…])/gu, "$1")
      .trim();
    const joinedChinese = members.map((member) => member.zh).filter(Boolean).join("").trim();
    merged.push({
      ...line,
      original,
      ipa: ipaFor(original, show.voice),
      en: textOverride.en ?? joinedEnglish,
      zh: textOverride.zh ?? joinedChinese,
      note: members.map((member) => member.note).filter(Boolean).join("；"),
      ...(textOverride.repeatCount ? { repeatCount: textOverride.repeatCount } : {}),
    });
    index += ids.length;
  }
  return merged.map((line, index) => ({ ...line, lineIndex: index + 1 }));
}

function isSafeReviewedLineMerge(members) {
  if (!Array.isArray(members) || members.length < 2) {
    return false;
  }
  const original = members.map((member) => String(member.original || "").trim()).filter(Boolean).join(" ");
  const vocalizationOnly = members.every((member) => /^(?:[a-z]+\W*)+$/iu.test(String(member.original || "").trim())
    && !/[\p{L}]{3,}/u.test(String(member.original || "").trim().replace(/^(?:woah|oh|ah|ha|la|na)\b/iu, "")));
  if (vocalizationOnly) return true;
  if (members.length > MAX_REVIEWED_LINE_MERGE_ROWS) return false;
  const wordCount = original.match(/[\p{L}\p{N}]+(?:[’'’-][\p{L}\p{N}]+)*/gu)?.length || 0;
  const wordLimit = REVIEWED_LONG_LINE_MERGE_START_IDS.has(members[0]?.id)
    ? MAX_REVIEWED_LINE_MERGE_WORDS + 1
    : MAX_REVIEWED_LINE_MERGE_WORDS;
  if (!wordCount || wordCount > wordLimit) return false;
  return !/[.!?…]+[”’'"』」）)\]]*\s+[“‘'"（(【\[]*[\p{Lu}]/u.test(original);
}

function merge1789OpeningLines(lines, show) {
  const groups = new Map([
    ["1789-les-amants-de-la-bastille-02-004", { count: 3, original: "Pour qui courir le risque de marcher à genoux ?", en: "For whom take the risk of walking on one's knees?", zh: "为了谁，要冒险卑躬屈膝？" }],
    ["1789-les-amants-de-la-bastille-02-009", { count: 3, original: "L'odieux chant du phénix qui nous prend tout", en: "The hateful song of the phoenix that takes everything from us", zh: "那可憎的凤凰之歌夺走了我们的一切" }],
    ["1789-les-amants-de-la-bastille-02-012", { count: 2, original: "J'ai subi le supplice du baiser sur la joue", en: "I endured the torment of a kiss on the cheek", zh: "我承受了面颊之吻的折磨" }],
    ["1789-les-amants-de-la-bastille-02-014", { count: 2, original: "Faut-il boire le calice jusqu'au bout ?", en: "Must we drink the bitter cup to the very end?", zh: "难道必须把这杯苦酒喝到底？" }],
    ["1789-les-amants-de-la-bastille-02-016", { count: 2, original: "Rien ne vaut le prix d'un homme", en: "Nothing is worth the price of a man", zh: "没有什么抵得上一个人的价值" }],
    ["1789-les-amants-de-la-bastille-02-018", { count: 2, original: "Ne tisse pas ta couronne dans le fil qui nous tient", en: "Do not weave your crown with the thread that binds us", zh: "不要用束缚我们的线编织你的王冠" }],
    ["1789-les-amants-de-la-bastille-02-020", { count: 2, original: "Le cri de ma naissance valait le tien", en: "The cry at my birth was worth yours", zh: "我出生时的啼哭与你的一样珍贵" }],
    ["1789-les-amants-de-la-bastille-02-025", { count: 2, original: "On se perd dans les rixes des règles que l'on fixe", en: "We lose ourselves in brawls over rules we set", zh: "我们迷失在自己定下规则的争斗中" }],
    ["1789-les-amants-de-la-bastille-02-027", { count: 4, original: "Soldats de père en fils, sans cesse au garde à vous, sous le joug des milices jusqu'au bout", en: "Soldiers from father to son, forever at attention under the yoke of militias to the very end", zh: "父子代代为兵，永远立正，直到最后都受民兵枷锁奴役" }],
    ["1789-les-amants-de-la-bastille-02-031", { count: 2, original: "Rien ne vaut le prix d'un homme", en: "Nothing is worth the price of a man", zh: "没有什么抵得上一个人的价值" }],
    ["1789-les-amants-de-la-bastille-02-033", { count: 2, original: "Ne tisse pas ta couronne dans le fil qui nous tient", en: "Do not weave your crown with the thread that binds us", zh: "不要用束缚我们的线编织你的王冠" }],
    ["1789-les-amants-de-la-bastille-02-035", { count: 2, original: "Le cri de ma naissance valait le tien", en: "The cry at my birth was worth yours", zh: "我出生时的啼哭与你的一样珍贵" }],
  ]);
  const merged = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const group = groups.get(line.id);
    if (!group) {
      merged.push(line);
      index += 1;
      continue;
    }
    merged.push({
      ...line,
      original: group.original,
      ipa: ipaFor(group.original, show.voice),
      en: group.en,
      zh: group.zh,
    });
    index += group.count;
  }
  return merged.map((line, index) => ({ ...line, lineIndex: index + 1 }));
}

function normalizeGeneratedSongLines(show, lines, allowLongLineSplit = true) {
  const splitOrdinaryComma = new Set([
    "1789-les-amants-de-la-bastille",
    "moliere-le-spectacle-musical",
  ]).has(show.slug);

  const expanded = lines.flatMap((line) => {
    const sourceLineIndex = line.sourceLineIndex ?? line.lineIndex;
    const explicitSegments = allowLongLineSplit ? LINE_SEGMENT_OVERRIDES[line.id] : null;
    if (Array.isArray(explicitSegments) && explicitSegments.length > 1) {
      return explicitSegments.flatMap((segment, index) => normalizeGeneratedSongLines(show, [{
        ...line,
        ...segment,
        en: segment.en ?? line.en,
        id: `${line.id}-${String.fromCharCode(97 + index)}`,
        sourceLineIndex,
      }], false));
    }
    const longSegments = allowLongLineSplit ? splitAlignedLongLine(line) : null;
    if (longSegments) {
      return longSegments.flatMap((segment, index) => normalizeGeneratedSongLines(show, [{
        ...line,
        ...segment,
        id: `${line.id}-${String.fromCharCode(97 + index)}`,
        sourceLineIndex,
      }], false));
    }
    let originals = splitAlignedSentenceSegments(line);
    if (originals.length === 1) originals = [line.original];
    let sentenceAligned = originals.length > 1;
    if (line.original.includes("，")) {
      originals = line.original.split(/\s*，\s*/u).filter(Boolean);
      sentenceAligned = false;
    } else if (splitOrdinaryComma || (show.slug === "mozart-opera-rock" && line.original === "On se reverra, On se reverra")) {
      const candidates = line.original.split(/\s*,\s*(?=[A-ZÀÂÄÇÉÈÊËÎÏÔÙÛÜŸŒÆ])/u).filter(Boolean);
      if (candidates.length > 1 && new Set(candidates.map((part) => part.toLocaleLowerCase("fr-FR"))).size > 1) {
        originals = candidates;
        sentenceAligned = false;
      }
    }

    const count = originals.length;
    const english = sentenceAligned
      ? splitSentenceSegments(line.en, false)
      : count > 1
        ? String(line.en).split(/\s*[,，]\s*(?=[A-Z])/u).filter(Boolean)
        : [line.en];
    const chinese = sentenceAligned
      ? splitSentenceSegments(line.zh, true)
      : count > 1
        ? String(line.zh).split(/\s*，\s*/u).filter(Boolean)
        : [line.zh];

    return originals.map((original, index) => {
      const normalizedOriginal = normalizeGeneratedLineText(show, original, "original");
      return {
        ...line,
        sourceLineIndex,
        id: count === 1 ? line.id : `${line.id}-${String.fromCharCode(97 + index)}`,
        original: normalizedOriginal,
        ipa: count === 1
          ? existingLineIpa(show, line.id, normalizedOriginal, line.ipa) || line.ipa || ipaFor(normalizedOriginal, show.voice)
          : ipaFor(normalizedOriginal, show.voice),
        en: normalizeGeneratedLineText(show, english[index] || line.en, "en"),
        zh: normalizeGeneratedLineText(show, chinese[index] || line.zh, "zh"),
        note: index === 0 ? line.note : "",
      };
    });
  });

  return expanded.map((line, index) => ({ ...line, lineIndex: index + 1 }));
}

function splitSentenceSegments(value, chinese) {
  const text = String(value || "").trim();
  if (!text) return [];
  const endings = chinese ? new Set(["。", "！", "？", "…"]) : new Set([".", "!", "?", "…"]);
  const closers = new Set(["”", "’", "'", '"', "』", "」", "）", ")", "】", "]"]);
  const segments = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!endings.has(text[index])) continue;
    let end = index + 1;
    while (endings.has(text[end])) end += 1;
    while (closers.has(text[end])) end += 1;
    let next = end;
    while (/\s/u.test(text[next] || "")) next += 1;
    if (next >= text.length) continue;
    segments.push(text.slice(start, end).trim());
    start = next;
    index = next - 1;
  }
  segments.push(text.slice(start).trim());
  return segments.filter(Boolean);
}

function splitClauseSegments(value, chinese) {
  const text = String(value || "").trim();
  if (!text) return [];
  const endings = chinese
    ? new Set(["，", "；", "：", "。", "！", "？", "…"])
    : new Set([",", ";", ":", ".", "!", "?", "…"]);
  const closers = new Set(["”", "’", "'", '"', "』", "」", "）", ")", "】", "]"]);
  const segments = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!endings.has(text[index])) continue;
    let end = index + 1;
    while (endings.has(text[end])) end += 1;
    while (closers.has(text[end])) end += 1;
    let next = end;
    while (/\s/u.test(text[next] || "")) next += 1;
    segments.push(text.slice(start, end).trim());
    start = next;
    index = next - 1;
  }
  if (start < text.length) segments.push(text.slice(start).trim());
  return segments.filter(Boolean);
}

function splitAlignedLongLine(line) {
  const original = String(line.original || "").trim();
  const originalWordCount = countLyricWords(original);
  if (originalWordCount <= MAX_REVIEWED_LINE_MERGE_WORDS) return null;
  const hasEnglishTranslation = Boolean(String(line.en || "").trim());
  const sourceVariants = [
    { kind: "sentence", parts: splitSentenceSegments(original, false), priority: 0 },
    { kind: "clause", parts: splitClauseSegments(original, false), priority: 2 },
  ];
  const chineseVariants = [
    { kind: "sentence", parts: splitSentenceSegments(line.zh, true), priority: 0 },
    { kind: "clause", parts: splitClauseSegments(line.zh, true), priority: 2 },
  ];
  const englishVariants = hasEnglishTranslation
    ? [
      { kind: "sentence", parts: splitSentenceSegments(line.en, false), priority: 0 },
      { kind: "clause", parts: splitClauseSegments(line.en, false), priority: 2 },
    ]
    : [];
  const candidates = [];

  for (const sourceVariant of sourceVariants) {
    for (const chineseVariant of chineseVariants) {
      const aligned = alignLongLineVariants(sourceVariant.parts, chineseVariant.parts, "");
      if (!aligned) continue;
      const [sourceParts, chineseParts] = aligned;
      if (hasEnglishTranslation) {
        for (const englishVariant of englishVariants) {
          if (englishVariant.parts.length !== sourceParts.length) continue;
          candidates.push({
            sourceParts,
            chineseParts,
            englishParts: englishVariant.parts,
            priority: sourceVariant.priority + chineseVariant.priority + englishVariant.priority,
          });
        }
      } else {
        candidates.push({
          sourceParts,
          chineseParts,
          englishParts: [],
          priority: sourceVariant.priority + chineseVariant.priority,
        });
      }
    }
  }

  const usable = candidates.filter((candidate) => {
    const count = candidate.sourceParts.length;
    if (count < 2 || count > 4) return false;
    if (candidate.sourceParts.some((part) => countLyricWords(part) < 3)) return false;
    if (candidate.sourceParts.some((part) => !hasBalancedParentheses(part))) return false;
    const maxWords = Math.max(...candidate.sourceParts.map(countLyricWords));
    return maxWords <= MAX_REVIEWED_LINE_MERGE_WORDS + 4 && maxWords < originalWordCount;
  });
  if (!usable.length) return null;
  usable.sort((left, right) => {
    const leftMax = Math.max(...left.sourceParts.map(countLyricWords));
    const rightMax = Math.max(...right.sourceParts.map(countLyricWords));
    return leftMax - rightMax || left.priority - right.priority || left.sourceParts.length - right.sourceParts.length;
  });
  const best = usable[0];
  return best.sourceParts.map((part, index) => ({
    original: part,
    en: best.englishParts[index] || "",
    zh: best.chineseParts[index] || "",
  }));
}

function alignLongLineVariants(sourceParts, chineseParts, joiner) {
  if (sourceParts.length < 2 || chineseParts.length < 2) return null;
  if (sourceParts.length === chineseParts.length) return [sourceParts, chineseParts];
  if (sourceParts.length > chineseParts.length) {
    const groupedSource = groupSegmentsToCount(sourceParts, chineseParts.length, " ", sourceParts, chineseParts);
    return groupedSource ? [groupedSource, chineseParts] : null;
  }
  const groupedChinese = groupSegmentsToCount(chineseParts, sourceParts.length, joiner, chineseParts, sourceParts);
  return groupedChinese ? [sourceParts, groupedChinese] : null;
}

function groupSegmentsToCount(parts, count, joiner, longParts, referenceParts) {
  if (parts.length < count || count < 1) return null;
  if (parts.length === count) return parts;
  const weights = (value, chinese) => chinese
    ? Math.max(Array.from(String(value || "")).length, 1)
    : Math.max(countLyricWords(value), 1);
  const isChinese = joiner === "";
  const total = parts.reduce((sum, part) => sum + weights(part, isChinese), 0);
  const referenceTotal = referenceParts.reduce((sum, part) => sum + weights(part, !isChinese), 0);
  const prefix = [0];
  parts.forEach((part) => prefix.push(prefix[prefix.length - 1] + weights(part, isChinese)));
  const referencePrefix = [0];
  referenceParts.forEach((part) => referencePrefix.push(referencePrefix[referencePrefix.length - 1] + weights(part, !isChinese)));
  const groups = [];
  let start = 0;
  for (let group = 1; group <= count; group += 1) {
    const remainingGroups = count - group;
    if (group === count) {
      groups.push(parts.slice(start).join(joiner).trim());
      break;
    }
    const desired = total * (referencePrefix[group] / referenceTotal);
    let bestEnd = start + 1;
    let bestDistance = Infinity;
    const maxEnd = parts.length - remainingGroups;
    for (let end = start + 1; end <= maxEnd; end += 1) {
      const distance = Math.abs(prefix[end] - desired);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestEnd = end;
      }
    }
    groups.push(parts.slice(start, bestEnd).join(joiner).trim());
    start = bestEnd;
  }
  return groups.every(Boolean) ? groups : null;
}

function countLyricWords(value) {
  return String(value || "").match(/[\p{L}\p{N}]+(?:[’'’-][\p{L}\p{N}]+)*/gu)?.length || 0;
}

function splitAlignedSentenceSegments(line) {
  const original = splitSentenceSegments(line.original, false);
  if (original.length < 2 || countLyricWords(line.original) < 18) return [line.original];
  if (original.some((segment) => !hasBalancedParentheses(segment))) return [line.original];
  const chinese = splitSentenceSegments(line.zh, true);
  const english = splitSentenceSegments(line.en, false);
  if (chinese.length !== original.length) return [line.original];
  if (String(line.en || "").trim() && english.length !== original.length) return [line.original];
  return original;
}

function hasBalancedParentheses(value) {
  let depth = 0;
  for (const char of String(value || "")) {
    if ("([{（【".includes(char)) depth += 1;
    if (")] }】）".replace(/\s/gu, "").includes(char)) depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function alignParallelSegments(parts, count, joiner) {
  if (parts.length <= count) return parts;
  const leadingCount = parts.length - count + 1;
  return [parts.slice(0, leadingCount).join(joiner), ...parts.slice(leadingCount)];
}

function normalizeGeneratedLineText(show, value, field) {
  let cleaned = String(value || "")
    .replace(/[！]/gu, "!")
    .replace(/[？]/gu, "?")
    .replace(/[：]/gu, ":")
    .replace(/[；]/gu, ";")
    .replace(/[，]/gu, ",")
    .replace(/[（）]/gu, (character) => character === "（" ? "(" : ")")
    .replace(/([.!?]|\p{Script=Latin})\(/gu, "$1 (")
    .replace(/\)(?=\p{Script=Latin})/gu, ") ")
    .replace(/——+/gu, "—")
    .replace(/^_+|_+$/gu, "")
    .replace(/_{2,}/gu, "…")
    .replace(/\\+\s*$/gu, "")
    .replace(/,\s*(?=\S)/gu, ", ")
    .replace(/([!?])\s*,/gu, "$1")
    .replace(/([!?])(?=\p{L})/gu, "$1 ")
    .replace(/([:;])(?=\p{L})/gu, "$1 ")
    .replace(/\s*，\s*/gu, ", ")
    .replace(/\s*：\s*/gu, ": ")
    .replace(/\s*；\s*/gu, "; ")
    .replace(/,\s*,+/gu, ", ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/,+\s*$/gu, "")
    .trim();
  if (field === "original") {
    (SHOW_LYRIC_CORRECTIONS[show.slug] || []).forEach(([pattern, replacement]) => {
      cleaned = cleaned.replace(pattern, replacement);
    });
  }
  if (field === "zh") {
    cleaned = cleaned
      .replace(/,\s*/gu, "，")
      .replace(/!\s*/gu, "！")
      .replace(/\?\s*/gu, "？")
      .replace(/:\s*/gu, "：")
      .replace(/;\s*/gu, "；")
      .replace(/\(/gu, "（")
      .replace(/\)/gu, "）")
      .replace(/\s+([，。！？；：）])/gu, "$1")
      .replace(/（\s+/gu, "（");
  }
  return cleaned;
}

function splitRoiSoleilOpening(lines, show) {
  const splitOriginal = (value) => String(value).split(/\s*[,，]\s*(?=[A-ZÀÂÄÇÉÈÊËÎÏÔÙÛÜŸŒÆ])/u).filter(Boolean);
  const splitEnglish = (value) => String(value).split(/\s*[,，]\s*(?=[A-Z])/u).filter(Boolean);
  const splitChinese = (value) => String(value).split(/\s*，\s*/u).filter(Boolean);
  const align = (parts, count) => {
    if (parts.length <= count) return parts;
    const leadingCount = parts.length - count + 1;
    return [parts.slice(0, leadingCount).join("，"), ...parts.slice(leadingCount)];
  };
  const expanded = [];

  lines.forEach((line) => {
    const originals = splitOriginal(line.original);
    const english = align(splitEnglish(line.en), originals.length);
    const chinese = align(splitChinese(line.zh), originals.length);
    originals.forEach((original, index) => {
      const lineIndex = expanded.length + 1;
      expanded.push({
        ...line,
        id: `${show.slug}-${String(line.id.match(/-(\d{2})-/)?.[1] || 2).padStart(2, "0")}-${String(lineIndex).padStart(3, "0")}`,
        lineIndex,
        original,
        ipa: ipaFor(original, show.voice),
        en: english[index] || line.en,
        zh: chinese[index] || line.zh,
        note: index === 0 ? line.note : "",
      });
    });
  });

  return expanded;
}

function splitMarkdownRow(row) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function rowByHeader(header, cells) {
  return Object.fromEntries(header.map((name, index) => [name, cells[index] || ""]));
}

function cleanCell(value) {
  return String(value)
    .replace(/(?:\[\d{1,2}:\d{2}(?:\.\d+)?\])+/gu, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\\\|/g, "|")
    .replace(/&apos;|&#0*39;|&#x0*27;/giu, "'")
    .replace(/&quot;|&#0*34;|&#x0*22;/giu, '"')
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#8203;|&#x200b;/giu, "")
    .replace(/\u00b4/gu, "'")
    .replace(/(\p{Script=Latin}),(?=\p{Script=Latin})/gu, "$1, ")
    .replace(/(\p{Script=Latin})([.!?;:])(?=\p{Script=Latin})/gu, "$1$2 ")
    .replace(/(\p{Script=Latin}|[.!?])\(/gu, "$1 (")
    .replace(/\)(?=\p{Script=Latin})/gu, ") ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSongTitleVersionSuffix(value) {
  let title = cleanCell(value);
  const versionSuffix = /\s*(?:[（(\[［]\s*(?:live(?:\s+[^)）\]］]*)?|现场(?:版|录音|演出版)?)(?:[)）\]］])|[-–—]\s*live)\s*$/iu;
  while (versionSuffix.test(title)) {
    title = title.replace(versionSuffix, "").trim();
  }
  return title;
}

const SPEAKER_HINT = /(?:judge|lucheni|toten|sophie|ludovika|max|\bfj\b|rudolf|\btod\b|chor|sisi|herzog|verwandt|ehepaar|schwager|helene|gouvernante|erzherzog|graf|kardinal|franz|mutter|fürst|fürsten|hochzeit|gräfin|hofdame|zofe|friseuse|männer|frauen|menge|aristokrat|professor|journalist|student|bohemien|poet|cafégast|arzt|baron|rauscher|richter|elisabeth|eisabeth|gäste|leopold|zinzendorf|salieri|waldstätten|nannerl|mesmer|wolfgang|mozart|chamberlain|arco|ensemble|anna|händlerin|gemüsefrau|gewürzhändlerin|obstfrau|passanten|schikaneder|colloredo|constanze|constance|cecilia|aloysia|josephine|raoul|andre|confidante|fop|firmin|countess|attilio|carlotta|phantom|meg|christine|chief|firemen|marksman|voice|don juan|passarino|aminta|giry|stagehand|sadia|johnny|marie-jeanne|roger|gourou|stella|zéro|clapman|cristal|speakerine|clients|both|\ball\b|chorus|\bp\b|\br\b|\bmj\b|\bgel\b|ge-l)/iu;
const KNOWN_CHINESE_TRANSLATION_ROLES = new Set([
  "众", "合唱", "爸爸", "妈妈", "姐姐", "弟弟", "发辫", "沙粒", "亚瑟", "莫扎特",
  "康斯坦斯", "沃尔夫冈", "凯瑞", "爱丽丝", "萝丝", "多丽丝", "乔", "诺玛", "麦克斯", "贝蒂", "埃文",
  "小王子", "飞行员", "大人们", "玫瑰花们", "狐狸", "蛇", "仙人掌们", "合", "回声",
  "地理学家", "国王", "酒鬼", "玫瑰", "商人", "扳道工", "卖药丸的商人", "药丸商人",
]);
const SHOW_CHINESE_TRANSLATION_SPEAKERS = {
  "chicago": new Set(["双方，语音"]),
  "cyrano-de-bergerac": new Set(["全体"]),
  "elisabeth-das-musical": new Set([
    "一粒沙", "死者", "索菲", "弗兰茨", "马科斯", "鲁道夫", "索菲&路德维卡", "马克斯", "弗朗茨·约瑟夫", "其他死者", "青年鲁道夫", "幼年鲁道夫",
    "弗朗茨·约瑟夫&鲁道夫&马克斯&索菲&路德维卡", "所有死者", "死神", "皇太后", "皇帝", "皇太后索菲",
    "路德维卡", "海伦娜", "路德维卡公爵夫人", "伊丽莎白叔父", "伊丽莎白的叔父", "叔父和舅父们", "一对夫妇",
    "其他亲戚", "其他的亲戚", "路德维卡的侄女", "路德维卡的妹夫", "一个远亲", "一个亲戚", "刚才那对夫妇",
    "舅父们", "那对夫妇", "家庭教师", "格林纳伯爵", "格拉夫·格林讷", "犯人母亲", "施瓦岑贝柯侯爵",
    "马科斯公爵", "马科斯&索菲", "史蒂凡·卡罗伊伯爵", "埃勒梅尔·巴卡尼伯爵", "鲁契尼", "教授", "学生",
    "艺术家", "记者", "流浪艺人", "流浪艺人2", "诗人", "鲁&诗人", "客人1", "客人2", "教授&学生",
    "流浪艺人&诗人", "学生&教授", "宫女", "宫女们", "女人们", "男人们", "众人", "所有人", "病人们",
    "病院相关管理人员", "女疯子", "女疯子&伊丽莎白", "伯爵夫人", "伯爵夫人&宫女", "伯爵", "侯爵", "医生",
    "医生（死神）", "美发师", "红衣大主教劳施尔", "肯佩恩男爵", "劳施尔", "法官", "死亡", "伊丽莎白",
    "伊丽莎白姑母", "伊丽莎白的姑母", "久洛·安德拉希伯爵", "格林讷伯爵", "男爵", "学生2", "随从", "路德维拉公爵夫人", "伊丽莎白&马科斯", "一粒沙&死神&弗兰茨", "索菲&宫女",
  ]),
  "dear-evan-hansen": new Set(["杰瑞德", "丹与谢伊"]),
  "don-juan": new Set(["唐卡洛斯", "唐·卡洛斯", "埃尔维拉和拉斐尔"]),
  "dracula-das-musical": new Set([
    "露西&米娜", "露西 & 米娜", "昆西&杰克&阿瑟", "昆西 & 杰克 & 阿瑟", "德古拉&米娜", "德古拉 & 米娜",
    "德古拉&米娜&乔纳森", "德古拉 & 米娜 & 乔纳森", "德古拉（米娅）",
  ]),
  "la-legende-du-roi-arthur": new Set(["Cam ＆Flo", "Cam＆Flo", "Zaho ＆发辫", "Zaho＆发辫", "Cam ＆Zaho", "Cam＆Zaho"]),
  "legally-blonde": new Set(["女士", "卡拉汉"]),
  "love-never-dies": new Set([
    "爵", "桶", "一起", "舞台工作者1", "舞台工作者2", "拉乌尔", "拉乌尔/魅影", "魅影", "舞台工作者",
    "姬莉夫人", "姬莉夫人/拉乌尔/魅影", "梅格",
  ]),
  "matilda": new Set(["特朗奇布尔女士", "孩子，念白"]),
  "mozart-das-musical": new Set([
    "利奥波德", "科洛雷多", "钦岑多夫伯爵夫人", "阿尔科伯爵", "南内尔", "康斯坦丝", "侍从官", "康斯坦茨",
    "阿尔科", "众人", "安娜", "男爵夫人", "索菲/约瑟芬", "采齐莉娅", "康斯坦茨＆沃尔夫冈", "萨列里",
    "阿洛伊西娅", "利奥波德 ＆ 沃尔夫冈", "卡尔·约瑟夫·阿尔克伯爵", "娜奈尔", "安东尼奥·萨列里", "客人们",
    "沃德斯塔腾男爵夫人", "迈斯莫博士", "采齐莉娅/约瑟芬", "采齐莉娅/阿洛伊西娅/约瑟芬", "索菲",
  ]),
  "phantom-of-the-opera": new Set([
    "卡洛塔", "女声", "爵", "桶", "一起", "舞台工作者1", "舞台工作者2", "拉乌尔", "拉乌尔/魅影", "魅影",
    "舞台工作者", "姬莉夫人", "姬莉夫人/拉乌尔/魅影", "梅格",
  ]),
  "rent": new Set(["马", "乔安妮", "马克", "马克和和声", "罗杰和咪咪", "除了本尼之外的所有人"]),
  "rebecca-das-musical": new Set(["“我”", "马克西姆 （对 \"我\"）", "马克西姆 (对 \"我\")"]),
  "starmania": new Set([
    "玛丽", "玛丽·珍", "顾客们", "女播报员", "女仆", "约翰尼", "萨迪亚", "助理", "斯黛拉", "泽若", "泽", "助", "斯",
    "仆", "摄影师", "女播音员", "罗杰", "克丽丝达", "父", "母", "强尼", "马拉大师的教徒们",
  ]),
  "sunset-boulevard": new Set([
    "全部", "曼弗雷德", "阿蒂", "女孩", "玛丽", "男孩", "全体", "推销员", "谢尔德雷克", "两者", "乔安娜", "第 1 组",
    "第 2 组", "第一个财务人", "萨米", "两人", "演员", "第一个财务人员", "第一财务员", "第二个财务人", "第二财务员",
    "迈伦", "乔，画外音", "乔发言", "凯瑟琳", "分析者", "医生", "占星家", "售货员", "四人", "年轻人", "所有",
    "按摩师 1", "按摩师 2", "推销员 3", "推销员 4", "推销员 5", "推销员 6", "推销员 7", "销售员", "销售员 1", "销售员 2",
    "美容师 1", "美容师 2", "美容师 3", "美容师2", "记者", "酒保", "秘书", "琼斯", "我会说", "第二个财务人员",
  ]),
  "suffs": new Set(["爱丽丝", "Ruza/Doris/Alice"]),
  "tanz-der-vampire": new Set([
    "小阿，沙拉", "玛格达，瑞贝卡，沙葛", "库科（对莎拉）", "沙葛（职业假笑）", "教授（开心）",
    "凡·库若洛克对阿尔弗雷德喊道",
  ]),
  "tick-tick-boom": new Set(["乔乔&迈克尔", "迈克尔&苏珊"]),
  "wicked": new Set(["警卫", "所有人"]),
};
const NDDP_SOURCE_SPEAKERS = new Set([
  "quasimodo", "frollo", "phoebus", "phœbus", "pheobus", "esmeralda", "esméralda",
  "gringoire", "clopin", "fleur-de-lys", "ensemble", "esmeralda&fleur-de-lys",
  "esméralda&fleur-de-lys", "frollo et gringoire", "frollo et la foule",
]);
const NDDP_TRANSLATION_SPEAKERS = new Map([
  ["卡西莫多", "Quasimodo"],
  ["孚罗洛", "Frollo"],
  ["弗罗洛", "Frollo"],
  ["菲比斯", "Phoebus"],
  ["葛林果", "Gringoire"],
  ["百合", "Fleur-de-Lys"],
  ["克洛潘", "Clopin"],
  ["爱斯美拉达", "Esméralda"],
  ["艾斯美拉达", "Esméralda"],
  ["艾斯梅拉达", "Esméralda"],
  ["艾丝美拉达", "Esméralda"],
  ["诗人", "Gringoire"],
  ["主教", "Frollo"],
  ["合", "Ensemble"],
  ["孚罗洛和众人", "Frollo / la foule"],
  ["弗罗洛和葛林果", "Frollo / Gringoire"],
]);
const NDDP_ENGLISH_TRANSLATION_SPEAKERS = new Map([
  ["frollo and gringoire", "Frollo / Gringoire"],
  ["frollo and the crowd", "Frollo / la foule"],
  ["frollo and crowd", "Frollo / la foule"],
  ["together", "Ensemble"],
]);
const KNOWN_SOURCE_ROLE_LABELS = new Set([
  "chor (wolfgang)",
  "chœur",
  "der tod & rudolf",
  "don carlos",
  "wolfgang (chor)",
]);
const SHOW_STANDALONE_SOURCE_ROLE_LABELS = {
  "chicago": new Set(["velma and matron"]),
  "dear-evan-hansen": new Set(["dan + shay"]),
  "don-juan": new Set(["elvira & raphaël"]),
  "dracula-das-musical": new Set([
    "lucy & mina",
    "dracula & mina",
    "dracula & mina & jonathan",
    "quincy, jack und arthur",
    "dracula (mina)",
  ]),
  "legally-blonde": new Set(["lady", "calahan"]),
  "les-miserables": new Set([
    "1st convict",
    "2nd convict",
    "3rd convict",
    "4th convict",
    "5th convict",
    "army officer",
    "army officer (offstage)",
    "all",
    "babet",
    "bamatabois",
    "beggars at the feast",
    "bishop",
    "brujon",
    "claquesous",
    "combeferre",
    "chorus",
    "constable 1",
    "constable 2",
    "cosette",
    "courfeyrac",
    "enjolras",
    "enjoras",
    "eponine",
    "eponine (to herself)",
    "employer",
    "fantine",
    "feuilly",
    "gavroche",
    "grantaire",
    "javert",
    "jean prouvaire",
    "joly",
    "laborer",
    "lesgles",
    "m. & mme. thenardier",
    "marius",
    "marius & eponine",
    "mme. thenardier",
    "montparnasse",
    "prouvaire",
    "sentry",
    "students",
    "students 1",
    "students 2",
    "thenardier",
    "thenardier & drinkers",
    "valjean",
    "valjean & fantine",
  ]),
  "starmania": new Set(["la femme de chambre"]),
  "suffs": new Set([
    "wilson/doctor white & major sylvester",
    "alice & nwp suffs",
  ]),
  "tanz-der-vampire": new Set([
    "von krolocks stimme (zu alfred)",
    "abronsius (*freu*)",
  ]),
  "sunset-boulevard": new Set(["joan of arc"]),
};
const KNOWN_LYRIC_COLON_LABELS = new Set([
  "die große redoute",
  "das wunder mozart",
]);

const SPEAKER_IPA_PREFIXES = {
  "notre-dame-de-paris": {
    quasimodo: "kazimodo",
    frollo: "fʁɔlo",
    esmeralda: "ɛsmeʁalda",
    gringoire: "ɡʁɛ̃ɡwaʁ",
    phoebus: "febys",
    clopin: "klɔpɛ̃",
    "frollo / gringoire": "fʁɔlo e ɡʁɛ̃ɡwaʁ",
    "frollo / la foule": "fʁɔlo e la ful",
    "esmeralda / fleur-de-lys": "ɛsmeʁalda e flœʁdəlis",
    "fleur-de-lys": "flœʁdəlis",
  },
};

function isStandaloneBracketedSpeakerRow(original, row, show) {
  const label = cleanCell(original).match(/^\s*(?:\[([^\]]{1,48})\]|【([^】]{1,48})】)\s*$/u)?.slice(1).find(Boolean)?.trim() || "";
  if (!label || /[!?！？]/u.test(label) || (!SPEAKER_HINT.test(label) && !isKnownSourceRole(label, show))) return false;
  if (isKnownSourceRole(label, show)) return true;
  const parallelTranslations = [row["中文翻译（校订）"], row["English Translation"]]
    .filter((value) => cleanCell(value));
  return parallelTranslations.length > 0
    && parallelTranslations.every((value) => /^\s*(?:\[[^\]]{1,500}\]|【[^】]{1,500}】)\s*$/u.test(cleanCell(value)));
}

function normalizeSourceRoleLabel(value) {
  return cleanCell(value)
    .replace(/^\s*(?:\[|【)/u, "")
    .replace(/(?:\]|】)\s*$/u, "")
    .replace(/[:：]\s*$/u, "")
    .trim()
    .toLocaleLowerCase();
}

function normalizeNddpSpeakerLabel(value) {
  return normalizeSourceRoleLabel(value)
    .replace(/^\s*[（(]\s*/u, "")
    .replace(/\s*[）)]\s*$/u, "")
    .replace(/\s*&\s*/gu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

function isNddpSpeakerLabel(value) {
  return NDDP_SOURCE_SPEAKERS.has(normalizeNddpSpeakerLabel(value));
}

function normalizeSpeakerForShow(show, value) {
  const clean = cleanCell(value);
  if (show?.slug !== "notre-dame-de-paris" || !clean) return clean;
  const normalized = normalizeNddpSpeakerLabel(clean);
  const canonical = new Map([
    ["quasimodo", "Quasimodo"],
    ["frollo", "Frollo"],
    ["phoebus", "Phoebus"],
    ["phœbus", "Phoebus"],
    ["pheobus", "Phoebus"],
    ["esmeralda", "Esméralda"],
    ["esméralda", "Esméralda"],
    ["gringoire", "Gringoire"],
    ["clopin", "Clopin"],
    ["fleur-de-lys", "Fleur-de-Lys"],
    ["ensemble", "Ensemble"],
    ["esmeralda&fleur-de-lys", "Esméralda / Fleur-de-Lys"],
    ["esméralda&fleur-de-lys", "Esméralda / Fleur-de-Lys"],
    ["frollo et gringoire", "Frollo / Gringoire"],
    ["frollo et la foule", "Frollo / la foule"],
  ]).get(normalized);
  return canonical || clean;
}

function normalizeNddpTranslationSpeaker(value, language, show) {
  if (show?.slug !== "notre-dame-de-paris") return "";
  const normalized = cleanCell(value).toLocaleLowerCase();
  if (language === "zh") return NDDP_TRANSLATION_SPEAKERS.get(cleanCell(value)) || "";
  if (language === "en") return NDDP_ENGLISH_TRANSLATION_SPEAKERS.get(normalized) || "";
  return "";
}

function isKnownSourceRole(value, show) {
  const normalized = normalizeSourceRoleLabel(value);
  return KNOWN_SOURCE_ROLE_LABELS.has(normalized)
    || SHOW_STANDALONE_SOURCE_ROLE_LABELS[show?.slug]?.has(normalized);
}

function normalizeChineseTranslationRoleLabel(value) {
  return cleanCell(value)
    .replace(/^[.。·、]\s*(?=[\p{Script=Han}])/u, "")
    .replace(/\s*&\s*/gu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

function isKnownChineseTranslationRole(value, show) {
  const label = normalizeChineseTranslationRoleLabel(value);
  if (!label) return false;
  if (KNOWN_CHINESE_TRANSLATION_ROLES.has(label)) return true;
  const configured = SHOW_CHINESE_TRANSLATION_SPEAKERS[show?.slug];
  return configured ? [...configured].some((role) => normalizeChineseTranslationRoleLabel(role) === label) : false;
}

function isTranslationRoleOnly(value, show) {
  const clean = cleanCell(value);
  const direct = clean.match(/^([^:：]{1,48})[:：]\s*$/u);
  const bracketed = clean.match(/^\s*(?:\[([^\]]{1,48})\]|【([^】]{1,48})】)\s*[:：]\s*$/u);
  const wrapped = clean.match(/^\s*[（(]\s*([^()（）:：]{1,48})[:：]\s*[）)]\s*$/u);
  const label = direct?.[1] || bracketed?.[1] || bracketed?.[2] || wrapped?.[1] || "";
  return Boolean(label) && isKnownChineseTranslationRole(label, show);
}

function isEmbeddedSourceRoleOnlyLine(speakerCell, translation, show) {
  const nestedRole = cleanCell(speakerCell.text).match(/^([^:：]{1,48})[:：]\s*$/u)?.[1] || "";
  return Boolean(nestedRole)
    && isKnownSourceRole(nestedRole, show)
    && isTranslationRoleOnly(translation, show);
}

function cleanInlineTranslationSpeakers(value, show) {
  const clean = cleanCell(value);
  if (show?.slug !== "suffs") return clean;
  return clean.replace(/\b(?:Inez|Alice)\s*[:：]\s*/gu, "");
}

function extractSpeaker(value, show) {
  const clean = cleanCell(value);
  if (clean === "_Die") return { speaker: "", text: "" };
  const tildeRole = clean.match(/^~([^~]{1,48})~$/u);
  if (tildeRole) return { speaker: normalizeSpeakerForShow(show, tildeRole[1]), text: "" };
  const nddpParenthetical = clean.match(/^\s*[（(]\s*([^()（）]{1,48}?)\s*[）)]\s*(.*)$/u);
  if (nddpParenthetical && show?.slug === "notre-dame-de-paris" && isNddpSpeakerLabel(nddpParenthetical[1])) {
    return {
      speaker: normalizeSpeakerForShow(show, nddpParenthetical[1]),
      text: nddpParenthetical[2].trim(),
    };
  }
  const inlineRoles = [...clean.matchAll(/(?:\[([^\]]{1,48})\]|【([^】]{1,48})】)/gu)]
    .map((match) => (match[1] || match[2] || "").trim())
    .filter(Boolean);
  if (inlineRoles.length > 1 && inlineRoles.every((role) => SPEAKER_HINT.test(role))) {
    return {
      speaker: normalizeSpeakerForShow(show, [...new Set(inlineRoles)].join(" / ")),
      text: clean.replace(/(?:\[[^\]]{1,48}\]|【[^】]{1,48}】)\s*/gu, " ").replace(/\s+/gu, " ").trim(),
    };
  }
  const bracketed = clean.match(/^\s*(?:\[([^\]]{1,48})\]|【([^】]{1,48})】)\s*[:：]?\s*(.*)$/u);
  if (bracketed) {
    return {
      speaker: normalizeSpeakerForShow(show, (bracketed[1] || bracketed[2] || "").replace(/[:：]\s*$/u, "").trim()),
      text: (bracketed[3] || "").trim(),
    };
  }

  const labelled = clean.match(/^([^:：]{1,48})[:：]\s*(.*)$/u);
  if (!labelled) return { speaker: "", text: clean };
  const label = labelled[1].trim();
  if (KNOWN_LYRIC_COLON_LABELS.has(normalizeSourceRoleLabel(label))) {
    return { speaker: "", text: clean };
  }
  // Some English sources annotate a role in the label (for example
  // "NORMA, on the phone:"). Keep the role, not the staging direction, out
  // of the lyric line.
  const stagedRole = label.match(/^([A-Z][A-Z .'-]*(?:\s+and\s+[A-Z][A-Z .'-]*)?)\s*,\s*(?:spoken|on the phone|off stage)\b/iu);
  if (stagedRole) return { speaker: stagedRole[1].trim(), text: labelled[2].trim() };
  if (/[!?]/u.test(label) || (/[()]/u.test(label) && !isKnownSourceRole(label))) {
    return { speaker: "", text: clean };
  }
  const upper = label === label.toLocaleUpperCase() && /[A-Z]/u.test(label);
  const titleCase = label.split(/\s+/u).every((word) => /^[A-Z][\p{L}'’.-]*$/u.test(word));
  const slashSeparatedTitleCase = label.split("/").length > 1
    && label.split("/").every((role) => role.trim().split(/\s+/u).every((word) => /^[A-Z][\p{L}'’.-]*$/u.test(word)));
  if (!upper && !titleCase && !slashSeparatedTitleCase && !SPEAKER_HINT.test(label) && !isKnownSourceRole(label, show)
    && !(show?.slug === "notre-dame-de-paris" && isNddpSpeakerLabel(label))) {
    return { speaker: "", text: clean };
  }
  return { speaker: normalizeSpeakerForShow(show, label), text: labelled[2].trim() };
}

function extractGermanTripleSpeaker(value, show) {
  const clean = cleanCell(value);
  const bracketed = clean.match(/^\s*(?:\[([^\]]{1,48})\]|【([^】]{1,48})】)\s*[:：]\s*(.+)$/u);
  if (bracketed) {
    return {
      speaker: (bracketed[1] || bracketed[2] || "").trim(),
      text: bracketed[3].trim(),
    };
  }

  const labelled = clean.match(/^([^:：]{1,48})[:：]\s*(.*)$/u);
  if (!labelled || !labelled[2].trim()) return { speaker: "", text: clean };
  const label = labelled[1].trim();
  if (/[!?！？,，;]/u.test(label) && !isKnownSourceRole(label, show)) return { speaker: "", text: clean };

  const words = label.split(/\s+/u);
  const upper = label === label.toLocaleUpperCase() && /[A-ZÄÖÜẞ]/u.test(label);
  const titleCase = words.length <= 4 && words.every((word) => /^(?:[A-ZÄÖÜẞ][\p{L}'’.-]*|der|die|das|de|del|den|des|von|van|und)$/u.test(word));
  const slashSeparated = label.split("/").length > 1
    && label.split("/").every((role) => {
      const roleWords = role.trim().split(/\s+/u);
      return roleWords.length <= 3 && roleWords.every((word) => /^(?:[A-ZÄÖÜẞ][\p{L}'’.-]*|der|die|das|de|del|den|des|von|van|und)$/u.test(word));
    });
  if (!upper && !titleCase && !slashSeparated && !SPEAKER_HINT.test(label) && !isKnownSourceRole(label, show)) {
    return { speaker: "", text: clean };
  }
  return { speaker: label, text: labelled[2].trim() };
}

function stripOuterBrackets(value) {
  const clean = cleanCell(value);
  const match = clean.match(/^\s*(?:\[([^\]]+)\]|【([^】]+)】|\(([^)]+)\)|（([^）]+)）)\s*$/u);
  return (match?.[1] || match?.[2] || match?.[3] || match?.[4] || clean).trim();
}

function extractNoteSpeaker(value) {
  const match = cleanCell(value).match(/^唱段人\s*[:：]\s*(.+)$/u);
  return match ? match[1].trim() : "";
}

function extractTranslationSpeaker(value, show = null) {
  const clean = cleanCell(value);
  const source = show?.slug === "notre-dame-de-paris" ? stripOuterBrackets(clean) : clean;
  const bracketedLabel = source.match(/^\s*(?:\[([^\]]{1,48})\]|【([^】]{1,48})】)\s*[:：]\s*(.*?)\s*$/u);
  if (bracketedLabel && isKnownChineseTranslationRole(bracketedLabel[1] || bracketedLabel[2], show)) {
    return {
      speaker: normalizeChineseTranslationRoleLabel(bracketedLabel[1] || bracketedLabel[2]),
      text: cleanInlineTranslationSpeakers(bracketedLabel[3], show),
    };
  }
  const wrappedLabel = source.match(/^\s*[（(]\s*([^()（）:：]{1,48})[:：]\s*(.*?)\s*[）)]\s*$/u);
  if (wrappedLabel && isKnownChineseTranslationRole(wrappedLabel[1], show)) {
    return {
      speaker: normalizeChineseTranslationRoleLabel(wrappedLabel[1]),
      text: cleanInlineTranslationSpeakers(wrappedLabel[2], show),
    };
  }
  const parenthetical = source.match(/^\s*[（(]\s*([^()（）]{1,48}?)\s*[）)]\s*(.*)$/u);
  const nddpParentheticalSpeaker = show?.slug === "notre-dame-de-paris"
    ? normalizeNddpTranslationSpeaker(parenthetical?.[1] || "", "zh", show)
      || normalizeNddpTranslationSpeaker(parenthetical?.[1] || "", "en", show)
    : "";
  if (parenthetical && nddpParentheticalSpeaker) {
    return {
      speaker: nddpParentheticalSpeaker,
      text: cleanInlineTranslationSpeakers(parenthetical[2], show),
    };
  }
  const match = source.match(/^([^:：]{1,24})[:：]\s*(.*)$/u);
  if (!match) return { speaker: "", text: clean };
  if (!match[2].trim()) return { speaker: "", text: clean };
  const speaker = match[1].trim();
  const normalizedNddpSpeaker = normalizeNddpTranslationSpeaker(speaker, "zh", show)
    || normalizeNddpTranslationSpeaker(speaker, "en", show);
  const knownChineseRole = isKnownChineseTranslationRole(speaker, show) || Boolean(normalizedNddpSpeaker);
  const upper = speaker === speaker.toLocaleUpperCase() && /[A-Z]/u.test(speaker);
  const titleCase = speaker.split(/\s+/u).every((word) => /^[A-Z][\p{L}'’.-]*$/u.test(word));
  if (!knownChineseRole && !upper && !titleCase && !SPEAKER_HINT.test(speaker)) {
    return { speaker: "", text: clean };
  }
  return {
    speaker: normalizedNddpSpeaker || normalizeChineseTranslationRoleLabel(speaker),
    text: cleanInlineTranslationSpeakers(match[2], show),
  };
}

function stripTranslationSpeaker(value, sourceSpeaker, show = null) {
  const clean = cleanCell(value);
  if (!sourceSpeaker) return clean;
  if (sourceSpeaker.includes(" / ")) {
    return clean
      .replace(/(?:\[[^\]]{1,48}\]|【[^】]{1,48}】|（[^（）]{1,12}）|\([^()]{1,12}\))\s*/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();
  }
  const bracketed = clean.match(/^\s*(?:\[([^\]]{1,500})\]|【([^】]{1,500})】)\s*$/u);
  if (bracketed) {
    const text = (bracketed[1] || bracketed[2] || "").trim();
    const parsed = extractTranslationSpeaker(text, show);
    // An aligned bracketed translation can contain the whole lyric, not only a
    // role label. Preserve that text unless the source speaker confirms a
    // leading translation label to remove.
    if (parsed.speaker) return parsed.text;
    const labelled = text.match(/^[^:：]{1,24}[:：]\s*(.+)$/u);
    return labelled ? labelled[1].trim() : text;
  }
  const parsed = extractTranslationSpeaker(clean, show);
  return parsed.speaker ? parsed.text : clean;
}

function stripSpeakerIpaPrefix(show, value, sourceSpeaker) {
  const ipa = cleanCell(value);
  const normalizedSpeaker = sourceSpeaker
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase();
  const phoneticName = SPEAKER_IPA_PREFIXES[show.slug]?.[normalizedSpeaker];
  if (!phoneticName) return ipa;
  return ipa.replace(new RegExp(`^/(?:${phoneticName})\\s+`, "u"), "/");
}

function cleanLineCell(show, value, field) {
  let cleaned = cleanCell(value);
  // A malformed Markdown table row in the Arthur source left a literal closing
  // bracket before a repeated vocalization. It is never lyric text.
  cleaned = cleaned.replace(/^\]\s*/u, "");
  cleaned = cleaned.replace(/[\[\]【】]/gu, "");
  cleaned = cleaned.replace(/([.!?;:])(?=\p{Lu})/gu, "$1 ");
  if (show.slug === "le-roi-soleil" && (field === "original" || field === "en")) {
    cleaned = cleaned
      .replace(/\s*，\s*/gu, ", ")
      .replace(/,\s*,+/gu, ", ")
      .replace(/\s+([,.;!?])/gu, "$1")
      .replace(/,+\s*$/gu, "");
  }
  if (show.slug === "le-roi-soleil" && field === "original") {
    const corrections = [
      [/qu'on aura pas/gu, "qu'on n'aura pas"],
      [/champs de blés pillés/gu, "champs de blé pillés"],
      [/nos priers/gu, "nos prières"],
      [/d'un main de fer/gu, "d'une main de fer"],
      [/\bA mains nues\b/gu, "À mains nues"],
      [/\bdevont\b/gu, "devons"],
      [/l'injustice qu'en finit pas/gu, "l'injustice qui n'en finit pas"],
      [/\bnouvee ère\b/gu, "nouvelle ère"],
      [/\br\?le\b/gu, "rôle"],
      [/\bｃa\b/gu, "ça"],
      [/\bca\b/gu, "ça"],
      [/au fond de soit/gu, "au fond de soi"],
      [/loin de soit/gu, "loin de soi"],
      [/en soit/gu, "en soi"],
      [/Alors qu'elle bat/gu, "Alors qu'il bat"],
      [/s'endorme ne rêve plus/gu, "ne s'endorme et ne rêve plus"],
      [/t'inquiètes/gu, "t'inquiète"],
    ];
    corrections.forEach(([pattern, replacement]) => {
      cleaned = cleaned.replace(pattern, replacement);
    });
  }
  if (show.slug === "don-juan" && (field === "original" || field === "en")) {
    cleaned = cleaned.replace(/,+\s*$/u, "");
  }
  return normalizeGeneratedLineText(show, cleaned, field);
}

function cleanReleaseNote(value) {
  return cleanCell(value)
    .replace(/(?:原文件该行未找到中文译文，已用机器翻译补中文。?|原文件缺中文，已用机器翻译补齐。?|机器翻译补中文。?|原文件原文和中文挤在同一行，已拆分。?)/gu, "")
    .replace(/^[；;、\s]+|[；;、\s]+$/gu, "")
    .trim();
}

function buildWordEntries(show, songs, rougeGlossary, freedictGlossary, englishGlossary, previousEntries = {}) {
  const entries = {};
  const common = show.language === "en"
    ? COMMON_ENGLISH
    : show.language === "de" ? COMMON_GERMAN : COMMON_FRENCH;

  songs.forEach((song) => {
      collectTokens(song.title).forEach((token) => addEntry(entries, token, show, common, rougeGlossary, freedictGlossary, englishGlossary, previousEntries, {
      zh: song.titleZh || show.titleZh,
      en: song.title,
      proper: false,
    }));

    song.lines.forEach((line) => {
      collectTokens(line.original).forEach((token) => addEntry(entries, token, show, common, rougeGlossary, freedictGlossary, englishGlossary, previousEntries, {
        zh: line.zh,
        en: line.en,
        proper: false,
      }));
    });
  });

  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b, "fr")));
}

function addEntry(entries, token, show, common, rougeGlossary, freedictGlossary, englishGlossary, previousEntries, context) {
  const key = normalizeKey(token);
  if (!key || entries[key]) return;

  const speak = normalizeSpeak(token);
  const elisionKey = getElisionKey(speak, key);
  const commonEntry = common[key] || (elisionKey ? common[elisionKey] : null);
  const rougeEntry = show.language === "fr" ? rougeGlossary[key] || (elisionKey ? rougeGlossary[elisionKey] : null) : null;
  const freedictEntry = show.language === "fr" ? freedictGlossary[key] || (elisionKey ? freedictGlossary[elisionKey] : null) : null;
  const englishEntry = show.language === "en" ? englishGlossary[key] : null;
  const showOverride = SHOW_WORD_OVERRIDES[show.slug]?.[key];
  const manualEntry = loadManualWordGlossary(show.slug, key);
  const autoEntry = loadAutoWordGlossary(show.slug, key);
  const priorEntry = previousEntries[key];

  if (showOverride) {
    entries[key] = {
      ipa: showOverride[3] || ipaFor(showOverride[2] || speak, show.voice),
      meaning: showOverride[0],
      en: showOverride[1],
      speak: showOverride[2] || speak,
    };
    return;
  }

  if (manualEntry?.zh && manualEntry?.en) {
    entries[key] = {
      ipa: manualEntry.ipa || ipaFor(manualEntry.speak || speak, show.voice),
      meaning: manualEntry.zh,
      en: shortEnglishGloss(manualEntry.en),
      speak: manualEntry.speak || speak,
    };
    return;
  }

  if (autoEntry?.zh && autoEntry?.en) {
    entries[key] = {
      ipa: ipaFor(speak, show.voice),
      meaning: autoEntry.zh,
      en: shortEnglishGloss(autoEntry.en),
      speak,
    };
    return;
  }

  if (
    priorEntry
    && !priorEntry.needsReview
    && priorEntry.meaning
    && priorEntry.speak
    && !/(?:词义：|暂未|待补|proper noun)/iu.test(`${priorEntry.meaning} ${priorEntry.en || ""}`)
  ) {
    entries[key] = {
      ...priorEntry,
      ipa: priorEntry.ipa || ipaFor(priorEntry.speak || speak, show.voice),
      en: priorEntry.en || priorEntry.speak || speak,
    };
    return;
  }

  if (commonEntry) {
    entries[key] = {
      ipa: commonEntry[3] || ipaFor(speak, show.voice),
      meaning: commonEntry[0],
      en: commonEntry[1],
      speak: commonEntry[2] || speak,
    };
    return;
  }

  if (rougeEntry && rougeEntry.zh && rougeEntry.en) {
    entries[key] = {
      ipa: rougeEntry.ipa || ipaFor(rougeEntry.speak || speak, show.voice),
      meaning: rougeEntry.zh,
      en: rougeEntry.en,
      speak: rougeEntry.speak || speak,
    };
    return;
  }

  if (freedictEntry && freedictEntry.meaning && freedictEntry.en) {
    entries[key] = {
      ipa: ipaFor(speak, show.voice),
      meaning: freedictEntry.meaning,
      en: shortEnglishGloss(freedictEntry.en),
      speak,
    };
    return;
  }

  if (englishEntry && (englishEntry.meaning || englishEntry.zh)) {
    entries[key] = {
      ipa: ipaFor(speak, show.voice),
      meaning: englishEntry.meaning || englishEntry.zh,
      en: englishEntry.en || englishEntry.speak || key,
      speak,
    };
    return;
  }

  entries[key] = guessEntry(speak, show, context);
  if (priorEntry?.ipa) entries[key].ipa = priorEntry.ipa;
}

let autoWordGlossaryCache;
let manualWordGlossaryCache;
function loadManualWordGlossary(show, key) {
  if (manualWordGlossaryCache === undefined) {
    try {
      const reviewedElisions = JSON.parse(fs.readFileSync(ELISION_WORD_GLOSSARY, "utf8"));
      const manual = JSON.parse(fs.readFileSync(MANUAL_WORD_GLOSSARY, "utf8"));
      const wave2Manual = JSON.parse(fs.readFileSync(WAVE2_MANUAL_WORD_GLOSSARY, "utf8"));
      const batch = JSON.parse(fs.readFileSync(BATCH_WORD_GLOSSARY, "utf8"));
      manualWordGlossaryCache = {};
      for (const showName of new Set([
        ...Object.keys(reviewedElisions),
        ...Object.keys(manual),
        ...Object.keys(wave2Manual),
        ...Object.keys(batch),
      ])) {
        manualWordGlossaryCache[showName] = {
          ...(reviewedElisions[showName] || {}),
          ...(manual[showName] || {}),
          ...(wave2Manual[showName] || {}),
          ...(batch[showName] || {}),
        };
      }
    } catch {
      manualWordGlossaryCache = {};
    }
  }
  return manualWordGlossaryCache[show]?.[key];
}

function loadAutoWordGlossary(show, key) {
  if (autoWordGlossaryCache === undefined) {
    try {
      autoWordGlossaryCache = JSON.parse(fs.readFileSync(AUTO_WORD_GLOSSARY, "utf8"));
    } catch {
      autoWordGlossaryCache = {};
    }
  }
  return autoWordGlossaryCache[show]?.[key];
}

function guessEntry(speak, show, context) {
  const key = normalizeKey(speak);
  const elisionKey = getElisionKey(speak, key);
  const englishGloss = englishEquivalentFromContext(context.en || "", speak);
  const zhGloss = chineseGlossFromEnglish(englishGloss, speak);

  if (show.language === "en") {
    return {
      ipa: ipaFor(speak, show.voice),
      meaning: context.proper ? "专有名词；人名、地名或剧中称谓" : zhGloss,
      en: context.proper ? "proper noun" : englishGloss,
      speak,
      needsReview: true,
    };
  }

  if (context.proper) {
    return {
      ipa: ipaFor(speak, show.voice),
      meaning: "专有名词；人名、地名或剧中称谓",
      en: "proper noun or character/place name",
      speak,
      needsReview: true,
    };
  }

  const contraction = frenchContractionEntry(speak, key, elisionKey);
  if (contraction) {
    return { ipa: ipaFor(speak, show.voice), ...contraction, speak, needsReview: true };
  }

  return {
    ipa: ipaFor(speak, show.voice),
    meaning: zhGloss,
    en: englishGloss,
    speak,
    needsReview: true,
  };
}

function frenchContractionEntry(speak, key, bare) {
  if (!bare || !/[’']/.test(speak)) return null;
  const prefixes = [
    ["c", "ce", "这/那"],
    ["d", "de", "的；从"],
    ["j", "je", "我"],
    ["l", "le/la", "这/那；他/她"],
    ["m", "me", "我；给我"],
    ["n", "ne", "不"],
    ["qu", "que", "那；什么；引导从句"],
    ["s", "se", "自己；相互"],
    ["t", "te", "你；给你"],
  ];
  const hit = prefixes.find(([prefix]) => key.startsWith(prefix) && bare !== key);
  if (!hit) return null;
  return {
    meaning: hit[2],
    en: `${hit[1]} + ${bare || "word"}`,
  };
}

function englishEquivalentFromContext(english, fallback) {
  const stop = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it",
    "of", "on", "or", "that", "the", "this", "to", "with", "you", "your",
  ]);
  const words = String(english || "")
    .toLowerCase()
    .match(/[a-z]+(?:'[a-z]+)?/g) || [];
  const useful = words.filter((word) => !stop.has(word)).slice(0, 3);
  return shortEnglishGloss(useful.length ? useful.join(" / ") : normalizeSpeak(fallback));
}

function shortEnglishGloss(value) {
  const clean = String(value || "")
    .replace(/[.!?。！？].*$/u, "")
    .replace(/\b(to|the|a|an)\b\s+/gi, "")
    .split(/\s*[,;]\s*/)[0]
    .split(/\s+\/\s+/)
    .slice(0, 3)
    .join(" / ")
    .trim();
  return shorten(clean, 48);
}

function singularEnglishGloss(value) {
  return shortEnglishGloss(value).replace(/\b([a-z]+)ies\b/gi, "$1y").replace(/\b([a-z]+)s\b/gi, "$1");
}

function singularFrenchKey(key) {
  if (!key || key.length <= 4 || !key.endsWith("s")) return "";
  return key.slice(0, -1);
}

function getElisionKey(speak, key) {
  const normalized = String(speak || "").normalize("NFC").toLocaleLowerCase("fr-FR");
  const match = normalized.match(/^(c|d|j|l|m|n|s|t|qu)['’]([\p{L}-]+)$/u);
  return match ? normalizeKey(match[2]) : "";
}

function chineseGlossFromEnglish(englishGloss, fallback) {
  const first = String(englishGloss || "")
    .toLowerCase()
    .split(/\s*\/\s*|\s+/)
    .find(Boolean);
  const map = {
    affair: "风流事；事件",
    angel: "天使",
    beauty: "美；美丽",
    blood: "血；血液",
    body: "身体",
    brother: "兄弟",
    child: "孩子",
    city: "城市",
    death: "死亡",
    desire: "欲望；渴望",
    dream: "梦；梦想",
    earth: "大地；土地",
    envy: "羡慕；欲望",
    fear: "恐惧",
    fire: "火；火焰",
    flower: "花",
    freedom: "自由",
    future: "未来",
    girl: "女孩",
    god: "神；上帝",
    hand: "手",
    happiness: "幸福",
    heart: "心；内心",
    history: "历史",
    hope: "希望",
    joy: "喜悦",
    king: "国王",
    land: "土地",
    light: "光；光明",
    love: "爱；爱情",
    madness: "疯狂",
    man: "男人；人",
    moment: "时刻",
    moon: "月亮",
    mother: "母亲",
    name: "名字",
    night: "夜晚",
    pain: "痛苦",
    past: "过去",
    path: "道路",
    pleasure: "快乐；愉悦",
    prayer: "祈祷",
    reason: "理性；理由",
    road: "道路",
    shadow: "影子；阴影",
    sister: "姐妹",
    sky: "天空",
    song: "歌曲；歌声",
    soul: "灵魂",
    star: "星星",
    story: "故事",
    sun: "太阳",
    tear: "眼泪",
    voice: "声音",
    wish: "愿望",
    woman: "女人",
    word: "词语；话语",
  };
  return map[first] || `词义：${normalizeSpeak(fallback)}`;
}

function collectTokens(text) {
  return String(text || "").match(/\p{L}+(?:['’]\p{L}+)*(?:-\p{L}+)*/gu) || [];
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

function normalizeSpeak(token) {
  return String(token || "")
    .normalize("NFC")
    .replace(/[’‘`]/gu, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function ipaFor(text, voice) {
  const normalized = String(text || "").normalize("NFC").toLocaleLowerCase("fr-FR");
  const overrides = {
    a: "/a/",
    "à": "/a/",
    "v'la": "/vla/",
    "mam'zelle": "/mamzɛl/",
    apothicaire: "/apɔtikɛʁ/",
    thunes: "/tyn/",
    pontmercy: "/pɔ̃mɛʁsi/",
    feuilly: "/fœji/",
    joly: "/ʒɔli/",
    goliath: "/ɡɔlja/",
    "f'ra": "/fʁa/",
    "f'sait": "/fəzɛ/",
    "j'm'ennuie": "/ʒmɑ̃nɥi/",
    "pauv'monsieur": "/pov məsjø/",
    "prouv'ra": "/pʁuvʁa/",
    "qu'ce": "/k sə/",
    "qu'chez": "/k ʃe/",
    "qu'j'affranchisse": "/k ʒafʁɑ̃ʃis/",
    "qu'là-haut": "/k la o/",
    "qu'le": "/k lə/",
    "r'voir": "/ʁəvwaʁ/",
    "v'là": "/vla/",
    "vot'bon": "/vɔ bɔ̃/",
  };
  if (overrides[normalized]) return overrides[normalized];

  const result = spawnSync("espeak-ng", ["-q", "--ipa=3", "-v", voice, "--", text], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  let ipa = (result.stdout || "")
    .replace(/[\u200b-\u200f\u2060\ufeff]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  ipa = ipa.replace(/\((?:en|fr|de)\)/giu, "");
  if (String(voice).startsWith("fr")) {
    ipa = ipa
      .replace(/[ˈˌ-]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return ipa ? `/${ipa}/` : "";
}

function shorten(value, max) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function writeFile(dir, name, content) {
  if (!generationWritesEnabled) {
    throw new Error(`Refusing to write ${name} without --write`);
  }
  writeFileAtomic(path.join(dir, name), content, `musical page generator: ${name}`);
}

function renderLoadRecovery() {
  return `    <script>
      (() => {
        const retryKey = "musical-site-retry:" + window.location.pathname;
        const retryAssetParam = "_retry_asset";
        const retryAlreadyAttempted = new URL(window.location.href).searchParams.has("_retry");
        let reloadStarted = false;

        window.writeCriticalScript = (source) => {
          const assetUrl = new URL(source, window.location.href);
          const pageUrl = new URL(window.location.href);
          const retryToken = pageUrl.searchParams.get("_retry");
          if (retryToken && pageUrl.searchParams.get(retryAssetParam) === assetUrl.pathname) {
            assetUrl.searchParams.set("_retry", retryToken);
          }
          document.write('<script src="' + assetUrl.href + '" onerror="handleCriticalAssetError(this.src)"><\\/script>');
        };

        function showLoadError() {
          const render = () => {
            if (document.querySelector("#criticalLoadError")) return;

            const notice = document.createElement("aside");
            notice.id = "criticalLoadError";
            notice.setAttribute("role", "status");
            notice.setAttribute("aria-live", "assertive");
            notice.style.cssText = "position:fixed;left:50%;bottom:18px;z-index:100000;width:min(420px,calc(100% - 28px));padding:14px 16px;border:1px solid rgba(255,255,255,.22);border-radius:8px;color:#fff;background:rgba(20,16,14,.96);box-shadow:0 18px 48px rgba(0,0,0,.42);font:14px/1.6 system-ui,-apple-system,sans-serif;transform:translateX(-50%)";

            const message = document.createElement("span");
            message.textContent = "网络连接不稳定，页面资源未完整加载。请稍后重试，或切换网络。";

            const retry = document.createElement("button");
            retry.type = "button";
            retry.textContent = "重新加载";
            retry.style.cssText = "margin-left:12px;padding:6px 10px;border:1px solid rgba(255,255,255,.35);border-radius:6px;color:#fff;background:transparent;font:inherit;cursor:pointer";
            retry.addEventListener("click", () => {
              try {
                sessionStorage.removeItem(retryKey);
              } catch {}
              const retryUrl = new URL(window.location.href);
              retryUrl.searchParams.set("_retry", String(Date.now()));
              window.location.replace(retryUrl);
            });

            notice.append(message, retry);
            document.body.append(notice);
          };

          if (document.body) render();
          else document.addEventListener("DOMContentLoaded", render, { once: true });
        }

        window.handleCriticalAssetError = (source) => {
          if (reloadStarted) return;

          let canRememberRetry = true;
          let recentlyRetried = false;
          const now = Date.now();

          try {
            const lastRetry = Number(sessionStorage.getItem(retryKey) || 0);
            recentlyRetried = now - lastRetry < 30000;
            if (!recentlyRetried) sessionStorage.setItem(retryKey, String(now));
          } catch {
            canRememberRetry = false;
          }

          if (canRememberRetry && !recentlyRetried && !retryAlreadyAttempted) {
            reloadStarted = true;
            const retryUrl = new URL(window.location.href);
            retryUrl.searchParams.set("_retry", String(now));
            retryUrl.searchParams.set(retryAssetParam, new URL(source, window.location.href).pathname);
            window.location.replace(retryUrl);
            return;
          }

          showLoadError();
        };

        window.addEventListener("load", () => {
          window.setTimeout(() => {
            try {
              sessionStorage.removeItem(retryKey);
              const cleanUrl = new URL(window.location.href);
              const changed = cleanUrl.searchParams.delete("_retry");
              cleanUrl.searchParams.delete(retryAssetParam);
              if (changed) {
                history.replaceState(null, "", cleanUrl);
              }
            } catch {}
          }, 3000);
        }, { once: true });
      })();
    </script>`;
}

function renderCriticalScript(source) {
  return `    <script>writeCriticalScript(${JSON.stringify(source)});</script>`;
}

function renderIndex(show) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="data:," />
    <link rel="preload" href="songs-initial.js" as="script" />
    <script src="../shared/display-settings-preload.js?v=${SHARED_UI_ASSET_VERSION}" data-musical-page="${escapeHtml(show.slug)}" data-musical-light-profile="${escapeHtml(deriveLightProfile(show).join("|"))}"></script>
    <title>${escapeHtml(show.title)}｜${escapeHtml(show.titleZh)}歌词学习</title>
    <link rel="stylesheet" href="style.css?v=${SHARED_UI_ASSET_VERSION}" />
    <link rel="stylesheet" href="../shared/lyrics-page-tools.css?v=${SHARED_UI_ASSET_VERSION}" />
    <link rel="stylesheet" href="../shared/mobile-lyrics.css" />
    <link rel="stylesheet" href="../shared/display-settings.css?v=${SHARED_UI_ASSET_VERSION}" />
  </head>
  <body>
    <canvas id="effectCanvas" aria-hidden="true"></canvas>
    <div class="app-shell">
      <aside class="song-sidebar" aria-label="歌曲列表">
        <div class="sidebar-top">
          <button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="收起歌曲列表" aria-expanded="true">‹</button>
          <div class="sidebar-title">
            <strong id="showTitle"></strong>
            <span>歌曲列表</span>
          </div>
        </div>
        <nav id="songList" class="song-list"></nav>
      </aside>
      <main class="content">
        <header class="hero">
          <a class="home-button" href="../index.html" aria-label="返回音乐剧展示架" title="返回音乐剧展示架">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
          </a>
          <div class="hero-copy">
            <p class="musical-name">${escapeHtml(show.title)}</p>
            <div class="song-title-row">
              <h2 id="songTitle"></h2>
            </div>
            <p id="songSubtitle" class="song-subtitle"></p>
            <div class="toolbar" role="group" aria-label="显示设置">
              <button class="toggle-btn is-active" type="button" data-toggle="showZh" aria-pressed="true">中译</button>
${show.showEnglishToggle === false ? "" : '              <button class="toggle-btn is-active" type="button" data-toggle="showEn" aria-pressed="true">英译</button>\n'}              <button class="toggle-btn is-active" type="button" data-toggle="showIpa" aria-pressed="true">音标</button>
              <button class="toggle-btn feedback-btn" id="feedbackButton" type="button">反馈</button>
              <div class="toolbar-playback-tools" aria-label="本曲播放控制">
                <button class="song-play-button" id="songPlayButton" type="button" aria-label="连续播放本曲" aria-pressed="false" title="连续播放本曲">
                  <svg viewBox="0 0 28 24" aria-hidden="true">
                    <path class="playlist-play-mark" d="M3.5 5.2v13.6l10-6.8z" />
                    <path class="playlist-lines-mark" d="M16.5 6h8M16.5 12h8M16.5 18h8" />
                    <rect class="playlist-stop-mark" x="8" y="6" width="12" height="12" rx="1.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div class="show-visual" data-mark="${escapeHtml(show.effect.icon)}" aria-hidden="true">
            <img class="show-visual-image" src="${escapeHtml(show.logo)}" alt="" />
          </div>
        </header>
        <label class="mobile-picker" for="songSelect">
          <span>选择歌曲</span>
          <select id="songSelect"></select>
        </label>
        <section id="lyrics" class="lyrics" aria-live="polite"></section>
      </main>
    </div>
    <div id="wordPopover" class="word-popover" hidden></div>
    <button class="back-to-top" id="backToTop" type="button" aria-label="返回顶部" title="返回顶部" hidden>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
    </button>
    <script>
      window.pageConfig = ${JSON.stringify({
        title: show.title,
        titleZh: show.titleZh,
        slug: show.slug,
        language: show.language,
        audioVoice: show.audioVoice || null,
        showEnglishToggle: show.showEnglishToggle !== false,
        independentWordIpa: show.independentWordIpa === true,
        ...(show.fullSongsFile ? { fullSongsFile: show.fullSongsFile } : {}),
        effect: show.effect,
      }, null, 8)};
    </script>
${renderLoadRecovery()}
${renderCriticalScript("songs-initial.js")}
${renderCriticalScript("../shared/analytics.js")}
${renderCriticalScript("../shared/audio-playback.js")}
${renderCriticalScript("../shared/playback-rate.js")}
${renderCriticalScript("../shared/lyrics-search.js")}
${renderCriticalScript("../shared/lyrics-page-tools.js")}
    <script src="../shared/display-settings.js"></script>
    <script>
      if (
        window.MusicalDisplaySettings?.customCursorEnabled() !== false
        && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        document.write('<script src="../shared/cursors/${escapeHtml(show.slug)}.js?v=${CURSOR_ASSET_VERSION}"><\\/script>');
      }
    </script>
${renderCriticalScript("script.js")}
    <script src="../shared/feedback-widget.js"></script>
    <script>
      window.MusicalFeedback.mount({
        id: ${JSON.stringify(show.slug)},
        siteName: ${JSON.stringify(`${show.titleZh}歌词学习`)},
        recipient: "fulife@agent.qq.com",
        trigger: "#feedbackButton",
        songs: (window.songsInitial || window.songs || []).map((song) => ({
          value: song.id,
          label: \`\${String(song.displayOrder || song.order).padStart(2, "0")}. \${song.title}\`,
        })),
        getCurrentSongId: () => (typeof getCurrentSong === "function" ? getCurrentSong()?.id : undefined),
      });
    </script>
  </body>
</html>
`;
}

function renderStyle(show) {
  const t = show.theme;
  const bodyFont = t.bodyFont || 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif';
  const displayFont = t.displayFont || t.serif;
  const lyricFont = t.lyricFont || t.serif;
  const bodyPattern = t.bodyPattern || "linear-gradient(transparent, transparent)";
  const heroPattern = t.heroPattern || "linear-gradient(transparent, transparent)";
  const visualPattern = t.visualPattern || "linear-gradient(transparent, transparent)";
  return `:root {
  color-scheme: dark;
  --bg: ${t.bg};
  --panel: ${t.panel};
  --accent: ${t.accent};
  --highlight: ${t.highlight};
  --ink: ${t.ink};
  --muted: ${t.muted};
  --line: ${t.line || "color-mix(in srgb, var(--highlight), transparent 72%)"};
  --shadow: ${t.shadow || "rgba(0, 0, 0, 0.34)"};
  --body-font: ${bodyFont};
  --display-font: ${displayFont};
  --lyric-font: ${lyricFont};
  --title-font: var(--display-font);
  --title-tracking: ${t.titleTracking || "0"};
  --radius: ${t.radius || "8px"};
  --visual-fit: ${t.visualFit || "contain"};
  --visual-position: ${t.visualPosition || "50% 50%"};
  --visual-width: ${t.visualWidth || "min(250px, 88%)"};
  --visual-height: ${t.visualHeight || "128px"};
  --visual-desktop-height: ${t.visualDesktopHeight || "auto"};
  --visual-tablet-height: ${t.visualTabletHeight || "auto"};
  --visual-mobile-height: ${t.visualMobileHeight || "auto"};
  --visual-min-height: ${t.visualMinHeight || "160px"};
  --visual-padding: ${t.visualPadding || "14px"};
  --visual-frame-radius: ${t.visualFrameRadius || "999px"};
  --visual-filter: ${t.visualFilter || "drop-shadow(0 12px 18px rgba(0, 0, 0, 0.3))"};
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  color: var(--ink);
  font-family: var(--body-font);
  overflow-x: hidden;
  background:
    ${bodyPattern},
    linear-gradient(104deg, color-mix(in srgb, var(--accent), transparent 78%), transparent 38%),
    linear-gradient(74deg, transparent 52%, color-mix(in srgb, var(--highlight), transparent 88%)),
    radial-gradient(circle at 18% 10%, color-mix(in srgb, var(--accent), transparent 72%), transparent 30rem),
    radial-gradient(circle at 82% 4%, color-mix(in srgb, var(--highlight), transparent 84%), transparent 28rem),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 12px),
    linear-gradient(180deg, color-mix(in srgb, var(--panel), black 18%), var(--bg) 46%, color-mix(in srgb, var(--bg), black 28%));
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 8% 88%, color-mix(in srgb, var(--accent), transparent 88%), transparent 24rem),
    linear-gradient(135deg, transparent 0 46%, rgba(255, 255, 255, 0.025) 46% 47%, transparent 47% 100%);
  opacity: 0.82;
}

#effectCanvas {
  position: fixed;
  inset: 0;
  z-index: 999999;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

button,
select {
  font: inherit;
}

.app-shell {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 30px;
  width: min(1440px, calc(100% - 34px));
  margin: 0 auto;
  padding: 26px 0 60px;
  transition: grid-template-columns 180ms ease;
}

.app-shell.is-collapsed {
  grid-template-columns: 66px minmax(0, 1fr);
}

.song-sidebar {
  position: sticky;
  top: 18px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  max-height: calc(100vh - 52px);
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--panel), white 5%), color-mix(in srgb, var(--bg), black 8%));
  box-shadow: 0 24px 60px var(--shadow);
}

.sidebar-top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--line);
}

.sidebar-toggle {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--highlight);
  background: color-mix(in srgb, var(--highlight), transparent 90%);
  cursor: pointer;
}

.sidebar-title {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.sidebar-title strong {
  display: block;
  min-width: 0;
  color: var(--highlight);
  font-family: var(--title-font);
  font-size: 1.04rem;
  line-height: 1.08;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-title span {
  color: var(--muted);
  font-size: 0.78rem;
}

.app-shell.is-collapsed .sidebar-title,
.app-shell.is-collapsed .song-button strong,
.app-shell.is-collapsed .song-button span:not(.song-order) {
  display: none;
}

.app-shell.is-collapsed .song-sidebar {
  justify-items: center;
}

.musical-name,
.song-subtitle {
  color: var(--muted);
}

h1,
h2 {
  margin: 0;
  font-family: var(--title-font);
  letter-spacing: var(--title-tracking);
}

h1 {
  font-size: 2.25rem;
  line-height: 1.05;
  color: var(--highlight);
}

h2 {
  font-size: clamp(1.55rem, 3vw, 2.65rem);
  line-height: 1.06;
  color: var(--ink);
}

.song-title-row {
  min-width: 0;
}

.song-title-row h2 {
  display: block;
  min-width: 0;
}

.song-play-button {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--highlight);
  background: color-mix(in srgb, var(--panel), black 10%);
  cursor: pointer;
  vertical-align: 0.08em;
  transition: border-color 140ms ease, background-color 140ms ease, opacity 140ms ease;
}

.toolbar-playback-tools {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 5px;
  min-height: 34px;
}

.toolbar-playback-tools .song-play-button {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
}

.toolbar-playback-tools .lyrics-tools-rate {
  flex: 0 0 auto;
  min-width: 44px;
  height: 30px;
  padding: 0 6px;
  font-size: 0.72rem;
}

.song-play-button:hover,
.song-play-button:focus-visible,
.song-play-button.is-playing {
  border-color: var(--highlight);
  background: color-mix(in srgb, var(--highlight), transparent 84%);
  outline: none;
}

.song-play-button:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.song-play-button svg {
  width: 22px;
  height: 19px;
  overflow: visible;
}

.playlist-play-mark,
.playlist-stop-mark {
  fill: currentColor;
  stroke: none;
}

.playlist-lines-mark {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
}

.playlist-stop-mark,
.song-play-button.is-playing .playlist-play-mark,
.song-play-button.is-playing .playlist-lines-mark {
  display: none;
}

.song-play-button.is-playing .playlist-stop-mark {
  display: block;
}

.song-list {
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  scrollbar-color: color-mix(in srgb, var(--highlight), transparent 48%) rgba(255, 255, 255, 0.04);
}

.song-button {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 4px 10px;
  align-items: baseline;
  width: 100%;
  min-width: 0;
  padding: 9px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  color: var(--ink);
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.app-shell.is-collapsed .song-button {
  grid-template-columns: 1fr;
  padding-inline: 4px;
}

.song-button:hover,
.song-button.is-active {
  border-color: var(--line);
  background: color-mix(in srgb, var(--accent), transparent 82%);
}

.song-button strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: var(--lyric-font);
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.song-order {
  color: var(--highlight);
  font-family: var(--lyric-font);
  font-size: 0.78rem;
  text-align: center;
}

.song-button span:not(.song-order) {
  display: block;
  grid-column: 2;
  min-width: 0;
  color: var(--muted);
  font-size: 0.85rem;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.content {
  min-width: 0;
  opacity: 1;
  transform: translateY(0);
  filter: none;
  transition: opacity 180ms ease, transform 180ms ease, filter 180ms ease;
  will-change: opacity, transform;
}

.content.is-song-changing {
  opacity: 0;
  transform: translateY(7px);
  filter: blur(1px);
}

.content.is-song-settling .lyric-card {
  animation: lyric-card-soft-in 260ms ease both;
}

.content.is-song-settling .lyric-card:nth-child(2n) {
  animation-delay: 18ms;
}

@keyframes lyric-card-soft-in {
  from {
    opacity: 0;
    transform: translateY(5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(190px, 270px);
  gap: 24px;
  align-items: center;
  min-height: 250px;
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  background:
    ${heroPattern},
    linear-gradient(115deg, color-mix(in srgb, var(--panel), black 24%), color-mix(in srgb, var(--bg), transparent 18%)),
    radial-gradient(circle at 78% 10%, color-mix(in srgb, var(--highlight), transparent 76%), transparent 38%);
  box-shadow: 0 24px 60px var(--shadow);
}

.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.028) 0 1px, transparent 1px 12px);
  pointer-events: none;
}

.hero-copy {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.home-button {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--highlight);
  text-decoration: none;
  background: color-mix(in srgb, var(--panel), black 10%);
  box-shadow: 0 10px 24px var(--shadow);
}

.home-button svg,
.back-to-top svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.home-button:hover {
  color: var(--bg);
  border-color: var(--highlight);
  background: var(--highlight);
}

.musical-name {
  margin: 0 0 10px;
  text-transform: uppercase;
  font-size: 0.78rem;
  letter-spacing: 0.22em;
}

.song-subtitle {
  margin: 12px 0 0;
  color: var(--highlight);
  font-family: "Songti SC", "Noto Serif CJK SC", serif;
  font-size: clamp(1.08rem, 2vw, 1.42rem);
  line-height: 1.35;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 5px;
  row-gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-start;
  margin-top: 18px;
}

.mobile-picker {
  display: none;
}

.show-visual {
  position: relative;
  display: grid;
  place-items: center;
  align-self: center;
  justify-self: center;
  width: min(100%, 270px);
  min-height: 0;
}

.show-visual::before {
  display: none;
}

.show-visual::after {
  display: none;
}

.show-visual-image {
  display: block;
  max-width: 100%;
  width: var(--visual-width);
  height: var(--visual-height);
  object-fit: var(--visual-fit);
  object-position: var(--visual-position);
  filter: var(--visual-filter);
}

${show.slug === "legally-blonde" ? `
.show-visual {
  padding: 18px 14px 16px;
  border: 1px solid color-mix(in srgb, var(--accent) 38%, transparent);
  border-radius: 18px;
  background:
    radial-gradient(circle at 50% 15%, color-mix(in srgb, var(--highlight) 18%, transparent), transparent 68%),
    linear-gradient(145deg, color-mix(in srgb, var(--panel), var(--highlight) 18%), var(--panel));
  box-shadow: 0 16px 34px color-mix(in srgb, var(--shadow) 86%, transparent);
}

.show-visual-image {
  filter: drop-shadow(0 10px 16px rgba(36, 7, 26, 0.38));
}
` : ""}

.show-visual-symbol::before,
.show-visual-symbol::after {
  content: "";
  position: absolute;
}

.show-visual[data-mark="roseWindow"] .show-visual-symbol::before {
  width: 54px;
  height: 54px;
  border: 2px solid currentColor;
  border-radius: 50%;
  background:
    conic-gradient(from 20deg, color-mix(in srgb, var(--accent), transparent 18%), transparent 18deg 38deg, currentColor 40deg 48deg, transparent 50deg 74deg);
}

.show-visual[data-mark="flag"] .show-visual-symbol::before {
  width: 46px;
  height: 38px;
  border-left: 3px solid currentColor;
  background: linear-gradient(90deg, #244a9b 0 33%, #f7f7f2 33% 66%, #c92535 66%);
  clip-path: polygon(0 0, 100% 10%, 92% 74%, 0 62%);
}

.show-visual[data-mark="musicNote"] .show-visual-symbol::before {
  width: 18px;
  height: 48px;
  border-right: 5px solid currentColor;
  border-top: 5px solid currentColor;
  transform: rotate(-8deg);
}

.show-visual[data-mark="musicNote"] .show-visual-symbol::after {
  width: 22px;
  height: 15px;
  border-radius: 50%;
  background: var(--accent);
  transform: translate(-13px, 18px) rotate(-12deg);
}

.show-visual[data-mark="rose"] .show-visual-symbol::before {
  width: 50px;
  height: 50px;
  background:
    radial-gradient(circle at 50% 50%, var(--accent) 0 18%, transparent 19%),
    conic-gradient(from 0deg, var(--accent), color-mix(in srgb, var(--highlight), transparent 12%), var(--accent));
  clip-path: polygon(50% 0, 63% 31%, 98% 35%, 70% 56%, 79% 91%, 50% 72%, 21% 91%, 30% 56%, 2% 35%, 37% 31%);
}

.show-visual[data-mark="sun"] .show-visual-symbol::before {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background:
    radial-gradient(circle, var(--highlight) 0 28%, transparent 31%),
    conic-gradient(var(--highlight), transparent 10deg 22deg, var(--highlight) 26deg 38deg, transparent 42deg 54deg, var(--highlight) 58deg 70deg, transparent 74deg);
  filter: blur(0.2px);
}

.show-visual[data-mark="cocarde"] .show-visual-symbol::before {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: radial-gradient(circle, #244a9b 0 28%, #f7f7f2 29% 54%, #c92535 55% 100%);
}

.show-visual[data-mark="rapier"] .show-visual-symbol::before {
  width: 58px;
  height: 3px;
  background: currentColor;
  transform: rotate(-42deg);
}

.show-visual[data-mark="rapier"] .show-visual-symbol::after {
  width: 22px;
  height: 22px;
  border: 2px solid var(--accent);
  border-radius: 50%;
  transform: translate(-15px, 14px) rotate(-42deg);
}

.show-visual[data-mark="stage"] .show-visual-symbol::before {
  width: 56px;
  height: 38px;
  border: 3px solid currentColor;
  border-radius: 5px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent), transparent 20%) 0 22%, transparent 22% 78%, color-mix(in srgb, var(--accent), transparent 20%) 78%);
}

.show-visual[data-mark="quill"] .show-visual-symbol::before {
  width: 22px;
  height: 58px;
  border-radius: 80% 20% 80% 20%;
  background: currentColor;
  transform: rotate(34deg);
}

.toggle-btn {
  min-width: 0;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.04);
  font-size: 0.74rem;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.toggle-btn.is-active {
  color: var(--bg);
  border-color: var(--highlight);
  background: var(--highlight);
}

.lyrics {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.lyric-card {
  display: grid;
  content-visibility: auto;
  contain-intrinsic-size: auto 96px;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  padding: 16px 17px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent), transparent 86%), transparent 44%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.018)),
    color-mix(in srgb, var(--panel), transparent 4%);
  box-shadow: 0 16px 36px var(--shadow);
}

.line-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.line-original {
  margin: 0;
  font-family: var(--lyric-font);
  font-size: clamp(1.08rem, 1.72vw, 1.38rem);
  line-height: 1.32;
  overflow-wrap: anywhere;
}

.lyric-repeat {
  display: inline-block;
  margin-left: 0.22em;
  color: color-mix(in srgb, var(--highlight), white 22%);
  font-family: var(--ui-font);
  font-size: 0.54em;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  vertical-align: super;
}

.line-speaker {
  margin: 0 0 2px;
  color: var(--highlight);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.line-zh,
.line-en {
  margin: 0;
  color: var(--muted);
  line-height: 1.46;
  overflow-wrap: anywhere;
}

.line-zh {
  font-family: "Songti SC", "Noto Serif CJK SC", serif;
}

.line-en {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
}

.line-actions {
  display: grid;
  align-content: start;
  justify-items: center;
}

.speak-button {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--highlight);
  background: rgba(255, 255, 255, 0.045);
  cursor: pointer;
}

.speak-button:hover {
  border-color: var(--highlight);
  background: color-mix(in srgb, var(--highlight), transparent 86%);
}

.speak-button.is-audio-loading {
  opacity: 0.56;
  pointer-events: none;
}

.lyric-card.is-sequence-active {
  border-color: color-mix(in srgb, var(--highlight), transparent 36%);
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--highlight), transparent 18%), 0 14px 38px var(--shadow);
}

.lyric-word,
.song-title-word {
  display: inline;
  padding: 0 1px;
  border: 0;
  border-radius: 5px;
  color: inherit;
  white-space: normal;
  background: transparent;
  cursor: pointer;
  transition: color 120ms ease, background-color 120ms ease;
}

.line-original .lyric-token {
  display: inline-grid;
  grid-template-rows: auto auto;
  align-items: start;
  margin-right: 0.08em;
  vertical-align: top;
}

.word-phonetic {
  display: block;
  color: color-mix(in srgb, var(--highlight), white 28%);
  font-family: var(--lyric-font);
  font-size: 0.68em;
  line-height: 1.12;
  white-space: nowrap;
}

.word-phonetic[hidden] {
  display: none;
}

.line-ipa {
  margin: 3px 0 0;
  color: color-mix(in srgb, var(--highlight), white 28%);
  font-family: var(--lyric-font);
  font-size: 0.72em;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.line-ipa[hidden] {
  display: none;
}

.lyric-word:hover,
.lyric-word:focus-visible,
.song-title-word:hover,
.song-title-word:focus-visible {
  color: var(--ink);
  background: color-mix(in srgb, var(--highlight), transparent 84%);
  outline: none;
}

.lyric-word.is-word-unavailable,
.song-title-word.is-word-unavailable {
  padding-inline: 0;
  cursor: text;
  opacity: 1;
}

.lyric-word.is-word-unavailable:hover,
.lyric-word.is-word-unavailable:focus-visible,
.song-title-word.is-word-unavailable:hover,
.song-title-word.is-word-unavailable:focus-visible {
  color: inherit;
  background: transparent;
}

.word-popover {
  position: fixed;
  z-index: 30;
  width: fit-content;
  max-width: min(240px, calc(100vw - 24px));
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink);
  background: color-mix(in srgb, var(--panel), black 12%);
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.46);
}

.word-popover[hidden],
[hidden] {
  display: none !important;
}

.popover-head {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 0;
}

.popover-term {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 9px;
  flex-wrap: wrap;
}

.popover-word {
  margin: 0;
  color: var(--highlight);
  font-family: var(--lyric-font);
  font-size: 1.45rem;
}

.popover-meaning,
.popover-en {
  margin: 8px 0 0;
  line-height: 1.55;
}

.popover-ipa {
  margin: 0;
  color: color-mix(in srgb, var(--highlight), white 28%);
  font-size: 0.94rem;
  white-space: nowrap;
}

.popover-en {
  color: var(--muted);
}

.back-to-top {
  position: fixed;
  right: max(20px, calc((100vw - 1440px) / 2 + 18px));
  bottom: 22px;
  z-index: 50;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--highlight);
  background: color-mix(in srgb, var(--panel), black 12%);
  box-shadow: 0 12px 28px var(--shadow);
  cursor: pointer;
}

.back-to-top:hover {
  border-color: var(--highlight);
  background: color-mix(in srgb, var(--highlight), transparent 82%);
}

@media (max-width: 980px) {
  .app-shell,
  .app-shell.is-collapsed {
    display: block;
    grid-template-columns: minmax(0, 1fr);
    width: min(calc(100% - 22px), 760px);
    padding-top: 18px;
  }

  .song-sidebar {
    display: none;
  }

  .hero {
    grid-template-columns: 1fr;
    min-height: 0;
    padding: 20px;
  }

  .show-visual {
    order: -1;
  }

  .mobile-picker {
    display: grid;
    gap: 6px;
    margin-top: 14px;
    color: var(--muted);
  }

  .mobile-picker select {
    width: 100%;
    max-width: 100%;
    min-height: 40px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--ink);
    background: color-mix(in srgb, var(--panel), black 18%);
  }

  .lyric-card {
    grid-template-columns: minmax(0, 1fr) 38px;
    padding: 14px;
  }

  .line-actions {
    justify-items: center;
  }

  .content,
  .hero-copy,
  .mobile-picker,
  .lyrics,
  .lyric-card,
  .line-main {
    min-width: 0;
    max-width: 100%;
  }

  .speak-button {
    width: 34px;
    height: 34px;
  }

  .back-to-top {
    right: 12px;
    bottom: 12px;
  }
}

@media (max-width: 420px) {
  .app-shell,
  .app-shell.is-collapsed {
    width: calc(100% - 16px);
    padding-top: 8px;
  }

  .hero {
    gap: 16px;
    padding: 16px;
  }

  .song-play-button {
    width: 34px;
    height: 34px;
  }

  h2 {
    font-size: 1.62rem;
    overflow-wrap: anywhere;
  }

  .lyric-card {
    gap: 9px;
    padding: 12px;
  }
}

@media (hover: hover) and (pointer: fine) {
  body,
  body * {
    cursor: none !important;
  }
}
`;
}

function renderScript(show) {
  return `const SETTINGS_KEY = "${show.slug}-display-settings";
const CURRENT_SONG_KEY = "${show.slug}-current-song";
const SIDEBAR_KEY = "${show.slug}-sidebar-collapsed";
const PLAYBACK_RATE_KEY = "${show.slug}-playback-rate";
const TOKEN_RE = /\\p{L}+(?:['’]\\p{L}+)*(?:-\\p{L}+)*/gu;

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
    script.addEventListener("error", () => reject(new Error(\`Failed to load \${src}\`)), { once: true });
    document.head.append(script);
  });
}

async function loadFullSongs() {
  await loadScript("songs.js", "high");
  if (window.pageConfig.fullSongsFile) {
    await loadScript(window.pageConfig.fullSongsFile, "high");
  }
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
    button.className = \`song-button\${song.id === state.currentSongId ? " is-active" : ""}\`;
    const order = document.createElement("span");
    order.className = "song-order";
    order.textContent = String(song.displayOrder || song.order).padStart(2, "0");
    const title = document.createElement("strong");
    title.textContent = song.title;
    const sub = document.createElement("span");
    sub.textContent = song.titleZh || "";
    button.setAttribute("aria-current", song.id === state.currentSongId ? "true" : "false");
    button.append(order, title, sub);
    button.addEventListener("click", () => selectSong(song.id));
    return button;
  }));

  if (dom.songSelect) {
    dom.songSelect.replaceChildren(...songs.map((song) => {
      const option = document.createElement("option");
      option.value = song.id;
      option.textContent = \`\${String(song.displayOrder || song.order).padStart(2, "0")}  \${song.title}\`;
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
  if (line.repeatCount > 1) {
    const repeat = document.createElement("sup");
    repeat.className = "lyric-repeat";
    repeat.textContent = \`×\${line.repeatCount}\`;
    repeat.setAttribute("aria-label", \`重复 \${line.repeatCount} 次\`);
    original.append(repeat);
  }
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
  return \`\${prefix}\${bare}\${suffix}\`;
}

function splitIpa(ipa) {
  return stripIpaSlashes(ipa)
    .split(/\\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function stripIpaSlashes(value) {
  return String(value || "").replace(/^\\/|\\/$/g, "").trim();
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
  dom.popover.style.top = \`\${top}px\`;
  dom.popover.style.left = \`\${Math.max(12, left)}px\`;
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
  dom.popover.style.top = \`\${top}px\`;
  dom.popover.style.left = \`\${Math.max(12, left)}px\`;
  dom.popover.hidden = false;
}

function hidePopover() {
  dom.popover.hidden = true;
}

function normalizeKey(token) {
  return String(token || "")
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR")
    .replace(/[’‘\`]/gu, "'")
    .replace(/'/g, "")
    .replace(/[^\\p{L}-]/gu, "")
    .trim();
}

function getLineAudioPath(song, line) {
  return withAudioVersion(\`audio/lines/\${encodeURIComponent(song.id)}/\${encodeURIComponent(line.id)}.mp3\`, line.original);
}

function getWordAudioPath(key) {
  // Delivery files already contain encodeURIComponent(key) in their literal name.
  // Encode the percent signs once more so static HTTP servers do not decode them
  // before resolving the repository path.
  return withAudioVersion(\`audio/words/\${encodeURIComponent(encodeURIComponent(key))}.mp3\`, wordEntries[key]?.speak || key);
}

function withAudioVersion(path, speechText) {
  let hash = 2166136261;
  for (const character of String(config.audioVoice || "system") + "|" + String(speechText || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return \`\${path}?v=\${(hash >>> 0).toString(36)}\`;
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
  utterance.lang = window.MusicalAudio.getSpeechLanguage(config.language);
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
    if (trail === "none") return;
    const letters = String(config.title || "Lyrics").replace(/\s+/g, "").split("");
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
      String(config.title || "Cyrano").replace(/\s+/g, "").split("").forEach((letter, index) => {
        const angle = Math.PI * (0.15 + Math.random() * 0.7);
        const speed = 0.45 + Math.random() * 0.85;
        bursts.push({ x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 8, vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed, life: 1, radius: 5, angle: (Math.random() - 0.5) * 0.25, delay: index * 2, kind: click, text: letter, color: index % 2 ? colors.primary : colors.secondary });
      });
      return;
    }
    const ringKinds = new Set(["roseWindowGlow", "loveRipples", "sunHalo", "moonHalo", "subtleRing", "softGreenRipple", "softOceanWave"]);
    if (ringKinds.has(click)) {
      const count = click === "roseWindowGlow" ? 2 : click === "subtleRing" || click === "softGreenRipple" || click === "softOceanWave" ? 1 : 3;
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
    b.life -= b.kind === "letterfall" ? 0.025 : /Glow|Ripples|Halo|subtleRing|softGreenRipple|softOceanWave/.test(b.kind) ? 0.045 : 0.065;
    b.x += b.vx;
    b.y += b.vy;
    b.vy += b.kind === "letterfall" ? 0.018 : b.kind === "tricolorConfetti" || b.kind === "inkDrops" ? 0.05 : 0.006;
    b.radius += /Glow|Ripples|Halo|subtleRing|softGreenRipple|softOceanWave/.test(b.kind) ? 0.75 : 0.35;
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
    } else if (["roseWindowGlow", "loveRipples", "sunHalo", "moonHalo", "subtleRing", "softGreenRipple", "softOceanWave"].includes(b.kind)) {
      const softRipple = b.kind === "subtleRing" || b.kind === "softGreenRipple" || b.kind === "softOceanWave";
      const ringColor = b.kind === "subtleRing" || b.kind === "softGreenRipple" ? colors.primary : b.kind === "softOceanWave" ? "#2d9fb6" : b.color;
      ctx.globalCompositeOperation = "screen";
      ctx.shadowColor = softRipple ? ringColor : b.color;
      ctx.shadowBlur = softRipple ? 4 : b.kind === "sunHalo" ? 18 : 10;
      ctx.strokeStyle = ringColor;
      if (b.kind === "softGreenRipple") {
        const haze = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius * 1.1);
        haze.addColorStop(0, "rgba(141,198,63,0.14)");
        haze.addColorStop(0.5, "rgba(141,198,63,0.06)");
        haze.addColorStop(1, "rgba(141,198,63,0)");
        ctx.globalAlpha = b.life * 0.58;
        ctx.fillStyle = haze;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      if (softRipple) ctx.globalAlpha = b.life * 0.62;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * (softRipple ? 0.8 : 1), 0, Math.PI * 2);
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
  } else if (icon === "plane") {
    ctx.rotate(-0.08);
    ctx.lineWidth = 1.5;
    ctx.fillStyle = colors.secondary;
    ctx.strokeStyle = colors.primary;
    ctx.beginPath();
    ctx.moveTo(-31, -2);
    ctx.quadraticCurveTo(-15, -5, -1, -4);
    ctx.lineTo(21, -14);
    ctx.lineTo(26, -13);
    ctx.lineTo(10, -2);
    ctx.lineTo(33, 3);
    ctx.lineTo(31, 8);
    ctx.lineTo(8, 3);
    ctx.lineTo(-2, 17);
    ctx.lineTo(-8, 17);
    ctx.lineTo(-3, 3);
    ctx.lineTo(-31, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.primary;
    [-14, -7, 0, 7].forEach((x) => {
      ctx.beginPath();
      ctx.arc(x, -1, 1.15, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (icon === "musicNote") {
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(-5, 11, 7, 5, -0.25, 0, Math.PI * 2);
    ctx.moveTo(2, 11);
    ctx.lineTo(2, -20);
    ctx.bezierCurveTo(12, -16, 16, -11, 16, -3);
    ctx.stroke();
  } else if (icon === "clock") {
    ctx.rotate(time * 0.0012);
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI / 6;
      const outer = 18;
      const inner = index % 3 === 0 ? 11 : 13;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-2, -8);
    ctx.moveTo(0, 0);
    ctx.lineTo(7, 4);
    ctx.stroke();
    ctx.fillStyle = colors.secondary;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
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
`;
}

function renderAudioBuilder(show) {
  return `const path = require("node:path");
const { runBuild } = require(path.resolve(__dirname, "..", "..", "shared", "build-natural-audio.js"));

runBuild({
  root: path.resolve(__dirname, ".."),
  voice: process.env.MUSICAL_TTS_VOICE || "${show.audioVoice}",
  rate: Number(process.env.MUSICAL_TTS_RATE || "0.48"),
  kind: "generated",
});
`;
}

function getCursorMarker(slug) {
  return {
    "1789-les-amants-de-la-bastille": "preRenderRevolutionCocarde",
    "don-juan": "preRenderCrimsonRose",
    "cyrano-de-bergerac": "preRenderPaperAirplane",
    "le-roi-soleil": "preRenderTrueApolloSun",
    "notre-dame-de-paris": "preRenderRoseWindow",
    "les-miserables": "preRenderBaguette",
    "mozart-opera-rock": "preRenderNeonNote",
    "romeo-et-juliette": "preRenderPureBlockRose",
    "moliere-le-spectacle-musical": "preRenderPureQuill",
    "moulin-rouge": "preRenderMoulinWindmill",
    "elisabeth-das-musical": "preRenderClassicTiara",
    "tanz-der-vampire": "preRenderVampireBat",
    "ludwig-ii-sehnsucht-nach-dem-paradies": "preRenderLudwigCastle",
    "dracula-das-musical": "preRenderDraculaBat",
    "rebecca-das-musical": "preRenderRebeccaLogoR",
  "the-greatest-showman": "preRenderMarqueeHat",
    "epic-the-musical": "preRenderOdysseyTrident",
    "starmania": "preRenderBlackStar",
    "mozart-das-musical": "preRenderInspirationPoint",
    "phantom-of-the-opera": "preRenderGrandChandelier",
    "love-never-dies": "preRenderWindingKey",
    "les-souliers-rouges": "preRenderPosterMoon",
    "la-legende-du-roi-arthur": "preRenderExcalibur",
    chicago: "preRenderChicagoNewspaper",
    "dear-evan-hansen": "preRenderCastNote",
    "six-the-musical": "preRenderNeonCrown",
    suffs: "preRenderVoteButton",
    "sunset-boulevard": "preRenderFilmReel",
    "come-from-away": "preRenderComeFromAwayGlobe",
    rent: "preRenderRentGraffiti",
    "tick-tick-boom": "preRenderTickClock",
    wicked: "preRenderWickedHat",
    hadestown: "preRenderHadestownFlower",
    "sound-of-music-the": "preRenderSoundOfMusicNote",
    matilda: "preRenderMatildaPencil",
    "les-dix-commandements": "preRenderStoneTablets",
    "legally-blonde": "preRenderLegallyBlondeBalance",
  }[slug];
}

function getReferenceCursorConfig(show) {
  const profiles = {
    "moulin-rouge": {
      motif: "windmill",
      trail: "goldSparkleRosePetal",
      burst: "spectacular",
      motion: "turn",
      accent: "#e21d2a",
      size: 62,
      follow: 0.45,
      emitDistance: 25,
      clickOn: "up",
      burstParticles: 9,
      hotspot: [0.5, 0.5],
    },
    "elisabeth-das-musical": {
      motif: "classicTiara",
      trail: "diamondDust",
      burst: "softDiamondGlow",
      motion: "still",
      accent: "#17121f",
      size: 58,
      follow: 0.45,
      emitDistance: 25,
      clickOn: "up",
      burstParticles: 3,
      hotspot: [0.5, 0.5],
    },
    "tanz-der-vampire": {
      motif: "vampireBat",
      trail: "none",
      burst: "subtleRing",
      motion: "still",
      accent: "#b51e3d",
      size: 58,
      follow: 0.58,
      emitDistance: 1000000000,
      clickOn: "down",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
    "ludwig-ii-sehnsucht-nach-dem-paradies": {
      motif: "ludwigCastle",
      trail: "ludwigStarlight",
      burst: "castleGlow",
      motion: "still",
      accent: "#8aa4c8",
      size: 60,
      follow: 0.45,
      emitDistance: 22,
      clickOn: "up",
      burstParticles: 5,
      hotspot: [0.5, 0.5],
    },
    "dracula-das-musical": {
      motif: "draculaBat",
      trail: "batEmbers",
      burst: "batFlare",
      motion: "still",
      accent: "#a82135",
      size: 58,
      follow: 0.42,
      emitDistance: 15,
      clickOn: "down",
      burstParticles: 6,
      hotspot: [0.5, 0.5],
    },
    "rebecca-das-musical": {
      motif: "rebeccaLogoR",
      trail: "manderleySmoke",
      burst: "manderleyBurn",
      motion: "still",
      accent: "#426a91",
      size: 58,
      follow: 0.52,
      emitInterval: 32,
      clickOn: "down",
      burstParticles: 4,
      hotspot: [0.5, 0.5],
    },
  "the-greatest-showman": {
      motif: "marqueeHat",
      trail: "marqueeGold",
      burst: "curtainCall",
      motion: "still",
      accent: "#d59b3a",
      size: 60,
      follow: 0.46,
      emitDistance: 22,
      clickOn: "up",
      burstParticles: 7,
      hotspot: [0.5, 0.5],
    },
    "epic-the-musical": {
      motif: "odysseyTrident",
      trail: "seaStarlight",
      burst: "softOceanWave",
      motion: "still",
      accent: "#2d9fb6",
      size: 62,
      follow: 0.46,
      emitDistance: 18,
      clickOn: "down",
      burstParticles: 2,
      hotspot: [0.5, 0.5],
    },
    starmania: {
      motif: "blackStar",
      trail: "glitchPixel",
      burst: "glitchRipple",
      motion: "still",
      accent: "#98d9ea",
      size: 82,
      follow: 0.45,
      emitInterval: 30,
      clickOn: "up",
      burstParticles: 6,
      hotspot: [0.5, 0.5],
    },
    "mozart-das-musical": {
      motif: "inspirationPoint",
      trail: "fiveLineStaff",
      burst: "goldenRippleNotes",
      motion: "still",
      accent: "#ffd700",
      size: 58,
      follow: 0.6,
      emitDistance: 8,
      clickOn: "down",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
    "phantom-of-the-opera": {
      motif: "grandChandelier",
      trail: "crystalGlint",
      burst: "pressGlow",
      motion: "still",
      accent: "#7d1119",
      size: 50,
      follow: 0.35,
      emitDistance: 10,
      clickOn: "down",
      burstParticles: 6,
      hotspot: [0.5, 0.5],
    },
    "love-never-dies": {
      motif: "windingKey",
      trail: "neonSpark",
      burst: "subtleRipple",
      motion: "still",
      accent: "#7454ae",
      size: 58,
      follow: 0.55,
      emitInterval: 35,
      clickOn: "down",
      burstParticles: 2,
      hotspot: [0.1875, 0.1875],
    },
    "les-souliers-rouges": {
      motif: "posterMoon",
      trail: "moonMist",
      burst: "lunarBloom",
      motion: "still",
      accent: "#e21b38",
      size: 64,
      follow: 0.45,
      emitDistance: 16,
      clickOn: "down",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
    "la-legende-du-roi-arthur": {
      motif: "excalibur",
      trail: "magicDust",
      burst: "crispShockwave",
      motion: "still",
      accent: "#d5b85d",
      size: 72,
      follow: 0.68,
      emitDistance: 14,
      clickOn: "down",
      burstParticles: 3,
      hotspot: [0, 0],
    },
    chicago: {
      motif: "chicagoNewspaper",
      trail: "none",
      burst: "headlineDrop",
      motion: "still",
      accent: "#c51f2b",
      size: 58,
      follow: 0.58,
      emitDistance: 1000000000,
      clickOn: "up",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
    "dear-evan-hansen": {
      motif: "castNote",
      trail: "diamondDust",
      burst: "softDiamondGlow",
      motion: "still",
      accent: "#2a7aaa",
      size: 56,
      follow: 0.52,
      emitDistance: 18,
      clickOn: "down",
      burstParticles: 3,
      // The note's rotated upper tip is the actual click position.
      hotspot: [0.27, 0.27],
      rotation: -Math.PI / 4,
    },
    "six-the-musical": {
      motif: "neonCrown",
      trail: "neonSpark",
      burst: "glitchRipple",
      motion: "pulse",
      accent: "#d52ba6",
      size: 62,
      follow: 0.58,
      emitInterval: 32,
      clickOn: "down",
      burstParticles: 6,
      hotspot: [0.5, 0.5],
    },
    suffs: {
      motif: "voteButton",
      trail: "none",
      burst: "subtleRing",
      motion: "still",
      accent: "#e3ba25",
      size: 58,
      follow: 0.46,
      emitDistance: 16,
      clickOn: "up",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
    "sunset-boulevard": {
      motif: "filmReel",
      trail: "none",
      burst: "none",
      motion: "turn",
      accent: "#d78024",
      size: 60,
      follow: 0.58,
      emitDistance: 1000000000,
      clickOn: "none",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
    "les-miserables-1980": {
      motif: "revolutionFlag",
      trail: "magicDust",
      burst: "crispShockwave",
      motion: "still",
      accent: "#e6c472",
      size: 54,
      follow: 0.52,
      emitDistance: 16,
      clickOn: "down",
      burstParticles: 4,
      hotspot: [0.24, 0.54],
    },
    "les-miserables-cityprod-2017": {
      motif: "concertFlag",
      trail: "diamondDust",
      burst: "softDiamondGlow",
      motion: "still",
      accent: "#ead9aa",
      size: 52,
      follow: 0.48,
      emitDistance: 18,
      clickOn: "down",
      burstParticles: 3,
      hotspot: [0.25, 0.56],
    },
    "jesus-christ-superstar-1996-london": {
      motif: "passionCrossHalo",
      trail: "none",
      burst: "subtleRing",
      motion: "still",
      accent: "#d6b46a",
      size: 56,
      follow: 0.5,
      emitDistance: 18,
      clickOn: "down",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
    "le-petit-prince-2cd": {
      motif: "littlePrinceScarf",
      trail: "b612Stars",
      burst: "planetOrbit",
      motion: "still",
      accent: "#e3bd58",
      size: 54,
      follow: 0.48,
      emitDistance: 18,
      clickOn: "down",
      burstParticles: 3,
      hotspot: [0.5, 0.5],
    },
    "come-from-away": {
      motif: "comeFromAwayGlobe",
      trail: "none",
      burst: "none",
      motion: "still",
      accent: "#2d9fb6",
      size: 50,
      follow: 0.46,
      emitDistance: 1000000000,
      clickOn: "none",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
    rent: {
      motif: "rentGraffiti",
      trail: "neonSpark",
      burst: "subtleRipple",
      motion: "still",
      accent: "#c51d49",
      size: 58,
      follow: 0.55,
      emitInterval: 35,
      clickOn: "down",
      burstParticles: 2,
      hotspot: [0.1875, 0.1875],
    },
    "tick-tick-boom": {
      motif: "tickClock",
      trail: "clockTicks",
      burst: "clockShockwave",
      motion: "turn",
      accent: "#f3b33d",
      size: 54,
      follow: 0.6,
      emitDistance: 8,
      clickOn: "down",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
    wicked: {
      motif: "wickedHat",
      trail: "none",
      burst: "softGreenRipple",
      motion: "still",
      accent: "#8dc63f",
      size: 56,
      follow: 0.58,
      emitDistance: 1000000000,
      clickOn: "up",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
    hadestown: {
      motif: "hadestownFlower",
      trail: "thornEmbers",
      burst: "none",
      motion: "still",
      accent: "#b33a2c",
      size: 62,
      follow: 0.46,
      emitDistance: 18,
      clickOn: "none",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
    "sound-of-music-the": {
      motif: "soundOfMusicNote",
      trail: "none",
      burst: "softDiamondGlow",
      motion: "still",
      accent: "#4fb6d7",
      size: 60,
      follow: 1,
      emitDistance: 1000000000,
      clickOn: "down",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
    matilda: {
      motif: "matildaPencil",
      trail: "none",
      burst: "subtleRing",
      motion: "still",
      accent: "#df72a6",
      size: 56,
      follow: 0.54,
      emitDistance: 1000000000,
      clickOn: "down",
      burstParticles: 0,
      hotspot: [0.29, 0.72],
    },
    "les-dix-commandements": {
      motif: "stoneTablets",
      trail: "goldDust",
      burst: "sunHalo",
      motion: "still",
      accent: "#c89b45",
      size: 56,
      follow: 0.5,
      emitDistance: 18,
      clickOn: "down",
      burstParticles: 4,
      hotspot: [0.5, 0.5],
    },
    "legally-blonde": {
      motif: "legallyBlondeBalance",
      trail: "none",
      burst: "subtleRing",
      motion: "still",
      accent: "#d72d78",
      size: 48,
      follow: 0.52,
      emitDistance: 1000000000,
      clickOn: "down",
      burstParticles: 0,
      hotspot: [0.5, 0.5],
    },
  };
  const profile = profiles[show.slug];
  if (!profile) return null;
  return {
    ...profile,
    primary: show.effect.primary,
    secondary: show.effect.secondary,
  };
}

function renderReferenceCursor(show) {
  const marker = getCursorMarker(show.slug);
  const config = getReferenceCursorConfig(show);
  return `(() => {
  if (document.documentElement.dataset.musicalCursor === "native") return;
  if (window.matchMedia("(pointer: coarse)").matches) return;
  window.referenceCursorActive = true;
  const canvas = document.getElementById("effectCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const config = ${JSON.stringify(config)};
  const particles = [];
  const bursts = [];
  const trailPoints = [];
  const mouse = { x: -100, y: -100, targetX: -100, targetY: -100 };
  const lastEmit = { x: -100, y: -100 };
  let lastEmitTime = 0;
  let pressed = false;
  let windmillRotation = 0;
  let motifRotation = 0;
  let chandelierLight = 0;
  const pointerScale = 1;

  canvas.dataset.cursorMotif = config.motif;
  canvas.dataset.cursorTrail = config.trail;
  canvas.dataset.cursorBurst = config.burst;
  canvas.dataset.cursorTrailEmissions = "0";
  canvas.dataset.cursorClickBursts = "0";

  const cache = document.createElement("canvas");
  const cacheScale = Math.max(2, Math.min(window.devicePixelRatio || 1, 3));
  cache.width = 96 * cacheScale;
  cache.height = 96 * cacheScale;
  const cacheCtx = cache.getContext("2d");
  cacheCtx.setTransform(cacheScale, 0, 0, cacheScale, 0, 0);
  const bladeCache = document.createElement("canvas");
  bladeCache.width = 96 * cacheScale;
  bladeCache.height = 96 * cacheScale;
  const bladeCtx = bladeCache.getContext("2d");
  bladeCtx.setTransform(cacheScale, 0, 0, cacheScale, 0, 0);

  function drawDiamond(target, x, y, radius) {
    target.beginPath();
    target.moveTo(x, y - radius);
    target.lineTo(x + radius * 0.68, y);
    target.lineTo(x, y + radius);
    target.lineTo(x - radius * 0.68, y);
    target.closePath();
  }

  function ${marker}() {
    cacheCtx.clearRect(0, 0, 96, 96);
    cacheCtx.save();
    cacheCtx.translate(48, 48);
    cacheCtx.strokeStyle = config.primary;
    cacheCtx.fillStyle = config.secondary;
    cacheCtx.lineCap = "round";
    cacheCtx.lineJoin = "round";
    cacheCtx.lineWidth = 2.2;

    if (config.motif === "comeFromAwayGlobe") {
      const lightTheme = document.documentElement.dataset.musicalTheme === "light";
      const lightAccent = getComputedStyle(document.documentElement)
        .getPropertyValue("--musical-light-accent")
        .trim() || "#174a80";
      const lightMotif = getComputedStyle(document.documentElement)
        .getPropertyValue("--musical-light-motif")
        .trim() || "#b48c12";
      const globePrimary = lightTheme ? lightAccent : config.primary;
      const globeSecondary = lightTheme ? lightMotif : config.secondary;
      cacheCtx.fillStyle = lightTheme ? "rgba(248,251,252,0.97)" : "rgba(7,23,28,0.84)";
      cacheCtx.strokeStyle = globePrimary;
      cacheCtx.lineWidth = lightTheme ? 2.1 : 1.8;
      cacheCtx.shadowColor = lightTheme ? "rgba(23,74,128,0.28)" : "rgba(45,159,182,0.55)";
      cacheCtx.shadowBlur = lightTheme ? 4 : 5;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 20, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.strokeStyle = globeSecondary;
      cacheCtx.lineWidth = lightTheme ? 1.35 : 1.15;
      cacheCtx.beginPath();
      cacheCtx.ellipse(0, 0, 8, 20, 0, 0, Math.PI * 2);
      cacheCtx.ellipse(0, 0, 15, 20, 0, 0, Math.PI * 2);
      cacheCtx.ellipse(0, 0, 20, 7, 0, 0, Math.PI * 2);
      cacheCtx.ellipse(0, 0, 20, 13, 0, 0, Math.PI * 2);
      cacheCtx.stroke();
      cacheCtx.strokeStyle = globePrimary;
      cacheCtx.lineWidth = lightTheme ? 1.55 : 1.35;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 20, 0, Math.PI * 2);
      cacheCtx.stroke();
    } else if (config.motif === "rentGraffiti") {
      cacheCtx.save();
      cacheCtx.rotate(-0.04);
      cacheCtx.fillStyle = "#171016";
      cacheCtx.strokeStyle = "#c51d49";
      cacheCtx.lineWidth = 2.3;
      cacheCtx.shadowColor = "rgba(197,29,73,0.75)";
      cacheCtx.shadowBlur = 6;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-31, -19);
      cacheCtx.lineTo(27, -22);
      cacheCtx.lineTo(33, 17);
      cacheCtx.lineTo(-28, 21);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.fillStyle = "#f0d65d";
      cacheCtx.font = "900 24px Arial Black, Arial, sans-serif";
      cacheCtx.textAlign = "center";
      cacheCtx.textBaseline = "middle";
      cacheCtx.fillText("RENT", 0, 1);
      cacheCtx.strokeStyle = "rgba(255,244,239,0.6)";
      cacheCtx.lineWidth = 1;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-27, -12);
      cacheCtx.lineTo(-20, -16);
      cacheCtx.moveTo(20, 13);
      cacheCtx.lineTo(27, 9);
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "rgba(240,214,93,0.72)";
      cacheCtx.lineWidth = 0.8;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-24, 13);
      cacheCtx.lineTo(22, 10);
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#c51d49";
      [[-27, -18], [28, -18], [-25, 18], [28, 16]].forEach(([x, y]) => {
        cacheCtx.beginPath();
        cacheCtx.arc(x, y, 1.6, 0, Math.PI * 2);
        cacheCtx.fill();
      });
      cacheCtx.restore();
    } else if (config.motif === "tickClock") {
      cacheCtx.save();
      cacheCtx.fillStyle = "#f3e500";
      cacheCtx.strokeStyle = "#17130a";
      cacheCtx.lineWidth = 2.6;
      cacheCtx.shadowColor = "rgba(243,229,0,0.75)";
      cacheCtx.shadowBlur = 7;
      cacheCtx.fillStyle = "#f5df42";
      cacheCtx.beginPath();
      cacheCtx.roundRect(-5, -32, 10, 8, 3);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 24, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.lineWidth = 1.3;
      for (let index = 0; index < 12; index += 1) {
        const angle = index * Math.PI / 6;
        const outer = 21;
        const inner = index % 3 === 0 ? 16 : 18;
        cacheCtx.beginPath();
        cacheCtx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        cacheCtx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        cacheCtx.stroke();
      }
      cacheCtx.lineWidth = 2.6;
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 0);
      cacheCtx.lineTo(-3, -13);
      cacheCtx.moveTo(0, 0);
      cacheCtx.lineTo(11, 6);
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#17130a";
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 2.5, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.strokeStyle = "#af86c8";
      cacheCtx.lineWidth = 1.2;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 28, Math.PI * 1.1, Math.PI * 1.85);
      cacheCtx.stroke();
      cacheCtx.restore();
    } else if (config.motif === "wickedHat") {
      cacheCtx.save();
      cacheCtx.rotate(-0.04);
      const brim = cacheCtx.createLinearGradient(-24, 4, 22, 15);
      brim.addColorStop(0, "#050706");
      brim.addColorStop(0.48, "#182316");
      brim.addColorStop(1, "#050706");
      cacheCtx.fillStyle = brim;
      cacheCtx.strokeStyle = "rgba(184,222,130,0.82)";
      cacheCtx.lineWidth = 0.92;
      cacheCtx.shadowColor = "rgba(0,0,0,0.52)";
      cacheCtx.shadowBlur = 2;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-27, 9);
      cacheCtx.quadraticCurveTo(-4, 2, 27, 9);
      cacheCtx.quadraticCurveTo(16, 16, -18, 15);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.shadowBlur = 0;
      cacheCtx.stroke();
      const crown = cacheCtx.createLinearGradient(-13, -32, 14, 8);
      crown.addColorStop(0, "#273422");
      crown.addColorStop(0.38, "#070a08");
      crown.addColorStop(0.82, "#111810");
      crown.addColorStop(1, "#030403");
      cacheCtx.fillStyle = crown;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-13, 8);
      cacheCtx.bezierCurveTo(-10, -6, -4, -17, 1, -31);
      cacheCtx.quadraticCurveTo(8, -38, 15, -31);
      cacheCtx.quadraticCurveTo(8, -26, 9, -19);
      cacheCtx.bezierCurveTo(11, -8, 13, 0, 14, 8);
      cacheCtx.closePath();
      cacheCtx.shadowColor = "rgba(0,0,0,0.52)";
      cacheCtx.shadowBlur = 2;
      cacheCtx.fill();
      cacheCtx.shadowBlur = 0;
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "#8dc63f";
      cacheCtx.lineWidth = 1.5;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-11, 3);
      cacheCtx.quadraticCurveTo(1, 0, 12, 3);
      cacheCtx.stroke();
      cacheCtx.restore();
    } else if (config.motif === "hadestownFlower") {
      cacheCtx.save();
      cacheCtx.strokeStyle = "#e9d3a0";
      cacheCtx.lineWidth = 2.1;
      cacheCtx.shadowColor = "rgba(233,211,160,0.48)";
      cacheCtx.shadowBlur = 4;
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 28);
      cacheCtx.bezierCurveTo(-2, 14, 2, 4, 0, -7);
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#8f241f";
      cacheCtx.strokeStyle = "#e9d3a0";
      cacheCtx.lineWidth = 0.9;
      for (let index = 0; index < 8; index += 1) {
        cacheCtx.save();
        cacheCtx.rotate(index * Math.PI / 4);
        cacheCtx.beginPath();
        cacheCtx.ellipse(0, -16, index % 2 ? 6 : 7.5, index % 2 ? 10 : 12, 0, 0, Math.PI * 2);
        cacheCtx.fill();
        cacheCtx.stroke();
        cacheCtx.restore();
      }
      cacheCtx.fillStyle = "#b33a2c";
      cacheCtx.beginPath();
      cacheCtx.arc(0, -16, 6, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.fillStyle = "#e9d3a0";
      cacheCtx.beginPath();
      cacheCtx.arc(0, -16, 2.8, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.strokeStyle = "#6c3327";
      cacheCtx.lineWidth = 1.15;
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 28);
      cacheCtx.quadraticCurveTo(-13, 18, -16, 11);
      cacheCtx.moveTo(-2, 20);
      cacheCtx.lineTo(-10, 16);
      cacheCtx.moveTo(1, 13);
      cacheCtx.lineTo(10, 9);
      cacheCtx.stroke();
      cacheCtx.restore();
    } else if (config.motif === "stoneTablets") {
      cacheCtx.save();
      const tabletFill = cacheCtx.createLinearGradient(0, -29, 0, 26);
      tabletFill.addColorStop(0, "#d8cba5");
      tabletFill.addColorStop(0.5, "#b7a887");
      tabletFill.addColorStop(1, "#82765e");
      cacheCtx.fillStyle = tabletFill;
      cacheCtx.strokeStyle = "#f0e6c5";
      cacheCtx.lineWidth = 1.4;
      cacheCtx.shadowColor = "rgba(29,138,166,0.65)";
      cacheCtx.shadowBlur = 5;
      const drawTablet = (x, rotation) => {
        cacheCtx.save();
        cacheCtx.translate(x, 2);
        cacheCtx.rotate(rotation);
        cacheCtx.beginPath();
        cacheCtx.moveTo(-13, -22);
        cacheCtx.quadraticCurveTo(0, -29, 13, -22);
        cacheCtx.lineTo(14, 23);
        cacheCtx.lineTo(-14, 23);
        cacheCtx.closePath();
        cacheCtx.fill();
        cacheCtx.stroke();
        cacheCtx.strokeStyle = "rgba(43,54,55,0.75)";
        cacheCtx.lineWidth = 1.1;
        [-13, -6, 1, 8, 15].forEach((y, index) => {
          cacheCtx.beginPath();
          cacheCtx.moveTo(-8 + (index % 2), y);
          cacheCtx.lineTo(8 - (index % 3), y);
          cacheCtx.stroke();
        });
        cacheCtx.strokeStyle = "rgba(240,230,197,0.4)";
        cacheCtx.lineWidth = 0.7;
        cacheCtx.beginPath();
        cacheCtx.moveTo(-10, -20);
        cacheCtx.lineTo(10, -20);
        cacheCtx.stroke();
        cacheCtx.restore();
      };
      drawTablet(-10, -0.12);
      drawTablet(10, 0.12);
      cacheCtx.restore();
    } else if (config.motif === "windmill") {
      const millBody = cacheCtx.createLinearGradient(0, 2, 0, 36);
      millBody.addColorStop(0, "#ef2835");
      millBody.addColorStop(0.52, "#b80f20");
      millBody.addColorStop(1, "#650611");
      cacheCtx.fillStyle = millBody;
      cacheCtx.strokeStyle = "#e6b85e";
      cacheCtx.lineWidth = 1.35;
      cacheCtx.shadowColor = "rgba(0,0,0,0.7)";
      cacheCtx.shadowBlur = 2;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-8, 3);
      cacheCtx.quadraticCurveTo(0, -1, 8, 3);
      cacheCtx.lineTo(14, 35);
      cacheCtx.lineTo(-14, 35);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.strokeStyle = "rgba(255,225,151,0.78)";
      cacheCtx.lineWidth = 0.75;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-11, 19);
      cacheCtx.lineTo(11, 19);
      cacheCtx.moveTo(-13, 30);
      cacheCtx.lineTo(13, 30);
      cacheCtx.stroke();
      [[-8,12],[0,13],[8,12],[-11,24],[11,24],[-12,32],[-6,34],[0,34],[6,34],[12,32]].forEach((bulb) => {
        cacheCtx.beginPath();
        cacheCtx.arc(bulb[0], bulb[1], 1.05, 0, Math.PI * 2);
        cacheCtx.fillStyle = "#fff1a8";
        cacheCtx.fill();
      });
      cacheCtx.fillStyle = "#2a050b";
      cacheCtx.strokeStyle = "#e6b85e";
      cacheCtx.lineWidth = 0.9;
      cacheCtx.fillRect(-4, 22, 8, 13);
      cacheCtx.strokeRect(-4, 22, 8, 13);
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 4.2, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#e6b85e";
      cacheCtx.fill();
    } else if (config.motif === "vampireBat") {
      cacheCtx.save();
      cacheCtx.translate(0, 2);
      const batFill = cacheCtx.createLinearGradient(0, -20, 0, 19);
      batFill.addColorStop(0, "#4b1020");
      batFill.addColorStop(0.45, "#21080f");
      batFill.addColorStop(1, "#080305");
      cacheCtx.fillStyle = batFill;
      cacheCtx.strokeStyle = "#d8b56d";
      cacheCtx.lineWidth = 1.15;
      cacheCtx.shadowColor = "rgba(181,30,61,0.5)";
      cacheCtx.shadowBlur = 5;
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, -8);
      cacheCtx.bezierCurveTo(-8, -16, -19, -22, -30, -16);
      cacheCtx.quadraticCurveTo(-28, -5, -22, 2);
      cacheCtx.quadraticCurveTo(-17, -3, -13, 7);
      cacheCtx.quadraticCurveTo(-8, 1, -4, 10);
      cacheCtx.lineTo(0, 18);
      cacheCtx.lineTo(4, 10);
      cacheCtx.quadraticCurveTo(8, 1, 13, 7);
      cacheCtx.quadraticCurveTo(17, -3, 22, 2);
      cacheCtx.quadraticCurveTo(28, -5, 30, -16);
      cacheCtx.bezierCurveTo(19, -22, 8, -16, 0, -8);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.fillStyle = "#3a0c18";
      cacheCtx.strokeStyle = "#d8b56d";
      cacheCtx.lineWidth = 0.9;
      cacheCtx.beginPath();
      cacheCtx.ellipse(0, 3, 4.8, 15, 0, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.moveTo(-5, -11);
      cacheCtx.lineTo(-8, -22);
      cacheCtx.lineTo(-1, -15);
      cacheCtx.closePath();
      cacheCtx.moveTo(5, -11);
      cacheCtx.lineTo(8, -22);
      cacheCtx.lineTo(1, -15);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.arc(0, -9, 6.5, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#d8b56d";
      cacheCtx.beginPath();
      cacheCtx.arc(-2.3, -9, 0.9, 0, Math.PI * 2);
      cacheCtx.arc(2.3, -9, 0.9, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.restore();
    } else if (config.motif === "ludwigCastle") {
      cacheCtx.translate(0, 2);
      cacheCtx.shadowColor = "rgba(138,164,200,0.65)";
      cacheCtx.shadowBlur = 5;
      cacheCtx.fillStyle = "rgba(216,232,247,0.94)";
      cacheCtx.beginPath();
      cacheCtx.arc(20, -24, 9, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.fillStyle = "rgba(7,16,27,0.9)";
      cacheCtx.beginPath();
      cacheCtx.moveTo(-35, 28);
      cacheCtx.lineTo(-20, 15);
      cacheCtx.lineTo(-10, 22);
      cacheCtx.lineTo(4, 10);
      cacheCtx.lineTo(17, 21);
      cacheCtx.lineTo(31, 14);
      cacheCtx.lineTo(38, 28);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.fillStyle = "#b9c9d6";
      cacheCtx.strokeStyle = "#e6d6a0";
      cacheCtx.lineWidth = 1;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-27, 26);
      cacheCtx.lineTo(-25, 1);
      cacheCtx.lineTo(-19, -7);
      cacheCtx.lineTo(-13, 1);
      cacheCtx.lineTo(-13, 26);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#d4e2ed";
      cacheCtx.beginPath();
      cacheCtx.moveTo(-9, 26);
      cacheCtx.lineTo(-7, -15);
      cacheCtx.lineTo(0, -24);
      cacheCtx.lineTo(7, -15);
      cacheCtx.lineTo(9, 26);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#aebfcc";
      cacheCtx.beginPath();
      cacheCtx.moveTo(13, 26);
      cacheCtx.lineTo(14, 4);
      cacheCtx.lineTo(20, -4);
      cacheCtx.lineTo(26, 4);
      cacheCtx.lineTo(27, 26);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#e6d6a0";
      [-21, -3, 20].forEach((x) => {
        cacheCtx.fillRect(x, 10, 2.3, 5);
        cacheCtx.fillRect(x, 19, 2.3, 5);
      });
      cacheCtx.shadowBlur = 0;
      [[-32,-22,1.2],[-3,-31,1.1],[10,-18,1.3],[34,-25,1]].forEach((star) => {
        cacheCtx.beginPath();
        cacheCtx.arc(star[0], star[1], star[2], 0, Math.PI * 2);
        cacheCtx.fill();
      });
    } else if (config.motif === "draculaBat") {
      cacheCtx.translate(0, 2);
      cacheCtx.shadowColor = "rgba(168,33,53,0.72)";
      cacheCtx.shadowBlur = 6;
      cacheCtx.fillStyle = "#10070e";
      cacheCtx.strokeStyle = "#a82135";
      cacheCtx.lineWidth = 1.1;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-4, -2);
      cacheCtx.bezierCurveTo(-15, -13, -25, -19, -38, -13);
      cacheCtx.lineTo(-30, -4);
      cacheCtx.lineTo(-39, -1);
      cacheCtx.lineTo(-25, 8);
      cacheCtx.lineTo(-16, 5);
      cacheCtx.lineTo(-8, 12);
      cacheCtx.lineTo(0, 5);
      cacheCtx.lineTo(8, 12);
      cacheCtx.lineTo(16, 5);
      cacheCtx.lineTo(25, 8);
      cacheCtx.lineTo(39, -1);
      cacheCtx.lineTo(30, -4);
      cacheCtx.lineTo(38, -13);
      cacheCtx.bezierCurveTo(25, -19, 15, -13, 4, -2);
      cacheCtx.quadraticCurveTo(0, -10, -4, -2);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#a82135";
      cacheCtx.beginPath();
      cacheCtx.ellipse(0, 3, 5, 12, 0, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.fillStyle = "#f5c7a1";
      cacheCtx.beginPath();
      cacheCtx.arc(-2, -1, 1.2, 0, Math.PI * 2);
      cacheCtx.arc(2, -1, 1.2, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.strokeStyle = "#b51e3d";
      cacheCtx.lineWidth = 1.7;
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 13);
      cacheCtx.lineTo(0, 29);
      cacheCtx.stroke();
    } else if (config.motif === "rebeccaLogoR") {
      cacheCtx.translate(-1, -1);
      const logoMetal = cacheCtx.createLinearGradient(-24, -34, 24, 32);
      logoMetal.addColorStop(0, "#f8d879");
      logoMetal.addColorStop(0.28, "#b75b2f");
      logoMetal.addColorStop(0.58, "#4a1a1c");
      logoMetal.addColorStop(0.82, "#efb43f");
      logoMetal.addColorStop(1, "#8b3327");
      cacheCtx.font = 'bold 69px Georgia, "Times New Roman", serif';
      cacheCtx.textAlign = "center";
      cacheCtx.textBaseline = "middle";
      cacheCtx.lineWidth = 1.2;
      cacheCtx.strokeStyle = "rgba(12,18,28,0.96)";
      cacheCtx.shadowColor = "rgba(17,8,8,0.86)";
      cacheCtx.shadowBlur = 7;
      cacheCtx.strokeText("R", 0, -4);
      cacheCtx.fillStyle = logoMetal;
      cacheCtx.fillText("R", 0, -4);
      cacheCtx.shadowBlur = 0;
      cacheCtx.strokeStyle = "#f2c65b";
      cacheCtx.lineWidth = 2.1;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-28, 22);
      cacheCtx.bezierCurveTo(-16, 29, 2, 31, 18, 25);
      cacheCtx.bezierCurveTo(31, 20, 36, 28, 26, 34);
      cacheCtx.bezierCurveTo(20, 38, 16, 34, 22, 30);
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "rgba(66,106,145,0.78)";
      cacheCtx.lineWidth = 0.9;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-27, 24);
      cacheCtx.bezierCurveTo(-12, 31, 5, 32, 20, 26);
      cacheCtx.stroke();
    } else if (config.motif === "marqueeHat") {
      cacheCtx.translate(0, 3);
      cacheCtx.shadowColor = "rgba(213,155,58,0.7)";
      cacheCtx.shadowBlur = 6;
      cacheCtx.fillStyle = "#17100d";
      cacheCtx.strokeStyle = "#d59b3a";
      cacheCtx.lineWidth = 1.3;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-13, -24);
      cacheCtx.quadraticCurveTo(0, -30, 13, -24);
      cacheCtx.lineTo(11, 7);
      cacheCtx.lineTo(-11, 7);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#a82135";
      cacheCtx.fillRect(-12, -3, 24, 7);
      cacheCtx.strokeStyle = "#f2d18a";
      cacheCtx.lineWidth = 1;
      cacheCtx.strokeRect(-12, -3, 24, 7);
      cacheCtx.fillStyle = "#17100d";
      cacheCtx.beginPath();
      cacheCtx.ellipse(0, 9, 25, 6, 0, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#fff5c4";
      [-19, -10, 0, 10, 19].forEach((x) => {
        cacheCtx.beginPath();
        cacheCtx.arc(x, 9 + Math.abs(x) * 0.045, 1.8, 0, Math.PI * 2);
        cacheCtx.fill();
      });
      cacheCtx.strokeStyle = "#e75b3c";
      cacheCtx.lineWidth = 1.4;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-21, -26);
      cacheCtx.lineTo(-30, -35);
      cacheCtx.moveTo(21, -26);
      cacheCtx.lineTo(30, -35);
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#f2d18a";
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, -43);
      cacheCtx.lineTo(3, -36);
      cacheCtx.lineTo(10, -36);
      cacheCtx.lineTo(5, -31);
      cacheCtx.lineTo(7, -24);
      cacheCtx.lineTo(0, -28);
      cacheCtx.lineTo(-7, -24);
      cacheCtx.lineTo(-5, -31);
      cacheCtx.lineTo(-10, -36);
      cacheCtx.lineTo(-3, -36);
      cacheCtx.closePath();
      cacheCtx.fill();
    } else if (config.motif === "classicTiara") {
      cacheCtx.translate(0, -3);
      cacheCtx.strokeStyle = "rgba(249,247,255,0.96)";
      cacheCtx.fillStyle = "rgba(183,166,211,0.24)";
      cacheCtx.shadowColor = "rgba(230,226,237,0.72)";
      cacheCtx.shadowBlur = 3;
      cacheCtx.lineWidth = 1.15;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-27, 32);
      cacheCtx.quadraticCurveTo(0, 38, 27, 32);
      cacheCtx.lineTo(25, 37);
      cacheCtx.quadraticCurveTo(0, 44, -25, 37);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      const tiaraArches = [
        [-25,32,-22,18,-19,14,-14,31],
        [-18,32,-14,10,-10,8,-5,31],
        [-8,32,-4,9,0,0,5,31],
        [8,32,4,9,0,0,-5,31],
        [18,32,14,10,10,8,5,31],
        [25,32,22,18,19,14,14,31],
      ];
      tiaraArches.forEach((arch) => {
        cacheCtx.beginPath();
        cacheCtx.moveTo(arch[0], arch[1]);
        cacheCtx.bezierCurveTo(arch[2], arch[3], arch[4], arch[5], arch[6], arch[7]);
        cacheCtx.stroke();
      });
      cacheCtx.shadowBlur = 0;
      cacheCtx.strokeStyle = "rgba(211,198,231,0.88)";
      cacheCtx.lineWidth = 0.85;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-18, 27);
      cacheCtx.quadraticCurveTo(-9, 17, 0, 29);
      cacheCtx.quadraticCurveTo(9, 17, 18, 27);
      cacheCtx.moveTo(-12, 31);
      cacheCtx.quadraticCurveTo(0, 19, 12, 31);
      cacheCtx.stroke();
      drawDiamond(cacheCtx, 0, 15, 6.5);
      cacheCtx.fillStyle = "rgba(103,84,126,0.9)";
      cacheCtx.fill();
      cacheCtx.strokeStyle = "#ffffff";
      cacheCtx.stroke();
      [[0,0,3.1],[-10,8,2.4],[10,8,2.4],[-19,14,1.9],[19,14,1.9],[0,15,1.7],[-7,23,1.25],[7,23,1.25]].forEach((gem) => {
        cacheCtx.beginPath();
        cacheCtx.arc(gem[0], gem[1], gem[2], 0, Math.PI * 2);
        cacheCtx.fillStyle = gem[0] === 0 && gem[1] === 15 ? "#e6e2ed" : "#ffffff";
        cacheCtx.shadowColor = "#ffffff";
        cacheCtx.shadowBlur = 4;
        cacheCtx.fill();
      });
      cacheCtx.shadowBlur = 1;
      for (let x = -22; x <= 22; x += 4) {
        cacheCtx.beginPath();
        cacheCtx.arc(x, 36 + Math.abs(x) * 0.035, 1.15, 0, Math.PI * 2);
        cacheCtx.fill();
      }
    } else if (config.motif === "blackStar") {
      cacheCtx.translate(0, 16);
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, -16);
      cacheCtx.lineTo(5, -4);
      cacheCtx.lineTo(20, 0);
      cacheCtx.lineTo(5, 5);
      cacheCtx.lineTo(0, 20);
      cacheCtx.lineTo(-5, 5);
      cacheCtx.lineTo(-20, 0);
      cacheCtx.lineTo(-5, -4);
      cacheCtx.closePath();
      cacheCtx.fillStyle = "rgba(5,2,10,0.96)";
      cacheCtx.fill();
      cacheCtx.strokeStyle = "#00f3ff";
      cacheCtx.shadowColor = "#00f3ff";
      cacheCtx.shadowBlur = 10;
      cacheCtx.lineWidth = 1.7;
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 3.2, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#ff00ff";
      cacheCtx.shadowColor = "#ff00ff";
      cacheCtx.shadowBlur = 8;
      cacheCtx.fill();
    } else if (config.motif === "soundOfMusicNote") {
      cacheCtx.save();
      const lightTheme = document.documentElement.dataset.musicalTheme === "light";
      const halo = cacheCtx.createRadialGradient(0, 2, 2, 0, 2, 31);
      halo.addColorStop(0, lightTheme ? "rgba(79,182,215,0.2)" : "rgba(132,218,240,0.28)");
      halo.addColorStop(0.45, lightTheme ? "rgba(79,182,215,0.08)" : "rgba(79,182,215,0.12)");
      halo.addColorStop(1, "rgba(79,182,215,0)");
      cacheCtx.fillStyle = halo;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 2, 31, 0, Math.PI * 2);
      cacheCtx.fill();

      cacheCtx.translate(1, 1);
      cacheCtx.rotate(-0.08);
      const noteFill = cacheCtx.createLinearGradient(-16, -24, 18, 25);
      noteFill.addColorStop(0, lightTheme ? "#dff8ff" : "#e8fbff");
      noteFill.addColorStop(0.28, lightTheme ? "#6ec9e6" : "#9ce6f5");
      noteFill.addColorStop(0.72, lightTheme ? "#2d8fb6" : "#4fb6d7");
      noteFill.addColorStop(1, lightTheme ? "#145b83" : "#237da8");
      cacheCtx.fillStyle = noteFill;
      cacheCtx.shadowColor = lightTheme ? "rgba(17,89,128,0.36)" : "rgba(79,182,215,0.54)";
      cacheCtx.shadowBlur = 6;

      cacheCtx.beginPath();
      cacheCtx.ellipse(-7, 19, 10.5, 6.5, -0.18, 0, Math.PI * 2);
      cacheCtx.fill();

      cacheCtx.beginPath();
      cacheCtx.roundRect(0, -20, 6.5, 40, 3.2);
      cacheCtx.fill();

      cacheCtx.beginPath();
      cacheCtx.moveTo(3, -20);
      cacheCtx.bezierCurveTo(14, -19, 22, -14, 22, -5);
      cacheCtx.bezierCurveTo(22, -1, 19, 1, 16, 1);
      cacheCtx.bezierCurveTo(18, -5, 15, -9, 6, -10);
      cacheCtx.lineTo(6, -16);
      cacheCtx.bezierCurveTo(13, -15, 18, -12, 20, -9);
      cacheCtx.bezierCurveTo(18, -14, 12, -16, 3, -14);
      cacheCtx.closePath();
      cacheCtx.fill();

      cacheCtx.shadowBlur = 0;
      cacheCtx.strokeStyle = lightTheme ? "rgba(238,252,255,0.78)" : "rgba(224,250,255,0.7)";
      cacheCtx.lineWidth = 1.1;
      cacheCtx.beginPath();
      cacheCtx.moveTo(2.5, -16);
      cacheCtx.lineTo(2.5, 9);
      cacheCtx.moveTo(-13, 18);
      cacheCtx.quadraticCurveTo(-7, 13, 1, 17);
      cacheCtx.stroke();
      cacheCtx.restore();
    } else if (config.motif === "inspirationPoint") {
      const glow = cacheCtx.createRadialGradient(0, 0, 0, 0, 0, 34);
      glow.addColorStop(0, "rgba(255,255,255,1)");
      glow.addColorStop(0.1, "rgba(255,239,181,0.96)");
      glow.addColorStop(0.28, "rgba(255,205,66,0.7)");
      glow.addColorStop(0.58, "rgba(201,29,43,0.22)");
      glow.addColorStop(1, "rgba(255,215,0,0)");
      cacheCtx.fillStyle = glow;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 34, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.fillStyle = "#ffffff";
      cacheCtx.shadowColor = "#ffffff";
      cacheCtx.shadowBlur = 4;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 2.5, 0, Math.PI * 2);
      cacheCtx.fill();
    } else if (config.motif === "grandChandelier") {
      const brass = cacheCtx.createLinearGradient(-32, 0, 32, 0);
      brass.addColorStop(0, "#684513");
      brass.addColorStop(0.3, "#c99535");
      brass.addColorStop(0.5, "#ffe3a0");
      brass.addColorStop(0.72, "#b77a24");
      brass.addColorStop(1, "#5a370f");
      cacheCtx.strokeStyle = brass;
      cacheCtx.fillStyle = brass;
      cacheCtx.lineWidth = 1.8;
      cacheCtx.shadowColor = "rgba(255,225,155,0.38)";
      cacheCtx.shadowBlur = 2.5;

      const drawFacetedCrystal = (x, y, width, height) => {
        cacheCtx.save();
        const crystal = cacheCtx.createLinearGradient(x - width, y, x + width, y);
        crystal.addColorStop(0, "rgba(123,206,240,0.94)");
        crystal.addColorStop(0.42, "rgba(255,255,255,0.98)");
        crystal.addColorStop(0.66, "rgba(218,243,252,0.96)");
        crystal.addColorStop(1, "rgba(193,160,232,0.88)");
        cacheCtx.shadowColor = "rgba(190,236,255,0.7)";
        cacheCtx.shadowBlur = 3.6;
        cacheCtx.beginPath();
        cacheCtx.moveTo(x, y - height * 0.55);
        cacheCtx.lineTo(x + width * 0.72, y - height * 0.16);
        cacheCtx.lineTo(x + width * 0.5, y + height * 0.34);
        cacheCtx.lineTo(x, y + height * 0.56);
        cacheCtx.lineTo(x - width * 0.5, y + height * 0.34);
        cacheCtx.lineTo(x - width * 0.72, y - height * 0.16);
        cacheCtx.closePath();
        cacheCtx.fillStyle = crystal;
        cacheCtx.strokeStyle = "rgba(245,252,255,0.92)";
        cacheCtx.lineWidth = 0.8;
        cacheCtx.fill();
        cacheCtx.stroke();
        cacheCtx.beginPath();
        cacheCtx.moveTo(x, y - height * 0.48);
        cacheCtx.lineTo(x, y + height * 0.46);
        cacheCtx.moveTo(x - width * 0.56, y - height * 0.12);
        cacheCtx.lineTo(x + width * 0.48, y + height * 0.3);
        cacheCtx.strokeStyle = "rgba(255,255,255,0.58)";
        cacheCtx.lineWidth = 0.55;
        cacheCtx.stroke();
        cacheCtx.restore();
      };

      // Ceiling rose, linked chain and glass baluster make the silhouette read as a chandelier.
      cacheCtx.beginPath();
      cacheCtx.ellipse(0, -35, 8.5, 2.5, 0, 0, Math.PI * 2);
      cacheCtx.fill();
      [-30.5, -25.5, -20.5].forEach((y, index) => {
        cacheCtx.beginPath();
        cacheCtx.ellipse(0, y, 2.2, 3.2, index % 2 ? Math.PI / 2 : 0, 0, Math.PI * 2);
        cacheCtx.stroke();
      });
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, -18);
      cacheCtx.bezierCurveTo(-5.8, -15, -5.5, -10.5, 0, -7.5);
      cacheCtx.bezierCurveTo(5.5, -10.5, 5.8, -15, 0, -18);
      cacheCtx.stroke();
      drawFacetedCrystal(0, -11.5, 3.6, 8.5);
      const glassBowl = cacheCtx.createLinearGradient(-27, 10, 27, 18);
      glassBowl.addColorStop(0, "rgba(119,198,230,0.2)");
      glassBowl.addColorStop(0.48, "rgba(255,255,255,0.4)");
      glassBowl.addColorStop(1, "rgba(179,147,217,0.22)");
      cacheCtx.beginPath();
      cacheCtx.moveTo(-27, 8);
      cacheCtx.quadraticCurveTo(0, 31, 27, 8);
      cacheCtx.quadraticCurveTo(0, 18, -27, 8);
      cacheCtx.closePath();
      cacheCtx.fillStyle = glassBowl;
      cacheCtx.strokeStyle = "rgba(222,244,252,0.72)";
      cacheCtx.lineWidth = 0.8;
      cacheCtx.fill();
      cacheCtx.stroke();
      [[0,-6,11,2.7],[0,8,27,6],[0,14,34,6.5]].forEach((ring) => {
        cacheCtx.beginPath();
        cacheCtx.ellipse(ring[0], ring[1], ring[2], ring[3], 0, 0, Math.PI * 2);
        cacheCtx.strokeStyle = brass;
        cacheCtx.lineWidth = ring[2] > 20 ? 2 : 1.5;
        cacheCtx.stroke();
      });

      // Five candle arms and cups remain readable at the reviewed 50px cursor size.
      const candles = [
        { x: -32, y: -3 },
        { x: -17, y: -8 },
        { x: 0, y: -10 },
        { x: 17, y: -8 },
        { x: 32, y: -3 },
      ];
      candles.forEach(({ x, y }) => {
        const direction = Math.sign(x);
        cacheCtx.beginPath();
        cacheCtx.moveTo(direction * 2, 9);
        cacheCtx.bezierCurveTo(x * 0.35, 18, x * 0.82, 10, x, y + 4);
        cacheCtx.quadraticCurveTo(x + direction * 3.3, y, x, y - 2);
        cacheCtx.strokeStyle = brass;
        cacheCtx.lineWidth = 1.9;
        cacheCtx.stroke();
        cacheCtx.beginPath();
        cacheCtx.ellipse(x, y - 2, 5.2, 1.9, 0, 0, Math.PI * 2);
        cacheCtx.fillStyle = brass;
        cacheCtx.fill();
        cacheCtx.stroke();
        const wax = cacheCtx.createLinearGradient(x - 2.2, 0, x + 2.2, 0);
        wax.addColorStop(0, "#b99e71");
        wax.addColorStop(0.48, "#fff8de");
        wax.addColorStop(1, "#c9ac79");
        cacheCtx.fillStyle = wax;
        cacheCtx.fillRect(x - 2, y - 8, 4, 6);
        cacheCtx.fillStyle = "#f4e5c4";
        cacheCtx.beginPath();
        cacheCtx.moveTo(x, y - 14.5);
        cacheCtx.quadraticCurveTo(x + 3, y - 11, x, y - 8);
        cacheCtx.quadraticCurveTo(x - 3, y - 11, x, y - 14.5);
        cacheCtx.fillStyle = "#fff2a6";
        cacheCtx.shadowColor = "#ffd671";
        cacheCtx.shadowBlur = 4;
        cacheCtx.fill();
        cacheCtx.fillStyle = brass;
        cacheCtx.shadowBlur = 1.5;
      });

      const drawBeadSwag = (startX, endX, startY, sag) => {
        for (let step = 0; step <= 8; step += 1) {
          const t = step / 8;
          const x = startX + (endX - startX) * t;
          const y = startY + Math.sin(t * Math.PI) * sag;
          cacheCtx.beginPath();
          cacheCtx.arc(x, y, step % 4 === 0 ? 1.4 : 0.9, 0, Math.PI * 2);
          cacheCtx.fillStyle = step % 4 === 0 ? "#ffffff" : "#cfe7f1";
          cacheCtx.shadowColor = "rgba(225,246,255,0.72)";
          cacheCtx.shadowBlur = 1.8;
          cacheCtx.fill();
        }
      };
      drawBeadSwag(-32, 0, 0, 13);
      drawBeadSwag(0, 32, 0, 13);
      drawBeadSwag(-17, 17, -4, 12);

      // A dense lower tier of faceted prisms gives the chandelier its crystal identity.
      [-29,-20,-10,0,10,20,29].forEach((x, index) => {
        const depth = 19 + (3 - Math.abs(index - 3)) * 1.4;
        cacheCtx.beginPath();
        cacheCtx.moveTo(x, 14 + Math.abs(index - 3) * 0.5);
        cacheCtx.lineTo(x, depth - 3);
        cacheCtx.strokeStyle = "rgba(219,239,248,0.82)";
        cacheCtx.lineWidth = 0.75;
        cacheCtx.stroke();
        drawFacetedCrystal(x, depth + 2.5, index === 3 ? 5.4 : 3.9, index === 3 ? 12 : 8.5);
      });
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 16);
      cacheCtx.lineTo(0, 29);
      cacheCtx.strokeStyle = brass;
      cacheCtx.lineWidth = 1;
      cacheCtx.stroke();
      drawFacetedCrystal(0, 35, 6.2, 13.5);
    } else if (config.motif === "windingKey") {
      cacheCtx.translate(-30, -30);
      cacheCtx.strokeStyle = "#e2b15d";
      cacheCtx.shadowColor = "rgba(116,84,174,0.86)";
      cacheCtx.shadowBlur = 5;
      cacheCtx.lineWidth = 3;
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 0);
      cacheCtx.lineTo(39, 39);
      cacheCtx.stroke();
      cacheCtx.lineWidth = 2.2;
      cacheCtx.beginPath();
      cacheCtx.moveTo(7, 7);
      cacheCtx.lineTo(1, 13);
      cacheCtx.lineTo(8, 20);
      cacheCtx.lineTo(14, 14);
      cacheCtx.moveTo(16, 16);
      cacheCtx.lineTo(13, 20);
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "rgba(250,246,255,0.75)";
      cacheCtx.lineWidth = 0.8;
      cacheCtx.beginPath();
      cacheCtx.moveTo(3, 2);
      cacheCtx.lineTo(38, 37);
      cacheCtx.stroke();
      cacheCtx.lineWidth = 3;
      cacheCtx.strokeStyle = "#e2b15d";
      cacheCtx.beginPath();
      cacheCtx.arc(47, 39, 8, 0, Math.PI * 2);
      cacheCtx.arc(39, 47, 8, 0, Math.PI * 2);
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#9b78d0";
      cacheCtx.shadowColor = "#7454ae";
      cacheCtx.shadowBlur = 6;
      cacheCtx.beginPath();
      cacheCtx.arc(43, 43, 2.5, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.fillStyle = "#ffffff";
      cacheCtx.shadowColor = "#ffffff";
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 1.8, 0, Math.PI * 2);
      cacheCtx.fill();
    } else if (config.motif === "passionCrossHalo") {
      cacheCtx.translate(0, 1);
      const bronze = cacheCtx.createLinearGradient(-24, -28, 24, 28);
      bronze.addColorStop(0, "#fff1a8");
      bronze.addColorStop(0.42, "#d8a33d");
      bronze.addColorStop(0.72, "#8b351f");
      bronze.addColorStop(1, "#f1ce72");
      cacheCtx.strokeStyle = bronze;
      cacheCtx.lineWidth = 3;
      cacheCtx.shadowColor = "rgba(218,168,72,0.65)";
      cacheCtx.shadowBlur = 6;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 3, 24, -Math.PI * 0.84, Math.PI * 0.06);
      cacheCtx.arc(0, 3, 24, Math.PI * 0.16, Math.PI * 1.06);
      cacheCtx.stroke();
      cacheCtx.lineWidth = 4.2;
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, -31);
      cacheCtx.lineTo(0, 31);
      cacheCtx.moveTo(-14, -13);
      cacheCtx.lineTo(14, -13);
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.strokeStyle = "#fff0aa";
      cacheCtx.lineWidth = 0.9;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-1, -29);
      cacheCtx.lineTo(-1, 28);
      cacheCtx.moveTo(-12, -14);
      cacheCtx.lineTo(12, -14);
      cacheCtx.stroke();
    } else if (config.motif === "littlePrinceScarf") {
      cacheCtx.translate(0, 3);
      cacheCtx.strokeStyle = "#f4d976";
      cacheCtx.fillStyle = "#f4d976";
      cacheCtx.shadowColor = "rgba(240,215,131,0.55)";
      cacheCtx.shadowBlur = 5;
      cacheCtx.beginPath();
      cacheCtx.arc(-5, -22, 6, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.beginPath();
      cacheCtx.moveTo(-10, -15);
      cacheCtx.quadraticCurveTo(-16, 2, -12, 22);
      cacheCtx.lineTo(4, 22);
      cacheCtx.quadraticCurveTo(8, 2, 0, -15);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.fillStyle = "#df6b3f";
      cacheCtx.beginPath();
      cacheCtx.moveTo(-8, -13);
      cacheCtx.bezierCurveTo(5, -10, 18, -7, 30, -14);
      cacheCtx.bezierCurveTo(19, -1, 8, 1, -7, -7);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.strokeStyle = "#f6e49c";
      cacheCtx.lineWidth = 2.1;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-10, 22);
      cacheCtx.lineTo(-18, 33);
      cacheCtx.moveTo(3, 22);
      cacheCtx.lineTo(9, 34);
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#9ecbe8";
      [[23,-28,2.2],[-25,-17,1.6],[24,19,1.4]].forEach((star) => {
        cacheCtx.beginPath();
        cacheCtx.arc(star[0], star[1], star[2], 0, Math.PI * 2);
        cacheCtx.fill();
      });
    } else if (config.motif === "odysseyTrident") {
      const seaGlow = cacheCtx.createRadialGradient(0, 5, 3, 0, 5, 34);
      seaGlow.addColorStop(0, "rgba(240,213,139,0.28)");
      seaGlow.addColorStop(0.45, "rgba(45,159,182,0.22)");
      seaGlow.addColorStop(1, "rgba(45,159,182,0)");
      cacheCtx.fillStyle = seaGlow;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 5, 34, 0, Math.PI * 2);
      cacheCtx.fill();

      const bronze = cacheCtx.createLinearGradient(-18, -30, 18, 30);
      bronze.addColorStop(0, "#fff1a8");
      bronze.addColorStop(0.35, "#f0d58b");
      bronze.addColorStop(0.68, "#7e9f9d");
      bronze.addColorStop(1, "#2d9fb6");
      cacheCtx.strokeStyle = bronze;
      cacheCtx.shadowColor = "rgba(45,159,182,0.8)";
      cacheCtx.shadowBlur = 6;
      cacheCtx.lineWidth = 3;
      cacheCtx.lineCap = "round";
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, -28);
      cacheCtx.lineTo(0, 30);
      cacheCtx.moveTo(-14, -28);
      cacheCtx.quadraticCurveTo(-9, -14, 0, -6);
      cacheCtx.quadraticCurveTo(9, -14, 14, -28);
      cacheCtx.moveTo(-14, -28);
      cacheCtx.lineTo(-14, -19);
      cacheCtx.moveTo(14, -28);
      cacheCtx.lineTo(14, -19);
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.strokeStyle = "rgba(255,247,205,0.84)";
      cacheCtx.lineWidth = 0.85;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-1, -26);
      cacheCtx.lineTo(-1, 28);
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "#2d9fb6";
      cacheCtx.lineWidth = 2;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-30, 24);
      cacheCtx.bezierCurveTo(-17, 14, -7, 34, 6, 24);
      cacheCtx.bezierCurveTo(16, 16, 22, 28, 31, 20);
      cacheCtx.stroke();
    } else if (config.motif === "matildaPencil") {
      cacheCtx.save();
      cacheCtx.rotate(Math.PI);
      cacheCtx.rotate(Math.PI / 4);
      cacheCtx.fillStyle = "#df72a6";
      cacheCtx.strokeStyle = "#f8d8e8";
      cacheCtx.lineWidth = 1.35;
      cacheCtx.shadowColor = "rgba(223,114,166,0.65)";
      cacheCtx.shadowBlur = 7;
      cacheCtx.beginPath();
      cacheCtx.roundRect(-5, -18, 10, 42, 2);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.fillStyle = "#e8c56a";
      cacheCtx.beginPath();
      cacheCtx.moveTo(-5, -18);
      cacheCtx.lineTo(5, -18);
      cacheCtx.lineTo(0, -29);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#f9e4ef";
      cacheCtx.fillRect(-5, 24, 10, 7);
      cacheCtx.strokeRect(-5, 24, 10, 7);
      cacheCtx.restore();
    } else if (config.motif === "greatestShow") {
      const glow = cacheCtx.createRadialGradient(0, 0, 4, 0, 0, 33);
      glow.addColorStop(0, "rgba(255,245,207,0.9)");
      glow.addColorStop(0.35, "rgba(213,155,58,0.28)");
      glow.addColorStop(1, "rgba(213,155,58,0)");
      cacheCtx.fillStyle = glow;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 33, 0, Math.PI * 2);
      cacheCtx.fill();

      cacheCtx.strokeStyle = "#f2d18a";
      cacheCtx.fillStyle = "#d59b3a";
      cacheCtx.lineWidth = 1.35;
      cacheCtx.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const angle = -Math.PI / 2 + point * Math.PI / 5;
        const radius = point % 2 === 0 ? 20 : 8;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (point === 0) cacheCtx.moveTo(x, y);
        else cacheCtx.lineTo(x, y);
      }
      cacheCtx.closePath();
      cacheCtx.shadowColor = "rgba(231,91,60,0.7)";
      cacheCtx.shadowBlur = 5;
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;

      for (let bulb = 0; bulb < 12; bulb += 1) {
        const angle = bulb * Math.PI * 2 / 12;
        cacheCtx.beginPath();
        cacheCtx.arc(Math.cos(angle) * 28, Math.sin(angle) * 28, 1.7, 0, Math.PI * 2);
        cacheCtx.fillStyle = bulb % 3 === 0 ? "#fff5c4" : "#e75b3c";
        cacheCtx.shadowColor = cacheCtx.fillStyle;
        cacheCtx.shadowBlur = 3;
        cacheCtx.fill();
      }
      cacheCtx.shadowBlur = 0;
    } else if (config.motif === "posterMoon") {
      const halo = cacheCtx.createRadialGradient(0, 0, 12, 0, 0, 29);
      halo.addColorStop(0, "rgba(239,236,255,0.16)");
      halo.addColorStop(0.55, "rgba(188,178,229,0.08)");
      halo.addColorStop(1, "rgba(188,178,229,0)");
      cacheCtx.fillStyle = halo;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 29, 0, Math.PI * 2);
      cacheCtx.fill();

      const moon = cacheCtx.createRadialGradient(-6, -7, 2, 0, 0, 18);
      moon.addColorStop(0, "#fffdf6");
      moon.addColorStop(0.42, "#e9e5f4");
      moon.addColorStop(0.78, "#bbb2d6");
      moon.addColorStop(1, "#756b98");
      cacheCtx.fillStyle = moon;
      cacheCtx.shadowColor = "rgba(221,213,255,0.45)";
      cacheCtx.shadowBlur = 4;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 18, 0, Math.PI * 2);
      cacheCtx.fill();

      cacheCtx.shadowBlur = 0;
      cacheCtx.fillStyle = "rgba(91,79,126,0.14)";
      [[-7,-5,3.2],[6,-8,2.2],[5,6,3.8],[-8,9,2.1]].forEach((crater) => {
        cacheCtx.beginPath();
        cacheCtx.arc(crater[0], crater[1], crater[2], 0, Math.PI * 2);
        cacheCtx.fill();
      });
      cacheCtx.strokeStyle = "rgba(255,255,255,0.48)";
      cacheCtx.lineWidth = 0.7;
      cacheCtx.beginPath();
      cacheCtx.arc(-2, -2, 15.5, -2.8, -0.45);
      cacheCtx.stroke();

      // Red ballet shoe and satin ribbons keep the moonlit poster tied to the show.
      cacheCtx.save();
      cacheCtx.translate(7, 13);
      cacheCtx.rotate(-0.22);
      cacheCtx.scale(1.35, 1.35);
      cacheCtx.fillStyle = "#c51f3b";
      cacheCtx.strokeStyle = "#f7d8dd";
      cacheCtx.lineWidth = 1;
      cacheCtx.shadowColor = "rgba(154,20,46,0.8)";
      cacheCtx.shadowBlur = 3;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-9, 2);
      cacheCtx.quadraticCurveTo(-3, -4, 5, -3);
      cacheCtx.quadraticCurveTo(13, -2, 18, 2);
      cacheCtx.quadraticCurveTo(15, 7, 7, 8);
      cacheCtx.lineTo(-5, 7);
      cacheCtx.quadraticCurveTo(-10, 6, -9, 2);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.strokeStyle = "#f0a5b4";
      cacheCtx.lineWidth = 1.35;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-1, -2);
      cacheCtx.lineTo(-6, -10);
      cacheCtx.moveTo(2, -2);
      cacheCtx.lineTo(10, -9);
      cacheCtx.moveTo(-6, -10);
      cacheCtx.quadraticCurveTo(-1, -8, 3, -10);
      cacheCtx.moveTo(10, -9);
      cacheCtx.quadraticCurveTo(7, -5, 4, -2);
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "rgba(255,247,242,0.72)";
      cacheCtx.lineWidth = 0.75;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-6, 5);
      cacheCtx.quadraticCurveTo(5, 8, 15, 3);
      cacheCtx.stroke();
      cacheCtx.restore();
    } else if (config.motif === "excalibur") {
      cacheCtx.translate(-48, -48);
      const blade = cacheCtx.createLinearGradient(0, 0, 35, 35);
      blade.addColorStop(0, "#ffffff");
      blade.addColorStop(0.34, "#dce8eb");
      blade.addColorStop(0.52, "#7da2ac");
      blade.addColorStop(0.7, "#eef7f5");
      blade.addColorStop(1, "#9ab2b7");
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 0);
      cacheCtx.lineTo(22, 35);
      cacheCtx.lineTo(35, 22);
      cacheCtx.closePath();
      cacheCtx.fillStyle = blade;
      cacheCtx.fill();
      cacheCtx.strokeStyle = "#d4af37";
      cacheCtx.lineWidth = 1.25;
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.moveTo(1.5, 1.5);
      cacheCtx.lineTo(29, 29);
      cacheCtx.strokeStyle = "rgba(255,255,255,0.95)";
      cacheCtx.lineWidth = 1.1;
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "rgba(84,127,141,0.9)";
      cacheCtx.lineWidth = 1;
      [[10,11,14,13],[15,18,19,17],[20,24,24,22]].forEach((rune) => {
        cacheCtx.beginPath();
        cacheCtx.moveTo(rune[0], rune[1]);
        cacheCtx.lineTo(rune[2], rune[3]);
        cacheCtx.stroke();
      });
      cacheCtx.beginPath();
      cacheCtx.moveTo(17, 41);
      cacheCtx.quadraticCurveTo(25, 33, 41, 17);
      cacheCtx.strokeStyle = "#d4af37";
      cacheCtx.lineWidth = 4.5;
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#d5b85d";
      [[17,41],[41,17]].forEach((cap) => {
        cacheCtx.beginPath();
        cacheCtx.arc(cap[0], cap[1], 2.4, 0, Math.PI * 2);
        cacheCtx.fill();
      });
      cacheCtx.beginPath();
      cacheCtx.moveTo(31, 31);
      cacheCtx.lineTo(42, 42);
      cacheCtx.strokeStyle = "#17343d";
      cacheCtx.lineWidth = 5.2;
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "#d5b85d";
      cacheCtx.lineWidth = 1.1;
      for (let wrap = 0; wrap < 3; wrap += 1) {
        const p = 34 + wrap * 3.5;
        cacheCtx.beginPath();
        cacheCtx.moveTo(p - 2, p + 2);
        cacheCtx.lineTo(p + 2, p - 2);
        cacheCtx.stroke();
      }
      cacheCtx.beginPath();
      cacheCtx.arc(45, 45, 3.8, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#d4af37";
      cacheCtx.fill();
      cacheCtx.beginPath();
      cacheCtx.arc(45, 45, 1.7, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#547f8d";
      cacheCtx.fill();
    } else if (config.motif === "chicagoNewspaper") {
      cacheCtx.save();
      cacheCtx.rotate(-0.09);
      const newsprint = cacheCtx.createLinearGradient(-27, -25, 27, 25);
      newsprint.addColorStop(0, "#fff9e9");
      newsprint.addColorStop(0.55, "#e9dfc9");
      newsprint.addColorStop(1, "#c9bda6");
      cacheCtx.fillStyle = newsprint;
      cacheCtx.strokeStyle = "#2b2021";
      cacheCtx.lineWidth = 1.2;
      cacheCtx.shadowColor = "rgba(0,0,0,0.58)";
      cacheCtx.shadowBlur = 4;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-27, -24);
      cacheCtx.lineTo(27, -24);
      cacheCtx.lineTo(27, 18);
      cacheCtx.lineTo(20, 25);
      cacheCtx.lineTo(-27, 25);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.fillStyle = "#241a1b";
      cacheCtx.fillRect(-23, -21, 46, 11);
      cacheCtx.fillStyle = "#f8efd9";
      cacheCtx.font = "700 8px Georgia, serif";
      cacheCtx.textAlign = "center";
      cacheCtx.fillText("EXTRA!", 0, -13);
      cacheCtx.fillStyle = "#c51f2b";
      cacheCtx.fillRect(-23, -8, 46, 2.4);
      cacheCtx.fillStyle = "#3a2d2b";
      cacheCtx.fillRect(-22, -2, 35, 3.2);
      cacheCtx.fillRect(-22, 3, 29, 2.2);
      cacheCtx.fillStyle = "#75685b";
      cacheCtx.fillRect(-22, 9, 15, 11);
      cacheCtx.strokeStyle = "#766b5d";
      cacheCtx.lineWidth = 1;
      [[-3, 10, 21], [-3, 14, 19], [-3, 18, 20], [-22, 23, 38]].forEach(([x, y, width]) => {
        cacheCtx.beginPath();
        cacheCtx.moveTo(x, y);
        cacheCtx.lineTo(x + width, y);
        cacheCtx.stroke();
      });
      cacheCtx.strokeStyle = "rgba(76,63,55,0.5)";
      cacheCtx.lineWidth = 0.8;
      cacheCtx.beginPath();
      cacheCtx.moveTo(1, -5);
      cacheCtx.lineTo(1, 23);
      cacheCtx.stroke();
      cacheCtx.fillStyle = "#b6aa94";
      cacheCtx.beginPath();
      cacheCtx.moveTo(20, 25);
      cacheCtx.lineTo(20, 18);
      cacheCtx.lineTo(27, 18);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.strokeStyle = "#6f6255";
      cacheCtx.stroke();
      cacheCtx.restore();
    } else if (config.motif === "castNote") {
      cacheCtx.rotate(Number.isFinite(config.rotation) ? config.rotation : -0.13);
      cacheCtx.fillStyle = "#ecf5f6";
      cacheCtx.strokeStyle = "#8fc5d4";
      cacheCtx.lineWidth = 1.3;
      cacheCtx.beginPath();
      cacheCtx.roundRect(-12, -31, 24, 62, 9);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "rgba(42,122,170,0.72)";
      cacheCtx.lineWidth = 1;
      for (let y = -20; y <= 20; y += 10) {
        cacheCtx.beginPath();
        cacheCtx.moveTo(-7, y + 2);
        cacheCtx.lineTo(7, y - 2);
        cacheCtx.stroke();
      }
      cacheCtx.fillStyle = "#2a7aaa";
      cacheCtx.font = "700 8px sans-serif";
      cacheCtx.textAlign = "center";
      cacheCtx.fillText("DEAR", 0, 3);
    } else if (config.motif === "neonCrown") {
      cacheCtx.translate(0, 5);
      cacheCtx.strokeStyle = "#f2c94c";
      cacheCtx.fillStyle = "rgba(213,43,166,0.24)";
      cacheCtx.shadowColor = "#d52ba6";
      cacheCtx.shadowBlur = 10;
      cacheCtx.lineWidth = 3;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-27, 16);
      cacheCtx.lineTo(-22, -18);
      cacheCtx.lineTo(-8, -4);
      cacheCtx.lineTo(0, -27);
      cacheCtx.lineTo(9, -4);
      cacheCtx.lineTo(23, -18);
      cacheCtx.lineTo(27, 16);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.fillStyle = "#fff8ff";
      cacheCtx.font = "900 15px sans-serif";
      cacheCtx.textAlign = "center";
      cacheCtx.fillText("6", 0, 11);
    } else if (config.motif === "voteButton") {
      cacheCtx.fillStyle = "#e3ba25";
      cacheCtx.strokeStyle = "#af86c8";
      cacheCtx.lineWidth = 3;
      cacheCtx.shadowColor = "rgba(227,186,37,0.55)";
      cacheCtx.shadowBlur = 7;
      cacheCtx.beginPath();
      cacheCtx.arc(0, 0, 28, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.fillStyle = "#241638";
      cacheCtx.font = "900 10px Rockwell, serif";
      cacheCtx.textAlign = "center";
      cacheCtx.fillText("VOTES", 0, 4);
    } else if (config.motif === "filmReel") {
      const reel = cacheCtx.createRadialGradient(-7, -9, 2, -2, -2, 31);
      reel.addColorStop(0, "#6e5437");
      reel.addColorStop(0.32, "#292017");
      reel.addColorStop(0.78, "#100d0a");
      reel.addColorStop(1, "#040302");
      cacheCtx.strokeStyle = "#f1d7a2";
      cacheCtx.fillStyle = reel;
      cacheCtx.lineWidth = 1.7;
      cacheCtx.shadowColor = "rgba(215,128,36,0.58)";
      cacheCtx.shadowBlur = 8;
      cacheCtx.beginPath();
      cacheCtx.arc(-2, -2, 28, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;
      cacheCtx.strokeStyle = "rgba(215,128,36,0.72)";
      cacheCtx.lineWidth = 0.8;
      cacheCtx.beginPath();
      cacheCtx.arc(-2, -2, 23.5, 0, Math.PI * 2);
      cacheCtx.stroke();
      for (let index = 0; index < 5; index += 1) {
        const angle = index * Math.PI * 2 / 5 - Math.PI / 2;
        const x = -2 + Math.cos(angle) * 14;
        const y = -2 + Math.sin(angle) * 14;
        const hole = cacheCtx.createRadialGradient(x - 1.5, y - 1.5, 0, x, y, 6.2);
        hole.addColorStop(0, "#f0c47a");
        hole.addColorStop(0.3, "#8e5625");
        hole.addColorStop(1, "#160e09");
        cacheCtx.beginPath();
        cacheCtx.arc(x, y, 5.6, 0, Math.PI * 2);
        cacheCtx.fillStyle = hole;
        cacheCtx.fill();
        cacheCtx.strokeStyle = "rgba(241,215,162,0.62)";
        cacheCtx.lineWidth = 0.65;
        cacheCtx.stroke();
      }
      cacheCtx.fillStyle = "#f1d7a2";
      cacheCtx.beginPath();
      cacheCtx.arc(-2, -2, 3.4, 0, Math.PI * 2);
      cacheCtx.fill();
      cacheCtx.fillStyle = "#8f511c";
      cacheCtx.beginPath();
      cacheCtx.arc(-2, -2, 1.5, 0, Math.PI * 2);
      cacheCtx.fill();
    } else if (config.motif === "revolutionFlag") {
      cacheCtx.translate(-8, 7);
      cacheCtx.strokeStyle = "rgba(230,196,114,0.95)";
      cacheCtx.lineWidth = 2.2;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-18, 22);
      cacheCtx.lineTo(-18, -28);
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.arc(-18, -30, 3.2, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#e6c472";
      cacheCtx.fill();
      const flag = cacheCtx.createLinearGradient(-17, -25, 22, 14);
      flag.addColorStop(0, "#29458a");
      flag.addColorStop(0.34, "#f4ecd7");
      flag.addColorStop(0.67, "#c13a3d");
      flag.addColorStop(1, "#772329");
      cacheCtx.fillStyle = flag;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-16, -24);
      cacheCtx.bezierCurveTo(-2, -29, 11, -19, 23, -22);
      cacheCtx.lineTo(20, 11);
      cacheCtx.bezierCurveTo(8, 8, -3, 0, -16, 7);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.strokeStyle = "rgba(255,243,216,0.7)";
      cacheCtx.lineWidth = 0.75;
      cacheCtx.stroke();
    } else if (config.motif === "concertFlag") {
      cacheCtx.translate(-8, 8);
      cacheCtx.strokeStyle = "rgba(234,217,170,0.98)";
      cacheCtx.lineWidth = 2.1;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-17, 22);
      cacheCtx.lineTo(-17, -27);
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.arc(-17, -29, 3, 0, Math.PI * 2);
      cacheCtx.fillStyle = "#ead9aa";
      cacheCtx.fill();
      const flag = cacheCtx.createLinearGradient(-15, -23, 24, 10);
      flag.addColorStop(0, "#203f91");
      flag.addColorStop(0.48, "#f7f2dd");
      flag.addColorStop(1, "#b12635");
      cacheCtx.fillStyle = flag;
      cacheCtx.beginPath();
      cacheCtx.moveTo(-15, -23);
      cacheCtx.bezierCurveTo(-2, -28, 12, -18, 24, -21);
      cacheCtx.lineTo(20, 10);
      cacheCtx.bezierCurveTo(8, 7, -3, 0, -15, 7);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.strokeStyle = "rgba(255,255,255,0.84)";
      cacheCtx.lineWidth = 0.8;
      cacheCtx.stroke();
      cacheCtx.strokeStyle = "rgba(255,238,184,0.92)";
      cacheCtx.lineWidth = 0.7;
      [-11, -5, 1, 7, 13].forEach((x) => {
        cacheCtx.beginPath();
        cacheCtx.moveTo(x, -17);
        cacheCtx.lineTo(x - 2.5, 4);
        cacheCtx.stroke();
      });
    } else if (config.motif === "legallyBlondeBalance") {
      const lightTheme = document.documentElement.dataset.musicalTheme === "light";
      const primary = lightTheme
        ? getComputedStyle(document.documentElement).getPropertyValue("--musical-light-accent").trim() || config.primary
        : config.primary;
      const secondary = lightTheme
        ? getComputedStyle(document.documentElement).getPropertyValue("--musical-light-motif").trim() || config.secondary
        : config.secondary;
      const metal = lightTheme ? "#fffafd" : "#fff3f8";
      cacheCtx.shadowColor = lightTheme ? "rgba(159,31,88,0.28)" : "rgba(215,45,120,0.52)";
      cacheCtx.shadowBlur = lightTheme ? 4 : 6;
      cacheCtx.strokeStyle = primary;
      cacheCtx.fillStyle = metal;
      cacheCtx.lineWidth = 2.1;
      cacheCtx.lineCap = "round";
      cacheCtx.lineJoin = "round";

      // A clear classical balance: finial, fulcrum, beam, chains, bowls and base.
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, -29);
      cacheCtx.lineTo(-6, -20);
      cacheCtx.lineTo(6, -20);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, -20);
      cacheCtx.lineTo(0, 19);
      cacheCtx.moveTo(-28, -16);
      cacheCtx.lineTo(28, -16);
      cacheCtx.stroke();
      cacheCtx.beginPath();
      cacheCtx.arc(0, -16, 2.8, 0, Math.PI * 2);
      cacheCtx.fillStyle = secondary;
      cacheCtx.fill();
      cacheCtx.stroke();
      cacheCtx.shadowBlur = 0;

      const bowlFill = cacheCtx.createLinearGradient(0, -2, 0, 14);
      bowlFill.addColorStop(0, secondary);
      bowlFill.addColorStop(1, primary);
      cacheCtx.strokeStyle = primary;
      cacheCtx.fillStyle = bowlFill;
      cacheCtx.lineWidth = 1.45;
      [-21, 21].forEach((x) => {
        const direction = x < 0 ? 1 : -1;
        cacheCtx.beginPath();
        cacheCtx.moveTo(x, -16);
        cacheCtx.lineTo(x, -6);
        cacheCtx.lineTo(x + direction * 9, 2);
        cacheCtx.moveTo(x, -6);
        cacheCtx.lineTo(x - direction * 9, 2);
        cacheCtx.stroke();
        cacheCtx.beginPath();
        cacheCtx.moveTo(x - 11, 2);
        cacheCtx.quadraticCurveTo(x, 17, x + 11, 2);
        cacheCtx.quadraticCurveTo(x, 7, x - 11, 2);
        cacheCtx.fill();
        cacheCtx.stroke();
        cacheCtx.strokeStyle = metal;
        cacheCtx.lineWidth = 0.8;
        cacheCtx.beginPath();
        cacheCtx.moveTo(x - 8, 5);
        cacheCtx.quadraticCurveTo(x, 12, x + 8, 5);
        cacheCtx.stroke();
        cacheCtx.strokeStyle = primary;
        cacheCtx.lineWidth = 1.45;
      });

      cacheCtx.fillStyle = primary;
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, 18);
      cacheCtx.lineTo(-9, 29);
      cacheCtx.lineTo(9, 29);
      cacheCtx.closePath();
      cacheCtx.fill();
      cacheCtx.fillStyle = metal;
      cacheCtx.fillRect(-15, 29, 30, 2.2);
      cacheCtx.strokeStyle = primary;
      cacheCtx.strokeRect(-15, 29, 30, 2.2);
    }
    cacheCtx.restore();
  }
  ${marker}();
  if (config.motif === "comeFromAwayGlobe" || config.motif === "legallyBlondeBalance") {
    new MutationObserver(() => ${marker}()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-musical-theme"],
    });
  }

  function preRenderWindmillBlades() {
    if (config.motif !== "windmill") return;
    bladeCtx.clearRect(0, 0, 96, 96);
    bladeCtx.save();
    bladeCtx.translate(48, 48);
    bladeCtx.strokeStyle = "#e6b85e";
    bladeCtx.lineWidth = 1.25;
    bladeCtx.lineJoin = "round";
    for (let arm = 0; arm < 4; arm += 1) {
      bladeCtx.save();
      bladeCtx.rotate(Math.PI / 4 + arm * Math.PI / 2);
      bladeCtx.beginPath();
      bladeCtx.moveTo(2, 0);
      bladeCtx.lineTo(8, -4);
      bladeCtx.lineTo(29, -8);
      bladeCtx.lineTo(24, 3);
      bladeCtx.lineTo(7, 4);
      bladeCtx.closePath();
      const sail = bladeCtx.createLinearGradient(2, 0, 29, -5);
      sail.addColorStop(0, "#7a0713");
      sail.addColorStop(0.52, arm % 2 ? "#cf1830" : "#ef3040");
      sail.addColorStop(1, "#8c0918");
      bladeCtx.fillStyle = sail;
      bladeCtx.fill();
      bladeCtx.stroke();
      bladeCtx.strokeStyle = "rgba(255,224,154,0.72)";
      bladeCtx.lineWidth = 0.72;
      bladeCtx.beginPath();
      bladeCtx.moveTo(8, -2.5);
      bladeCtx.lineTo(26, -6.2);
      bladeCtx.moveTo(11, 2.4);
      bladeCtx.lineTo(24, 0.6);
      bladeCtx.moveTo(15, -4.1);
      bladeCtx.lineTo(16, 1.8);
      bladeCtx.moveTo(21, -5.4);
      bladeCtx.lineTo(21.5, 1.1);
      bladeCtx.stroke();
      bladeCtx.strokeStyle = "#e6b85e";
      bladeCtx.lineWidth = 1.25;
      bladeCtx.restore();
    }
    bladeCtx.beginPath();
    bladeCtx.arc(0, 0, 5, 0, Math.PI * 2);
    bladeCtx.fillStyle = "#e6b85e";
    bladeCtx.fill();
    bladeCtx.beginPath();
    bladeCtx.arc(0, 0, 2.2, 0, Math.PI * 2);
    bladeCtx.fillStyle = "#fff0b0";
    bladeCtx.fill();
    bladeCtx.restore();
  }
  preRenderWindmillBlades();

  class TrailParticle {
    constructor(x, y, burst = false, index = 0, movementAngle = 0) {
      const angle = Math.random() * Math.PI * 2;
      const speed = burst ? 0.9 + Math.random() * 1.7 : 0.18 + Math.random() * 0.42;
      this.x = x;
      this.y = y;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.radius = 0.8 + Math.random() * 1.5;
      this.alpha = 0.92;
      this.spin = (Math.random() - 0.5) * 0.18;
      this.angle = movementAngle + (Math.random() - 0.5) * 0.55;
      this.fade = null;
      this.color = index % 3 === 0 ? config.accent : index % 2 ? config.primary : config.secondary;
      this.variant = index % 2;
      if (config.trail === "goldSparkleRosePetal") {
        this.vy -= this.variant ? 0.05 : 0.38;
        this.radius += this.variant ? 1.1 : 0;
      }
      if (config.trail === "diamondDust") this.vy += 0.18;
      if (config.trail === "glitchPixel") {
        this.vx = (Math.random() - 0.5) * (burst ? 3.2 : 1.5);
        this.vy = (Math.random() - 0.5) * (burst ? 3.2 : 1.5);
        this.color = index % 3 === 0 ? "#ffffff" : index % 2 ? "#ff00ff" : "#00f3ff";
      }
      if (config.trail === "neonSpark") {
        this.vx *= 0.7;
        this.vy *= 0.7;
        this.color = index % 2 ? "#e2b15d" : "#9b78d0";
      }
      if (config.trail === "crystalGlint") {
        this.vx = this.vx * (burst ? 0.62 : 0.42) + (Math.random() - 0.5) * (burst ? 0.22 : 0.42);
        this.vy = this.vy * (burst ? 0.62 : 0.42) + (Math.random() - 0.5) * (burst ? 0.18 : 0.3);
        this.radius = burst ? 1.1 + Math.random() * 1.4 : 0.65 + Math.random() * 1.45;
        this.alpha = burst ? 0.9 : 0.52 + Math.random() * 0.3;
        this.fade = burst ? 0.019 + Math.random() * 0.009 : 0.012 + Math.random() * 0.009;
        this.phase = Math.random() * Math.PI * 2;
        this.wobble = 0.08 + Math.random() * 0.18;
        this.twinkle = 0.04 + Math.random() * 0.08;
        this.spin = (Math.random() - 0.5) * 0.3;
        this.variant = Math.random() > 0.42;
        this.color = index % 3 === 0 ? "#ffffff" : index % 2 ? "#bfe8f5" : "#efdca4";
      }
      if (config.trail === "moonMist") {
        this.vx *= 0.24;
        this.vy *= 0.24;
        this.radius = 0.8 + Math.random() * 1.1;
        this.alpha = 0.32;
        this.color = index % 2 ? "#d9d1ef" : "#fffdf7";
      }
      if (config.trail === "magicDust") {
        this.vx = burst ? this.vx * 1.7 : 0.15 + Math.random() * 0.45;
        this.vy = burst ? this.vy * 1.7 : 0.4 + Math.random() * 0.75;
        this.color = index % 3 ? "#d4af37" : "#ffffff";
      }
      if (config.trail === "thornEmbers") {
        this.vx *= burst ? 1.15 : 0.5;
        this.vy = burst ? this.vy * 1.15 : -0.18 - Math.random() * 0.28;
        this.radius = 0.75 + Math.random() * 1.15;
        this.color = index % 3 === 0 ? "#8b351f" : index % 2 ? "#d8a33d" : "#fff0aa";
      }
      if (config.trail === "b612Stars") {
        this.vx *= burst ? 0.9 : 0.35;
        this.vy *= burst ? 0.9 : 0.35;
        this.radius = 0.7 + Math.random() * 1.05;
        this.color = index % 3 === 0 ? "#9ecbe8" : index % 2 ? "#f4d976" : "#ffffff";
      }
      if (config.trail === "ludwigStarlight") {
        this.vx *= burst ? 0.9 : 0.3;
        this.vy *= burst ? 0.9 : 0.3;
        this.radius = 0.7 + Math.random() * 1.2;
        this.alpha = burst ? 0.9 : 0.46 + Math.random() * 0.32;
        this.fade = burst ? 0.024 : 0.015 + Math.random() * 0.008;
        this.phase = Math.random() * Math.PI * 2;
        this.color = index % 3 === 0 ? "#ffffff" : index % 2 ? "#e6d6a0" : "#8aa4c8";
      }
      if (config.trail === "batEmbers") {
        this.vx *= burst ? 1.05 : 0.42;
        this.vy = burst ? this.vy * 1.05 : -0.1 - Math.random() * 0.35;
        this.radius = 0.7 + Math.random() * 1.15;
        this.fade = burst ? 0.029 : 0.021 + Math.random() * 0.008;
        this.color = index % 3 === 0 ? "#f4c47c" : index % 2 ? "#b51e3d" : "#731225";
      }
      if (config.trail === "manderleySmoke") {
        this.vx *= burst ? 0.8 : 0.2;
        this.vy = burst ? this.vy * 0.8 - 0.1 : -0.12 - Math.random() * 0.2;
        this.radius = 1.2 + Math.random() * 1.6;
        this.alpha = burst ? 0.72 : 0.25 + Math.random() * 0.18;
        this.fade = burst ? 0.022 : 0.012 + Math.random() * 0.007;
        this.phase = Math.random() * Math.PI * 2;
        this.color = index % 3 === 0 ? "#c9a75a" : index % 2 ? "#426a91" : "#9fb8c7";
      }
      if (config.trail === "marqueeGold") {
        this.vx *= burst ? 1.1 : 0.45;
        this.vy = burst ? this.vy * 1.1 - 0.2 : -0.18 - Math.random() * 0.35;
        this.radius = 0.8 + Math.random() * 1.2;
        this.fade = burst ? 0.026 : 0.018 + Math.random() * 0.008;
        this.color = index % 3 === 0 ? "#fff5c4" : index % 2 ? "#d59b3a" : "#e75b3c";
      }
      if (config.trail === "seaStarlight") {
        this.vx *= burst ? 0.9 : 0.32;
        this.vy *= burst ? 0.9 : 0.32;
        this.radius = 0.7 + Math.random() * 1.25;
        this.alpha = burst ? 0.9 : 0.5 + Math.random() * 0.28;
        this.fade = burst ? 0.024 : 0.015 + Math.random() * 0.008;
        this.phase = Math.random() * Math.PI * 2;
        this.color = index % 3 === 0 ? "#fff7d0" : index % 2 ? "#2d9fb6" : "#97d7dc";
      }
      if (config.trail === "airRoute") {
        const routeSpeed = burst ? 1.25 + Math.random() * 0.85 : 0.18 + Math.random() * 0.26;
        this.vx = Math.cos(movementAngle) * routeSpeed + (Math.random() - 0.5) * 0.22;
        this.vy = Math.sin(movementAngle) * routeSpeed + (Math.random() - 0.5) * 0.22;
        this.radius = burst ? 1.1 + Math.random() * 1.2 : 0.65 + Math.random() * 0.7;
        this.alpha = burst ? 0.9 : 0.46 + Math.random() * 0.28;
        this.fade = burst ? 0.028 : 0.018 + Math.random() * 0.008;
        this.color = index % 3 === 0 ? "#fff7d0" : index % 2 ? "#2d9fb6" : "#97d7dc";
      }
      if (config.trail === "clockTicks") {
        this.vx *= burst ? 1.05 : 0.28;
        this.vy *= burst ? 1.05 : 0.28;
        this.radius = burst ? 1.1 + Math.random() * 1.1 : 0.75 + Math.random() * 0.75;
        this.alpha = burst ? 0.92 : 0.54 + Math.random() * 0.24;
        this.fade = burst ? 0.032 : 0.022 + Math.random() * 0.008;
        this.color = index % 3 === 0 ? "#fff2ad" : index % 2 ? "#f3b33d" : "#af86c8";
        this.variant = index % 3 === 0;
      }
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= config.trail === "magicDust" ? 0.97 : 0.93;
      this.vy *= config.trail === "magicDust" ? 0.97 : 0.93;
      if (config.trail === "crystalGlint") {
        this.phase += this.wobble;
        this.x += Math.sin(this.phase) * 0.12;
        this.y += Math.cos(this.phase * 0.83) * 0.08;
      }
      this.angle += this.spin;
      this.alpha -= this.fade ?? (config.trail === "glitchPixel" ? 0.055 : config.trail === "magicDust" ? 0.018 : config.trail === "moonMist" ? 0.016 : config.trail === "crystalGlint" ? 0.024 : config.trail === "b612Stars" ? 0.022 : 0.03);
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.alpha);
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 3;
      ctx.strokeStyle = this.color;
      ctx.fillStyle = this.color;
      ctx.lineCap = "round";
      if (config.trail === "goldSparkleRosePetal" && this.variant) {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = "#b30b23";
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 1.7, this.radius * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (config.trail === "goldSparkleRosePetal" || config.trail === "diamondDust") {
        const length = this.radius * (config.trail === "diamondDust" ? 2.8 : 2.2);
        ctx.beginPath();
        ctx.moveTo(this.x - length, this.y);
        ctx.lineTo(this.x + length, this.y);
        ctx.moveTo(this.x, this.y - length);
        ctx.lineTo(this.x, this.y + length);
        ctx.stroke();
      } else if (config.trail === "glitchPixel") {
        ctx.fillRect(this.x, this.y, this.radius * 3.2, this.radius * 1.25);
      } else if (config.trail === "neonSpark" || config.trail === "magicDust") {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * (config.trail === "magicDust" ? 0.85 : 0.7), 0, Math.PI * 2);
        ctx.fill();
      } else if (config.trail === "crystalGlint") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        const twinkle = 0.72 + Math.sin(this.phase) * 0.28;
        const glowRadius = this.radius * (3.8 + twinkle * 2.2);
        ctx.globalCompositeOperation = "screen";
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
        glow.addColorStop(0, this.color);
        glow.addColorStop(0.3, this.color);
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha *= 0.2 + twinkle * 0.12;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha *= 0.9 + twinkle * 0.2;
        ctx.shadowBlur = 5 + twinkle * 4;
        drawDiamond(ctx, 0, 0, this.radius * (1.45 + twinkle * 0.42));
        ctx.fill();
        if (this.variant) {
          ctx.globalAlpha *= 0.38 + twinkle * 0.2;
          ctx.lineWidth = 0.55 + twinkle * 0.35;
          const ray = this.radius * (2.2 + twinkle * 1.6);
          ctx.beginPath();
          ctx.moveTo(-ray, 0);
          ctx.lineTo(ray, 0);
          ctx.moveTo(0, -ray * 0.82);
          ctx.lineTo(0, ray * 0.82);
          ctx.stroke();
        }
      } else if (config.trail === "ludwigStarlight") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        const ray = this.radius * (1.9 + Math.sin(this.phase || 0) * 0.45);
        ctx.beginPath();
        ctx.moveTo(0, -ray);
        ctx.lineTo(ray * 0.42, 0);
        ctx.lineTo(0, ray);
        ctx.lineTo(-ray * 0.42, 0);
        ctx.closePath();
        ctx.fill();
      } else if (config.trail === "batEmbers") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.moveTo(-this.radius * 1.8, 0);
        ctx.lineTo(0, -this.radius * 0.7);
        ctx.lineTo(this.radius * 1.8, 0);
        ctx.lineTo(0, this.radius * 0.7);
        ctx.closePath();
        ctx.fill();
      } else if (config.trail === "manderleySmoke") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.globalAlpha *= 0.72;
        ctx.beginPath();
        ctx.arc(-this.radius * 0.7, 0, this.radius * 0.72, 0, Math.PI * 2);
        ctx.arc(this.radius * 0.55, -this.radius * 0.4, this.radius * 0.58, 0, Math.PI * 2);
        ctx.stroke();
      } else if (config.trail === "marqueeGold") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        const ray = this.radius * 2.3;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha *= 0.65;
        ctx.beginPath();
        ctx.moveTo(-ray, 0);
        ctx.lineTo(ray, 0);
        ctx.moveTo(0, -ray);
        ctx.lineTo(0, ray);
        ctx.stroke();
      } else if (config.trail === "seaStarlight") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        const ray = this.radius * (1.85 + Math.sin(this.phase || 0) * 0.35);
        ctx.beginPath();
        ctx.moveTo(0, -ray);
        ctx.lineTo(ray * 0.36, 0);
        ctx.lineTo(0, ray);
        ctx.lineTo(-ray * 0.36, 0);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha *= 0.52;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 2.2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (config.trail === "airRoute") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        const length = this.radius * (this.variant ? 3.6 : 2.4);
        ctx.lineWidth = this.variant ? 1.15 : 0.8;
        ctx.beginPath();
        ctx.moveTo(-length, 0);
        ctx.lineTo(length, 0);
        ctx.stroke();
        if (this.variant) {
          ctx.globalAlpha *= 0.55;
          ctx.beginPath();
          ctx.arc(length * 1.15, 0, this.radius * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (config.trail === "clockTicks") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        const length = this.radius * (this.variant ? 3.8 : 2.5);
        ctx.lineWidth = this.variant ? 1.35 : 0.9;
        ctx.beginPath();
        ctx.moveTo(-length * 0.5, -length);
        ctx.lineTo(length * 0.5, length);
        ctx.stroke();
        if (this.variant) {
          ctx.globalAlpha *= 0.58;
          ctx.beginPath();
          ctx.arc(0, 0, length * 1.4, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (config.trail === "moonMist") {
        ctx.shadowBlur = 2.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (config.trail === "thornEmbers") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.moveTo(-this.radius * 2.2, 0);
        ctx.lineTo(this.radius * 2.2, 0);
        ctx.moveTo(0, 0);
        ctx.lineTo(this.radius * 0.9, -this.radius * 1.5);
        ctx.stroke();
      } else if (config.trail === "b612Stars") {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        const outer = this.radius * 2.1;
        const inner = this.radius * 0.8;
        ctx.beginPath();
        for (let point = 0; point < 10; point += 1) {
          const angle = -Math.PI / 2 + point * Math.PI / 5;
          const distance = point % 2 ? inner : outer;
          const x = Math.cos(angle) * distance;
          const y = Math.sin(angle) * distance;
          if (point === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  class ClickBurst {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.age = 0;
      this.maxAge = config.burst === "softOceanWave" || config.burst === "softGreenRipple" ? 24 : 28;
    }
    update() {
      this.age += 1;
    }
    draw() {
      const progress = this.age / this.maxAge;
      const radius = 8 + progress * 40;
      const alpha = Math.max(0, 1 - progress)
        * (config.burst === "softOceanWave" || config.burst === "softGreenRipple" ? 0.7 : 1);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = config.primary;
      ctx.fillStyle = config.secondary;
      ctx.lineWidth = 1.5;
      if (config.burst === "headlineDrop") {
        ctx.shadowColor = "rgba(197,31,43,0.35)";
        ctx.shadowBlur = 2;
        ctx.font = "700 9px Georgia, serif";
        ctx.textAlign = "center";
        ["N", "E", "W", "S"].forEach((letter, index) => {
          const spread = (index - 1.5) * 7;
          const drift = (index % 2 ? 1 : -1) * progress * 1.5;
          ctx.fillStyle = index === 1 ? "#c51f2b" : "#f1d7a2";
          ctx.fillText(letter, spread + drift, 24 + progress * (16 + index * 1.2));
        });
      } else if (config.burst === "subtleRing") {
        ctx.globalAlpha *= 0.5;
        ctx.strokeStyle = config.primary;
        ctx.lineWidth = Math.max(0.65, 1.35 - progress * 0.7);
        ctx.beginPath();
        ctx.arc(0, 0, 5 + progress * 11, 0, Math.PI * 2);
        ctx.stroke();
      } else if (config.burst === "softGreenRipple") {
        const hazeRadius = 10 + progress * 18;
        const haze = ctx.createRadialGradient(0, 0, 0, 0, 0, hazeRadius);
        haze.addColorStop(0, "rgba(141,198,63,0.16)");
        haze.addColorStop(0.45, "rgba(141,198,63,0.08)");
        haze.addColorStop(1, "rgba(141,198,63,0)");
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha *= 0.72;
        ctx.fillStyle = haze;
        ctx.beginPath();
        ctx.arc(0, 0, hazeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha *= 0.62;
        ctx.strokeStyle = "#9fd26a";
        ctx.shadowColor = "rgba(141,198,63,0.4)";
        ctx.shadowBlur = 4;
        ctx.lineWidth = Math.max(0.55, 1.05 - progress * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, 5 + progress * 18, 0, Math.PI * 2);
        ctx.stroke();
      } else if (config.burst === "spectacular") {
        ctx.fillStyle = "#ffd700";
        ctx.shadowColor = "#ff2a2a";
        ctx.shadowBlur = 8;
        ctx.font = "700 14px Georgia";
        ctx.textAlign = "center";
        ctx.fillText("SPECTACULAR!", 0, -8 - progress * 12);
      } else if (config.burst === "vampireBite") {
        ctx.strokeStyle = "#b51e3d";
        ctx.shadowColor = "#b51e3d";
        ctx.shadowBlur = 7;
        ctx.lineWidth = 2.4 - progress;
        ctx.beginPath();
        ctx.arc(-7, 0, radius * 0.58, -0.35, Math.PI + 0.35);
        ctx.arc(7, 0, radius * 0.58, -Math.PI - 0.35, 0.35);
        ctx.stroke();
        ctx.fillStyle = "#fff0d3";
        ctx.beginPath();
        ctx.moveTo(-radius * 0.48, 1);
        ctx.lineTo(-radius * 0.3, 1);
        ctx.lineTo(-radius * 0.39, radius * 0.48);
        ctx.closePath();
        ctx.moveTo(radius * 0.3, 1);
        ctx.lineTo(radius * 0.48, 1);
        ctx.lineTo(radius * 0.39, radius * 0.48);
        ctx.closePath();
        ctx.fill();
      } else if (config.burst === "castleGlow") {
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        glow.addColorStop(0, "rgba(230,214,160,0.74)");
        glow.addColorStop(0.35, "rgba(138,164,200,0.34)");
        glow.addColorStop(1, "rgba(138,164,200,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#e6d6a0";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(0, -radius * 0.85);
        ctx.lineTo(radius * 0.16, -radius * 0.18);
        ctx.lineTo(radius * 0.78, -radius * 0.18);
        ctx.lineTo(radius * 0.28, radius * 0.16);
        ctx.lineTo(radius * 0.46, radius * 0.78);
        ctx.lineTo(0, radius * 0.42);
        ctx.lineTo(-radius * 0.46, radius * 0.78);
        ctx.lineTo(-radius * 0.28, radius * 0.16);
        ctx.lineTo(-radius * 0.78, -radius * 0.18);
        ctx.lineTo(-radius * 0.16, -radius * 0.18);
        ctx.closePath();
        ctx.fill();
      } else if (config.burst === "batFlare") {
        ctx.strokeStyle = "#a82135";
        ctx.shadowColor = "#a82135";
        ctx.shadowBlur = 8;
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.bezierCurveTo(-radius * 0.45, -radius * 0.8, -radius * 0.95, -radius * 0.55, -radius, -radius * 0.1);
        ctx.lineTo(-radius * 0.54, radius * 0.08);
        ctx.lineTo(-radius * 0.22, radius * 0.42);
        ctx.moveTo(0, -2);
        ctx.bezierCurveTo(radius * 0.45, -radius * 0.8, radius * 0.95, -radius * 0.55, radius, -radius * 0.1);
        ctx.lineTo(radius * 0.54, radius * 0.08);
        ctx.lineTo(radius * 0.22, radius * 0.42);
        ctx.stroke();
        ctx.fillStyle = "#f5c7a1";
        ctx.beginPath();
        ctx.arc(-3, -2, 1.2, 0, Math.PI * 2);
        ctx.arc(3, -2, 1.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (config.burst === "manderleyBurn") {
        ctx.strokeStyle = "#426a91";
        ctx.shadowColor = "#c9a75a";
        ctx.shadowBlur = 7;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.72, -0.8, Math.PI * 1.65);
        ctx.stroke();
        ctx.strokeStyle = "#c9a75a";
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.48, Math.PI * 0.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.fillStyle = "#b51e3d";
        [[-radius * 0.76, -radius * 0.4], [radius * 0.72, radius * 0.18], [0, radius * 0.86]].forEach((spark) => {
          ctx.beginPath();
          ctx.arc(spark[0], spark[1], 1.5, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (config.burst === "curtainCall") {
        ctx.strokeStyle = "#d59b3a";
        ctx.shadowColor = "#e75b3c";
        ctx.shadowBlur = 8;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 8, radius * 0.74, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.strokeStyle = "#e75b3c";
        ctx.beginPath();
        ctx.arc(0, 8, radius * 0.46, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
        ctx.strokeStyle = "#fff5c4";
        ctx.lineWidth = 1;
        [[-radius * 0.72, -radius * 0.55], [radius * 0.72, -radius * 0.55], [0, -radius * 0.92]].forEach((ray) => {
          ctx.beginPath();
          ctx.moveTo(ray[0] * 0.62, ray[1] * 0.62);
          ctx.lineTo(ray[0], ray[1]);
          ctx.stroke();
        });
      } else if (config.burst === "oceanWave" || config.burst === "softOceanWave") {
        const softOceanWave = config.burst === "softOceanWave";
        ctx.strokeStyle = "#2d9fb6";
        ctx.shadowColor = "#97d7dc";
        ctx.shadowBlur = softOceanWave ? 3 : 7;
        ctx.lineWidth = softOceanWave ? 1.05 : 1.6;
        if (softOceanWave) ctx.globalAlpha *= 0.68;
        ctx.beginPath();
        ctx.arc(0, 7, radius * (softOceanWave ? 0.58 : 0.74), Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
        ctx.strokeStyle = "#f0d58b";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 4, radius * (softOceanWave ? 0.38 : 0.48), Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.globalAlpha *= softOceanWave ? 0.56 : 0.82;
        ctx.beginPath();
        ctx.moveTo(0, -radius * 0.72);
        ctx.lineTo(0, radius * 0.42);
        ctx.moveTo(-radius * 0.32, -radius * 0.72);
        ctx.quadraticCurveTo(0, -radius * 0.25, radius * 0.32, -radius * 0.72);
        ctx.stroke();
      } else if (config.burst === "flightPath") {
        ctx.strokeStyle = "#2d9fb6";
        ctx.shadowColor = "#97d7dc";
        ctx.shadowBlur = 7;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 5, radius * 0.78, Math.PI * 1.05, Math.PI * 1.92);
        ctx.stroke();
        ctx.strokeStyle = "#e3bd58";
        ctx.lineWidth = 1;
        ctx.setLineDash([2.5, 3.5]);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.5, Math.PI * 1.08, Math.PI * 1.88);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#fff4d6";
        ctx.strokeStyle = "#2d9fb6";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(radius * 0.5, -radius * 0.55);
        ctx.lineTo(radius * 0.86, -radius * 0.66);
        ctx.lineTo(radius * 0.62, -radius * 0.42);
        ctx.lineTo(radius * 0.55, -radius * 0.12);
        ctx.lineTo(radius * 0.42, -radius * 0.13);
        ctx.lineTo(radius * 0.47, -radius * 0.4);
        ctx.lineTo(radius * 0.16, -radius * 0.48);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (config.burst === "clockShockwave") {
        ctx.strokeStyle = "#f3b33d";
        ctx.shadowColor = "#f5e4a8";
        ctx.shadowBlur = 8;
        ctx.lineWidth = Math.max(0.7, 2 - progress);
        [0.52, 0.82].forEach((scale) => {
          ctx.beginPath();
          ctx.arc(0, 0, radius * scale, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.strokeStyle = "#af86c8";
        ctx.lineWidth = 1;
        for (let index = 0; index < 12; index += 1) {
          const angle = index * Math.PI / 6;
          const outer = radius * 0.92;
          const inner = outer - (index % 3 === 0 ? 5 : 3);
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
          ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
          ctx.stroke();
        }
        ctx.strokeStyle = "#fff2ad";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-radius * 0.28, -radius * 0.48);
        ctx.moveTo(0, 0);
        ctx.lineTo(radius * 0.42, radius * 0.18);
        ctx.stroke();
      } else if (config.burst === "softDiamondGlow") {
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.7);
        glow.addColorStop(0, "rgba(255,255,255,0.8)");
        glow.addColorStop(0.35, "rgba(224,247,250,0.4)");
        glow.addColorStop(1, "rgba(224,247,250,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
      } else if (config.burst === "glitchRipple") {
        ctx.strokeStyle = "#00f3ff";
        ctx.beginPath();
        ctx.ellipse(-2, 0, radius * 0.72, radius * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#ff00ff";
        ctx.beginPath();
        ctx.ellipse(2, 0, radius * 0.72, radius * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (config.burst === "goldenRippleNotes") {
        ctx.strokeStyle = "#ffd700";
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#ffd700";
        ctx.font = "20px Georgia";
        ctx.fillText("♪", -12 - progress * 8, -8 - progress * 12);
        ctx.fillText("♫", 10 + progress * 10, 2 - progress * 15);
      } else if (config.burst === "pressGlow") {
        const lightRadius = 11 + progress * 20;
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, lightRadius);
        glow.addColorStop(0, "rgba(255,250,218,0.76)");
        glow.addColorStop(0.25, "rgba(255,224,137,0.42)");
        glow.addColorStop(0.62, "rgba(191,232,245,0.15)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, lightRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha *= 0.58;
        ctx.strokeStyle = "#fff3b8";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-6 - progress * 5, 0);
        ctx.lineTo(6 + progress * 5, 0);
        ctx.moveTo(0, -5 - progress * 4);
        ctx.lineTo(0, 5 + progress * 4);
        ctx.stroke();
      } else if (config.burst === "subtleRipple") {
        ctx.strokeStyle = "#9b78d0";
        ctx.lineWidth = 1.2;
        ctx.shadowColor = "#7454ae";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha *= 0.62;
        ctx.strokeStyle = "#e2b15d";
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.52, 0, Math.PI * 2);
        ctx.stroke();
      } else if (config.burst === "lunarBloom") {
        const bloomRadius = 4 + progress * 9;
        const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, bloomRadius);
        bloom.addColorStop(0, "rgba(255,253,247,0.24)");
        bloom.addColorStop(0.38, "rgba(224,218,243,0.14)");
        bloom.addColorStop(0.72, "rgba(168,155,208,0.07)");
        bloom.addColorStop(1, "rgba(168,155,208,0)");
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(0, 0, bloomRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha *= 0.34;
        ctx.strokeStyle = "#eee9fb";
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.arc(0, 0, 3.5 + progress * 4.5, 0, Math.PI * 2);
        ctx.stroke();
      } else if (config.burst === "crispShockwave") {
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
        ctx.strokeStyle = "#d4af37";
        ctx.lineWidth = 2 - progress;
        ctx.shadowColor = "#d4af37";
        ctx.shadowBlur = 8;
        ctx.stroke();
      } else if (config.burst === "cruciformHalo") {
        ctx.strokeStyle = "#d8a33d";
        ctx.shadowColor = "#d8a33d";
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -radius);
        ctx.lineTo(0, radius);
        ctx.moveTo(-radius * 0.55, -radius * 0.28);
        ctx.lineTo(radius * 0.55, -radius * 0.28);
        ctx.stroke();
      } else if (config.burst === "planetOrbit") {
        ctx.strokeStyle = "#9ecbe8";
        ctx.shadowColor = "#f4d976";
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * 0.42, -0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#f4d976";
        ctx.beginPath();
        ctx.arc(Math.cos(progress * Math.PI * 2) * radius, Math.sin(progress * Math.PI * 2) * radius * 0.42, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawMotionTrail() {
    if (config.trail === "fiveLineStaff" && trailPoints.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 1.2;
      [-14, -7, 0, 7, 14].forEach((offset) => {
        ctx.beginPath();
        trailPoints.forEach((point, index) => {
          const alpha = (index + 1) / trailPoints.length;
          ctx.globalAlpha = alpha * 0.48;
          if (index === 0) ctx.moveTo(point.x, point.y + offset);
          else ctx.lineTo(point.x, point.y + offset);
        });
        ctx.stroke();
      });
      ctx.restore();
      return;
    }
  }

  function drawChandelierLightPulse(size, foreground = false) {
    if (config.motif !== "grandChandelier" || chandelierLight < 0.01) return;
    const intensity = Math.min(1, chandelierLight);
    const candleLights = [
      [-0.333, -0.182],
      [-0.177, -0.234],
      [0, -0.255],
      [0.177, -0.234],
      [0.333, -0.182],
    ];
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    if (!foreground) {
      ctx.globalAlpha = intensity * 0.74;
      const halo = ctx.createRadialGradient(0, -size * 0.05, 0, 0, -size * 0.05, size * 0.72);
      halo.addColorStop(0, "rgba(255,242,184,0.6)");
      halo.addColorStop(0.38, "rgba(255,207,100,0.28)");
      halo.addColorStop(0.7, "rgba(186,226,244,0.12)");
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, -size * 0.05, size * 0.72, 0, Math.PI * 2);
      ctx.fill();
      candleLights.forEach(([x, y]) => {
        const lampGlow = ctx.createRadialGradient(x * size, y * size, 0, x * size, y * size, size * 0.16);
        lampGlow.addColorStop(0, "rgba(255,255,238,0.98)");
        lampGlow.addColorStop(0.25, "rgba(255,228,132,0.76)");
        lampGlow.addColorStop(1, "rgba(255,211,92,0)");
        ctx.fillStyle = lampGlow;
        ctx.beginPath();
        ctx.arc(x * size, y * size, size * 0.16, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      ctx.globalAlpha = intensity * 0.88;
      ctx.strokeStyle = "rgba(255,255,244,0.96)";
      ctx.lineWidth = Math.max(0.55, size * 0.013);
      candleLights.forEach(([x, y], index) => {
        const px = x * size;
        const py = y * size;
        const ray = size * (index === 2 ? 0.075 : 0.056);
        ctx.beginPath();
        ctx.moveTo(px - ray, py);
        ctx.lineTo(px + ray, py);
        ctx.moveTo(px, py - ray);
        ctx.lineTo(px, py + ray);
        ctx.stroke();
      });
      [[-0.21, 0.24], [0, 0.35], [0.21, 0.24]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x * size, y * size, size * 0.022, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(205,239,255,0.9)";
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("mousemove", (event) => {
    mouse.targetX = event.clientX;
    mouse.targetY = event.clientY;
    const distance = Math.hypot(event.clientX - lastEmit.x, event.clientY - lastEmit.y);
    const now = Date.now();
    const shouldEmit = config.emitInterval
      ? now - lastEmitTime >= config.emitInterval
      : distance >= (config.emitDistance || 12);
    if (shouldEmit) {
      const movementAngle = Math.atan2(event.clientY - lastEmit.y, event.clientX - lastEmit.x);
      if (config.trail && config.trail !== "none" && config.trail !== "fiveLineStaff") {
        particles.push(new TrailParticle(event.clientX, event.clientY, false, particles.length, movementAngle));
      }
      canvas.dataset.cursorTrailEmissions = String(Number(canvas.dataset.cursorTrailEmissions) + 1);
      lastEmit.x = event.clientX;
      lastEmit.y = event.clientY;
      lastEmitTime = now;
    }
  });
  function triggerBurst(event) {
    const hasPointerPosition = Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY);
    const x = hasPointerPosition ? event.clientX : mouse.x > 0 ? mouse.x : mouse.targetX;
    const y = hasPointerPosition ? event.clientY : mouse.y > 0 ? mouse.y : mouse.targetY;
    if (hasPointerPosition) {
      mouse.x = x;
      mouse.y = y;
      mouse.targetX = x;
      mouse.targetY = y;
    }
    if (config.burst !== "none") bursts.push(new ClickBurst(x, y));
    if (config.motif === "grandChandelier") chandelierLight = 1;
    canvas.dataset.cursorClickBursts = String(Number(canvas.dataset.cursorClickBursts) + 1);
    for (let index = 0; index < config.burstParticles; index += 1) {
      particles.push(new TrailParticle(x, y, true, index, index * Math.PI * 2 / config.burstParticles));
    }
  }
  window.addEventListener("mousedown", (event) => {
    pressed = true;
    if (config.clickOn === "down") triggerBurst(event);
  });
  window.addEventListener("mouseup", (event) => {
    pressed = false;
    if (config.clickOn === "up") triggerBurst(event);
  });

  function animate() {
    if (document.hidden) {
      requestAnimationFrame(animate);
      return;
    }
    if (particles.length > 72) particles.splice(0, particles.length - 72);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.update();
      if (particle.alpha <= 0) particles.splice(index, 1); else particle.draw();
    }
    for (let index = bursts.length - 1; index >= 0; index -= 1) {
      const burst = bursts[index];
      burst.update();
      if (burst.age >= burst.maxAge) bursts.splice(index, 1); else burst.draw();
    }
    if (bursts.length > 8) bursts.splice(0, bursts.length - 8);
    mouse.x += (mouse.targetX - mouse.x) * config.follow;
    mouse.y += (mouse.targetY - mouse.y) * config.follow;
    if (mouse.targetX > -50) {
      if (config.trail === "fiveLineStaff") {
        trailPoints.push({ x: mouse.x, y: mouse.y });
        if (trailPoints.length > 35) trailPoints.shift();
      }
      drawMotionTrail();
      const size = (pressed ? config.size * 0.9 : config.size) * pointerScale * 1;
      ctx.save();
      ctx.translate(mouse.x, mouse.y);
      if (config.motif === "windmill") {
        ctx.drawImage(cache, -size * 0.5, -size * 0.5, size, size);
        windmillRotation += 0.02;
        ctx.rotate(windmillRotation);
        ctx.drawImage(bladeCache, -size * 0.5, -size * 0.5, size, size);
      } else {
        motifRotation += 0.004;
        if (config.motif === "filmReel") ctx.rotate(motifRotation);
        drawChandelierLightPulse(size, false);
        ctx.drawImage(
          cache,
          -size * config.hotspot[0],
          -size * config.hotspot[1],
          size,
          size,
        );
        drawChandelierLightPulse(size, true);
      }
      ctx.restore();
    }
    chandelierLight *= 0.965;
    if (chandelierLight < 0.006) chandelierLight = 0;
    requestAnimationFrame(animate);
  }

  resizeCanvas();
  animate();
})();
`;
}

function renderTests(show) {
  return `const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scriptJs = fs.readFileSync(path.join(root, "script.js"), "utf8");
const styleCss = fs.readFileSync(path.join(root, "style.css"), "utf8");
const displaySettingsCss = fs.readFileSync(path.join(root, "..", "shared", "display-settings.css"), "utf8");
const songsJs = fs.readFileSync(path.join(root, ${JSON.stringify(show.fullSongsFile || "songs.js")}), "utf8");
const criticalSongsJs = fs.readFileSync(path.join(root, "songs.js"), "utf8");
const songsInitialJs = fs.readFileSync(path.join(root, "songs-initial.js"), "utf8");
const wordDataJs = fs.readFileSync(path.join(root, "word-data.js"), "utf8");
const audioBuilderJs = fs.readFileSync(path.join(root, "scripts", "build-audio.js"), "utf8");
const cursorJs = fs.readFileSync(path.join(root, "..", "shared", "cursors", "${show.slug}.js"), "utf8");
const cursorMarker = ${JSON.stringify(getCursorMarker(show.slug))};
const cursorProfile = ${JSON.stringify(getReferenceCursorConfig(show))};

test("page uses the shared analytics module", () => {
  assert.match(indexHtml, /writeCriticalScript\\("\\.\\.\\/shared\\/analytics\\.js"\\)/);
  assert.match(scriptJs, /window\\.MusicalAnalytics\\.initShow/);
  assert.match(scriptJs, /showId:\\s*config\\.slug/);
  assert.doesNotMatch(indexHtml, /function gtag\\(\\)/);
});

test("page uses the show-specific cursor profile", () => {
  if (cursorProfile) {
    assert.match(cursorJs, new RegExp(\`"motif":"\${cursorProfile.motif}"\`));
    assert.match(cursorJs, new RegExp(\`"trail":"\${cursorProfile.trail}"\`));
    assert.match(cursorJs, new RegExp(\`"burst":"\${cursorProfile.burst}"\`));
    if (cursorProfile.clickOn) assert.match(cursorJs, new RegExp(\`"clickOn":"\${cursorProfile.clickOn}"\`));
    if (Number.isInteger(cursorProfile.burstParticles)) assert.match(cursorJs, new RegExp(\`"burstParticles":\${cursorProfile.burstParticles}\`));
  } else {
    assert.match(cursorJs, new RegExp(cursorMarker));
  }
});

test("lyrics do not contain OCR acute apostrophes or glued Latin punctuation", () => {
  const punctuationSandbox = { window: {} };
  vm.runInNewContext(songsJs, punctuationSandbox);
  const displayedLyrics = punctuationSandbox.window.songs.flatMap((song) => [
    song.title,
    song.titleZh,
    ...song.lines.flatMap((line) => [line.original, line.en, line.zh]),
  ]).filter(Boolean).join("\\n");
  assert.doesNotMatch(displayedLyrics, /´/u);
  assert.doesNotMatch(
    displayedLyrics,
    /\\p{Script=Latin},\\p{Script=Latin}|\\p{Script=Latin}[!?;:]\\p{Script=Latin}|\\p{Ll}\\.\\p{Script=Latin}|\\p{Script=Latin}\\.\\p{Ll}|\\p{Script=Latin}[!?]\\(|\\)\\p{Script=Latin}/u,
  );
});

test("favorites are not present", () => {
  const combined = \`\${indexHtml}\\n\${scriptJs}\\n\${styleCss}\`;
  ["favorite", "Favorite", "收藏", "onlyFavorites", "song-star"].forEach((term) => {
    assert.equal(combined.includes(term), false, \`found removed favorite term: \${term}\`);
  });
});

test("translation toggles use reviewed labels and stay grouped before IPA", () => {
  assert.match(indexHtml, /data-toggle="showZh"[^>]*>中译<\\/button>/);
  assert.match(indexHtml, /data-toggle="showIpa"/);
  assert.match(indexHtml, /id="feedbackButton"[^>]*>反馈<\\/button>/);
  assert.ok(indexHtml.indexOf('data-toggle="showZh"') < indexHtml.indexOf('data-toggle="showIpa"'));
  assert.ok(indexHtml.indexOf('data-toggle="showIpa"') < indexHtml.indexOf('id="feedbackButton"'));
  if (${JSON.stringify(show.showEnglishToggle === false)}) {
    assert.doesNotMatch(indexHtml, /data-toggle="showEn"/);
  } else {
    assert.match(indexHtml, /data-toggle="showEn"[^>]*>英译<\\/button>/);
    assert.match(indexHtml, /data-toggle="showZh"[^>]*>中译<\\/button>\\s*<button[^>]*data-toggle="showEn"[^>]*>英译<\\/button>/);
    assert.ok(indexHtml.indexOf('data-toggle="showZh"') < indexHtml.indexOf('data-toggle="showEn"'));
    assert.ok(indexHtml.indexOf('data-toggle="showEn"') < indexHtml.indexOf('data-toggle="showIpa"'));
  }
  assert.match(scriptJs, /showIpa:\\s*true/);
  assert.match(scriptJs, /phonetic\\.hidden\\s*=\\s*!state\\.settings\\.showIpa/);
  assert.match(scriptJs, /function getAlignedWordIpa/);
  assert.match(scriptJs, /function formatLineIpaPart/);
  assert.match(styleCss, /\\.word-phonetic/);
  assert.match(styleCss, /\\.song-order/);
  assert.match(styleCss, /#effectCanvas \\{[\\s\\S]*z-index:\\s*999999/);
  assert.doesNotMatch(scriptJs, /行歌词/);
});

test("page mounts the shared feedback widget with current song selection", () => {
  assert.match(indexHtml, /\\.\\.\\/shared\\/feedback-widget\\.js/);
  assert.match(indexHtml, /window\\.MusicalFeedback\\.mount/);
  assert.match(indexHtml, /trigger:\\s*"#feedbackButton"/);
  assert.match(indexHtml, /recipient:\\s*"fulife@agent\\.qq\\.com"/);
  assert.match(indexHtml, /getCurrentSongId:\\s*\\(\\) =>/);
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
  assert.match(indexHtml, /<link rel="preload" href="songs-initial\\.js" as="script" \\/>/);
  assert.doesNotMatch(indexHtml, /<link rel="preload" href="word-data\\.js"/);
  assert.match(indexHtml, /writeCriticalScript\\("songs-initial\\.js"\\)/);
  assert.doesNotMatch(indexHtml, /<script src="word-data\\.js"><\\/script>/);
  const initialSandbox = { window: {} };
  vm.runInNewContext(songsInitialJs, initialSandbox);
  assert.ok(initialSandbox.window.songsInitial[0].lines.length > 0);
  assert.ok(initialSandbox.window.songsInitial.slice(1).every((song) => song.lines.length === 0));
  assert.ok(Buffer.byteLength(songsInitialJs) < Buffer.byteLength(songsJs));
  assert.match(scriptJs, /ensureSearchReady:\\s*ensureFullSongs/);
  assert.match(scriptJs, /await loadScript\\("songs\\.js", "high"\\)/);
  assert.match(scriptJs, /renderSong\\(\\)/);
  assert.match(scriptJs, /scheduleDeferredWordData\\(\\)/);
  assert.match(scriptJs, /await loadScript\\("word-data\\.js", "low"\\)/);
  assert.match(scriptJs, /window\\.addEventListener\\("load", start, \\{ once: true \\}\\)/);
  assert.match(scriptJs, /showWordLoading\\(token, anchor\\);\\s*await ensureWordDataReady\\(\\)/);
  assert.match(styleCss, /content-visibility:\\s*auto/);
  assert.ok(Buffer.byteLength(criticalSongsJs) < 520_000, \`critical songs.js too large: \${Buffer.byteLength(songsJs)}B\`);
});

test("song header uses an unframed show logo and soft switching", () => {
  assert.match(indexHtml, /class="hero"/);
  assert.match(indexHtml, /class="home-button" href="\\.\\.\\/index\\.html" aria-label="返回音乐剧展示架"/);
  assert.match(indexHtml, /class="show-visual"/);
  assert.doesNotMatch(indexHtml, /show-visual-inner/);
  assert.match(indexHtml, /class="show-visual-image" src="assets\\/show(?:-title)?-logo(?:-[^./]+)?\\.(?:png|svg|webp|jpg)"/);
  assert.match(styleCss, /\\.hero/);
  assert.match(styleCss, /\\.show-visual/);
  assert.match(scriptJs, /function renderCurrentSongWithTransition/);
  assert.match(scriptJs, /is-song-changing/);
  assert.match(scriptJs, /is-song-settling/);
  assert.match(styleCss, /@keyframes lyric-card-soft-in/);
});

test("song switching resets the new song to the top of the page", () => {
  assert.match(scriptJs, /function resetSongScrollPosition/);
  assert.match(scriptJs, /window\\.scrollTo\\(\\{ top: 0, left: 0, behavior: "auto" \\}\\)/);
  assert.match(scriptJs, /renderCurrentSongWithTransition\\(\\);\\s*resetSongScrollPosition\\(\\);/);
});

test("playlist and rate controls follow feedback in a stable toolbar group", () => {
  const feedbackIndex = indexHtml.indexOf('id="feedbackButton"');
  const playbackIndex = indexHtml.indexOf('class="toolbar-playback-tools"');
  assert.ok(feedbackIndex !== -1 && playbackIndex > feedbackIndex);
  assert.match(indexHtml, /class="toolbar-playback-tools"[\\s\\S]*?id="songPlayButton"/);
  assert.match(scriptJs, /playbackTools:\\s*document\\.querySelector\\("\\.toolbar-playback-tools"\\)/);
  assert.match(scriptJs, /rateContainer:\\s*dom\\.playbackTools/);
  assert.match(styleCss, /\\.toolbar-playback-tools\\s*\\{[\\s\\S]*?display:\\s*inline-flex;[\\s\\S]*?align-items:\\s*center;/);
  assert.match(styleCss, /\\.toolbar-playback-tools\\s*\\{[\\s\\S]*?flex:\\s*0 0 auto;/);
  assert.match(styleCss, /\\.toolbar-playback-tools \\.lyrics-tools-rate/);
  assert.match(styleCss, /\\.toggle-btn\\s*\\{[\\s\\S]*?min-height:\\s*28px;[\\s\\S]*?font-size:\\s*0\\.74rem;/);
});

test("page follows the Hamilton-style collapsible navigation frame", () => {
  assert.match(indexHtml, /id="sidebarToggle"/);
  assert.match(indexHtml, /id="songSelect"/);
  assert.match(styleCss, /\\.app-shell\\.is-collapsed/);
  assert.match(styleCss, /\\.song-sidebar/);
  assert.match(styleCss, /\\.mobile-picker/);
  assert.match(scriptJs, /const SIDEBAR_KEY/);
  assert.match(scriptJs, /function syncSidebarState/);
  assert.match(scriptJs, /dom\\.songSelect\\?\\.addEventListener/);
  assert.doesNotMatch(indexHtml, />合集<\\/a>/);
});

test("page includes a themed canvas cursor effect", () => {
  assert.match(indexHtml, /<canvas id="effectCanvas"/);
  assert.match(styleCss, /#effectCanvas\\s*\\{/);
  assert.match(styleCss, /cursor:\\s*none !important/);
  assert.match(indexHtml, /\\.\\.\\/shared\\/cursors\\/${show.slug}\\.js/);
  assert.match(scriptJs, /initThemedCursor\\(\\)/);
  assert.match(scriptJs, /if \\(window\\.referenceCursorActive\\) return/);
  assert.match(cursorJs, /window\\.referenceCursorActive = true/);
  assert.match(cursorJs, new RegExp(cursorMarker));
  assert.match(cursorJs, /Math\\.min\\(window\\.devicePixelRatio \\|\\| 1, 1\\.5\\)/);
  if (${JSON.stringify(show.slug)} === "notre-dame-de-paris") {
    assert.match(cursorJs, /window\\.addEventListener\\("pointermove", updatePointer/);
    assert.match(cursorJs, /window\\.addEventListener\\("pointerdown", handlePointerDown/);
    assert.match(cursorJs, /window\\.addEventListener\\("pointerup", handlePointerUp/);
    assert.match(cursorJs, /const pressedScale = 0\\.88/);
    assert.match(cursorJs, /createLinearGradient/);
    assert.match(cursorJs, /requestAnimationFrame\\(drawCursor\\)/);
    assert.doesNotMatch(cursorJs, /CathedralHaloTrail|SoftWindowGlow|particles|ctx\\.filter|autoRotation|targetX/);
  } else {
    assert.match(cursorJs, /particles\\.length > 72/);
    assert.match(cursorJs, /document\\.hidden/);
  }
});

test("shared page-style trigger matches the generated hero action buttons", () => {
  assert.match(indexHtml, /lyrics-page-tools\\.css\\?v=20260830-derived-light-profiles-4/);
  assert.match(indexHtml, /display-settings\\.css\\?v=20260830-derived-light-profiles-4/);
  assert.match(displaySettingsCss, /\\.musical-display-trigger\\s*\\{[\\s\\S]*?color:\\s*var\\(--highlight/);
  assert.match(displaySettingsCss, /\\.musical-display-trigger\\s*\\{[\\s\\S]*?background:\\s*var\\(--panel/);
  assert.match(displaySettingsCss, /\\.musical-display-trigger\\s*\\{[\\s\\S]*?box-shadow:\\s*none/);
  assert.match(displaySettingsCss, /html\\[data-musical-theme="light"\\]\\[data-musical-page\\] :is\\([\\s\\S]*?\\.musical-display-trigger/);
});

test("generated hero action buttons share the dark-theme button treatment", () => {
  assert.match(indexHtml, /class="home-button"/);
  const pageToolsCss = fs.readFileSync(path.join(root, "..", "shared", "lyrics-page-tools.css"), "utf8");
  assert.match(pageToolsCss, /\\.lyrics-tools-hero-actions \\.home-button\\s*\\{[\\s\\S]*?width:\\s*44px/);
  assert.match(pageToolsCss, /\\.lyrics-tools-hero-actions \\.home-button\\s*\\{[\\s\\S]*?background:\\s*var\\(--panel/);
  assert.match(pageToolsCss, /\\.lyrics-tools-hero-actions \\.home-button\\s*\\{[\\s\\S]*?box-shadow:\\s*none/);
});

test("Matilda My House keeps complete phrases together and preserves the backing vocal", () => {
  if (${JSON.stringify(show.slug)} !== "matilda") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const song = sandbox.window.songs.find((item) => item.sourceOrder === 15);
  assert.equal(song?.lines.at(-2)?.original, "It isn't much but it is enough for me");
  assert.equal(song?.lines.at(-2)?.zh, "虽然不多，但对我来说已足够");
  assert.equal(song?.lines.at(-1)?.original, "It isn't much but it is enough for me");
  assert.equal(song?.lines.at(-1)?.zh, "虽然不多，但对我来说已足够");
  assert.equal(song?.lines.find((line) => line.id === "matilda-15-014")?.zh, "借着这盏灯，我可以阅读；而我也获得了自由");
  assert.equal(song?.lines.find((line) => line.id === "matilda-15-032")?.original, "It isn't much");
  assert.match(song?.lines.find((line) => line.original.includes("Don’t cry"))?.original || "", /Don’t cry/u);
});

test("Matilda uses a 45-degree upward-slanting downward-pointing pencil cursor", () => {
  if (${JSON.stringify(show.slug)} !== "matilda") return;
  assert.ok(cursorJs.includes('"hotspot":[0.29,0.72]'));
  assert.match(cursorJs, /config\\.motif === "matildaPencil"/);
  assert.match(cursorJs, /cacheCtx\\.rotate\\(Math\\.PI\\);/);
  assert.ok(cursorJs.includes("cacheCtx.rotate(Math.PI / 4);"));
});

test("Sound of Music uses a polished blue vector music-note cursor", () => {
  if (${JSON.stringify(show.slug)} !== "sound-of-music-the") return;
  assert.match(cursorJs, /"motif":"soundOfMusicNote"/);
  assert.match(cursorJs, /"trail":"none"/);
  assert.match(cursorJs, /"burst":"softDiamondGlow"/);
  assert.match(cursorJs, /"follow":1/);
  assert.match(cursorJs, /createLinearGradient/);
  assert.match(cursorJs, /"accent":"#4fb6d7"/);
  assert.match(cursorJs, /cacheCtx\\.ellipse\\(-7, 19, 10\\.5, 6\\.5/);
  assert.doesNotMatch(cursorJs, /Apple Color Emoji|fillText\\("🎵"/);
});

test("Preludium keeps the reviewed Latin-to-Chinese line pairs", () => {
  if (${JSON.stringify(show.slug)} !== "sound-of-music-the") return;
  const sourceText = fs.readFileSync(path.join(root, "..", "..", "lyrics", ${JSON.stringify(show.source)}), "utf8");
  assert.match(sourceText, /\\| Dixit dominus domino meo \\|\\s*\\n\\| 上主对我的主说 \\|/u);
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const preludium = sandbox.window.songs.find((song) => song.sourceOrder === 1);
  assert.equal(preludium?.lines.length, 22);
  assert.deepEqual(Array.from(preludium?.lines.slice(0, 4) || [], (line) => line.zh), [
    "上主对我的主说",
    "你坐在我的右边",
    "等我使你的仇敌",
    "成为你脚下的凳脚",
  ]);
  assert.equal(preludium?.lines.filter((line) => !line.zh).length, 0);
  assert.ok(preludium?.lines.every((line) => !line.speaker));
});

test("Come From Away keeps the reviewed count-in and globe cursor", () => {
  if (${JSON.stringify(show.slug)} !== "come-from-away") return;
  const lyricSandbox = { window: {} };
  vm.runInNewContext(songsJs, lyricSandbox);
  const finale = lyricSandbox.window.songs.find((song) => song.sourceOrder === 22);
  const opening = finale?.lines?.[0];
  const toledo = finale?.lines?.find((line) => line.id === "come-from-away-22-004");
  assert.equal(opening?.original, "One, two, a-one, two, three, four");
  assert.equal(opening?.zh, "1，2，预备—1，2，3，4");
  assert.equal(toledo?.original.includes("Toldeo"), false);
  assert.match(cursorJs, /"motif":"comeFromAwayGlobe"/);
  assert.match(cursorJs, /"size":50/);
  assert.match(cursorJs, /musical-light-accent/);
  assert.match(cursorJs, /MutationObserver/);
  assert.doesNotMatch(cursorJs, /comeFromAwayPlane/);
});

test("songs and word data are populated", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  vm.runInNewContext(wordDataJs, sandbox);
  assert.ok(sandbox.window.songs.length > 0);
  assert.ok(sandbox.window.songs.every((song) => song.lines.length > 0));
  assert.ok(sandbox.window.songs.every((song) => song.titleZh));
  const versionLabel = /(?:[（(\\[［]\\s*(?:live|现场)|[-–—]\\s*live)/iu;
  assert.ok(sandbox.window.songs.every((song) => !versionLabel.test(song.title) && !versionLabel.test(song.titleZh)));
  assert.ok(Object.keys(sandbox.window.wordEntries).length > 0);
});

test("Les Misérables keeps the English additions in concert order", () => {
  if (${JSON.stringify(show.slug)} !== "les-miserables") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const songs = sandbox.window.songs;
  assert.equal(songs.length, 39);
  assert.deepEqual(Array.from(songs, (song) => song.displayOrder), Array.from({ length: 39 }, (_value, index) => index + 1));
  const doYouHear = songs.find((song) => song.sourceOrder === 38);
  const epilogue = songs.find((song) => song.sourceOrder === 39);
  const encore = songs.find((song) => song.sourceOrder === 40);
  assert.equal(doYouHear?.title, "Do You Hear the People Sing?");
  assert.equal(doYouHear?.displayOrder, 18);
  assert.equal(doYouHear?.lines.length, 36);
  assert.equal(epilogue?.title, "Epilogue (Finale)");
  assert.equal(epilogue?.displayOrder, 38);
  assert.equal(epilogue?.lines.length, 86);
  assert.equal(encore?.title, "Encore: One Day More");
  assert.equal(encore?.displayOrder, 39);
  assert.equal(encore?.lines.length, 72);
  assert.ok([doYouHear, epilogue, encore].every((song) => song?.lines.every((line) => line.original && line.zh && line.ipa)));
});

test("The Greatest Show compresses the opening vocalization and shows its repeat count", () => {
  if (${JSON.stringify(show.slug)} !== "the-greatest-showman") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const opening = sandbox.window.songs.find((song) => song.sourceOrder === 1);
  assert.equal(opening.lines[0].original, "Woah");
  assert.equal(opening.lines[0].repeatCount, 9);
  assert.equal(opening.lines[1].id, "the-greatest-showman-01-010");
  assert.match(scriptJs, /lyric-repeat/);
  assert.match(styleCss, /\\.lyric-repeat/);
});

test("Epic keeps all 40 songs and removes non-lyric stage directions", () => {
  if (${JSON.stringify(show.slug)} !== "epic-the-musical") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const songs = sandbox.window.songs;
  assert.equal(songs.length, 40);
  assert.deepEqual(Array.from(songs, (song) => song.sourceOrder), Array.from({ length: 40 }, (_value, index) => index + 1));
  const lines = songs.flatMap((song) => song.lines);
  assert.ok(lines.every((line) => line.original && line.zh && line.ipa));
  assert.doesNotMatch(lines.map((line) => line.original).join("\\n"), /Instrumental (?:Interlude|Break)|opens the door|picks up .*trident|drops the trident/iu);
  assert.equal(songs[0].titleZh, "木马与婴儿");
  assert.equal(songs.at(-1).titleZh, "你还会再次爱上我吗");
  assert.match(cursorJs, /preRenderOdysseyTrident/);
  assert.match(cursorJs, /config\.motif === "odysseyTrident"/);
  assert.match(cursorJs, /config\.trail === "seaStarlight"/);
  assert.match(cursorJs, /config\.burst === "softOceanWave"/);
});

test("Dear Evan Hansen keeps slash-delimited line IPA and its upper-left note hotspot", () => {
  if (${JSON.stringify(show.slug)} !== "dear-evan-hansen") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const lines = sandbox.window.songs.flatMap((song) => song.lines);
  assert.ok(lines.every((line) => /^\\/[^/].*[^/]\\/$/u.test(line.ipa)));
  assert.ok(lines.every((line) => [...line.ipa].filter((character) => character === "/").length === 2));
  assert.match(indexHtml, /"independentWordIpa": false/);
  assert.match(scriptJs, /showPhonetics: true/);
  assert.doesNotMatch(scriptJs, /className = "line-ipa"/);
  assert.equal(scriptJs.includes("if (config.independentWordIpa)"), false);
  assert.ok(scriptJs.includes('const prefix = wordIndex === 0 ? "/" : "";'));
  assert.ok(scriptJs.includes('const suffix = wordIndex === wordCount - 1 ? "/" : "";'));
  assert.match(styleCss, /\.word-phonetic/);
  assert.ok(cursorJs.includes('"hotspot":[0.27,0.27]'));
  assert.ok(cursorJs.includes('"rotation":-0.785398'));
});

test("bracketed lyrics with aligned translations remain lyrics, not speaker labels", () => {
  if (${JSON.stringify(show.slug)} !== "mozart-opera-rock") return;
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
  assert.match(scriptJs, /song\.displayOrder \|\| song\.order/);
});

test("Starmania opening keeps the reviewed Chinese translation", () => {
  if (${JSON.stringify(show.slug)} !== "starmania") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const opening = sandbox.window.songs[0];
  assert.equal(opening.titleZh, "垄断城出大事了");
  assert.equal(opening.lines.find((line) => line.lineIndex === 3).zh, "垄断城");
  assert.equal(opening.lines.find((line) => line.lineIndex === 29).zh, "当太阳落下");
});

test("Moulin Rouge keeps source IPA corrections when lyric text is unchanged", () => {
  if (${JSON.stringify(show.slug)} !== "moulin-rouge") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const encore = sandbox.window.songs.find((song) => song.sourceOrder === 19);
  assert.equal(encore.lines[0].ipa, "/vulevu kuʃe avɛk mwa sə swar/");
  assert.equal(encore.lines[1].ipa, "/vulevu kuʃe avɛk mwa/");
});

test("Phantom and Love Never Dies stay in separate source ranges", () => {
  if (!["phantom-of-the-opera", "love-never-dies"].includes(${JSON.stringify(show.slug)})) return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const songs = sandbox.window.songs;
  if (${JSON.stringify(show.slug)} === "phantom-of-the-opera") {
    assert.equal(songs.length, 18);
    assert.equal(Math.max(...songs.map((song) => song.sourceOrder)), 21);
    assert.equal(songs[0].title, "Prologue");
    assert.equal(songs[0].titleZh, "序幕");
    assert.ok(songs.every((song) => !/live|现场/iu.test(song.title) && !/live|现场/iu.test(song.titleZh)));
    const allAskOfYou = songs.filter((song) => song.sourceOrder === 12 || song.sourceOrder === 13);
    assert.equal(allAskOfYou.length, 2);
    assert.equal(allAskOfYou[0].id, "12-all-i-ask-of-you-live");
    assert.equal(allAskOfYou[0].title, "All I Ask Of You");
    assert.equal(allAskOfYou[0].titleZh, "我对你唯一的请求");
    assert.equal(allAskOfYou[1].id, "13-all-i-ask-of-you-live");
    assert.equal(allAskOfYou[1].title, "All I Ask Of You (Reprise)");
    assert.equal(allAskOfYou[1].titleZh, "我对你唯一的请求（重唱）");
    return;
  }
  assert.equal(songs.length, 26);
  assert.equal(Math.min(...songs.map((song) => song.sourceOrder)), 22);
  assert.match(songs[0].lines[0].id, /^phantom-of-the-opera-22-/);
});

test("Romeo Aimer keeps one opening lyric, not an expanded spelling duplicate", () => {
  if (${JSON.stringify(show.slug)} !== "romeo-et-juliette") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const aimer = sandbox.window.songs.find((song) => song.sourceOrder === 18);
  assert.deepEqual(
    Array.from(aimer.lines.slice(0, 2), (line) => line.original),
    ["Aimer, c'est ce qu'y a d'plus beau", "Aimer, c'est monter si haut"],
  );
  assert.equal(aimer.lines.some((line) => line.id === "romeo-et-juliette-18-004"), false);
});

test("Notre-Dame speaker metadata never enters the lyric IPA or speech input", () => {
  if (${JSON.stringify(show.slug)} !== "notre-dame-de-paris") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  const line = sandbox.window.songs
    .find((song) => song.sourceOrder === 49)
    .lines.find((item) => item.lineIndex === 1);
  assert.equal(line.speaker, "Quasimodo");
  assert.equal(line.original, "Frollo");
  assert.equal(line.ipa, "/fʁɔlo/");
  assert.doesNotMatch(line.ipa, /kazimodo/u);
});

test("reviewed OCR word fragments are reassembled", () => {
  if (!["la-legende-du-roi-arthur", "phantom-of-the-opera", "notre-dame-de-paris", "le-roi-soleil", "mozart-opera-rock"].includes(${JSON.stringify(show.slug)})) return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  vm.runInNewContext(wordDataJs, sandbox);
  const lines = sandbox.window.songs.flatMap((song) => song.lines);
  const brokenTerms = ["Go té", "dé mons", "dé fait", "magné tique", "dé fie", "Ensorcelé e", "pensé es", "dé tour", "dé lit", "gouté", "au delà", "guida nce", "Monsieur ur", "prot égeront", "imb éciles", "qu'àvenir", "M ême", "fian? ailles", "pa? enne", "pa? ens", "r? le", "fl? te"];
  assert.equal(brokenTerms.find((term) => songsJs.includes(term)), undefined);

  if (${JSON.stringify(show.slug)} === "la-legende-du-roi-arthur") {
    assert.equal(lines.find((line) => line.id === "la-legende-du-roi-arthur-01-003").original, "Goûté aux effets toxiques");
    assert.equal(lines.find((line) => line.id === "la-legende-du-roi-arthur-01-007").original, "Tué mes démons, bravé les tourments");
    assert.equal(lines.find((line) => line.id === "la-legende-du-roi-arthur-06-004").original, "Ensorcelée par de sensuelles pensées");
    assert.equal(lines.find((line) => line.id === "la-legende-du-roi-arthur-17-011").original, "De désirer jusqu'au délit");
    assert.equal(sandbox.window.wordEntries["goûté"].meaning, "尝过；品尝过");
    assert.equal(sandbox.window.wordEntries.démons.meaning, "恶魔；心魔");
    return;
  }

  if (${JSON.stringify(show.slug)} === "notre-dame-de-paris") {
    assert.equal(lines.find((line) => line.id === "notre-dame-de-paris-08-044").original, "Avec sa bosse au dos");
    assert.equal(lines.find((line) => line.id === "notre-dame-de-paris-10-010").original, "Dans les cœurs dans les âmes des fidèles de Notre-Dame");
    assert.equal(lines.find((line) => line.id === "notre-dame-de-paris-21-002").original, "Te protégeront de tous les imbéciles");
    assert.equal(lines.find((line) => line.id === "notre-dame-de-paris-31-001").original, "Gringoire qu'as-tu fait de ta femme?");
    assert.equal(lines.find((line) => line.id === "notre-dame-de-paris-53-016").original, "Laissez entrer ces païens, ces vandales");
    return;
  }

  if (${JSON.stringify(show.slug)} === "le-roi-soleil") {
    assert.equal(lines.find((line) => line.id === "le-roi-soleil-24-016").original, "Chacun d'entre nous a son rôle à jouer");
    return;
  }

  if (${JSON.stringify(show.slug)} === "mozart-opera-rock") {
    assert.equal(lines.find((line) => line.id === "mozart-opera-rock-16-027").original, "De flûte enchantée");
    assert.equal(sandbox.window.songs.find((song) => song.sourceOrder === 17).title, "L'assasymphonie");
    return;
  }

  assert.equal(lines.find((line) => line.id === "phantom-of-the-opera-19-003").original, "yearning for my guidance...");
  assert.equal(lines.find((line) => line.id === "phantom-of-the-opera-19-043").original, "Let's see, Monsieur, how far you dare go?");
  assert.equal(sandbox.window.wordEntries.guidance.meaning, "指引；指导");
});

test("word cards do not contain placeholder copy", () => {
  const combined = \`\${scriptJs}\\n\${wordDataJs}\`;
  ["word from the lyric line", "暂未收录", "not in the local glossary yet", "title word", "contextual lyric term", "结合本句", "语境", "词义：", "de + ésir", "专有名词；人名、地名或剧中称谓", "proper noun or character/place name"].forEach((term) => {
    assert.equal(combined.includes(term), false, \`found placeholder: \${term}\`);
  });
  const sandbox = { window: {} };
  vm.runInNewContext(wordDataJs, sandbox);
  const unresolved = Object.entries(sandbox.window.wordEntries).find(([, entry]) => /^(?:ce|de|je|le\\/la|me|ne|que|se|te) \\+ /i.test(entry.en || ""));
  assert.equal(unresolved, undefined, \`found unresolved contraction: \${unresolved?.[0]}\`);
});

test("Le Roi Soleil keeps clean lyric breaks and real glosses", () => {
  if (${JSON.stringify(show.slug)} !== "le-roi-soleil") return;
  const sandbox = { window: {} };
  vm.runInNewContext(songsJs, sandbox);
  vm.runInNewContext(wordDataJs, sandbox);
  const opening = sandbox.window.songs.find((song) => song.sourceOrder === 2);
  assert.equal(opening.lines.length, 54);
  assert.equal(opening.lines[0].original, "Pour une couronne qu'on n'aura pas");
  assert.equal(opening.lines[1].original, "Un jour meilleur qui ne vient pas");
  assert.equal(opening.lines.some((line) => /,\\s*[，,]|，/u.test(line.original)), false);
  assert.equal(sandbox.window.songs.some((song) => song.lines.some((line) => /,\\s*[，,]|，/u.test(line.original))), false);
  assert.equal(sandbox.window.wordEntries["apprends-moi"].meaning, "教教我；告诉我");
  assert.equal(sandbox.window.wordEntries.versailles.meaning, "凡尔赛");
  assert.equal(sandbox.window.wordEntries.jerusalem.meaning, "耶路撒冷");
  assert.equal(sandbox.window.wordEntries.panurge.meaning, "盲从者；随大流的人");
});

test("French desire words keep dictionary glosses instead of elision fragments", () => {
  if (${JSON.stringify(show.language)} !== "fr") return;
  const sandbox = { window: {} };
  vm.runInNewContext(wordDataJs, sandbox);
  ["désir", "désirs", "désirer", "désire", "désirée", "désirent"].forEach((key) => {
    const entry = sandbox.window.wordEntries[key];
    if (!entry) return;
    assert.match(entry.meaning, /欲望|渴望|想要/);
    assert.match(entry.en, /desire|want|desired|wanted/);
    assert.doesNotMatch(entry.en, /\\+\\s*ésir/);
  });
});

test("Moliere keeps the requested show name and dictionary meaning", () => {
  if (${JSON.stringify(show.slug)} !== "moliere-le-spectacle-musical") return;
  const sandbox = { window: {} };
  vm.runInNewContext(wordDataJs, sandbox);
  assert.match(indexHtml, /"title": "Molière"/);
  assert.match(indexHtml, /"titleZh": "莫里哀"/);
  assert.equal(sandbox.window.wordEntries["molière"].meaning, "莫里哀");
  assert.equal(sandbox.window.wordEntries["molière"].en, "Molière");
});

test("Moliere keeps split Chinese translations aligned with their French clauses", () => {
  if (${JSON.stringify(show.slug)} !== "moliere-le-spectacle-musical") return;
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
  if (${JSON.stringify(show.language)} === "en") {
    assert.match(scriptJs, /config\\.language !== "en"/);
    assert.doesNotMatch(scriptJs, /dom\\.popover\\.append\\(head, ipa, meaning, en\\)/);
    return;
  }

  const sandbox = { window: {} };
  vm.runInNewContext(wordDataJs, sandbox);
  const longGlosses = Object.entries(sandbox.window.wordEntries)
    .filter(([, entry]) => String(entry.en || "").length > 48);
  assert.deepEqual(longGlosses.slice(0, 10), []);
});

test("clickable song title and lyric words are wired", () => {
  assert.match(scriptJs, /renderClickableWords\\(config\\.title/);
  assert.match(scriptJs, /renderClickableWords\\(song\\.title/);
  assert.match(scriptJs, /renderClickableWords\\(line\\.original/);
  assert.match(scriptJs, /className = className/);
  assert.match(styleCss, /\\.lyric-word/);
  assert.match(styleCss, /\\.song-title-word/);
});

test("word-card IPA sits beside the word and translations keep English above Chinese", () => {
  assert.match(scriptJs, /term\\.append\\(word, ipa\\)/);
  assert.match(styleCss, /\\.popover-term\\s*\\{[\\s\\S]*display:\\s*flex/);
  assert.ok(scriptJs.indexOf('en.className = "line-en"') < scriptJs.indexOf('zh.className = "line-zh"'));
  assert.match(styleCss, /h2\\s*\\{[\\s\\S]*font-size:\\s*clamp\\(1\\.55rem, 3vw, 2\\.65rem\\)/);
});

test("clicking a word opens its card and automatically plays its cached pronunciation once", () => {
  assert.match(scriptJs, /showWord\\(token, anchor, \\{ autoplay: true \\}\\)/);
  assert.match(scriptJs, /function showWord\\(token, anchor, \\{ autoplay = false \\} = \\{\\}\\)/);
  assert.match(scriptJs, /const playWordPronunciation = \\(\\) => \\{[\\s\\S]*?audioController\\.runUserAction\\(/);
  assert.match(scriptJs, /if \\(autoplay\\) playWordPronunciation\\(\\);/);
  assert.doesNotMatch(scriptJs, /popover-speak/);
  assert.match(scriptJs, /head\\.append\\(term\\)/);
  assert.match(styleCss, /max-width:\\s*min\\(240px, calc\\(100vw - 24px\\)\\)/);
});

test("page includes an unobtrusive return-to-top control", () => {
  assert.match(indexHtml, /id="backToTop"/);
  assert.match(scriptJs, /function bindBackToTop/);
  assert.match(scriptJs, /window\\.scrollTo\\(\\{ top: 0, behavior: "smooth" \\}\\)/);
  assert.match(styleCss, /\\.back-to-top/);
});

test("sentence and word audio prefer cached local MP3 files", () => {
  assert.match(scriptJs, /MusicalAudio\\.getCachedAudio\\(src\\)/);
  assert.match(scriptJs, /MusicalAudio\\.preloadLocalAudio/);
  assert.match(scriptJs, /function withAudioVersion\\(path, speechText\\)/);
  assert.match(scriptJs, /String\\(config\\.audioVoice \\|\\| "system"\\)/);
  assert.match(scriptJs, /withAudioVersion\\([^\\n]+line\\.original\\)/);
  assert.match(scriptJs, /\\.mp3/);
  assert.match(scriptJs, /audio\\/lines/);
  assert.match(scriptJs, /audio\\/words/);
  assert.match(indexHtml, /\\.\\.\\/shared\\/audio-playback\\.js/);
  assert.match(indexHtml, /id="songPlayButton"/);
  assert.match(indexHtml, /playlist-lines-mark/);
  assert.match(indexHtml, /playlist-stop-mark" x="8"/);
  assert.match(scriptJs, /MusicalAudio\\.createController/);
  assert.match(scriptJs, /audioController\\.runUserAction/);
  assert.match(scriptJs, /audioController\\.toggleSequence/);
  assert.match(scriptJs, /function playLineToEnd/);
  assert.match(scriptJs, /function preloadLineAudio/);
  assert.match(scriptJs, /function followSequenceCard/);
  assert.match(scriptJs, /scrollIntoView/);
  assert.match(scriptJs, /audio\\.addEventListener\\("ended"/);
  assert.match(styleCss, /\\.song-play-button/);
  assert.match(styleCss, /\\.lyric-card\\.is-sequence-active/);
  assert.match(audioBuilderJs, /build-natural-audio\\.js/);
  assert.match(audioBuilderJs, /runBuild\\(\\{/);
  assert.match(audioBuilderJs, /MUSICAL_TTS_VOICE/);
  assert.match(audioBuilderJs, /kind:\\s*"generated"/);
});

test("page includes shared search, rate, and persistent playlist controls", () => {
  assert.match(indexHtml, /\\.\\.\\/shared\\/playback-rate\\.js/);
  assert.match(indexHtml, /\\.\\.\\/shared\\/lyrics-search\\.js/);
  assert.match(indexHtml, /\\.\\.\\/shared\\/lyrics-page-tools\\.js/);
  assert.match(indexHtml, /\\.\\.\\/shared\\/lyrics-page-tools\\.css/);
  assert.match(scriptJs, /MusicalLyricsPageTools\\.create/);
  assert.match(scriptJs, /pauseCurrent:\\s*pauseCurrentPlayback/);
  assert.match(scriptJs, /resumeCurrent:\\s*resumeCurrentPlayback/);
  assert.match(scriptJs, /gapMs:\\s*window\\.MusicalAudio\\.SEQUENCE_GAP_MS \\/ pageTools\\.getRate\\(\\)/);
  assert.match(scriptJs, /is-sequence-stop/);
  assert.match(scriptJs, /navigateToSearchResult/);
});

test("narrow and mobile layouts override a persisted collapsed sidebar", () => {
  assert.match(styleCss, /@media \\(max-width: 980px\\)[\\s\\S]*\\.app-shell,\\s*[\\s\\S]*\\.app-shell\\.is-collapsed\\s*\\{[\\s\\S]*display:\\s*block/);
  assert.match(styleCss, /\\.toolbar\\s*\\{[\\s\\S]*display:\\s*flex;[\\s\\S]*flex-wrap:\\s*wrap;[\\s\\S]*justify-content:\\s*flex-start;/);
  assert.doesNotMatch(styleCss, /\\.toolbar\\s*\\{[\\s\\S]{0,180}grid-template-columns:/);
  assert.match(styleCss, /@media \\(max-width: 980px\\)[\\s\\S]*\\.lyric-card\\s*\\{[\\s\\S]*grid-template-columns:\\s*minmax\\(0, 1fr\\) 38px;/);
  assert.match(scriptJs, /window\\.matchMedia\\("\\(max-width: 980px\\)"\\)\\.matches/);
  assert.match(scriptJs, /state\\.sidebarCollapsed && !isNarrowLayout/);
  assert.match(scriptJs, /window\\.addEventListener\\("resize", syncSidebarState/);
  assert.match(styleCss, /overflow-wrap:\\s*anywhere/);
});
`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if (require.main === module) main();

module.exports = {
  SHOWS,
  deriveLightProfile,
  renderIndex,
  cleanConfiguredSongTitle,
  isInstrumentalMarkerText,
  isInstrumentalPlaceholderLine,
  parseLoosePairedEnglishMarkdown,
  parsePairedEnglishMarkdown,
  parseEnglishChineseColumnsMarkdown,
  parseEnglishChineseSingleColumnMarkdown,
  parseGermanTripleMarkdown,
  parseMarkdown,
  extractSpeaker,
  extractGermanTripleSpeaker,
  extractTranslationSpeaker,
  findStructuralLyricCandidates,
  assertLyricsReadyForGeneration,
  assertNoUnreviewedContentChanges,
  isSafeReviewedLineMerge,
  splitSentenceSegments,
  splitAlignedLongLine,
  splitAlignedSentenceSegments,
  buildWordEntries,
  requiredWordKeys,
  isReviewedWordCard,
  loadRougeGlossary,
  loadFreedictGlossary,
  loadEnglishGlossary,
  loadLegacyWordEntries,
  loadLegacyEnglishWordEntries,
};
