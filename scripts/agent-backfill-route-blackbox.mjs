#!/usr/bin/env node
import { runRouteBackfillBlackbox } from './agent-route-blackbox-lib.mjs';

runRouteBackfillBlackbox('$Agent', 'agent:backfill-route-blackbox');
