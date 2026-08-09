from __future__ import annotations

import os
from pathlib import Path
from typing import Sequence


def write_or_check(
    path: Path,
    content: str,
    arguments: Sequence[str],
    *,
    label: str,
) -> bool:
    if not content.strip():
        raise RuntimeError(f"{label}: refusing to write empty generated content")

    write_requested = "--write" in arguments
    current = path.read_text(encoding="utf-8") if path.exists() else None
    if not write_requested:
        if current != content:
            raise RuntimeError(
                f"{label} is stale; check mode did not write anything. "
                "Review the diff, then rerun with --write."
            )
        print(f"Checked {path}: up to date")
        return False

    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(content, encoding="utf-8")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    return current != content
