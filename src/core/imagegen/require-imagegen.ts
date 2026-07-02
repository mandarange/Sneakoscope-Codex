import { detectImagegenCapability } from './imagegen-capability.js';
import { repairCodexImagegen } from '../doctor/imagegen-repair.js';

export async function requireCodexImagegen(root: string, opts: {
  autoRepair?: boolean;
  applyRepair?: boolean;
  codexBin?: string | null;
  timeoutMs?: number;
} = {}) {
  const capability = await detectImagegenCapability({
    codexBin: opts.codexBin || undefined,
    timeoutMs: opts.timeoutMs || 5000
  }).catch((err: unknown) => ({
    ok: false,
    core_ready: false,
    blockers: [err instanceof Error ? err.message : String(err)]
  }));
  if ((capability as any).core_ready === true) {
    return { ok: true, capability, repair: null, blocker: null, blockers: [] };
  }
  const repair = opts.autoRepair === true
    ? await repairCodexImagegen({
        root,
        apply: opts.applyRepair === true,
        codexBin: opts.codexBin || null,
        timeoutMs: opts.timeoutMs || 5000
      }).catch((err: unknown) => ({
        ok: false,
        recovered: false,
        blockers: [err instanceof Error ? err.message : String(err)]
      }))
    : null;
  const finalCapability = repair
    ? (repair as any).after || capability
    : capability;
  const ok = (finalCapability as any).core_ready === true || (repair as any)?.recovered === true;
  const blockers = ok ? [] : [
    ...new Set([
      ...(((finalCapability as any)?.core_blockers || []).map(String)),
      ...(((finalCapability as any)?.blockers || []).map(String)),
      ...(((repair as any)?.blockers || []).map(String)),
      'codex_imagegen_unavailable'
    ])
  ];
  return {
    ok,
    capability: finalCapability,
    repair,
    blocker: ok ? null : {
      schema: 'sks.codex-imagegen-required-blocker.v1',
      blocker: 'codex_imagegen_unavailable',
      status: 'blocked',
      blockers,
      next_actions: (repair as any)?.manual_actions || [
        'Install/update Codex CLI: npm i -g @openai/codex@latest',
        'Open Codex App settings and enable image_generation / $imagegen.',
        'Verify with: codex features list --json'
      ]
    },
    blockers
  };
}
