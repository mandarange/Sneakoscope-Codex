# MCP ReadOnly Runtime Scheduler

SKS 1.18.10 records runtime proof before MCP `readOnlyHint` can support parallel scheduling claims.

The release gate is `mcp:readonly-runtime-scheduler`. Its proof requires at least three read-only runtime candidates, overlapping start/end windows among only those candidates, serialized write-capable rows, and blocked destructive-name or destructive-schema false positives. Each tool row records `scheduled_mode`, `batch_id`, timestamps, duration, and any serialization reason.

`readOnlyHint` remains advisory. The scheduler first classifies candidates, then parallelizes only the rows that pass the read-only candidate filter. Write-capable and destructive rows stay serial unless a future explicit policy allows otherwise.
