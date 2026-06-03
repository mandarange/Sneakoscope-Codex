#!/usr/bin/env python3
"""Side-effect-zero JSONL summary helper for local diagnostics."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "usage: jsonl_summary.py <file>"}))
        return 2
    target = Path(sys.argv[1])
    count = 0
    keys: set[str] = set()
    try:
        with target.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                count += 1
                try:
                    parsed = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    keys.update(str(key) for key in parsed.keys())
    except OSError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1
    print(json.dumps({"ok": True, "lines": count, "keys": sorted(keys)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
