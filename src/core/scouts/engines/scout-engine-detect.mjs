import { getCodexInfo } from '../../codex-adapter.mjs';
import { runProcess, which } from '../../fsx.mjs';
import { availableEngine, unavailableEngine } from './scout-engine-base.mjs';

export async function detectScoutEngines(root, opts = {}) {
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

export async function detectCodexExecParallel(root, opts = {}) {
  const info = await getCodexInfo().catch((err) => ({ available: false, error: err.message }));
  if (!info?.available || !info.bin) return unavailableEngine('codex-exec-parallel', 'Codex CLI not available; set SKS_CODEX_BIN or install codex CLI.');
  return availableEngine('codex-exec-parallel', {
    bin: info.bin,
    version: info.version || null,
    reason: 'Codex CLI found and can run separate exec jobs.'
  });
}

export async function detectTmuxLanes(root, opts = {}) {
  const bin = await which('tmux');
  if (!bin) return unavailableEngine('tmux-lanes', 'tmux binary not available on PATH.');
  const version = await runProcess(bin, ['-V'], { timeoutMs: 5000, maxOutputBytes: 4096 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (version.code !== 0) return unavailableEngine('tmux-lanes', `tmux exists but version check failed: ${String(version.stderr || version.stdout || '').trim() || 'unknown error'}`);
  return availableEngine('tmux-lanes', {
    bin,
    version: String(version.stdout || version.stderr || '').trim(),
    reason: 'tmux is available for lane orchestration.'
  });
}

export async function detectCodexAppSubagents(root, opts = {}) {
  if (process.env.SKS_CODEX_APP_SUBAGENTS === '1') {
    return availableEngine('codex-app-subagents', {
      reason: 'SKS_CODEX_APP_SUBAGENTS=1 explicitly declared local Codex App subagent runtime support.'
    });
  }
  return unavailableEngine('codex-app-subagents', 'Codex App subagent runtime capability is not exposed to this CLI process; schema/events are not invented.');
}
