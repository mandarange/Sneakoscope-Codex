# Shared TriWiki

Shared TriWiki stores durable project memory as one-record-per-file JSON shards so multiple workers can add evidence without rewriting one large ledger.

## Publish

```bash
sks wiki refresh --json
sks wiki publish latest --shared --json
sks wiki rebuild-index --json
sks wiki validate-shared --json
```

Claim shards are written to:

```text
.sneakoscope/wiki/records/claims/<claim-id>.json
```

Generated indexes live under `.sneakoscope/wiki/indexes/` and are intentionally ignored. Rebuild them from shards instead of resolving merge conflicts in index files.

## Security

Shared records are schema-checked and secret-scanned. Use `--redact` when publishing from artifacts that may contain local home paths or sensitive strings.

