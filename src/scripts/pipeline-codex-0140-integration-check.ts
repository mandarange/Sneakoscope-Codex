#!/usr/bin/env node
import { assertGate, emitGate, exists, readText } from './sks-1-18-gate-lib.js';

const surfaces = [
  'src/core/codex-control/codex-0140-capability.ts',
  'src/core/codex-control/codex-0140-feature-probes.ts',
  'src/core/codex-control/codex-0140-real-probes.ts',
  'src/scripts/codex-0140-goal-attachment-preservation-check.ts',
  'src/core/doctor/context7-mcp-repair.ts',
  'src/core/doctor/supabase-mcp-repair.ts'
];
for (const file of surfaces) assertGate(exists(file), `Codex 0.140 integration surface missing: ${file}`);
const cap = readText('src/core/codex-control/codex-0140-capability.ts');
const broker = readText('src/core/codex-native/codex-native-feature-broker.ts');
for (const token of ['usage_views', 'goal_attachment_preservation', 'session_delete', 'import_command', 'unified_mentions', 'bedrock_managed_auth', 'mcp_reliability', 'sqlite_auto_recovery', 'non_tty_interrupt', 'large_repo_responsiveness']) {
  assertGate(cap.includes(token), `Codex 0.140 capability must expose ${token}`);
  assertGate(broker.includes(token), `Codex native feature broker must surface ${token}`);
}
emitGate('pipeline:codex-0140-integration', { surfaces: surfaces.length });
