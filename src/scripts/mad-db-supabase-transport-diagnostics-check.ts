#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMission } from '../core/mission.js';
import { classifyMadDbError, madDbRetryGuidance, summarizeMadDbError } from '../core/mad-db/mad-db-executor.js';
import { createMadDbRuntimeProfile, madDbMcpUrl } from '../core/mad-db/mad-db-runtime-profile.js';
import { resolveMadDbTarget } from '../core/mad-db/mad-db-target.js';
import { assertGate, emitGate } from './sks-1-18-gate-lib.js';

const timeoutSummary = summarizeMadDbError(new Error('failed to connect to postgres: dial tcp 1.2.3.4:6543: i/o timeout token=secret-token'));
assertGate(classifyMadDbError(timeoutSummary) === 'supabase_sql_plane_timeout', 'timeout errors must be classified as SQL-plane timeout', { timeoutSummary });
assertGate(!timeoutSummary.includes('secret-token'), 'error summary must redact token query values', { timeoutSummary });
assertGate(madDbRetryGuidance('supabase_sql_plane_timeout').includes('--db-url'), 'timeout guidance should mention explicit db-url fallback evidence from Supabase CLI docs');

const readOnlyKind = classifyMadDbError('MCP server denied apply_migration because this connection is read only');
assertGate(readOnlyKind === 'supabase_mcp_read_only_transport', 'read-only transport errors must be separated from SQL-plane connectivity', { readOnlyKind });

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-db-transport-'));
await fs.mkdir(path.join(root, '.codex'), { recursive: true });
await fs.writeFile(path.join(root, '.codex', 'config.toml'), '[mcp_servers.supabase]\nurl = "https://mcp.supabase.com/mcp?project_ref=localref&read_only=true&features=database,docs"\n', 'utf8');

const target = await resolveMadDbTarget(root, {
  args: ['--project-ref', 'explicitref', '--mcp-url', 'https://mcp.supabase.com/mcp?features=docs']
});
assertGate(target.blockers.length === 0, 'explicit trusted MCP URL without read_only should be accepted', target);
assertGate(target.mcp_url?.includes('project_ref=explicitref'), 'explicit MCP URL should inherit project_ref when omitted', target);
assertGate(target.mcp_url?.includes('features=database'), 'explicit MCP URL should force database feature for MadDB SQL-plane execution', target);
assertGate(!target.mcp_url?.includes('read_only=true'), 'active MadDB explicit MCP URL must not remain read-only', target);

const conflict = await resolveMadDbTarget(root, {
  args: ['--project-ref', 'explicitref', '--mcp-url', 'https://mcp.supabase.com/mcp?read_only=true']
});
assertGate(conflict.blockers.includes('mad_db_mcp_url_read_only_conflict'), 'read-only explicit MCP URL must be rejected in active MadDB', conflict);

const mission = await createMission(root, { mode: 'mad-db', prompt: 'transport diagnostics fixture' });
const profile = await createMadDbRuntimeProfile({
  root,
  missionId: mission.id,
  cycleId: 'cycle-fixture',
  projectRef: 'explicitref',
  runtimeSessionId: 'session-fixture',
  mcpUrl: target.mcp_url
});
assertGate(profile.server_url_source === 'explicit_mcp_url', 'runtime profile must record explicit MCP URL source', profile);
assertGate(profile.server_url === target.mcp_url, 'runtime profile must use normalized explicit MCP URL', { profile, target });
assertGate(madDbMcpUrl('abc123') === 'https://mcp.supabase.com/mcp?project_ref=abc123&features=database', 'generated MCP URL should stay project scoped and database-feature scoped');

emitGate('mad-db:supabase-transport-diagnostics', {
  timeout_kind: classifyMadDbError(timeoutSummary),
  read_only_kind: readOnlyKind,
  mcp_url_source: profile.server_url_source
});
