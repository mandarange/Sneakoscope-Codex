#!/usr/bin/env node
// @ts-nocheck
import { runPatchSwarmRouteBlackbox } from './agent-patch-swarm-gate-lib.js';

await runPatchSwarmRouteBlackbox({
  gate: 'agent:patch-swarm-runtime',
  route: '$Agent',
  routeCommand: 'sks agent run',
  reportName: 'agent-patch-swarm-runtime'
});
