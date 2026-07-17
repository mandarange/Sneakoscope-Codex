import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, exists, nowIso, projectRoot, runProcess, writeJsonAtomic } from '../fsx.js';
import {
  buildAgentManifest,
  validateAgentManifest,
  type AgentManifest
} from '../agent-bridge/agent-manifest.js';
import { flag } from './command-utils.js';

interface NonInteractiveSmoke {
  ok: boolean;
  command: string;
  exit_code: number | null;
  note: string;
  issues: string[];
  starts_mission: false;
}

async function resolveSksEntrypoint(): Promise<string> {
  // Mirrors src/core/agent-bridge/mcp-server.ts's own bin resolution: prefer the
  // packaged dist entrypoint, fall back to the source-tree relative path in dev.
  const packedBin = fileURLToPath(new URL('../../bin/sks.js', import.meta.url));
  const sourceBin = fileURLToPath(new URL('../../../bin/sks.js', import.meta.url));
  return (await exists(packedBin)) ? packedBin : sourceBin;
}

async function runJsonSmoke(
  entrypoint: string,
  args: readonly string[],
  validate: (value: Record<string, unknown>) => string[],
  run: typeof runProcess
): Promise<NonInteractiveSmoke> {
  const result = await run(process.execPath, [entrypoint, ...args], {
    env: { SKS_AGENT_MODE: '1' },
    timeoutMs: 15_000,
    // Status is intentionally bounded but can exceed 32 KiB when several
    // session summaries are present. Truncating otherwise-valid JSON makes the
    // bridge report a false non-interactive failure.
    maxOutputBytes: 512 * 1024
  }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }));
  let parsed: Record<string, unknown> | null = null;
  try {
    const value = JSON.parse(result.stdout);
    parsed = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    parsed = null;
  }
  const issues = parsed ? validate(parsed) : ['stdout_not_clean_json_object'];
  if (result.code !== 0) issues.push(`exit_code:${String(result.code)}`);
  return {
    ok: result.code === 0 && issues.length === 0,
    command: `SKS_AGENT_MODE=1 ${entrypoint} ${args.join(' ')}`,
    exit_code: result.code,
    note: issues.length === 0
      ? 'stdout parsed as one clean JSON object with SKS_AGENT_MODE=1 set.'
      : `non-interactive JSON contract failed: ${issues.join(', ')}`,
    issues,
    starts_mission: false
  };
}

export async function runAgentBridgeContractSmokes(
  entrypoint: string,
  manifest: AgentManifest,
  run: typeof runProcess = runProcess
): Promise<{ status: NonInteractiveSmoke; naruto_help: NonInteractiveSmoke }> {
  const naruto = manifest.tools.find((tool) => tool.name === 'naruto');
  const manifestActions = (naruto?.input_schema as any)?.properties?.action?.enum;
  const [status, narutoHelp] = await Promise.all([
    runJsonSmoke(entrypoint, ['status', '--json'], () => [], run),
    runJsonSmoke(entrypoint, ['naruto', 'help', '--json'], (value) => {
      const issues: string[] = [];
      if (value.schema !== 'sks.naruto-subagent-workflow.v1') issues.push('naruto_help_schema');
      if (value.action !== 'help') issues.push('naruto_help_action');
      if (value.workflow !== 'official_codex_subagent') issues.push('naruto_help_workflow');
      if (value.max_depth !== 1) issues.push('naruto_help_max_depth');
      if (JSON.stringify(value.commands) !== JSON.stringify(manifestActions)) issues.push('naruto_help_manifest_actions');
      return issues;
    }, run)
  ]);
  return { status, naruto_help: narutoHelp };
}

function registrationSnippets(): Record<string, unknown> {
  return {
    generic_mcp_host: { command: 'sks', args: ['mcp-server'] },
    codex_cli: 'codex mcp add sks -- sks mcp-server',
    non_interactive_cli: {
      env: { SKS_AGENT_MODE: '1' },
      example: 'SKS_AGENT_MODE=1 sks status --json',
      streaming_example: 'SKS_AGENT_MODE=1 sks qa-loop run <mission> --mock --stream --json'
    }
  };
}

export async function agentBridgeCommand(subcommand: string, args: readonly string[] = []): Promise<unknown> {
  const sub = subcommand || 'setup';
  if (sub !== 'setup') {
    const result = { ok: false, error: `unknown_subcommand:${sub}`, supported: ['setup'] };
    if (flag(args as any, '--json')) console.log(JSON.stringify(result, null, 2));
    else console.log(`Unknown agent-bridge subcommand "${sub}". Supported: setup`);
    return result;
  }

  const root = await projectRoot();
  const manifest = buildAgentManifest();
  const manifestValidation = validateAgentManifest(manifest);
  const manifestPath = path.join(root, '.sneakoscope', 'agent-bridge', 'manifest.json');
  if (!manifestValidation.ok) {
    const result = {
      schema: 'sks.agent-bridge-setup.v1',
      generated_at: nowIso(),
      ok: false,
      status: 'manifest_validation_failed',
      manifest_path: manifestPath,
      manifest_validation: manifestValidation
    };
    process.exitCode = 1;
    if (flag(args as any, '--json')) console.log(JSON.stringify(result, null, 2));
    else console.error(`Agent bridge manifest validation failed: ${manifestValidation.issues.join(', ')}`);
    return result;
  }
  await ensureDir(path.dirname(manifestPath));
  await writeJsonAtomic(manifestPath, manifest);

  const entrypoint = await resolveSksEntrypoint();
  const smokes = await runAgentBridgeContractSmokes(entrypoint, manifest);

  const result = {
    schema: 'sks.agent-bridge-setup.v1',
    generated_at: nowIso(),
    ok: smokes.status.ok && smokes.naruto_help.ok,
    manifest_path: manifestPath,
    tool_count: manifest.tools.length,
    manifest_validation: manifestValidation,
    registration_snippets: registrationSnippets(),
    non_interactive_smoke: smokes.status,
    naruto_help_smoke: smokes.naruto_help
  };
  if (!result.ok) process.exitCode = 1;

  if (flag(args as any, '--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Agent bridge manifest written: ${manifestPath} (${manifest.tools.length} tools)`);
    console.log('Register with a generic MCP host:');
    console.log(`  ${JSON.stringify(registrationSnippets().generic_mcp_host)}`);
    console.log('Register with Codex CLI:');
    console.log(`  ${registrationSnippets().codex_cli}`);
    console.log(`Non-interactive status smoke: ${smokes.status.ok ? 'ok' : 'FAILED'} (${smokes.status.note})`);
    console.log(`Naruto help contract smoke: ${smokes.naruto_help.ok ? 'ok' : 'FAILED'} (${smokes.naruto_help.note})`);
  }
  return result;
}
