#!/usr/bin/env node
import { runRouteBackfillBlackbox } from './agent-route-blackbox-lib.mjs';

runRouteBackfillBlackbox('$QA-LOOP', 'qa:backfill-route-blackbox');
