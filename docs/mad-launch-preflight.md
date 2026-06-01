# MAD Launch Preflight

SKS 1.20.4 `sks --mad` runs dependency repair and `runCodexLaunchPreflight()` before creating the MAD Zellij session, launches Zellij with a short default `ZELLIJ_SOCKET_DIR` when the operator has not set one, and prints the exact `Attach with: ZELLIJ_SOCKET_DIR=... zellij attach ...` command after a successful background launch.

The preflight runs read-only config readability, actual Codex config-load probing, project-config policy checks, Zellij capability checks, safe repair when needed, and Fast service-tier CLI proof, then writes `.sneakoscope/reports/mad-launch-preflight.json`.

If blockers remain, Zellij launch is skipped and SKS prints blockers plus operator actions.
