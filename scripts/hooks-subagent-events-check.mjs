#!/usr/bin/env node
import { CODEX_HOOK_EVENTS } from '../dist/core/codex-compat/codex-schema-snapshot.js';
import { validateCodexFixtureOutputs } from '../dist/core/codex-compat/codex-hook-schema.js';

const fixtures = await validateCodexFixtureOutputs(process.cwd());
const subagentEvents = ['SubagentStart', 'SubagentStop'];
const ok = subagentEvents.every((event) => CODEX_HOOK_EVENTS.includes(event))
  && subagentEvents.every((event) => fixtures.outputs.some((row) => row.event === event && row.ok));
console.log(JSON.stringify({
  schema: 'sks.hooks-subagent-events-check.v1',
  ok,
  subagent_events: subagentEvents,
  fixture_counts: Object.fromEntries(subagentEvents.map((event) => [event, fixtures.outputs.filter((row) => row.event === event).length]))
}, null, 2));
if (!ok) process.exitCode = 1;
