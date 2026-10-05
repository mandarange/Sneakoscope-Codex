# Frequently asked questions

## What problem does SKS solve?

Codex can produce a useful change while leaving the reasoning, checks, and release evidence scattered across a long session. SKS adds a local workflow that keeps context bounded and makes completion claims depend on current artifacts.

## Is SKS a model, an agent, or a hosted service?

It is a local trust layer and CLI for Codex CLI and supported Codex desktop hosts. It coordinates the workflows around an agent; it does not replace Codex or promise a particular model's output.

## What is the smallest install?

```sh
npm exec --yes --package=sneakoscope@latest -- sneakoscope install --yes
```

Then run `sks bootstrap` from a project root and `sks doctor --json` to inspect setup.

## What files does bootstrap add?

Bootstrap creates the project-local SKS context and ignore rules that let the repository be indexed and its generated runtime state stay out of source control. It does not rewrite application source files. Review the diff after running it.

## What does `sks update` change?

It resolves the latest release, runs setup reconciliation, keeps trusted SKS hooks installed, and cleans up recognized SKS-owned legacy assets. User-authored configuration remains authoritative.

## Is the macOS menu bar required?

No. The CLI is the core product. The menu bar app is an optional macOS control surface for connections, updates, diagnostics, and other local controls.

## Can I use SKS on Linux or Windows?

The CLI can run on macOS, Linux, and Windows where Node.js and a supported Codex host are available. The native menu bar is macOS-only, and desktop integration outside macOS is best-effort.

## Does SKS improve search rankings?

No. SKS can record search visibility evidence, but it does not promise rankings or traffic.

## Where should I ask for help?

Use the [bug report form](https://github.com/mandarange/Sneakoscope-Codex/issues/new?template=bug_report.yml) for a reproducible failure. Include the command, OS, Node.js version, SKS version, and redacted output. Use the feature form for a proposal.
