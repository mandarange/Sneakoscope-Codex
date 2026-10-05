# Troubleshooting

Start with the smallest diagnostic bundle:

```sh
node --version
sks --version
sks doctor --json
sks status --json
```

Redact credentials, access tokens, private source, and personal paths before sharing output.

## `sks: command not found`

The global npm bin directory is not on `PATH`, or the installer did not finish. Re-run the supported installer and verify the resolved binary:

```sh
npm exec --yes --package=sneakoscope@latest -- sneakoscope install --yes
command -v sks
sks --version
```

If `command -v sks` points at a different installation, remove that stale entry or adjust `PATH` before retrying.

## Doctor reports a failed check

Run `sks doctor --json` again and follow the recovery action printed by the command. Do not bypass a check by deleting state or claiming success. If the recovery action fails twice, attach the redacted JSON and the exact command to a bug report.

## Bootstrap changed more files than expected

Review the diff from the project root. Generated SKS runtime state belongs under the ignored project-local paths. Stop and report the paths if application source or user-authored configuration was changed unexpectedly.

## Codex does not show SKS workflows

Check that the current Codex client is supported, then run `sks status --json` and inspect the hook path reported by Doctor. Restart the Codex task after changing context-management or hook settings.

## SKS Center is not visible on macOS

Run the install from an interactive terminal, then install the native surface explicitly:

```sh
sks menubar install
sks doctor --json
```

Dependency, CI, and piped installs intentionally skip the menu bar build. Set `SKS_POSTINSTALL_MENUBAR=1` only when a scripted install is meant to build it.

## Bridge or provider checks are unavailable

Inspect the configured route without entering credentials into a shell history:

```sh
sks bridge status --json
sks bridge route explain gpt-6-astra --json
```

Use the native connection dialog or `--api-key-stdin` for credentials. An unavailable route is a setup problem; it is not a reason to silently substitute another provider.

## Tests fail after a source change

Rebuild before running the canonical test command:

```sh
npm run build
npm run typecheck
npm test
```

Attach the first failing test and its output. Avoid posting a full environment dump.
