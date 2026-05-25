#!/usr/bin/env node
import { runRouteBackfillBlackbox } from './agent-route-blackbox-lib.mjs';

runRouteBackfillBlackbox('$Team', 'team:backfill-route-blackbox');
