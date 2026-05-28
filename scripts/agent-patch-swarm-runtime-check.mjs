#!/usr/bin/env node
import { runPatchSwarmRouteBlackbox } from './agent-patch-swarm-gate-lib.mjs';

await runPatchSwarmRouteBlackbox({
  gate: 'agent:patch-swarm-runtime',
  route: '$Agent',
  routeCommand: 'sks agent run',
  reportName: 'agent-patch-swarm-runtime'
});
