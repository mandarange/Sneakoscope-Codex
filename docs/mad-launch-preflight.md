# MAD Launch Preflight

SKS 1.18.13 `sks --mad` runs `runCodexLaunchPreflight()` before creating the MAD tmux pane.

The preflight runs read-only config readability, actual Codex config-load probing, project-config policy checks, optional tmux context smoke, safe repair when needed, and Fast service-tier CLI proof, then writes `.sneakoscope/reports/mad-launch-preflight.json`.

If blockers remain, tmux launch is skipped and SKS prints blockers plus operator actions.
