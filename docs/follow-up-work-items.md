# Follow-up Work Items 1.18.3

SKS 1.18.4 keeps follow-up items behind route truth gates and fake-vs-real proof policy so fixture-only or stand-in outputs cannot be promoted to real runtime closure.

SKS 1.18.2 adds schema-bound `follow_up_work_items` to native agent results.

SKS 1.18.3 keeps follow-up work under the route-truth scheduler contract: accepted items inherit Source Intelligence and Goal refs, use the same work queue proof surface, and cannot satisfy backfill gates through generic Agent-route substitution.

Workers may return follow-up work only as JSON objects with:

- `id`
- `title`
- `description`
- `required_persona_category`
- `priority`
- `dependencies`
- `lease_requirements`
- `max_attempts`
- `reason`
- optional `source_agent_session_id`

The validator rejects additional properties, missing required fields, protected core targets, main-route recursion, and global Scout ledger requests. The scheduler enqueues only validated items, inherits Source Intelligence and Goal mode refs, increments `generated_work_item_count`, and opens a new session generation for accepted follow-up work.

Useful check:

```bash
npm run agent:follow-up-work-schema
```
