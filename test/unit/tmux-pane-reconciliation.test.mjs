import test from 'node:test';
import assert from 'node:assert/strict';

test('tmux pane reconciliation blocks fake pane ids in real mode', async () => {
  const mod = await import('../../dist/core/agents/tmux-physical-proof.js');
  const report = mod.buildTmuxPaneReconciliation({
    realTmux: true,
    supervisor: { lanes: [{ slot_id: 'slot-001', pane_id: 'fake-pane-slot-001' }] },
    listPanes: []
  });
  assert.equal(report.ok, false);
  assert.ok(report.blockers.some((row) => row.includes('fake_tmux_pane_id_in_real_mode')));
});
