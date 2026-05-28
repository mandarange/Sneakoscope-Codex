# MAD Launch Preflight

SKS 1.18.12 `sks --mad` runs `runCodexLaunchPreflight()` before creating the MAD tmux pane.

The preflight runs read-only config readability and project-config policy checks in parallel, applies safe repair when needed, proves the Codex CLI args include `-c service_tier=fast`, and writes `.sneakoscope/reports/mad-launch-preflight.json`.

If blockers remain, tmux launch is skipped and SKS prints blockers plus operator actions.
