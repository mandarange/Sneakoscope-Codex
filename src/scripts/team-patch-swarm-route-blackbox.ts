#!/usr/bin/env node
// @ts-nocheck
import { runPatchSwarmRouteBlackbox } from './agent-patch-swarm-gate-lib.js';

await runPatchSwarmRouteBlackbox({
  gate: 'team:patch-swarm-route-blackbox',
  route: '$Team',
  routeCommand: 'sks team',
  reportName: 'team-patch-swarm-route-blackbox'
});
