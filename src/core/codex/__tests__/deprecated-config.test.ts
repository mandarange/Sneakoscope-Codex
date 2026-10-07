import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'smol-toml';
import { repairDeprecatedCodexConfigText, supabaseMcpIsReadOnly } from '../deprecated-config.js';

test('repairs the reported keys without promoting ignored network access or changing model choices', () => {
  const text = [
    '# Personal settings', 'network_access = "enabled" # old setting',
    'model = "user-choice"', 'model_reasoning_effort = "high"', 'service_tier = "flex"',
    '[sandbox_workspace_write]', 'network_access = false',
    '[features.guardianv2]', 'thread_context = false', 'enabled = true',
    '[mcp_servers.supabase]', 'url = "https://mcp.supabase.com/mcp?project_ref=abc&features=database,docs"',
    'read_only = true', 'bearer_token_env_var = "MY_SUPABASE_TOKEN"',
    '[mcp_servers.supabase.http_headers]', 'X-Custom = "preserved"', ''
  ].join('\n');
  const result = repairDeprecatedCodexConfigText(text);
  assert.deepEqual(result.blockers, []);
  const config = parse(result.text) as any;
  assert.equal(config.network_access, undefined);
  assert.equal(config.sandbox_workspace_write.network_access, false);
  assert.equal(config.features.guardianv2.thread_context, undefined);
  assert.equal(config.features.guardianv2.enabled, true);
  assert.equal(config.model, 'user-choice');
  assert.equal(config.model_reasoning_effort, 'high');
  assert.equal(config.service_tier, 'flex');
  assert.equal(config.mcp_servers.supabase.read_only, undefined);
  assert.equal(supabaseMcpIsReadOnly(config.mcp_servers.supabase), true);
  assert.equal(new URL(config.mcp_servers.supabase.url).searchParams.get('project_ref'), 'abc');
  assert.equal(config.mcp_servers.supabase.http_headers['X-Custom'], 'preserved');
  assert.match(result.text, /# Personal settings/);
  assert.match(result.text, /# old setting/);
  assert.equal(repairDeprecatedCodexConfigText(result.text).text, result.text);
});

test('repairs quoted and dotted profile keys while preserving multiline strings that resemble settings', () => {
  const text = [
    'developer_instructions = """', '[features.guardianv2]', 'thread_context = true', '"""',
    '[profiles."custom.profile"."features"."guardianv2"]', '"thread_context" = true',
    'enabled = false', '[profiles.other]', 'network_access = "disabled"',
    'features.guardianv2.thread_context = false', 'model = "chosen"', ''
  ].join('\n');
  const result = repairDeprecatedCodexConfigText(text);
  assert.deepEqual(result.blockers, []);
  const after = parse(result.text) as any;
  assert.equal(after.developer_instructions, (parse(text) as any).developer_instructions);
  assert.equal(after.profiles['custom.profile'].features.guardianv2.thread_context, undefined);
  assert.equal(after.profiles['custom.profile'].features.guardianv2.enabled, false);
  assert.equal(after.profiles.other.network_access, undefined);
  assert.equal(after.profiles.other.features?.guardianv2?.thread_context, undefined);
  assert.equal(after.profiles.other.model, 'chosen');
});

test('stdio read-only migration preserves token arguments, env tables, comments and existing flags', () => {
  const text = [
    '[mcp_servers.supabase]', 'command = "npx"', 'args = [',
    '  "-y", "@supabase/mcp-server-supabase@latest", # package',
    '  "--project-ref", "abc", "--access-token", "test-token"', ']',
    'read_only = true', '[mcp_servers.supabase.env]', 'CUSTOM_ENV = "keep"', ''
  ].join('\n');
  const result = repairDeprecatedCodexConfigText(text);
  assert.deepEqual(result.blockers, []);
  const server = (parse(result.text) as any).mcp_servers.supabase;
  assert.deepEqual(server.args, ['-y', '@supabase/mcp-server-supabase@latest', '--project-ref', 'abc', '--access-token', 'test-token', '--read-only']);
  assert.equal(server.env.CUSTOM_ENV, 'keep');
  assert.match(result.text, /# package/);
  assert.equal(supabaseMcpIsReadOnly(server), true);
  assert.equal(repairDeprecatedCodexConfigText(result.text, { enforceSupabaseReadOnly: true }).text, result.text);
});

test('disabled Supabase stays disabled and unknown transports cannot claim a read-only migration', () => {
  const disabled = '[mcp_servers.supabase]\nenabled = false\nurl = "https://custom.example/mcp"\nread_only = true\n';
  const repaired = repairDeprecatedCodexConfigText(disabled);
  assert.deepEqual(repaired.blockers, []);
  assert.equal((parse(repaired.text) as any).mcp_servers.supabase.enabled, false);
  assert.equal((parse(repaired.text) as any).mcp_servers.supabase.url, 'https://custom.example/mcp');
  const active = disabled.replace('enabled = false', 'enabled = true');
  const refused = repairDeprecatedCodexConfigText(active);
  assert.deepEqual(refused.blockers, ['supabase_mcp_read_only_transport_unverified']);
  assert.equal(refused.text, active);
  assert.equal(supabaseMcpIsReadOnly({ read_only: true, url: 'https://mcp.supabase.com/mcp' }), false);
});

test('unsupported inline layouts and invalid TOML remain untouched with an explicit blocker', () => {
  const inline = 'features = { guardianv2 = { thread_context = true, enabled = true } }\n';
  assert.equal(repairDeprecatedCodexConfigText(inline).text, inline);
  assert.deepEqual(repairDeprecatedCodexConfigText(inline).blockers, ['deprecated_config_layout_requires_manual_repair']);
  const invalid = 'network_access = "unfinished';
  assert.equal(repairDeprecatedCodexConfigText(invalid).text, invalid);
  assert.deepEqual(repairDeprecatedCodexConfigText(invalid).blockers, ['toml_parse_failed']);
});
