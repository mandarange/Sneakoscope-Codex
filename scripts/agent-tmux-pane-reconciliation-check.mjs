#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/agents/tmux-physical-proof.js');
const report = mod.buildTmuxPaneReconciliation({
  generatedAt: new Date().toISOString(),
  missionId: 'fixture',
  mode: 'real_tmux',
  realTmux: true,
  phase: 'before_drain',
  supervisor: {
    mission_id: 'fixture',
    lanes: [
      { slot_id: 'slot-001', pane_id: '%101', drained: false, closed_at: null },
      { slot_id: 'slot-002', pane_id: '%102', drained: false, closed_at: null }
    ]
  },
  tmuxLanes: { lanes: [{ slot_id: 'slot-001', pane_id: '%101' }, { slot_id: 'slot-002', pane_id: '%102' }] },
  launchLedger: [
    JSON.stringify({ slot_id: 'slot-001', pane_id: '%101' }),
    JSON.stringify({ slot_id: 'slot-002', pane_id: '%102' })
  ].join('\n'),
  listPanes: mod.parseTmuxListPanes('sks-fixture\t0\t1\t%101\t0\tsh\nsks-fixture\t0\t2\t%102\t0\tsh\n')
});
assertGate(report.ok === true, 'tmux pane reconciliation positive fixture failed', report);
const negative = mod.buildTmuxPaneReconciliation({
  realTmux: true,
  supervisor: { lanes: [{ slot_id: 'slot-001', pane_id: 'fake-pane-slot-001' }] },
  listPanes: mod.parseTmuxListPanes('')
});
assertGate(negative.ok === false && negative.blockers.some((row) => row.includes('fake_tmux_pane_id_in_real_mode')), 'fake pane id must not reconcile in real mode', negative);
emitGate('agent:tmux-pane-reconciliation', { records: report.records.length, negative_blockers: negative.blockers.length });
