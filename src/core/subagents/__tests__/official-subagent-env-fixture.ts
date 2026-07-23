import assert from 'node:assert/strict';
import path from 'node:path';

export const STANDALONE_CHILD_LEASE_OWNER = 'lease-owner-fixture';

export function standaloneParentHostEnv(root: string, inheritedAuthSecret: string): NodeJS.ProcessEnv {
  return {
    ACAS_CUSTOMER_ID: 'customer-fixture',
    SKS_NARUTO_PARENT_EDGE_ID: 'edge-fixture',
    SKS_NARUTO_PARENT_LEASE_OWNER: STANDALONE_CHILD_LEASE_OWNER,
    SKS_NARUTO_PARENT_LEASE_GENERATION: '7',
    SKS_NARUTO_PARENT_MISSION_GENERATION: '11',
    ACAS_CENTER_BASE_URL: 'https://center.example.test',
    ACAS_CONNECTION_TOKEN: 'acas-connection-secret',
    SUPABASE_ACCESS_TOKEN: 'supabase-access-secret',
    SLACK_BOT_TOKEN: 'slack-bot-secret',
    SLACK_APP_TOKEN: 'slack-app-secret',
    OPENAI_API_KEY: inheritedAuthSecret,
    ANTHROPIC_API_KEY: 'anthropic-api-secret',
    OPENROUTER_API_KEY: 'openrouter-api-secret',
    SHORT_TOKEN: 'ok',
    HTTP_PROXY: 'http://user:proxy-secret@proxy.example.test',
    HTTPS_PROXY: 'https://user:proxy-secret@proxy.example.test',
    ALL_PROXY: 'socks5://user:proxy-secret@proxy.example.test',
    NODE_OPTIONS: `--env-file=${path.join(root, 'host-secrets.env')}`,
    DOTENV_CONFIG_PATH: path.join(root, 'host-secrets.env'),
    ACAS_ENV_FILE: path.join(root, 'acas-host-secrets.env'),
    SKS_ENV_FILE: path.join(root, 'sks-host-secrets.env'),
    CODEX_THREAD_ID: 'outer-app-thread',
    CODEX_LB_API_KEY: 'blocked-lb-secret',
    UNRELATED_RUNTIME_VALUE: 'must-not-reach-child'
  };
}

export function assertStandaloneChildEnvironment(input: {
  actual: Record<string, string | undefined>;
  result: any;
  home: string;
  codexHome: string;
  inheritedAuthSecret: string;
  blockedSecret: string;
}): void {
  assert.deepEqual(
    Object.fromEntries([
      'HOME', 'CODEX_HOME', 'ACAS_CUSTOMER_ID', 'SKS_NARUTO_PARENT_EDGE_ID',
      'SKS_NARUTO_PARENT_LEASE_OWNER', 'SKS_NARUTO_PARENT_LEASE_GENERATION',
      'SKS_NARUTO_PARENT_MISSION_GENERATION', 'SKS_NARUTO_PARENT_MISSION_ID',
      'SKS_NARUTO_PARENT_WORKFLOW_RUN_ID'
    ].map((key) => [key, input.actual[key]])),
    {
      HOME: input.home,
      CODEX_HOME: input.codexHome,
      ACAS_CUSTOMER_ID: 'customer-fixture',
      SKS_NARUTO_PARENT_EDGE_ID: 'edge-fixture',
      SKS_NARUTO_PARENT_LEASE_OWNER: STANDALONE_CHILD_LEASE_OWNER,
      SKS_NARUTO_PARENT_LEASE_GENERATION: '7',
      SKS_NARUTO_PARENT_MISSION_GENERATION: '11',
      SKS_NARUTO_PARENT_MISSION_ID: 'M-real-env-isolation',
      SKS_NARUTO_PARENT_WORKFLOW_RUN_ID: 'run-real-env-isolation'
    }
  );
  for (const key of [
    'ACAS_CENTER_BASE_URL', 'ACAS_CONNECTION_TOKEN', 'SUPABASE_ACCESS_TOKEN',
    'SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
    'OPENROUTER_API_KEY', 'CODEX_LB_API_KEY', 'HTTP_PROXY', 'HTTPS_PROXY',
    'ALL_PROXY', 'NODE_OPTIONS', 'DOTENV_CONFIG_PATH', 'ACAS_ENV_FILE',
    'SKS_ENV_FILE', 'CODEX_THREAD_ID', 'UNRELATED_RUNTIME_VALUE',
    'HOST_INHERITED_SECRET'
  ]) assert.equal(input.actual[key], undefined, key);
  const secrets = new RegExp(`${input.inheritedAuthSecret}|${input.blockedSecret}`);
  assert.doesNotMatch(JSON.stringify(input.result), new RegExp(STANDALONE_CHILD_LEASE_OWNER));
  assert.doesNotMatch(input.result.process.stdout_tail, secrets);
  assert.doesNotMatch(input.result.process.stderr_tail, secrets);
  assert.doesNotMatch(input.result.parent_summary, secrets);
  assert.equal(input.result.process.stdout_tail, '');
  assert.match(input.result.process.stderr_tail, /stderr auth=<redacted> blocked=<redacted> short=ok/);
  assert.equal(input.result.parent_summary, 'summary auth=<redacted> blocked=<redacted> short=ok');
}
