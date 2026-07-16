import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../dist/core/fsx.js';

function hermeticEnv(home) {
  const preload = `const models=['gpt-5.6-luna','gpt-5.6-terra','gpt-5.6-sol'].map(slug=>({slug,display_name:slug,supported_reasoning_levels:[],shell_type:'shell_command',visibility:'list',supported_in_api:true,priority:1,base_instructions:'',supports_reasoning_summaries:true,support_verbosity:true,truncation_policy:{mode:'tokens',limit:10000},supports_parallel_tool_calls:true,experimental_supported_tools:[],service_tiers:['priority'],tool_mode:'code_mode_only'}));globalThis.fetch=async input=>{const url=String(input?.url||input);if(url.endsWith('/health'))return new Response('{}',{status:200,headers:{'x-app-version':'1.21.0-beta.3'}});if(url.endsWith('/models'))return new Response(JSON.stringify({models}),{status:200,headers:{'content-type':'application/json'}});throw new Error('unexpected fixture fetch '+url)}`;
  return { ...process.env, HOME: home, CODEX_LB_API_KEY: '', CODEX_LB_BASE_URL: '', CI: 'true', SKS_UPDATE_MIGRATION_GATE_DISABLED: '1', SKS_ALLOW_UNVERIFIED_CODEX_LB_RECOVERY: '', NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=data:text/javascript,${encodeURIComponent(preload)}`].filter(Boolean).join(' ') };
}

test('codex-lb setup fixture command configures without leaking the key', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-fixture-runner-'));
  try {
    await fs.symlink(path.resolve('dist'), path.join(home, 'dist'), 'dir');
    const result = await runProcess(process.execPath, [path.resolve('dist/scripts/codex-lb-setup-fixture-check.js')], {
      cwd: home,
      env: hermeticEnv(home),
      timeoutMs: 20_000,
      maxOutputBytes: 256 * 1024
    });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});
