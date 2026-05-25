#!/usr/bin/env node
import { runRouteBackfillBlackbox } from './agent-route-blackbox-lib.mjs';

runRouteBackfillBlackbox('$Research', 'research:backfill-route-blackbox');
