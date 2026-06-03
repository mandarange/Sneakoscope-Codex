#!/usr/bin/env node
// @ts-nocheck
import { runPatchSwarmRouteBlackbox } from './agent-patch-swarm-gate-lib.js';

await runPatchSwarmRouteBlackbox({
  gate: 'ux:patch-swarm-route-blackbox',
  route: '$UX-Review',
  routeCommand: 'sks ux-review',
  reportName: 'ux-patch-swarm-route-blackbox'
});
