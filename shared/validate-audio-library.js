const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const shows = [
  "notre-dame-de-paris",
  "les-miserables",
  "mozart-opera-rock",
  "romeo-et-juliette",
  "le-roi-soleil",
  "1789-les-amants-de-la-bastille",
  "don-juan",
  "moliere-le-spectacle-musical",
  "cyrano-de-bergerac",
  "Hamilton",
  "moulin-rouge",
  "elisabeth-das-musical",
  "starmania",
  "mozart-das-musical",
  "phantom-of-the-opera",
  "love-never-dies",
  "les-souliers-rouges",
  "la-legende-du-roi-arthur",
];
const requestedShows = process.argv
  .filter((argument) => argument.startsWith("--show="))
  .map((argument) => argument.slice("--show=".length));
const unknownShows = requestedShows.filter((show) => !shows.includes(show));
if (unknownShows.length) throw new Error(`Unknown show: ${unknownShows.join(", ")}`);
const showsToValidate = requestedShows.length ? requestedShows : shows;

function walkDeliveryAudio(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkDeliveryAudio(target);
    return entry.isFile() && entry.name.endsWith(".mp3") ? [target] : [];
  });
}

function expectedCount(show) {
  const builder = path.join(projectRoot, show, "scripts", "build-audio.js");
  const result = spawnSync(process.execPath, [builder, "--list"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Cannot list expected audio for ${show}: ${result.stderr}`);
  const lines = Number(result.stdout.match(/line_jobs=(\d+)/)?.[1]);
  const words = Number(result.stdout.match(/word_jobs=(\d+)/)?.[1]);
  if (!Number.isFinite(lines) || !Number.isFinite(words)) throw new Error(`Invalid audio list for ${show}`);
  return lines + words;
}

function inspectDelivery(file) {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", file, "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0) return { reason: "decode-failed" };
  if (fs.statSync(file).size < 512) return { reason: "suspiciously-small-delivery" };
  return null;
}

let failed = false;
for (const show of showsToValidate) {
  const files = walkDeliveryAudio(path.join(projectRoot, show, "audio"));
  const expected = expectedCount(show);
  const bad = [];
  for (const file of files) {
    const issue = inspectDelivery(file);
    if (issue) bad.push({ file: path.relative(projectRoot, file), ...issue });
  }
  const countMatches = files.length === expected;
  if (!countMatches || bad.length) failed = true;
  console.log(`${show}: expected=${expected} actual=${files.length} bad=${bad.length}`);
  bad.slice(0, 5).forEach((entry) => console.log(`  ${entry.file}: ${entry.reason}`));
}

if (failed) process.exit(1);
