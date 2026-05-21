#!/usr/bin/env node
import { codexSchemaSnapshotReport } from '../dist/core/codex-compat/codex-schema-snapshot.js';

const report = await codexSchemaSnapshotReport();
const ok = report.ok
  && report.supported_events_count === 10
  && report.schema_files_count === 20
  && report.metadata?.tag === 'latest'
  && report.supported_events.includes('SubagentStart')
  && report.supported_events.includes('SubagentStop');
console.log(JSON.stringify({
  schema: 'sks.hooks-latest-schema-check.v1',
  ok,
  supported_events_count: report.supported_events_count,
  schema_files_count: report.schema_files_count,
  release_blockers: ok ? [] : report.release_blockers
}, null, 2));
if (!ok) process.exitCode = 1;
