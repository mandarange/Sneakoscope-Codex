# codex-lb Evidence

SKS keeps codex-lb separate from ChatGPT OAuth. The codex-lb proxy key is stored and redacted as `CODEX_LB_API_KEY`; ChatGPT OAuth remains the official Codex login path.

## Commands

```bash
sks codex-lb setup
sks codex-lb setup --host lb.example.com --api-key-stdin --plan --json
sks codex-lb setup --host lb.example.com --api-key-stdin --yes --json
sks codex-lb status --json
sks codex-lb metrics --json
sks codex-lb doctor --deep --json
sks codex-lb circuit reset
sks codex-lb circuit record-fixture test/fixtures/codex-lb/5xx.json --json
sks codex-lb proof-evidence --json
```

## Setup Wizard

SKS 1.0.6 makes `sks codex-lb setup` a two-phase plan/apply repair path for missing codex-lb keys. Interactive setup asks for:

- codex-lb domain or base URL
- API key with hidden input
- whether to use the proxy as the default Codex launch target
- whether to write the shell env loader
- whether to store the key in macOS Keychain when available
- whether to sync the macOS `launchctl` environment
- whether to install a shell profile snippet
- whether to run a health check

Non-interactive setup accepts `--host`, `--domain`, `--base-url`, `--api-key`, `--api-key-stdin`, `--plan`, `--apply`, `--yes`, `--use-default-provider`, `--no-default-provider`, `--write-env-file`, `--no-env-file`, `--keychain`, `--no-keychain`, `--launchctl`, `--no-launchctl`, `--shell-profile zsh|bash|fish|all|skip`, `--health`, `--no-health`, and `--json`.

Plan mode prints the exact files and commands that would change and writes nothing. Apply mode records the plan, applied actions, and drift list in the result. `--yes` applies without an interactive confirmation.

Base URL normalization:

```text
lb.example.com -> https://lb.example.com/backend-api/codex
https://lb.example.com -> https://lb.example.com/backend-api/codex
https://lb.example.com/backend-api/codex -> unchanged
```

The fallback env file is `~/.codex/sks-codex-lb.env` with mode `0600`. Metadata lives at `~/.codex/sks-codex-lb.json` and stores only `base_url`, `updated_at`, `source`, and a SHA-256 key fingerprint. Status and doctor report only redacted key presence:

```json
{
  "configured": true,
  "repair_available": false,
  "api_key": {
    "present": true,
    "source": "env-file",
    "redacted": true
  },
  "env_loader": {
    "configured": true,
    "source_priority": ["process.env", "keychain", "env-file", "legacy-env-file"]
  },
  "env_auto_load": true
}
```

SKS must never print raw CODEX_LB_API_KEY missing-env text. It reports setup guidance instead and records wrongness if a fixture ever exposes the raw missing-env message or a secret.

Exact setup-choice effects:

- `--use-default-provider` writes `[model_providers.codex-lb]` and selects top-level `model_provider = "codex-lb"`.
- `--no-default-provider` writes the provider block but does not select top-level `model_provider`.
- `--write-env-file` writes `~/.codex/sks-codex-lb.env` with mode `0600`.
- `--no-env-file` does not write the env file; the current process can still verify the supplied key.
- `--keychain` attempts macOS Keychain storage; `--no-keychain` never runs the `security` command.
- `--launchctl` syncs the GUI launch environment when available; `--no-launchctl` never runs `launchctl setenv`.
- `--shell-profile skip` modifies no shell profile.

Release gates:

```bash
npm run codex-lb:setup-fixture
npm run codex-lb:setup-truthfulness
npm run codex-lb:missing-env-regression
node --test test/blackbox/codex-lb-setup-stdin-no-secret-leak.test.mjs
```

## Circuit Policy

- `auth` rejection is a hard failure.
- Repeated `5xx` or timeout failures open the circuit.
- `previous_response_not_found` is a stateless-LB warning, not an automatic failure.
- Hard failures are surfaced and recorded in circuit health.
- SKS only bypasses codex-lb when the user chooses fallback or `SKS_CODEX_LB_AUTOBYPASS=1` is set.

Health summaries are written to `~/.codex/sks-codex-lb-health.json` and `<active-project>/.sneakoscope/reports/codex-lb-health.json` when launch health checks or metrics commands update the circuit. Completion Proof evidence includes a `codex_lb` summary from the active project root.

0.9.14 launch health integration records the same circuit state when the response-chain check runs:

- `previous_response_not_found` records a warning and keeps the circuit closed.
- auth rejection opens the circuit immediately.
- timeout, network, and 5xx failures open the circuit after three recent failures.
- `chain_ok` updates `last_ok_at` and closes a half-open/open circuit.
