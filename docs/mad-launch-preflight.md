# MAD Launch Preflight

SKS 1.20.2 `sks --mad` runs dependency repair and `runCodexLaunchPreflight()` before creating the MAD Zellij session.

The preflight runs read-only config readability, actual Codex config-load probing, project-config policy checks, Zellij capability checks, safe repair when needed, and Fast service-tier CLI proof, then writes `.sneakoscope/reports/mad-launch-preflight.json`.

If blockers remain, Zellij launch is skipped and SKS prints blockers plus operator actions.
