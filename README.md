<div align="center">

<img src="docs/assets/sks-logo.svg" alt="Sneakoscope Codex logo" width="120" height="120" />

# Sneakoscope Codex

**Make Codex work explainable, bounded, and test-backed.**

[![CI](https://github.com/mandarange/Sneakoscope-Codex/actions/workflows/ci.yml/badge.svg)](https://github.com/mandarange/Sneakoscope-Codex/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/sneakoscope?color=cb3837&logo=npm)](https://www.npmjs.com/package/sneakoscope)
[![Node.js >=20.11](https://img.shields.io/badge/node-%3E%3D20.11-339933?logo=node.js&logoColor=white)](#quick-start)
[![MIT license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

</div>

<!-- BEGIN SKS SEARCH VISIBILITY MARKETING -->
Sneakoscope Codex (`sks`) is an open-source trust layer for Codex CLI and ChatGPT Desktop. It coordinates bounded AI coding agents, records machine-verifiable evidence, preserves project memory, and blocks release claims that are not supported by current tests or artifacts. Search visibility outcomes are measured separately; SKS does not promise rankings or traffic.
<!-- END SKS SEARCH VISIBILITY MARKETING -->

Current package: **SKS 10.5.4**. Install the latest stable release from npm.

Sneakoscope Codex (`sks`) is a local trust layer for Codex CLI and ChatGPT Desktop. It keeps agent work bounded, preserves project context, records machine-verifiable evidence, and prevents release claims that current tests or artifacts cannot support.

Use SKS when you want an AI coding session to end with something you can inspect: the change, the checks that ran, and the evidence behind the result. SKS is local-first and deterministic. It does not promise model quality, search rankings, or traffic.

## Quick start

Requirements: Node.js **20.11+**, npm, Git, and a current Codex CLI or supported Codex desktop host.

```sh
npm exec --yes --package=sneakoscope@latest -- sneakoscope install --yes
```

From the root of a project you want SKS to understand:

```sh
sks bootstrap
sks doctor --json
```

Then open the project in Codex. Start with the smallest useful loop:

```text
$sks-plan "Describe the change and the checks it needs"
$sks-work
$sks-review
```

Use the terminal to inspect the same state:

```sh
sks status --json
sks review --staged
sks update-check
```

The installer resolves the latest npm release, installs `sks`, runs setup and Doctor, and verifies that the command on your `PATH` is the version it installed. `sks bootstrap` adds the project-local SKS context and ignore rules; it does not replace your source of truth.

## What you get

| Need | SKS provides |
| --- | --- |
| Keep work focused | Answers, tiny edits, ordinary implementation, reviews, and DB work run directly in the main agent, the way Codex works by default. Naruto splits work across official Codex subagents only when you ask for it. |
| Keep context bounded | TriWiki indexes repository code into context that can be checked against source. |
| Know what actually ran | Tests, diagnostics, and release evidence are recorded for completion claims. |
| Recover safely | Doctor and update flows report a concrete recovery action when a check needs attention. |
| Operate locally | The CLI works without a hosted control plane; macOS users can also use SKS Center. |

## Everyday commands

Inside a Codex conversation:

| Command | Use it for |
| --- | --- |
| `$sks-plan "task"` | Write a plan without editing product code. |
| `$sks-work` | Execute the latest plan with Naruto child agents. |
| `$sks-review` | Review the current changes. |
| `$sks-naruto "task"` | Explicitly split independent work across official subagents. |
| `$sks-help` | Explore available SKS workflows. |

In a terminal:

```sh
sks --help
sks status --json
sks doctor --json
sks update-check
sks update
```

Naruto runs only when you invoke `$sks-naruto` or `$sks-work`, pass `--agents N`, or ask for subagents or parallel work in so many words (a word like "parallel" in a file name is not a request); with Jev mode on, Jev may also judge that a task splits into independent parts. Ordinary fixes, tests, refactors, reviews, and DB work stay with the main agent by default. See the [Naruto guide](docs/naruto.md).

## How the trust loop works

1. **Plan** — describe the outcome and the evidence it needs.
2. **Build** — make the smallest change that satisfies the plan.
3. **Verify** — run the project checks and SKS diagnostics.
4. **Review** — inspect the diff and the evidence before claiming completion.

SKS keeps these steps observable. It does not turn a failed check into a success, invent test output, or silently substitute a provider.

## Optional integrations

### SKS Center on macOS

The menu bar app exposes connections, updates, MCP servers, image generation, and diagnostics in one place. Build it from an interactive macOS install or run:

```sh
sks menubar install
```

Dependency, CI, and piped installs do not touch your home directory. Set `SKS_POSTINSTALL_MENUBAR=1` to force the build in a script, or `SKS_POSTINSTALL_NO_MENUBAR=1` to skip it.

### Desktop Bridge

The Desktop Bridge can route eligible models through Codex-LB or OpenRouter while keeping provider choice and session pins explicit:

```sh
sks bridge auth-priority status --json
sks bridge auth-priority on --json
sks bridge status --json
```

Enter credentials only through the native connection dialog or an explicit `--api-key-stdin` flow. See [Codex-LB guidance](docs/codex-lb.md) and [OpenRouter Only Mode](docs/openrouter-only-mode.md).

### Image generation

SKS records which image mode produced an artifact and keeps the default Codex image route available:

```sh
sks imagegen status --json
sks imagegen models --json
sks imagegen generate --prompt "App icon, flat, blue" --out icon.png
```

See [Image generation](docs/image-generation.md) for provider boundaries and evidence sidecars.

## Documentation

- [Product contract](docs/PRODUCT-CONTRACT.md) — supported surfaces and ownership.
- [Essential Trust](docs/essential-trust.md) — verification profiles and safety boundaries.
- [Astra guidance](docs/astra-guidance.md) — how SKS applies official model recommendations.
- [Agent Bridge](docs/AGENT-BRIDGE.md) — integrate through the CLI or MCP interface.
- [Context Graph](docs/architecture/context-graph.md) — bounded source lookup and freshness.
- [Release readiness](docs/release-readiness.md) — build, verify, and publish a release.
- [Release evidence](docs/release-proof-truth.md) — what each verification result proves.
- [FAQ](docs/faq.md) — common setup questions.
- [Troubleshooting](docs/troubleshooting.md) — concrete recovery paths.
- [Changelog](CHANGELOG.md) — changes by version.

## FAQ and troubleshooting

### Does SKS send my source code to a hosted service?

SKS is local-first. Provider integrations are explicit opt-in routes; inspect the provider and bridge status before using them. Do not paste credentials or private source into an issue.

### Why does `sks doctor` report a problem after an update?

Run `sks doctor --json`, read the reported recovery action, and run that action exactly. If the issue remains, capture the command, operating system, Node.js version, and redacted JSON in a bug report.

### How do I turn off experimental context management?

In SKS Center, open **Settings → Context management**, or run:

```sh
sks codex-app context-management off
```

Start a new Codex task after changing the setting. Availability depends on the Codex client and account session.

### Why is the menu bar app missing?

The native Center is macOS-only. Run `sks menubar install` from an interactive terminal, then run `sks doctor --json`. Linux and Windows CLI support is best-effort.

### Does SKS guarantee better AI output or search visibility?

No. SKS verifies process evidence and release claims. Model behavior and search outcomes remain separate measurements.

For a reproducible issue, use the [bug report form](https://github.com/mandarange/Sneakoscope-Codex/issues/new?template=bug_report.yml). For a question, start a discussion or open an issue with the smallest redacted reproduction.

## Development

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Release work follows [release readiness](docs/release-readiness.md); do not publish a package from an unverified working tree.

## Support and security

- Bug reports: [issue form](https://github.com/mandarange/Sneakoscope-Codex/issues/new?template=bug_report.yml)
- Feature ideas: [feature form](https://github.com/mandarange/Sneakoscope-Codex/issues/new?template=feature_request.yml)
- Security reports: see [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE)
