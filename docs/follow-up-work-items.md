# Follow-up Work Items 1.18.2

SKS 1.18.2 adds schema-bound `follow_up_work_items` to native agent results.

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
