"""Resident worker entrypoint.

    python -I -m sks_local_decision.worker --snapshot <dir> --receipt <file>

The install receipt (an SKS-owned private file) supplies model evidence. The
worker recomputes the tokenizer digest from the snapshot and refuses to start
on a mismatch, loads the model once, runs the warm-up, then serves frames.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import signal
import sys
from pathlib import Path

from . import ENGINE_VERSION, IMPLEMENTATION_ORIGIN
from .protocol import encode_frame, ready_frame, serve
from .snapshot import tokenizer_digest


def _fatal(out, reason: str) -> int:
    out.write(encode_frame({"type": "fatal", "reason": reason}) + "\n")
    out.flush()
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sks_local_decision.worker")
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--receipt", required=True)
    args = parser.parse_args(argv)

    # Protocol frames go to the original stdout; anything a library prints is
    # redirected to stderr so it can never corrupt a frame.
    protocol_out = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr

    generation_id = f"{os.getpid()}-{secrets.token_hex(4)}"
    try:
        receipt = json.loads(Path(args.receipt).read_text(encoding="utf-8"))
    except Exception as error:  # noqa: BLE001
        return _fatal(protocol_out, f"receipt_unreadable:{type(error).__name__}")
    snapshot = Path(args.snapshot)
    try:
        if Path(receipt["localSnapshotPath"]).resolve() != snapshot.resolve():
            return _fatal(protocol_out, "receipt_snapshot_mismatch")
        if receipt["engineVersion"] != ENGINE_VERSION:
            return _fatal(protocol_out, "engine_version_mismatch")
        if receipt["implementationOrigin"] != IMPLEMENTATION_ORIGIN:
            return _fatal(protocol_out, "implementation_origin_mismatch")
        model_evidence = {
            "modelId": receipt["modelId"],
            "modelRevision": receipt["modelRevision"],
            "engineVersion": receipt["engineVersion"],
            "tokenizerDigest": receipt["tokenizerDigest"],
            "quantization": receipt["quantization"],
            "implementationOrigin": receipt["implementationOrigin"],
        }
    except (KeyError, TypeError):
        return _fatal(protocol_out, "receipt_invalid")
    if not snapshot.is_dir():
        return _fatal(protocol_out, "model_missing")
    if tokenizer_digest(snapshot) != model_evidence["tokenizerDigest"]:
        return _fatal(protocol_out, "tokenizer_digest_mismatch")

    try:
        from .engine import MlxDecisionEngine
        engine = MlxDecisionEngine(str(snapshot), model_evidence)
        engine.load()
        warmup = engine.warmup()
    except Exception as error:  # noqa: BLE001
        sys.stderr.write(f"sks_local_decision: load failed: {type(error).__name__}: {str(error)[:300]}\n")
        return _fatal(protocol_out, f"model_load_failed:{type(error).__name__}")

    real_model_verified = bool(warmup.get("argmaxEqual")) and warmup.get("maxAbsProbabilityDiff") is not None
    protocol_out.write(encode_frame(ready_frame(generation_id, model_evidence, real_model_verified, warmup, engine.load_ms)) + "\n")
    protocol_out.flush()

    def _terminate(_signum, _frame):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, _terminate)
    return serve(engine, generation_id, sys.stdin, protocol_out, sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
