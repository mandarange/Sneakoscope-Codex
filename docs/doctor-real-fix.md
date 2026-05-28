# Doctor Real Fix

SKS 1.18.12 `sks doctor` reports Codex CLI availability, Codex App readiness, codex-lb health, and Codex project config readability separately.

`sks doctor --fix` still runs setup, then runs the Codex config repair transaction and returns child-read proof in `codex_config`. Ready is not true unless Codex CLI exists, `.codex/config.toml` is readable by a spawned child, Codex App checks pass, and codex-lb is healthy.
