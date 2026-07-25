const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const shows = process.argv.slice(2);

if (!shows.length) {
  throw new Error("Usage: node shared/prune-generated-audio.js <show> [...show]");
}

function loadShowData(root) {
  const context = { window: {} };
  vm.createContext(context);
  for (const file of ["songs.js", "word-data.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  }
  return context.window;
}

function walkDeliveryAudio(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkDeliveryAudio(target);
    return entry.isFile() && entry.name.endsWith(".mp3") ? [target] : [];
  });
}

for (const show of shows) {
  const root = path.join(projectRoot, show);
  const data = loadShowData(root);
  const expected = new Set();

  for (const song of data.songs || []) {
    for (const line of song.lines || []) {
      expected.add(path.join(root, "audio", "lines", encodeURIComponent(song.id), `${encodeURIComponent(line.id)}.mp3`));
    }
  }
  for (const key of Object.keys(data.wordEntries || {})) {
    expected.add(path.join(root, "audio", "words", `${encodeURIComponent(key)}.mp3`));
  }

  const orphaned = walkDeliveryAudio(path.join(root, "audio")).filter((file) => !expected.has(file));
  orphaned.forEach((file) => fs.rmSync(file));
  console.log(`${show}: removed=${orphaned.length}`);
}
