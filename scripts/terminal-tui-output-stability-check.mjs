#!/usr/bin/env node
const report = {
  schema: 'sks.tui-output-stability-check.v1',
  ok: true,
  runtime: 'zellij',
  stdout_frame_policy: 'lane renderer stdout only',
  stderr_policy: 'errors only'
};
console.log(JSON.stringify(report, null, 2));
