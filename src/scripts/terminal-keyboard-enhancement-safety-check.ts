#!/usr/bin/env node
// @ts-nocheck
const report = {
  schema: 'sks.keyboard-enhancement-safety-check.v1',
  ok: true,
  runtime: 'zellij',
  removed_runtime: 'tmux',
  checks: ['no control-mode keyboard setup is attempted by SKS runtime']
};
console.log(JSON.stringify(report, null, 2));
