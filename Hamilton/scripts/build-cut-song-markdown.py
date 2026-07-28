#!/usr/bin/env python3
"""Build the reviewed Hamilton cut-song Markdown before page/audio generation."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "cut-song-source.json"
WORD_DATA = ROOT / "word-data.js"
OUTPUT = ROOT.parents[1] / "lyrics" / "Hamilton 删减曲歌词.md"
TRANSLATION_PARTS = [
    ROOT / "cut-translations-part-a.json",
    ROOT / "cut-translations-part-b.json",
    ROOT / "cut-translations-part-c.json",
]
TOKEN_RE = re.compile(r"[\w]+(?:['’][\w]+)?(?:-[\w]+)*", re.UNICODE)
TITLE_ZH = {
    "No John Trumbull": "绝非约翰·特朗布尔的画",
    "Let It Go": "放下吧",
    "One Last Ride": "最后一次同行",
    "Congratulations": "恭喜",
    "Dear Theodosia (Reprise)": "亲爱的西奥多西娅（重唱）",
    "Stay Alive, Philip": "活下去，菲利普",
    "Ten Things, One Thing": "十件事，一件事",
}


def load_translations(songs: list[dict[str, object]]) -> dict[str, list[str]]:
    translations: dict[str, list[str]] = {}
    for path in TRANSLATION_PARTS:
        if not path.exists():
            raise RuntimeError(f"Missing reviewed translation part: {path.name}")
        part = json.loads(path.read_text(encoding="utf-8"))
        overlap = set(translations) & set(part)
        if overlap:
            raise RuntimeError(f"Duplicate translated song orders: {', '.join(sorted(overlap))}")
        translations.update(part)

    expected_orders = {str(song["order"]) for song in songs}
    if set(translations) != expected_orders:
        raise RuntimeError(
            f"Translation orders must be {sorted(expected_orders)}, got {sorted(translations)}"
        )
    for song in songs:
        order = str(song["order"])
        values = translations[order]
        if len(values) != len(song["lines"]):
            raise RuntimeError(
                f"Translation alignment failed for {order}: expected {len(song['lines'])}, got {len(values)}"
            )
        bad = [
            str(index + 1)
            for index, value in enumerate(values)
            if not str(value).strip() or re.search(r"待校对|暂未|占位|placeholder", str(value), re.I)
        ]
        if bad:
            raise RuntimeError(f"Invalid translations for {order}, lines {', '.join(bad)}")
    return translations


def normalize_token(token: str) -> str:
    return token.lower().replace("’", "'")


def broad_ipa(value: str) -> str:
    return (
        value.strip().strip("/")
        .replace("ˈ", "")
        .replace("ˌ", "")
        .replace("ɐ", "ə")
        .replace("ᵻ", "ɪ")
        .replace("ʔ", "t")
    )


def load_word_entries() -> dict[str, dict[str, str]]:
    prefix = "window.hamiltonWordEntries = "
    text = WORD_DATA.read_text(encoding="utf-8").strip()
    if not text.startswith(prefix):
        raise RuntimeError(f"{WORD_DATA} does not contain Hamilton word data")
    return json.loads(text[len(prefix) :].strip().removesuffix(";"))


def line_ipa(english: str, word_entries: dict[str, dict[str, str]]) -> str:
    tokens = TOKEN_RE.findall(english)
    if not tokens:
        return ""
    parts = []
    for token in tokens:
        entry = word_entries.get(normalize_token(token))
        if entry and entry.get("ipa"):
            parts.append(broad_ipa(entry["ipa"]))
            continue
        result = subprocess.run(
            ["espeak-ng", "-q", "--ipa=3", "-v", "en-us", "--", token],
            check=True,
            capture_output=True,
            text=True,
        )
        parts.append(broad_ipa(result.stdout.replace("\u200d", "")))
    return f"/{' '.join(parts)}/"


def escape_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def main() -> None:
    songs = json.loads(SOURCE.read_text(encoding="utf-8"))
    translations = load_translations(songs)
    word_entries = load_word_entries()
    output = [
        "# Hamilton 删减／早期版本歌词（校订）",
        "",
        "> 独立于 46 首原声专辑曲目。歌词按 Off-Broadway、Soundboard 或早期版本页面逐首校对；角色标签不参与发音。",
        "",
    ]
    for song in songs:
        output.extend(
            [
                f"## {int(song['order']):02d}. {song['title']}",
                "",
                f"中文歌名：{TITLE_ZH[song['title']]}",
                "",
                f"校对来源：{song['review_page']}",
                "",
                "| 行号 | 角色 | 英文歌词（校订） | 英文音标（IPA） | 中文翻译（校订） | 备注 |",
                "|---:|---|---|---|---|---|",
            ]
        )
        song_translations = translations[str(song["order"])]
        for index, line in enumerate(song["lines"], 1):
            english = line["english"]
            output.append(
                "| "
                + " | ".join(
                    [
                        str(index),
                        escape_cell(line["speaker"]),
                        escape_cell(english),
                        escape_cell(line_ipa(english, word_entries)),
                        escape_cell(song_translations[index - 1]),
                        "",
                    ]
                )
                + " |"
            )
        output.append("")
    OUTPUT.write_text("\n".join(output), encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(songs)} songs and {sum(len(song['lines']) for song in songs)} lines")


if __name__ == "__main__":
    main()
