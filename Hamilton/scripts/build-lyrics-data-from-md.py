from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_MD = ROOT.parent.parent / "lyrics" / "Hamilton (Original Broadway Cast Recording) (3367211).md"
OUTPUT_JS = ROOT / "lyrics-data.js"
REFERENCE_ROOT = ROOT.parent.parent / "outputs" / "musicals" / "Hamilton"
ACT_ONE_SCRIPT_MD = REFERENCE_ROOT / "script.md"
ALL_LYRICS_MD = REFERENCE_ROOT / "lyrics" / "Hamilton 全曲目歌词.md"

SONG_HEADING_RE = re.compile(r"^##\s+(\d+)\.\s+(.+?)\s*$")
TABLE_ROW_RE = re.compile(r"^\|(.+)\|\s*$")
REFERENCE_HEADING_RE = re.compile(r"^##\s+(\d+)\s+(.+?)\s*$")
SCRIPT_HEADING_RE = re.compile(r"^(\d+)\.\s+(.+?)\s*$")
BRACKETED_SPEAKER_RE = re.compile(r"^\[([^\]]{1,100})\]$")
COLON_SPEAKER_RE = re.compile(
    r"^((?:HAMILTON|BURR|LAURENS|LAFAYETTE|MULLIGAN|WASHINGTON|ANGELICA|"
    r"ELIZA|PEGGY|COMPANY|ENSEMBLE|WOMEN|MEN|KING GEORGE|SEABURY|LEE|"
    r"JEFFERSON|MADISON|REYNOLDS|PHILIP|EAKER|SCHUYLER SISTERS|CHOIRS|"
    r"BOTH|MARIA|JAMES|FULL COMPANY|FULL ENSEMBLE|DOCTOR|GEORGE|DOLLY|"
    r"MARTHA|MALE COMPANY|FEMALE VOTER|MALE VOTER)"
    r"(?:[ /,&()+.'’-].*)?):$",
    re.IGNORECASE,
)
SCRIPT_SPEAKER_RE = re.compile(
    r"^(?=.*(?:HAMILTON|BURR|LAURENS|LAFAYETTE|MULLIGAN|WASHINGTON|"
    r"ANGELICA|ELIZA|PEGGY|COMPANY|ENSEMBLE|WOMEN|MEN|KING|SEABURY|LEE|"
    r"JEFFERSON|MADISON|REYNOLDS|PHILIP|EAKER|SCHUYLER|CHOIR|BOTH|MARIA|"
    r"JAMES|FULL))[A-Z0-9 /,&.'’+\-]{2,100}$"
)
LEADING_SPEAKER_RE = re.compile(
    r"^([A-Z][A-Z0-9 /,&.'’+\-]{1,80}):\s*(.*)$"
)
GLUED_SPEAKER_FOOTNOTE_RE = re.compile(r"(?<=[A-Z])\d+$")
LEADING_BRACKETED_METADATA_RE = re.compile(r"^\s*[\[\(\{【（]([^\]\)\}】）]{1,100})[\]\)\}】）]\s*")
LEADING_UNBRACKETED_SPEAKER_RE = re.compile(r"^\s*([A-Za-z][A-Za-z .&/'‘’\-]{0,99})(?:\]|:)\s*")
SPEAKER_LABELS = {
    "HAMILTON", "BURR", "LAURENS", "LAFAYETTE", "MULLIGAN", "WASHINGTON",
    "ANGELICA", "ELIZA", "PEGGY", "COMPANY", "ENSEMBLE", "WOMEN", "MEN",
    "KING GEORGE", "SEABURY", "LEE", "JEFFERSON", "MADISON", "REYNOLDS",
    "PHILIP", "EAKER", "SCHUYLER SISTERS", "CHOIRS", "BOTH", "MARIA", "JAMES",
    "FULL COMPANY", "FULL ENSEMBLE", "DOCTOR", "GEORGE", "DOLLY", "MARTHA",
    "MALE COMPANY", "FEMALE VOTER", "MALE VOTER", "AARON BURR",
    "ALEXANDER HAMILTON", "THOMAS JEFFERSON", "JAMES MADISON",
}
SPEAKER_LABELS_ZH = {"伯尔", "杰斐逊", "麦迪逊", "杰斐逊和伯尔", "杰斐逊/麦迪逊/伯尔"}
SPEAKER_OVERRIDES = {
    32: {
        **{str(line_index): ["HAMILTON"] for line_index in range(61, 66)},
        **{str(line_index): ["HAMILTON", "WASHINGTON"] for line_index in range(66, 77)},
        "80": ["COMPANY"],
        "82": ["COMPANY"],
        "84": ["COMPANY"],
        "86": ["COMPANY"],
    },
}


def split_markdown_row(line: str) -> list[str]:
    match = TABLE_ROW_RE.match(line)
    if not match:
        return []

    cells: list[str] = []
    current: list[str] = []
    escaped = False
    for char in match.group(1):
        if escaped:
            current.append(char)
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if char == "|":
            cells.append("".join(current).strip())
            current = []
            continue
        current.append(char)

    cells.append("".join(current).strip())
    return cells


def is_separator_row(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)


def slugify(value: str) -> str:
    value = value.lower().replace("#", "number")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "song"


def lyric_tokens(value: str) -> list[str]:
    value = value.lower().replace("’", "'").replace("‘", "'")
    return re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", value)


def normalize_speaker(value: str) -> str:
    value = re.sub(r"\s+", " ", value.strip().upper())
    # The Act I reference occasionally glues a citation number directly to a
    # role label (for example, ANGELICA42). Keep intentional labels such as
    # ENSEMBLE 1 intact because their number is separated by whitespace.
    value = GLUED_SPEAKER_FOOTNOTE_RE.sub("", value)
    aliases = {
        "AARON BURR": "BURR",
        "ALEXANDER HAMILTON": "HAMILTON",
        "ELIZA HAMILTON": "ELIZA",
        "JAMES MADISON": "MADISON",
        "JOHN LAURENS": "LAURENS",
        "THOMAS JEFFERSON": "JEFFERSON",
    }
    value = aliases.get(value, value)
    return value.replace(" & ", "/").replace(", & ", "/").replace(", ", "/")


def is_speaker_label(value: str) -> bool:
    normalized = re.sub(r"\s+", " ", value.strip("'‘’ ").upper())
    if value.strip() in SPEAKER_LABELS_ZH:
        return True
    if normalized in SPEAKER_LABELS:
        return True
    parts = [part.strip() for part in re.split(r"\s*(?:/|&| AND|,|、)\s*", normalized) if part.strip()]
    return len(parts) > 1 and all(part in SPEAKER_LABELS for part in parts)


def strip_line_metadata(value: str) -> str:
    """Keep leading timestamps and confirmed role labels out of lyric fields."""
    value = value.strip()
    while True:
        timestamp_match = re.match(r"^\[(?:\d{1,2}:\d{2}(?:\.\d+)?)\]\s*", value)
        if timestamp_match:
            value = value[timestamp_match.end():].strip()
            continue
        marker_match = LEADING_BRACKETED_METADATA_RE.match(value)
        if marker_match and is_speaker_label(marker_match.group(1)):
            remainder = value[marker_match.end():].strip()
            if not remainder:
                return "" if value.startswith(("[", "{")) else value
            value = remainder
            continue
        bare_match = LEADING_UNBRACKETED_SPEAKER_RE.match(value)
        if bare_match and is_speaker_label(bare_match.group(1)):
            value = value[bare_match.end():].strip()
            continue
        return value


def parse_act_one_reference(markdown: str) -> dict[int, list[dict[str, str]]]:
    songs: dict[int, list[dict[str, str]]] = {}
    current_order = 0
    current_speaker = ""
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        heading = SCRIPT_HEADING_RE.match(line)
        if heading and 1 <= int(heading.group(1)) <= 23:
            current_order = int(heading.group(1))
            songs[current_order] = []
            current_speaker = ""
            continue
        if not current_order or not line:
            continue
        if line.startswith(("Send corrections", "<strong>", "Musicals >")):
            continue
        if SCRIPT_SPEAKER_RE.match(line) and len(line.split()) <= 8:
            current_speaker = normalize_speaker(line)
            continue
        line = re.sub(r"(?<=[!?….”'])\d+$", "", line)
        songs[current_order].append({"text": line, "speaker": current_speaker})
    return songs


def parse_album_reference(markdown: str) -> dict[int, list[dict[str, str]]]:
    songs: dict[int, list[dict[str, str]]] = {}
    current_order = 0
    current_speaker = ""
    skip_title = False
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        heading = REFERENCE_HEADING_RE.match(line)
        if heading:
            current_order = int(heading.group(1))
            songs[current_order] = []
            current_speaker = ""
            skip_title = True
            continue
        if not current_order or not line:
            continue
        if skip_title:
            skip_title = False
            continue
        speaker_match = BRACKETED_SPEAKER_RE.match(line) or COLON_SPEAKER_RE.match(line)
        if speaker_match:
            candidate = normalize_speaker(speaker_match.group(1))
            if candidate != "SIMULTANEOUSLY":
                current_speaker = candidate
            continue
        if re.search(r"\bLyrics$", line) and len(line) < 80:
            continue
        if line.startswith(("Send corrections", "Musicals >")):
            continue
        songs[current_order].append({"text": line, "speaker": current_speaker})
    return songs


def nearest_reference_speaker(
    reference_speakers: list[str],
    position: int,
) -> str:
    if not reference_speakers:
        return ""
    position = max(0, min(position, len(reference_speakers) - 1))
    if reference_speakers[position]:
        return reference_speakers[position]
    for distance in range(1, len(reference_speakers)):
        for candidate in (position - distance, position + distance):
            if 0 <= candidate < len(reference_speakers) and reference_speakers[candidate]:
                return reference_speakers[candidate]
    return ""


def align_speakers(
    rows: list[dict[str, str]],
    reference_songs: dict[int, list[dict[str, str]]],
) -> None:
    rows_by_song: dict[int, list[dict[str, str]]] = {}
    for row in rows:
        rows_by_song.setdefault(int(row["song_order"]), []).append(row)

    for order, song_rows in rows_by_song.items():
        reference_lines = reference_songs.get(order, [])
        if not reference_lines:
            raise RuntimeError(f"Missing speaker reference for Hamilton track {order}")

        source_tokens: list[str] = []
        source_owners: list[int] = []
        source_centers: list[float] = []
        for row_index, row in enumerate(song_rows):
            tokens = lyric_tokens(row["english"])
            start = len(source_tokens)
            source_tokens.extend(tokens)
            source_owners.extend([row_index] * len(tokens))
            source_centers.append(start + max(len(tokens) - 1, 0) / 2)

        reference_tokens: list[str] = []
        reference_speakers: list[str] = []
        for reference_line in reference_lines:
            tokens = lyric_tokens(reference_line["text"])
            reference_tokens.extend(tokens)
            reference_speakers.extend([reference_line["speaker"]] * len(tokens))

        hits: list[list[str]] = [[] for _ in song_rows]
        matched_positions: list[tuple[int, int]] = []
        matcher = SequenceMatcher(None, source_tokens, reference_tokens, autojunk=False)
        for source_start, reference_start, size in matcher.get_matching_blocks():
            for offset in range(size):
                source_position = source_start + offset
                reference_position = reference_start + offset
                matched_positions.append((source_position, reference_position))
                speaker = reference_speakers[reference_position]
                if speaker:
                    hits[source_owners[source_position]].append(speaker)

        for row_index, row in enumerate(song_rows):
            override = SPEAKER_OVERRIDES.get(order, {}).get(row["line_index"])
            if override:
                row["speakers"] = override
                continue
            explicit = LEADING_SPEAKER_RE.match(row["english"])
            if explicit:
                row["speakers"] = [normalize_speaker(explicit.group(1))]
                continue

            counts = {speaker: hits[row_index].count(speaker) for speaker in set(hits[row_index])}
            if counts:
                row["speakers"] = [
                    speaker
                    for speaker, count in sorted(counts.items(), key=lambda item: -item[1])
                    if count >= max(counts.values()) * 0.35
                ]
                continue

            center = source_centers[row_index]
            if matched_positions:
                source_position, reference_position = min(
                    matched_positions,
                    key=lambda item: abs(item[0] - center),
                )
                estimated = round(reference_position + center - source_position)
            else:
                estimated = 0
            speaker = nearest_reference_speaker(reference_speakers, estimated)
            row["speakers"] = [speaker] if speaker else []

        missing = [row["line_index"] for row in song_rows if not row["speakers"]]
        if missing:
            raise RuntimeError(
                f"Missing aligned speakers for Hamilton track {order}, lines {', '.join(missing)}"
            )
        contaminated = [
            f"{row['line_index']}:{speaker}"
            for row in song_rows
            for speaker in row["speakers"]
            if GLUED_SPEAKER_FOOTNOTE_RE.search(speaker)
        ]
        if contaminated:
            raise RuntimeError(
                f"Speaker labels still contain glued footnotes for Hamilton track {order}: "
                + ", ".join(contaminated)
            )


def load_speaker_references() -> dict[int, list[dict[str, str]]]:
    act_one = parse_act_one_reference(ACT_ONE_SCRIPT_MD.read_text(encoding="utf-8"))
    album = parse_album_reference(ALL_LYRICS_MD.read_text(encoding="utf-8"))
    references = {**act_one, **{order: album[order] for order in range(24, 47)}}
    if set(references) != set(range(1, 47)):
        raise RuntimeError("Hamilton speaker references must cover exactly tracks 1-46")
    return references


def parse_rows(markdown: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    current_order = ""
    current_title = ""
    current_zh_title = ""
    headers: list[str] = []

    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        heading = SONG_HEADING_RE.match(line)
        if heading:
            current_order, current_title = heading.groups()
            current_zh_title = ""
            headers = []
            continue

        if line.startswith("中文歌名："):
            current_zh_title = line.removeprefix("中文歌名：").strip()
            if current_zh_title == "未提供":
                current_zh_title = ""
            continue

        cells = split_markdown_row(line)
        if not cells or is_separator_row(cells):
            continue

        if cells[:5] == ["行号", "英文歌词（校订）", "英文音标（IPA）", "中文翻译（校订）", "备注"]:
            headers = cells
            continue

        if len(cells) < 5 or not headers or not current_order or not current_title:
            continue

        line_index, english, ipa, chinese, note = cells[:5]
        english = strip_line_metadata(english)
        ipa = strip_line_metadata(ipa)
        chinese = strip_line_metadata(chinese)
        if not line_index.isdigit() or not english:
            continue

        rows.append(
            {
                "song_order": str(int(current_order)),
                "song_title": current_title,
                "song_title_zh": current_zh_title,
                "song_id": slugify(f"{int(current_order):02d}-{current_title}"),
                "line_index": str(int(line_index)),
                "english": english,
                "ipa": ipa,
                "chinese_translation": chinese,
                "note": note,
                "source_file": SOURCE_MD.name,
            }
        )

    return rows


def main() -> None:
    markdown = SOURCE_MD.read_text(encoding="utf-8")
    rows = parse_rows(markdown)
    align_speakers(rows, load_speaker_references())
    song_count = len({row["song_order"] for row in rows})

    payload = "window.hamiltonLyricsRows = "
    payload += json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    payload += ";\n"
    OUTPUT_JS.write_text(payload, encoding="utf-8")

    print(f"Wrote {OUTPUT_JS} with {len(rows)} rows from {song_count} songs")


if __name__ == "__main__":
    main()
