#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const surface = await importDist('core/agents/agent-command-surface.js');
const parsed = surface.parseAgentCommandArgs('agent', ['cleanup', 'latest', '--apply', '--dry-run', '--drain', '--stale-ms', '1234', '--json']);
assertGate(parsed.action === 'cleanup', 'agent command parser must parse cleanup action', parsed);
assertGate(parsed.apply === true, 'agent command parser must support --apply', parsed);
assertGate(parsed.dryRun === true, 'agent command parser must support --dry-run', parsed);
assertGate(parsed.drain === true, 'agent command parser must support --drain', parsed);
assertGate(parsed.staleMs === 1234, 'agent command parser must support --stale-ms', parsed);
emitGate('agent:cleanup-command-ux', { action: parsed.action, stale_ms: parsed.staleMs });
