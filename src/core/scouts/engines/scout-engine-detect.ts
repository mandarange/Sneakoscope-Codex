import { getCodexInfo } from '../../codex-adapter.js';
import { runProcess, which } from '../../fsx.js';
import { availableEngine, unavailableEngine } from './scout-engine-base.js';
import { readCodexAppSubagentCapability } from './codex-app-subagent-engine.js';

export async function detectScoutEngines(root: any, opts: any = {}) {
  const [codex, tmux, app] = await Promise.all([
    detectCodexExecParallel(root, opts),
    detectTmuxLanes(root, opts),
    detectCodexAppSubagents(root, opts)
  ]);
  return {
    schema: 'sks.scout-engines.v1',
    root,
    engines: [
      codex,
      tmux,
      app,
      availableEngine('local-static', {
        real_parallel: false,
        claim_allowed: false,
        fallback_only: true,
        reason: 'deterministic local static fixture engine'
      }),
      availableEngine('sequential-fallback', {
        real_parallel: false,
        claim_allowed: false,
        fallback_only: true,
        reason: 'deterministic sequential fallback engine'
      })
    ]
  };
}

export async function detectCodexExecParallel(root: any, opts: any = {}) {
  const info: any = await getCodexInfo().catch((err: any) => ({ available: false, error: err.message }));
  if (!info?.available || !info.bin) return unavailableEngine('codex-exec-parallel', 'Codex CLI not available; set SKS_CODEX_BIN or install codex CLI.');
  return availableEngine('codex-exec-parallel', {
    bin: info.bin,
    version: info.version || null,
    reason: 'Codex CLI found and can run separate exec jobs.'
  });
}

export async function detectTmuxLanes(root: any, opts: any = {}) {
  const bin = await which('tmux');
  if (!bin) return unavailableEngine('tmux-lanes', 'tmux binary not available on PATH.');
  const version = await runProcess(bin, ['-V'], { timeoutMs: 5000, maxOutputBytes: 4096 }).catch((err: any) => ({ code: 1, stdout: '', stderr: err.message }));
  if (version.code !== 0) return unavailableEngine('tmux-lanes', `tmux exists but version check failed: ${String(version.stderr || version.stdout || '').trim() || 'unknown error'}`);
  return availableEngine('tmux-lanes', {
    bin,
    version: String(version.stdout || version.stderr || '').trim(),
    reason: 'tmux is available for lane orchestration.'
  });
}

export async function detectCodexAppSubagents(root: any, opts: any = {}) {
  const capability = await readCodexAppSubagentCapability();
  if (capability.available) {
    return availableEngine('codex-app-subagents', {
      capability_file: capability.file,
      event_schema_version: capability.descriptor?.event_schema_version || null,
      reason: 'Codex App subagent capability descriptor is present and valid.'
    });
  }
  return unavailableEngine('codex-app-subagents', (capability.blockers || []).join('; ') || 'Codex App subagent runtime capability is not exposed to this CLI process; schema/events are not invented.');
}
