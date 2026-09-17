"""NDJSON worker protocol v1 (stdin frames in, stdout frames out).

stdout carries protocol frames only. Diagnostics go to stderr and never
include the request summary. One frame is at most 64 KiB.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Protocol, TextIO

PROTOCOL_VERSION = 1
MAX_LINE_BYTES = 64 * 1024

from .schemas import SchemaError, validate_input


class DecisionEngine(Protocol):
    def infer(self, decision_input: dict) -> dict: ...


class ProtocolError(ValueError):
    pass


def encode_frame(frame: dict) -> str:
    line = json.dumps({"protocolVersion": PROTOCOL_VERSION, **frame}, separators=(",", ":"), ensure_ascii=True)
    if len(line.encode("utf-8")) > MAX_LINE_BYTES:
        raise ProtocolError("frame_too_large")
    return line


def parse_frame(line: str) -> dict:
    if len(line.encode("utf-8")) > MAX_LINE_BYTES:
        raise ProtocolError("frame_too_large")
    try:
        frame = json.loads(line)
    except json.JSONDecodeError as error:
        raise ProtocolError("malformed_json") from error
    if not isinstance(frame, dict) or frame.get("protocolVersion") != PROTOCOL_VERSION:
        raise ProtocolError("protocol_version")
    if not isinstance(frame.get("type"), str):
        raise ProtocolError("frame_type")
    return frame


def ready_frame(generation_id: str, model: dict, real_model_verified: bool, warmup: dict, load_ms: float | None) -> dict:
    return {
        "type": "ready",
        "generationId": generation_id,
        "realModelVerified": bool(real_model_verified),
        "model": model,
        "warmup": warmup,
        "loadMs": load_ms,
    }


def result_frame(generation_id: str, request_id: str, result: dict) -> dict:
    return {"type": "result", "generationId": generation_id, "requestId": request_id, "result": result}


def error_frame(generation_id: str, request_id: str | None, reason: str) -> dict:
    return {"type": "error", "generationId": generation_id, "requestId": request_id, "reason": reason}


def unavailable(request_id: str, reason: str) -> dict:
    return {"status": "unavailable", "requestId": request_id, "reason": reason}


def serve(engine: DecisionEngine, generation_id: str, stdin: TextIO, stdout: TextIO, stderr: TextIO = sys.stderr) -> int:
    """Blocking frame loop. Returns the process exit code."""

    def emit(frame: dict) -> None:
        stdout.write(encode_frame(frame) + "\n")
        stdout.flush()

    for raw in stdin:
        line = raw.rstrip("\r\n")
        if not line.strip():
            continue
        try:
            frame = parse_frame(line)
        except ProtocolError as error:
            emit(error_frame(generation_id, None, f"protocol:{error}"))
            continue
        kind = frame["type"]
        if kind == "ping":
            emit({"type": "pong", "generationId": generation_id})
            continue
        if kind == "shutdown":
            return 0
        if kind != "infer":
            emit(error_frame(generation_id, None, f"unknown_frame:{kind}"))
            continue
        request_id = frame.get("requestId") if isinstance(frame.get("requestId"), str) else None
        try:
            decision_input = validate_input(frame.get("input"))
        except SchemaError as error:
            if request_id:
                emit(result_frame(generation_id, request_id, unavailable(request_id, "invalid_request")))
            else:
                emit(error_frame(generation_id, None, f"invalid_request:{error.code}"))
            continue
        if decision_input["requestId"] != request_id:
            emit(error_frame(generation_id, request_id, "request_id_mismatch"))
            continue
        try:
            result = engine.infer(decision_input)
        except MemoryError:
            result = unavailable(request_id, "oom")
        except Exception as error:  # noqa: BLE001 - the broker must always get a typed answer
            stderr.write(f"sks_local_decision: inference failed: {type(error).__name__}\n")
            stderr.flush()
            reason = "oom" if "out of memory" in str(error).lower() else "worker_crashed"
            result = unavailable(request_id, reason)
        emit(result_frame(generation_id, request_id, result))
    return 0
