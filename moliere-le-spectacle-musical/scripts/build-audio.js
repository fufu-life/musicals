const path = require("node:path");
const { runBuild } = require(path.resolve(__dirname, "..", "..", "shared", "build-natural-audio.js"));

runBuild({
  root: path.resolve(__dirname, ".."),
  voice: process.env.MUSICAL_TTS_VOICE || "Audrey",
  rate: Number(process.env.MUSICAL_TTS_RATE || "0.48"),
  kind: "generated",
});
