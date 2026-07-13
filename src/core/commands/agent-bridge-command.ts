import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, exists, nowIso, projectRoot, runProcess, writeJsonAtomic } from '../fsx.js';
import { buildAgentManifest, validateAgentManifest } from '../agent-bridge/agent-manifest.js';
import { flag } from './command-utils.js';

async function resolveSksEntrypoint(): Promise<string> {
  // Mirrors src/core/agent-bridge/mcp-server.ts's own bin resolution: prefer the
  // packaged dist entrypoint, fall back to the source-tree relative path in dev.
  const packedBin = fileURLToPath(new URL('../../bin/sks.js', import.meta.url));
  const sourceBin = fileURLToPath(new URL('../../../bin/sks.js', import.meta.url));
  return (await exists(packedBin)) ? packedBin : sourceBin;
}

async function runNonInteractiveSmoke(entrypoint: string): Promise<{ ok: boolean; command: string; exit_code: number | null; note: string }> {
  const result = await runProcess(process.execPath, [entrypoint, 'status', '--json'], {
    env: { SKS_AGENT_MODE: '1' },
    timeoutMs: 15_000,
    // Status is intentionally bounded but can exceed 32 KiB when several
    // session summaries are present. Truncating otherwise-valid JSON makes the
    // bridge report a false non-interactive failure.
    maxOutputBytes: 512 * 1024
  }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }));
  let stdoutIsCleanJson = false;
  try {
    JSON.parse(result.stdout);
    stdoutIsCleanJson = true;
  } catch {
    stdoutIsCleanJson = false;
  }
  return {
    ok: result.code === 0 && stdoutIsCleanJson,
    command: `SKS_AGENT_MODE=1 ${entrypoint} status --json`,
    exit_code: result.code,
    note: stdoutIsCleanJson
      ? 'stdout parsed as clean JSON with SKS_AGENT_MODE=1 set — non-interactive contract verified end-to-end for this one command.'
      : 'stdout did not parse as clean JSON; a real agent host would fail to consume this — see exit_code/stderr in the report.'
  };
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
  const smoke = await runNonInteractiveSmoke(entrypoint);

  const result = {
    schema: 'sks.agent-bridge-setup.v1',
    generated_at: nowIso(),
    ok: smoke.ok,
    manifest_path: manifestPath,
    tool_count: manifest.tools.length,
    manifest_validation: manifestValidation,
    registration_snippets: registrationSnippets(),
    non_interactive_smoke: smoke
  };

  if (flag(args as any, '--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Agent bridge manifest written: ${manifestPath} (${manifest.tools.length} tools)`);
    console.log('Register with a generic MCP host:');
    console.log(`  ${JSON.stringify(registrationSnippets().generic_mcp_host)}`);
    console.log('Register with Codex CLI:');
    console.log(`  ${registrationSnippets().codex_cli}`);
    console.log(`Non-interactive smoke test: ${smoke.ok ? 'ok' : 'FAILED'} (${smoke.note})`);
  }
  return result;
}
