# MAD Launch Preflight

SKS 1.20.5 `sks --mad` runs dependency repair and `runCodexLaunchPreflight()` before creating the MAD Zellij session, launches Zellij with a short default `ZELLIJ_SOCKET_DIR` when the operator has not set one, and—in an interactive terminal—automatically attaches to the freshly created background session so it actually opens. When auto-attach is skipped or fails (for example `--json`, a non-TTY/piped launch, already inside a Zellij session, `--no-attach`/`SKS_NO_ZELLIJ_ATTACH=1`, or an attach error), SKS falls back to printing the exact `Attach with: ZELLIJ_SOCKET_DIR=... zellij attach ...` command.

The preflight runs read-only config readability, actual Codex config-load probing, project-config policy checks, Zellij capability checks, safe repair when needed, and Fast service-tier CLI proof, then writes `.sneakoscope/reports/mad-launch-preflight.json`.

If blockers remain, Zellij launch is skipped and SKS prints blockers plus operator actions.
