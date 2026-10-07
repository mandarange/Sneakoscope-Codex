# Shared TriWiki

Shared TriWiki stores durable project memory as one-record-per-file JSON shards so multiple workers can add evidence without rewriting one large ledger.

## Publish

```bash
sks align run --json
sks wiki publish latest --shared --json
sks wiki rebuild-index --json
sks wiki rebuild-summary --json
sks wiki validate-shared --json
```

Claim shards are written to:

```text
.sneakoscope/wiki/records/claims/<claim-id>.json
```

Generated indexes live under `.sneakoscope/wiki/indexes/` and are intentionally ignored. Rebuild them from shards instead of resolving merge conflicts in index files.

Generated memory summaries are schema-versioned in 1.0.8. Rebuild them with `sks wiki rebuild-summary --json`; if a summary is stale, context packs should recommend rebuilding instead of treating the generated summary as fresh recall.

Retention cleanup preserves shared TriWiki claim shards, wrongness/image-voxel/avoidance record directories, and `.sneakoscope/wiki/context-pack.json` as durable learning context. Route-local scratch and summarized raw logs may be removed after completion; shared records are not ordinary cleanup targets, including when optional wiki artifact pruning is enabled.

## Security

Shared records are schema-checked and secret-scanned. Use `--redact` when publishing from artifacts that may contain local home paths or sensitive strings.

## Jev vNext canonical memory overlay

Jev-derived candidates first live in the mission-scoped ignored file
`.sneakoscope/missions/<mission-id>/jev-memory-intake.json`. The intake is
bounded, redacted, digest-bound to the turn/source/graph snapshot, and written
with an idempotency key under the existing file lock. The prompt hook never
writes a canonical shard.

Promotion is an explicit coordinator operation in
`src/core/git-hygiene/shared-memory-publish.ts`. Durable and verified visual
evidence become existing claim shards with a `memory_metadata` object containing
the intake, effective trust, evidence score, and priority. Negative evidence
uses the existing wrongness/avoidance schema. Every promotion rechecks
provenance, evidence files, image references, lifecycle, redaction, and the
single-writer policy, then rebuilds indexes and summaries atomically.

`readSharedMemoryOverlay(root, opts)` is the only bounded memory reader. It
returns a separate provenance section with source/evidence digests, lifecycle,
freshness, and effective trust. The governor enforces active/pinned records,
mission scope, TTL, sensitivity, top-k 8 (16 for high-risk routes), and a
6000-token cap. Missing provenance makes a candidate unavailable; it does not
receive an assumed trust score or a lexical/model fallback. Tombstones under
`.sneakoscope/wiki/summaries/memory-tombstones/` suppress the stable memory ID
immediately while physical GC remains under the existing approval gate.

Operator commands keep promotion and forgetting explicit:

```text
sks memory recall [--query <text>] [--high-risk] [--json]
sks memory promote --mission <id> --yes [--json]
sks memory forget --memory-id <id> --previous-digest <digest> [--json]
sks wiki publish latest --shared --jev-memory --mission <id> --json
```

Promotion requires Jev memory promotion enabled and the optimize policy. A
forget operation requires the canonical record's previous byte digest; it
suppresses retrieval without physically deleting the record.
