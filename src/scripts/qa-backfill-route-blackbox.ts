#!/usr/bin/env node
// @ts-nocheck
import { runRouteBackfillBlackbox } from './agent-route-blackbox-lib.js';

runRouteBackfillBlackbox('$QA-LOOP', 'qa:backfill-route-blackbox');
