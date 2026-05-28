#!/usr/bin/env node
import { runPatchSwarmRouteBlackbox } from './agent-patch-swarm-gate-lib.mjs';

await runPatchSwarmRouteBlackbox({
  gate: 'dfix:patch-swarm-route-blackbox',
  route: '$DFix',
  routeCommand: 'sks dfix',
  reportName: 'dfix-patch-swarm-route-blackbox'
});
