# Shared Wrongness Memory

Wrongness memory can be promoted from local/project ledgers into tracked shards:

```bash
sks wrongness publish latest --shared --json
sks wiki validate-shared --json
```

Shared wrongness records live at:

```text
.sneakoscope/wiki/wrongness/<wrongness-id>.json
.sneakoscope/wiki/avoidance-rules/<rule-id>.json
```

When project wrongness context is read, SKS merges local project wrongness with shared wrongness shards. This keeps negative evidence available even when a developer has not generated the local ledger yet.

Active wrongness remains trust-affecting: high severity blocks full trust, medium severity keeps completion at `verified_partial`, and avoidance rules are retrieved before final claims.

