# $Naruto — Shadow Clone Swarm (影分身 / Kage Bunshin no Jutsu)

`$Naruto` is a high-scale mode of the native SKS agent kernel. It fans out up to **100
parallel "clone" sessions** (vs. the standard 20-agent ceiling) for high-throughput work
such as broad codebase sweeps, fan-out drafting, or large parallel audits.

It is the same proven engine used by `sks team` / `sks agent` — roster → work-queue →
scheduler → backend → patch-swarm — with one difference: the concurrency ceiling is
lifted from `MAX_AGENT_COUNT = 20` to `MAX_NARUTO_AGENT_COUNT = 100`, **only for this
route**. Every other route keeps the 20 ceiling untouched.

## Usage

```bash
# Default clone count (12) on the real Codex backend
sks naruto run "sweep the codebase for TODO comments and summarize"

# Up to 100 shadow clones
sks naruto run "draft a unit test for every module" --clones 100

# Dry/mock fan-out (no Codex calls) — fast proof of the swarm
sks naruto run "demo" --clones 24 --backend fake --work-items 24 --json

# Status of the latest Naruto mission
sks naruto status
```

Aliases: `$ShadowClone`, `$Kagebunshin`, and the CLI flag form `sks --naruto`.

### Flags

| Flag | Meaning | Default |
|------|---------|---------|
| `--clones N` (alias `--agents N`) | Number of parallel clone sessions (clamped to 100) | 12 |
| `--backend codex-exec\|fake\|process` | Worker backend | `codex-exec` |
| `--work-items N` | Work items to distribute across clones | = clones |
| `--real` | Use real Codex execution (not dry-run) | off |
| `--readonly` | Read-only clones (no writes) | off |
| `--json` | Machine-readable output | off |

## How it works

1. **Clone roster** — `buildNarutoCloneRoster()` builds N identical clones (`naruto_clone_NNN`),
   cycling the persona pool so it scales past the unique-persona ceiling. Naruto's clones
   are copies, not distinct personas — which is exactly the shadow-clone model.
2. **Work partition** — the prompt is sliced into work items with disjoint write leases.
3. **Scheduler** — `runAgentScheduler` keeps up to `--clones` sessions active, backfilling
   idle slots as clones finish (`MAX_NARUTO_AGENT_COUNT` ceiling).
4. **Safe parallel writes** — the patch-swarm runtime applies disjoint patches in parallel
   and serializes conflicting ones via the merge coordinator + conflict rebase, with a
   transaction journal and rollback dry-run per clone.
5. **Proof + cleanup** — every clone emits a session record; the mission writes proof
   evidence and cleans up worker sessions.

## Adaptive concurrency (system-aware)

`--clones N` sets the total work fan-out (up to 100), but `$Naruto` **never spawns the whole
count at once**. Live concurrency (how many clones run simultaneously) is throttled to a
host-safe number derived from CPU cores and free memory:

- Heavy backends (`codex-exec`, `zellij`, `process`) leave a core free and budget ~0.6 GB per
  concurrent worker, capped at 16.
- Light/in-process backend (`fake`) packs tighter (≈ 2× cores, capped at 32).

So `sks naruto run "…" --clones 100` on an 8-core/8 GB host might keep ~7 clones running at a
time while still processing all 100 work units (the scheduler backfills as clones finish). The
run output reports `running M at a time (throttled to host capacity: C cores, G GB free)` when
throttling applies. Override with `SKS_NARUTO_MAX_CONCURRENCY=<n>` (still clamped to 100).

## Limits & guidance

- 100 concurrent real Codex sessions would be heavy, which is exactly why concurrency is
  throttled to host capacity by default. Increase `--clones` freely for fan-out; the scheduler
  paces actual execution safely.
- For CI/proof, use `--backend fake`, which runs clones in-process for a fast, deterministic
  swarm demonstration.

## Proof gate

`naruto:shadow-clone-swarm` (`scripts/naruto-shadow-clone-swarm-check.mjs`) proves the
ceiling is lifted to 100 without changing the standard 20 cap, that a 100-clone roster
builds 100 unique clones, and that an end-to-end `sks naruto run --clones 24` schedules all
24 clones to completion (i.e. genuinely past the old 20 cap).
