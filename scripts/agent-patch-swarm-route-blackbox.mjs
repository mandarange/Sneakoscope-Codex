#!/usr/bin/env node
import { runPatchSwarmRouteBlackbox } from './agent-patch-swarm-gate-lib.mjs';

await runPatchSwarmRouteBlackbox({
  gate: 'agent:patch-swarm-route-blackbox',
  route: '$Agent',
  routeCommand: 'sks agent run',
  reportName: 'agent-patch-swarm-route-blackbox'
});
