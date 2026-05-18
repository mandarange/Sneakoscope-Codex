# Scout Output Schema

Real Scout engines must emit parseable `sks.scout-result.v1` JSON before their output can become consensus evidence.

## Required Fields

```json
{
  "schema": "sks.scout-result.v1",
  "mission_id": "M-...",
  "scout_id": "scout-1-code-surface",
  "role": "Repo / Code Surface Scout",
  "route": "$Team",
  "status": "done",
  "read_only": true,
  "summary": "...",
  "findings": [],
  "suggested_tasks": [],
  "blockers": [],
  "unverified": []
}
```

## Accepted Input Formats

- pure JSON object;
- fenced JSON block;
- markdown containing a `SCOUT_RESULT_JSON:` section;
- markdown whose final fenced block is JSON.

Malformed output becomes a blocked scout result with `parsed=false`, `parse_issues`, `scout_output_parse_failed:*`, and the raw `source_file`. SKS never fabricates successful real findings from malformed engine output.
