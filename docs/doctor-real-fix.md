# Doctor Real Fix

SKS 1.20.2 `sks doctor` reports Codex CLI availability, Codex App readiness, codex-lb health, Zellij dependency readiness, and Codex project config readability separately.

`sks doctor --fix` still runs setup, then runs the Codex config repair transaction and writes `doctor-ready-breakdown.json`. Ready is not true unless Codex CLI exists and actual Codex config-load evidence passes; Codex App and codex-lb gaps are surfaced separately from CLI readiness.
