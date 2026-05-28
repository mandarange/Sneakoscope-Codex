#!/usr/bin/env node
import { runPatchSwarmRouteBlackbox } from './agent-patch-swarm-gate-lib.mjs';

await runPatchSwarmRouteBlackbox({
  gate: 'team:patch-swarm-route-blackbox',
  route: '$Team',
  routeCommand: 'sks team',
  reportName: 'team-patch-swarm-route-blackbox'
});
