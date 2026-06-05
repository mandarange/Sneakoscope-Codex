#!/usr/bin/env python3
import json
import sys


def main():
    for line in sys.stdin:
        if not line.strip():
            continue
        event = json.loads(line)
        print(json.dumps({
            "schema": "sks.python-codex-sdk-event.v1",
            "event_type": event.get("event", "unknown"),
            "thread_id": event.get("thread_id"),
            "turn_id": event.get("turn_id"),
            "status": event.get("status"),
            "message": event.get("message"),
        }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
