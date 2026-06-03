# Codex App UI Preservation

SKS treats Codex App fast-mode, feature, provider, profile, auth, and app metadata state as host-owned.

The 2.0.1 guardrails are:

- `sks --mad` may pass `service_tier=fast` through task, CLI, or SDK config overrides.
- SKS must not use project `.codex/config.toml` to force provider, profile, auth, telemetry, notification, or app metadata keys.
- Codex App UI state repair requires a backup and an explicit repair scope such as `doctor --fix --repair-codex-app-ui`.
- Snapshots record hashes and redacted metadata only. Secrets are not written to artifacts.

Official Codex manual basis used for this policy:

- User config lives at `~/.codex/config.toml`; project overrides live in `.codex/config.toml`.
- Project config is loaded only for trusted projects.
- Project config cannot override credential redirection, host-owned app metadata, provider auth, profile selection, notifications, telemetry, or provider keys.
- Fast mode is a documented feature flag and service-tier path.
