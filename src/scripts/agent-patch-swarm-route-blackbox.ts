#!/usr/bin/env node
// @ts-nocheck
import { runPatchSwarmRouteBlackbox } from './agent-patch-swarm-gate-lib.js';

await runPatchSwarmRouteBlackbox({
  gate: 'agent:patch-swarm-route-blackbox',
  route: '$Agent',
  routeCommand: 'sks agent run',
  reportName: 'agent-patch-swarm-route-blackbox'
});
