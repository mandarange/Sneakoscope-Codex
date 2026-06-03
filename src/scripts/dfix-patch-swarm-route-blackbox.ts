#!/usr/bin/env node
// @ts-nocheck
import { runPatchSwarmRouteBlackbox } from './agent-patch-swarm-gate-lib.js';

await runPatchSwarmRouteBlackbox({
  gate: 'dfix:patch-swarm-route-blackbox',
  route: '$DFix',
  routeCommand: 'sks dfix',
  reportName: 'dfix-patch-swarm-route-blackbox'
});
