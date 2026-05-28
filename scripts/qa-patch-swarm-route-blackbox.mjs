#!/usr/bin/env node
import { runPatchSwarmRouteBlackbox } from './agent-patch-swarm-gate-lib.mjs';

await runPatchSwarmRouteBlackbox({
  gate: 'qa:patch-swarm-route-blackbox',
  route: '$QA-LOOP',
  routeCommand: 'sks qa-loop run',
  reportName: 'qa-patch-swarm-route-blackbox'
});
