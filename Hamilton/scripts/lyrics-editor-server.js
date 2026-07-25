#!/usr/bin/env node
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const musicalsRoot = path.resolve(__dirname, "..", "..");
const hamiltonRoot = path.resolve(__dirname, "..");
const sourcePath = path.resolve(musicalsRoot, "..", "lyrics", "Hamilton (Original Broadway Cast Recording) (3367211).md");
const port = Number(process.env.LYRICS_EDITOR_PORT || 4179);

function send(response, status, data) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: musicalsRoot, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  return (result.stdout || "").trim();
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").trim();
}

function saveLine(payload) {
  const order = Number(payload.songOrder);
  const lineIndex = Number(payload.lineIndex);
  const fields = [payload.english, payload.ipa, payload.chinese];
  if (!Number.isInteger(order) || !Number.isInteger(lineIndex) || fields.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error("歌曲、行号、英文、IPA 与中文翻译均不能为空");
  }
  const lines = fs.readFileSync(sourcePath, "utf8").split("\n");
  let currentOrder = 0;
  let updated = false;
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^##\s+(\d+)\./);
    if (heading) currentOrder = Number(heading[1]);
    if (currentOrder !== order) continue;
    const row = lines[index].match(/^\| (\d+) \| (.*?) \| (.*?) \| (.*?) \| (.*?) \|$/);
    if (!row || Number(row[1]) !== lineIndex) continue;
    lines[index] = `| ${lineIndex} | ${escapeCell(payload.english)} | ${escapeCell(payload.ipa)} | ${escapeCell(payload.chinese)} | ${row[5]} |`;
    updated = true;
    break;
  }
  if (!updated) throw new Error("未在原始 Markdown 中找到该歌词行");
  fs.writeFileSync(sourcePath, lines.join("\n"), "utf8");

  run("python3", ["Hamilton/scripts/build-lyrics-data-from-md.py"]);
  const englishChanged = String(payload.previousEnglish || "") !== payload.english;
  if (englishChanged) {
    run("python3", ["Hamilton/scripts/build-word-data.py"]);
    const id = `ham-${String(order).padStart(2, "0")}-${String(lineIndex).padStart(3, "0")}`;
    run(process.execPath, ["Hamilton/scripts/build-audio.js", "--force", `--ids=${id}`]);
  }
  return { englishChanged };
}

function regression() {
  const commands = [
    [process.execPath, ["--check", "Hamilton/script.js"]],
    [process.execPath, ["--test", "Hamilton/tests/behavior.test.js"]],
    [process.execPath, ["shared/validate-audio-library.js", "--show=Hamilton"]],
  ];
  const summary = [];
  for (const [command, args] of commands) summary.push(run(command, args));
  return summary.join("\n\n");
}

function isLocal(request) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress);
}

function serveStatic(request, response) {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = path.resolve(musicalsRoot, relative);
  if (!target.startsWith(`${musicalsRoot}${path.sep}`) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    response.writeHead(404); response.end("Not found"); return;
  }
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".mp3": "audio/mpeg" };
  response.writeHead(200, { "content-type": `${types[path.extname(target)] || "application/octet-stream"}; charset=utf-8` });
  fs.createReadStream(target).pipe(response);
}

http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname.startsWith("/__lyrics-editor/")) {
    if (!isLocal(request)) return send(response, 403, { error: "仅允许本机访问" });
    if (request.method !== "POST") return send(response, 405, { error: "仅支持 POST" });
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        if (url.pathname.endsWith("/line")) {
          const result = saveLine(payload);
          return send(response, 200, { ok: true, message: result.englishChanged ? "已保存；词卡与本句音频已重建。" : "已保存；音频无需重建。" });
        }
        if (url.pathname.endsWith("/regression")) return send(response, 200, { ok: true, summary: regression() });
        return send(response, 404, { error: "未知编辑接口" });
      } catch (error) { return send(response, 400, { error: error.message }); }
    });
    return;
  }
  serveStatic(request, response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Hamilton 本地校对模式：http://127.0.0.1:${port}/Hamilton/index.html?editor=1`);
});
