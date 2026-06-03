#!/usr/bin/env node
// @ts-nocheck
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) {
  console.log(JSON.stringify({ schema: 'sks.tui-output-stability-check.v1', ok: false, blockers: ['dist_not_fresh'], freshness }, null, 2));
  process.exit(1);
}
const layoutMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-layout-builder.js')).href);
const madLayout = layoutMod.buildZellijLayoutKdl({
  missionId: 'M-tui-output-stability',
  ledgerRoot: path.join(root, '.sneakoscope', 'tmp', 'tui-output-stability'),
  cwd: root,
  kind: 'mad',
  slotCount: 1,
  codexArgs: ['--profile', 'sks-mad-high']
});
const codexScrollbackOk = madLayout.codex_args.includes('--no-alt-screen')
  && madLayout.layout_kdl.includes('--no-alt-screen');
const report = {
  schema: 'sks.tui-output-stability-check.v1',
  ok: codexScrollbackOk,
  runtime: 'zellij',
  stdout_frame_policy: 'lane renderer stdout only',
  stderr_policy: 'errors only',
  codex_scrollback_policy: 'zellij interactive Codex panes launch with --no-alt-screen so trackpad wheel scrolls terminal conversation history instead of the prompt textarea',
  codex_no_alt_screen: codexScrollbackOk,
  blockers: codexScrollbackOk ? [] : ['codex_no_alt_screen_missing']
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
