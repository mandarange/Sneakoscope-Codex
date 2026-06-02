import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildZellijClipboardKdl,
  resolveCopyCommand,
  writeZellijClipboardConfig
} from '../../dist/core/zellij/zellij-clipboard-config.js';

test('Zellij clipboard config supports macOS native Cmd+C selection', async () => {
  assert.equal(resolveCopyCommand('darwin'), 'pbcopy');

  const kdl = buildZellijClipboardKdl({
    copy_command: 'pbcopy',
    copy_clipboard: 'system',
    copy_on_select: true,
    mouse_mode: false
  });
  assert.match(kdl, /mouse_mode false/);
  assert.match(kdl, /copy_command "pbcopy"/);
  assert.match(kdl, /copy_on_select true/);
});

test('Zellij clipboard launch flags preserve native mouse-drag copy by default', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-clipboard-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const prev = process.env.SKS_ZELLIJ_MOUSE_MODE;
  delete process.env.SKS_ZELLIJ_MOUSE_MODE;
  t.after(() => { if (prev === undefined) delete process.env.SKS_ZELLIJ_MOUSE_MODE; else process.env.SKS_ZELLIJ_MOUSE_MODE = prev; });
  const cfg = await writeZellijClipboardConfig(root, 'M-clipboard-config-test', 'darwin');

  assert.equal(cfg.copy_command, 'pbcopy');
  assert.equal(cfg.copy_on_select, true);
  assert.equal(cfg.mouse_mode, false);
  assert.deepEqual(cfg.optionFlags, [
    '--copy-command',
    'pbcopy',
    '--copy-on-select',
    'true',
    '--mouse-mode',
    'false'
  ]);
});

test('Zellij clipboard mouse mode can be enabled with SKS_ZELLIJ_MOUSE_MODE=1', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-clipboard-off-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const prev = process.env.SKS_ZELLIJ_MOUSE_MODE;
  process.env.SKS_ZELLIJ_MOUSE_MODE = '1';
  t.after(() => { if (prev === undefined) delete process.env.SKS_ZELLIJ_MOUSE_MODE; else process.env.SKS_ZELLIJ_MOUSE_MODE = prev; });
  const cfg = await writeZellijClipboardConfig(root, 'M-clipboard-config-off', 'darwin');
  assert.equal(cfg.mouse_mode, true);
  assert.deepEqual(cfg.optionFlags.slice(-2), ['--mouse-mode', 'true']);
});
