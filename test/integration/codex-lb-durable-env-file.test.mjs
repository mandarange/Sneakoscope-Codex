import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../dist/core/fsx.js';

function hermeticEnv(home) {
  const preload = `const models=['gpt-5.6-luna','gpt-5.6-terra','gpt-5.6-sol'].map(slug=>({slug,display_name:slug,supported_reasoning_levels:[],shell_type:'shell_command',visibility:'list',supported_in_api:true,priority:1,base_instructions:'',supports_reasoning_summaries:true,support_verbosity:true,truncation_policy:{mode:'tokens',limit:10000},supports_parallel_tool_calls:true,experimental_supported_tools:[],service_tiers:['priority'],tool_mode:'code_mode_only'}));globalThis.fetch=async input=>{const url=String(input?.url||input);if(url.endsWith('/health'))return new Response('{}',{status:200,headers:{'x-app-version':'1.21.0-beta.3'}});if(url.endsWith('/models'))return new Response(JSON.stringify({models}),{status:200,headers:{'content-type':'application/json'}});throw new Error('unexpected fixture fetch '+url)}`;
  return { ...process.env, HOME: home, CODEX_HOME: path.join(home, '.codex'), CODEX_LB_API_KEY: '', CODEX_LB_BASE_URL: '', CI: 'true', SKS_GLOBAL_ROOT: path.join(home, '.sneakoscope-global'), SKS_UPDATE_MIGRATION_GATE_DISABLED: '1', SKS_ALLOW_UNVERIFIED_CODEX_LB_RECOVERY: '', SKS_CODEX_LB_CHAIN_CHECK: '0', SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1', NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=data:text/javascript,${encodeURIComponent(preload)}`].filter(Boolean).join(' ') };
}

test('codex-lb durable env file mode writes env file and reports durability', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lb-env-'));
  const envPath = path.join(home, '.codex', 'sks-codex-lb.env');
  const result = await runProcess(process.execPath, [path.resolve('dist/bin/sks.js'), 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--yes', '--write-env-file', '--no-keychain', '--no-launchctl', '--json'], {
    cwd: home,
    input: 'sk-clb-env\n',
    env: hermeticEnv(home),
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.ok(json.persistence.applied_modes.includes('durable_env_file'));
  assert.equal(json.persistence.durable, true);
  assert.match(await fs.readFile(envPath, 'utf8'), /CODEX_LB_API_KEY/);
});
