#!/usr/bin/env python3
"""Extract the lyric-only portion of the reviewed Hamilton cut-song sources."""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from html import unescape
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT.parents[1] / "outputs" / "musicals" / "Hamilton" / "lyrics"
OUTPUT = ROOT / "cut-song-source.json"

SOURCES = [
    ("47", "No John Trumbull", "51 No John Trumbull.md", "No John Trumbull (Off-Broadway)"),
    ("48", "Let It Go", "52 Let It Go.md", "Let It Go (Off-Broadway)"),
    ("49", "One Last Ride", "53 One Last Ride.md", "One Last Ride"),
    ("50", "Congratulations", "54 Congratulations.md", "Congratulations (Off-Broadway)"),
    ("51", "Dear Theodosia (Reprise)", "55 Dear Theodosia (Reprise).md", "Dear Theodosia (Reprise) (Off-Broadway)"),
    ("52", "Stay Alive, Philip", "56 Stay Alive, Philip.md", "Stay Alive Philip"),
    ("53", "Ten Things, One Thing", "57 Ten Things One Thing.md", "Ten Things, One Thing"),
]

SPEAKER_RE = re.compile(r"^\[([^]]+):\]$")


def fetch_reviewed_lines(page: str) -> list[dict[str, str]]:
    query = urllib.parse.urlencode(
        {"action": "parse", "page": page, "prop": "wikitext", "format": "json", "origin": "*"}
    )
    request = urllib.request.Request(
        f"https://hamiltonmusical.fandom.com/api.php?{query}",
        headers={"User-Agent": "Hamilton lyric source audit/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        wikitext = json.load(response)["parse"]["wikitext"]["*"]
    section = wikitext.split("<poem>", 1)[1].split("</poem>", 1)[0]

    speaker = ""
    entries: list[dict[str, str]] = []
    for raw_line in section.splitlines():
        if raw_line.strip().startswith("''") and not raw_line.strip().startswith("'''["):
            continue
        line = re.sub(r"<[^>]+>", " ", raw_line)
        line = unescape(line.replace("&mdash;", "—"))
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        match = re.fullmatch(r"'{3}\[([^]]+)]'{3}", line)
        if match:
            speaker = match.group(1).strip()
            continue
        trailing_speaker = re.search(r"\s*'{3}\[([^]]+)]'{3}\s*$", line)
        next_speaker = ""
        if trailing_speaker:
            next_speaker = trailing_speaker.group(1).strip()
            line = line[: trailing_speaker.start()].strip()
        line = line.replace("'''", "").strip()
        if not line or line.startswith("{|") or line.startswith("|") or (
            line.startswith("[") and line.endswith("]")
        ):
            if next_speaker:
                speaker = next_speaker
            continue
        if speaker:
            entries.append({"speaker": speaker, "english": line})
        if next_speaker:
            speaker = next_speaker
    if not entries:
        raise RuntimeError(f"{page}: no reviewed lyrics extracted")
    return entries


def extract_song(order: str, title: str, filename: str, page: str) -> dict[str, object]:
    text = (SOURCE_ROOT / filename).read_text(encoding="utf-8")
    lyric_block = text.split("## 歌词 (Lyrics)", 1)[1].split("Allmusicals bot ADAPT", 1)[0]
    lines = [line.strip() for line in lyric_block.splitlines()]

    while lines and not lines[0]:
        lines.pop(0)
    if lines and not SPEAKER_RE.match(lines[0]):
        lines.pop(0)

    speaker = ""
    entries: list[dict[str, str]] = []
    for line in lines:
        if not line:
            continue
        match = SPEAKER_RE.match(line)
        if match:
            speaker = match.group(1).strip()
            continue
        if not speaker:
            raise RuntimeError(f"{filename}: lyric without speaker: {line}")
        entries.append({"speaker": speaker, "english": line})

    if not entries:
        raise RuntimeError(f"{filename}: no lyrics extracted")
    reviewed = fetch_reviewed_lines(page)
    return {
        "order": order,
        "title": title,
        "source_file": filename,
        "review_page": f"https://hamiltonmusical.fandom.com/wiki/{page.replace(' ', '_')}",
        "local_source_line_count": len(entries),
        "lines": reviewed,
    }


def main() -> None:
    songs = [extract_song(*source) for source in SOURCES]
    OUTPUT.write_text(json.dumps(songs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(songs)} songs and {sum(len(song['lines']) for song in songs)} lines")


if __name__ == "__main__":
    main()
