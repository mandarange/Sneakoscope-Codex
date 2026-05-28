#!/usr/bin/env node
import { runPatchSwarmRouteBlackbox } from './agent-patch-swarm-gate-lib.mjs';

await runPatchSwarmRouteBlackbox({
  gate: 'ux:patch-swarm-route-blackbox',
  route: '$UX-Review',
  routeCommand: 'sks ux-review',
  reportName: 'ux-patch-swarm-route-blackbox'
});
