"""Explicit-install helpers: pinned snapshot download and local digest computation.

`download` is the only network path in this package and is invoked by
`sks decision install` alone. The resident worker never imports it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

TOKENIZER_FILES = (
    "tokenizer.json", "tokenizer_config.json", "vocab.json", "merges.txt",
    "special_tokens_map.json", "added_tokens.json", "chat_template.jinja",
)
WEIGHT_PATTERNS = ("*.safetensors", "*.safetensors.index.json")
CONFIG_FILES = ("config.json", "generation_config.json")
LICENSE_FILES = ("LICENSE", "LICENSE.md", "LICENSE.txt", "README.md")
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def digest_files(snapshot: Path, names: list[str]) -> str:
    """sha256 over `name\\0sha256(file)\\n` for the sorted existing files (shared with TS install.ts)."""
    digest = hashlib.sha256()
    for name in sorted(names):
        path = snapshot / name
        if not path.is_file():
            continue
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(sha256_file(path).encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def tokenizer_digest(snapshot: Path) -> str:
    return digest_files(snapshot, list(TOKENIZER_FILES))


def weight_manifest_digest(snapshot: Path) -> str:
    names = sorted(p.name for p in snapshot.iterdir() if p.is_file() and (p.suffix == ".safetensors" or p.name.endswith(".safetensors.index.json")))
    return digest_files(snapshot, names)


def _download(args: argparse.Namespace) -> int:
    if not COMMIT_RE.match(args.revision):
        print(json.dumps({"ok": False, "error": "revision_must_be_commit_sha"}))
        return 2
    try:
        from huggingface_hub import snapshot_download
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"huggingface_hub_import_failed:{type(error).__name__}"}))
        return 1
    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)
    allow = list(args.allow_pattern) if args.allow_pattern else list(WEIGHT_PATTERNS) + list(TOKENIZER_FILES) + list(CONFIG_FILES) + list(LICENSE_FILES)
    try:
        path = snapshot_download(
            repo_id=args.repo,
            revision=args.revision,
            local_dir=str(dest),
            allow_patterns=allow,
        )
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"snapshot_download_failed:{type(error).__name__}:{str(error)[:200]}"}))
        return 1
    files = []
    for entry in sorted(Path(path).iterdir()):
        if entry.name == ".cache" or not entry.is_file():
            continue
        files.append({"name": entry.name, "size": entry.stat().st_size})
    print(json.dumps({"ok": True, "path": str(path), "files": files}))
    return 0


def _digests(args: argparse.Namespace) -> int:
    snapshot = Path(args.dir)
    print(json.dumps({
        "ok": True,
        "tokenizerDigest": tokenizer_digest(snapshot),
        "weightManifestDigest": weight_manifest_digest(snapshot),
    }))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sks_local_decision.snapshot")
    sub = parser.add_subparsers(dest="command", required=True)
    download = sub.add_parser("download")
    download.add_argument("--repo", required=True)
    download.add_argument("--revision", required=True)
    download.add_argument("--dest", required=True)
    download.add_argument("--allow-pattern", action="append")
    download.set_defaults(func=_download)
    digests = sub.add_parser("digests")
    digests.add_argument("--dir", required=True)
    digests.set_defaults(func=_digests)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
