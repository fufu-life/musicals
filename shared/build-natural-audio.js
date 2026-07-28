const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const vm = require("node:vm");

const MIN_AUDIO_BYTES = 8192;
const SYNTHESIS_BATCH_SIZE = 200;

function run(command, args, id, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed for ${id}: ${result.stderr || result.stdout}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

function loadWindowData(files) {
  const context = { window: {} };
  vm.createContext(context);
  files.forEach((file) => vm.runInContext(fs.readFileSync(file, "utf8"), context));
  return context.window;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/#/, "number")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanSpeechText(text) {
  const original = String(text || "").trim();
  const withoutBracketedMetadata = original.replace(/^(?:\[[^\]]{1,80}\])+\s*/, "").trim();
  if (original && !withoutBracketedMetadata && /^\[[^\]]{1,80}\]$/.test(original)) return "";
  return withoutBracketedMetadata
    .replace(/^[A-Z][A-Z .,'&/-]{1,40}:\s*/, "")
    .trim();
}

function speechVersion(text) {
  return crypto.createHash("sha256").update(cleanSpeechText(text), "utf8").digest("hex").slice(0, 16);
}

function loadAudioManifest(root) {
  const file = path.join(root, "audio", "audio-manifest.json");
  if (!fs.existsSync(file)) return { file, jobs: {} };
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return { file, jobs: data.jobs || {} };
}

function writeAudioManifest(manifest) {
  fs.mkdirSync(path.dirname(manifest.file), { recursive: true });
  fs.writeFileSync(manifest.file, `${JSON.stringify({ version: 1, jobs: manifest.jobs }, null, 2)}\n`, "utf8");
}

function loadPronunciationOverrides(root) {
  const file = path.resolve(root, "..", "scripts", "tts-pronunciation-overrides.json");
  if (!fs.existsSync(file)) return { lines: {}, words: {} };
  const allOverrides = JSON.parse(fs.readFileSync(file, "utf8"));
  return allOverrides[path.basename(root)] || { lines: {}, words: {} };
}

function collectGeneratedJobs(root, masterRoot, lineSpeechOverrides = {}, wordSpeechOverrides = {}) {
  const data = loadWindowData([path.join(root, "songs.js"), path.join(root, "word-data.js")]);
  const lineJobs = (data.songs || []).flatMap((song) => (song.lines || []).map((line) => {
    const text = cleanSpeechText(lineSpeechOverrides[line.id] || line.original);
    if (!text) return null;
    return {
      id: line.id,
      text,
      manifestKey: `line:${line.id}`,
      speechVersion: speechVersion(text),
      output: path.join(masterRoot, "audio", "lines", encodeURIComponent(song.id), `${encodeURIComponent(line.id)}.wav`),
      delivery: path.join(root, "audio", "lines", encodeURIComponent(song.id), `${encodeURIComponent(line.id)}.mp3`),
    };
  }).filter(Boolean));
  const wordJobs = Object.entries(data.wordEntries || {}).map(([key, entry]) => {
    const text = wordSpeechOverrides[key] || entry.speak || key;
    return {
      id: key,
      text,
      manifestKey: `word:${key}`,
      speechVersion: speechVersion(text),
      output: path.join(masterRoot, "audio", "words", `${encodeURIComponent(key)}.wav`),
      delivery: path.join(root, "audio", "words", `${encodeURIComponent(key)}.mp3`),
    };
  });
  return { lineJobs, wordJobs };
}

function collectHamiltonJobs(root, masterRoot, lineSpeechOverrides = {}, wordSpeechOverrides = {}) {
  const data = loadWindowData([path.join(root, "lyrics-data.js"), path.join(root, "word-data.js")]);
  const lineJobs = (data.hamiltonLyricsRows || []).map((row) => {
    const order = Number(row.song_order);
    const lineIndex = Number(row.line_index);
    const title = row.song_title?.trim();
    if (!Number.isFinite(order) || !Number.isFinite(lineIndex) || !title) return null;
    const songId = slugify(`${String(order).padStart(2, "0")}-${title}`);
    const lineId = `ham-${String(order).padStart(2, "0")}-${String(lineIndex).padStart(3, "0")}`;
    const text = cleanSpeechText(lineSpeechOverrides[lineId] || row.english);
    if (!text) return null;
    return {
      id: lineId,
      text,
      manifestKey: `line:${lineId}`,
      speechVersion: speechVersion(text),
      output: path.join(masterRoot, "audio", "lines", encodeURIComponent(songId), `${encodeURIComponent(lineId)}.wav`),
      delivery: path.join(root, "audio", "lines", encodeURIComponent(songId), `${encodeURIComponent(lineId)}.mp3`),
    };
  }).filter(Boolean);
  const wordJobs = Object.entries(data.hamiltonWordEntries || {}).map(([key, entry]) => {
    const text = cleanSpeechText(wordSpeechOverrides[key] || entry.speak || key);
    return {
      id: key,
      text,
      manifestKey: `word:${key}`,
      speechVersion: speechVersion(text),
      output: path.join(masterRoot, "audio", "words", `${encodeURIComponent(key)}.wav`),
      delivery: path.join(root, "audio", "words", `${encodeURIComponent(key)}.mp3`),
    };
  });
  return { lineJobs, wordJobs };
}

function isValidFile(file) {
  return fs.existsSync(file) && fs.statSync(file).size >= MIN_AUDIO_BYTES;
}

function isValidDelivery(file) {
  return fs.existsSync(file) && fs.statSync(file).size >= 512;
}

function transcodeDelivery(job) {
  fs.mkdirSync(path.dirname(job.delivery), { recursive: true });
  const temporaryFile = `${job.delivery}.tmp`;
  try {
    run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", job.output,
      "-vn", "-map_metadata", "-1",
      "-ac", "1", "-ar", "22050",
      "-c:a", "libmp3lame", "-b:a", "64k",
      "-f", "mp3", temporaryFile,
    ], job.id);
    if (!isValidDelivery(temporaryFile)) throw new Error(`Invalid MP3 delivery for ${job.id}`);
    fs.renameSync(temporaryFile, job.delivery);
  } finally {
    fs.rmSync(temporaryFile, { force: true });
  }
}

function validateSample(file, id) {
  const result = spawnSync("afinfo", [file], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.status !== 0 || /audio bytes:\s*0/i.test(result.stdout) || /estimated duration:\s*0\.0+ sec/i.test(result.stdout)) {
    throw new Error(`Empty or invalid audio for ${id}: ${file}`);
  }
}

function validateSpeechSignal(file, id) {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", file, "-af", "astats=metadata=0:reset=0", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
  );
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const dynamicRange = Number(output.match(/Dynamic range:\s*([\d.]+)/i)?.[1]);
  const zeroCrossingRate = Number(output.match(/Zero crossings rate:\s*([\d.]+)/i)?.[1]);
  const dcOffset = Math.abs(Number(output.match(/DC offset:\s*(-?[\d.]+)/i)?.[1]));

  if (
    result.status !== 0
    || !Number.isFinite(dynamicRange)
    || !Number.isFinite(zeroCrossingRate)
    || !Number.isFinite(dcOffset)
    || dynamicRange < 50
    || zeroCrossingRate > 0.5
    || dcOffset > 0.08
  ) {
    throw new Error(
      `Audio content check failed for ${id}: dynamicRange=${dynamicRange}, zeroCrossingRate=${zeroCrossingRate}, dcOffset=${dcOffset}`,
    );
  }
}

function runBuild({
  root,
  voice,
  rate = 0.48,
  kind = "generated",
  lineSpeechOverrides = {},
  wordSpeechOverrides = {},
}) {
  const force = process.argv.includes("--force");
  const listOnly = process.argv.includes("--list");
  const smoke = process.argv.includes("--smoke");
  const adoptExisting = process.argv.includes("--adopt-existing");
  const idsArgument = process.argv.find((argument) => argument.startsWith("--ids="));
  const requestedIds = new Set(
    String(idsArgument?.slice("--ids=".length) || process.env.MUSICAL_AUDIO_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const masterRoot = process.env.MUSICAL_AUDIO_MASTER_ROOT
    || path.resolve(root, "..", "..", "audio-masters", "vibe-coding-current", path.basename(root));
  const storedOverrides = loadPronunciationOverrides(root);
  const effectiveLineOverrides = { ...(storedOverrides.lines || {}), ...lineSpeechOverrides };
  const effectiveWordOverrides = { ...(storedOverrides.words || {}), ...wordSpeechOverrides };
  const { lineJobs, wordJobs } = kind === "hamilton"
    ? collectHamiltonJobs(root, masterRoot, effectiveLineOverrides, effectiveWordOverrides)
    : collectGeneratedJobs(root, masterRoot, effectiveLineOverrides, effectiveWordOverrides);

  const allJobs = [...lineJobs, ...wordJobs];
  const manifest = loadAudioManifest(root);
  const targetedJobs = requestedIds.size
    ? allJobs.filter((job) => requestedIds.has(job.id))
    : allJobs;
  if (requestedIds.size && targetedJobs.length !== requestedIds.size) {
    const found = new Set(targetedJobs.map((job) => job.id));
    const missing = [...requestedIds].filter((id) => !found.has(id));
    throw new Error(`Unknown requested audio IDs: ${missing.join(", ")}`);
  }

  if (listOnly) {
    console.log(`voice=${voice}`);
    console.log(`line_jobs=${lineJobs.length}`);
    console.log(`word_jobs=${wordJobs.length}`);
    console.log(`selected_jobs=${targetedJobs.length}`);
    return;
  }

  if (adoptExisting) {
    let adopted = 0;
    let alreadyTracked = 0;
    let missing = 0;
    targetedJobs.forEach((job) => {
      if (!isValidDelivery(job.delivery)) {
        missing += 1;
        return;
      }
      if (manifest.jobs[job.manifestKey] === job.speechVersion) {
        alreadyTracked += 1;
        return;
      }
      manifest.jobs[job.manifestKey] = job.speechVersion;
      adopted += 1;
    });
    writeAudioManifest(manifest);
    console.log(`Audio manifest adoption complete. adopted=${adopted}, tracked=${alreadyTracked}, missing=${missing}`);
    return;
  }

  const selected = smoke && !requestedIds.size
    ? [lineJobs[0], wordJobs[0]].filter(Boolean)
    : targetedJobs;
  const emptyJob = selected.find((job) => !String(job.text || "").trim());
  if (emptyJob) throw new Error(`Refusing to synthesize empty text for ${emptyJob.id}`);
  const jobs = force ? selected : selected.filter((job) => (
    !isValidDelivery(job.delivery) || manifest.jobs[job.manifestKey] !== job.speechVersion
  ));
  if (!jobs.length) {
    console.log(`Audio build complete. voice=${voice}, generated=0, skipped=${selected.length}`);
    return;
  }
  const synthesisJobs = force ? jobs : jobs.filter((job) => !isValidFile(job.output));

  const tempRoot = path.join(root, ".audio-tmp");
  const jobsFile = path.join(tempRoot, "jobs.json");
  const preflightJobsFile = path.join(tempRoot, "preflight-jobs.json");
  const preflightAudio = path.join(tempRoot, "preflight.wav");
  const binary = path.join(tempRoot, "batch-system-tts");
  const swiftSource = path.resolve(root, "..", "shared", "batch-system-tts.swift");
  fs.mkdirSync(tempRoot, { recursive: true });

  const signalCheckJobs = synthesisJobs.filter((job) => {
    const letterCount = (job.text.match(/\p{L}/gu) || []).length;
    return job.text.length >= 20 && letterCount >= 12;
  });
  const preflightJob = signalCheckJobs[0] || synthesisJobs[0];

  try {
    if (synthesisJobs.length) {
      run("swiftc", [swiftSource, "-o", binary], "compile", {
        env: {
          ...process.env,
          CLANG_MODULE_CACHE_PATH: path.join(tempRoot, "swift-module-cache"),
          SWIFT_MODULECACHE_PATH: path.join(tempRoot, "swift-module-cache"),
        },
      });
      fs.writeFileSync(preflightJobsFile, JSON.stringify([{
        id: "preflight",
        text: preflightJob.text,
        output: preflightAudio,
      }]), "utf8");
      run(binary, [preflightJobsFile, voice, String(rate)], "preflight");
      validateSample(preflightAudio, "preflight");
      validateSpeechSignal(preflightAudio, "preflight");
      for (let offset = 0; offset < synthesisJobs.length; offset += SYNTHESIS_BATCH_SIZE) {
        const batch = synthesisJobs.slice(offset, offset + SYNTHESIS_BATCH_SIZE);
        batch.forEach((job) => fs.mkdirSync(path.dirname(job.output), { recursive: true }));
        fs.writeFileSync(jobsFile, JSON.stringify(batch), "utf8");
        run(binary, [jobsFile, voice, String(rate)], `synthesis batch ${offset / SYNTHESIS_BATCH_SIZE + 1}`);
      }
    }
    const invalid = jobs.filter((job) => !isValidFile(job.output));
    if (invalid.length) throw new Error(`Invalid audio files: ${invalid.slice(0, 5).map((job) => job.id).join(", ")}`);
    const contentSamples = signalCheckJobs.length
      ? [signalCheckJobs[0], signalCheckJobs[signalCheckJobs.length - 1]]
      : synthesisJobs.slice(0, 1);
    contentSamples.forEach((job) => {
      validateSample(job.output, job.id);
      validateSpeechSignal(job.output, job.id);
    });
    jobs.forEach(transcodeDelivery);
    const invalidDelivery = jobs.filter((job) => !isValidDelivery(job.delivery));
    if (invalidDelivery.length) throw new Error(`Invalid MP3 delivery files: ${invalidDelivery.slice(0, 5).map((job) => job.id).join(", ")}`);
    jobs.forEach((job) => {
      manifest.jobs[job.manifestKey] = job.speechVersion;
    });
    writeAudioManifest(manifest);
    console.log(`Audio build complete. voice=${voice}, generated=${synthesisJobs.length}, converted=${jobs.length}, skipped=${selected.length - jobs.length}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

module.exports = { cleanSpeechText, runBuild };
