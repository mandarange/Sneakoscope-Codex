#!/usr/bin/env node
// @ts-nocheck
import { runRouteBackfillBlackbox } from './agent-route-blackbox-lib.js';

runRouteBackfillBlackbox('$Agent', 'agent:backfill-route-blackbox');
