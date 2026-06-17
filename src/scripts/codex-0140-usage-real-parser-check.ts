#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.js';
import { parseCodex0140UsageOutput } from '../core/codex-control/codex-0140-usage-parser.js';

const json = parseCodex0140UsageOutput(JSON.stringify({
  daily: { tokens: 1200, limit: 5000 },
  weekly: { tokens: 7400 },
  cumulative: { tokens: 120000 }
}));
assertGate(json.ok === true && json.source_format === 'json', 'usage parser must parse JSON usage output', json);
assertGate(json.views.daily === 1200 && json.views.weekly === 7400 && json.views.cumulative === 120000 && json.views.limit === 5000, 'usage parser must retain daily/weekly/cumulative/limit fields', json);

const text = parseCodex0140UsageOutput('Daily usage: 1,234 tokens\nWeekly quota: 50,000\nCumulative total: 999999\n');
assertGate(text.ok === true && text.source_format === 'text', 'usage parser must parse text usage output', text);
assertGate(text.views.daily === 1234 && text.views.weekly === 50000 && text.views.cumulative === 999999, 'usage parser must normalize numeric text output', text);

const empty = parseCodex0140UsageOutput('');
assertGate(empty.ok === false && empty.blockers.includes('usage_output_empty'), 'usage parser must reject empty output', empty);
emitGate('codex:0140-usage-real-parser', { json_fields: Object.keys(json.views).length, text_fields: Object.keys(text.views).length });
