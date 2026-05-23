# Immutable Harness Guard

SKS 1.15.1 makes the immutable harness guard an explicit MAD-SKS release gate and verifies it against actual MAD-SKS executor attempts.

The Immutable Harness Guard protects SKS infrastructure from MAD-SKS and other high-power routes. MAD-SKS may maintain user-approved targets, but it cannot rewrite the harness that grants the authority.

## Protected Core

Protected core includes the SKS package root, installed binary path, `dist/`, `src/core/`, `src/cli/`, `src/commands/`, `scripts/`, `schemas/`, `crates/sks-core/`, `package.json`, `package-lock.json`, `tsconfig.json`, release metadata, SKS-owned managed hooks, and immutable policy files such as `.sneakoscope/policies/immutable-harness.json`.

## Guard Behavior

Before writes, deletes, chmod/chown, package-root shell commands, and broad destructive commands, SKS resolves real paths and checks protected-core membership. Symlink or path traversal into protected core is blocked. Hardlink or bind-mount suspicion is warning or blocked depending on evidence. Violations write Wrongness Memory and audit-ledger entries.

## Evidence

Release readiness expects a protected-core path list, pre/post hash snapshots, write-guard decisions, git diff validation, proof graph v3 links, and proof graph v4 actual-executor blackbox links. If any protected-core file changes during a MAD-SKS run, the route is blocked unless the change is outside MAD-SKS and explicitly handled by normal release engineering.
