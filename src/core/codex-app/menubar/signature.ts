import { exists, runProcess, which } from '../../fsx.js';
import { SKS_MENUBAR_LABEL } from './constants.js';
import type { SksMenuBarStatusResult } from './types.js';

export async function inspectSignature(appPath: string, env: NodeJS.ProcessEnv = process.env): Promise<SksMenuBarStatusResult['signature']> {
  if (process.platform !== 'darwin') return { checked: false, identifier: null, ok: true, error: null };
  const codesign = env.SKS_MENUBAR_CODESIGN || await which('codesign').catch(() => null) || '/usr/bin/codesign';
  if (!(await exists(appPath))) return { checked: true, identifier: null, ok: false, error: 'app_missing' };
  const detail = await runProcess(codesign, ['-dv', '--verbose=4', appPath], { timeoutMs: 5_000, maxOutputBytes: 32 * 1024 })
    .catch((error: unknown) => ({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }));
  const text = `${detail.stdout || ''}\n${detail.stderr || ''}`;
  const identifier = text.match(/\bIdentifier=([^\n]+)/)?.[1]?.trim() || null;
  const verify = await runProcess(codesign, ['--verify', '--deep', '--strict', appPath], { timeoutMs: 5_000, maxOutputBytes: 32 * 1024 })
    .catch(() => ({ code: 1, stdout: '', stderr: 'codesign_verify_failed' }));
  return {
    checked: true,
    identifier,
    ok: detail.code === 0 && verify.code === 0 && identifier === SKS_MENUBAR_LABEL,
    error: detail.code === 0 && verify.code === 0 ? null : String(verify.stderr || detail.stderr || detail.stdout).trim()
  };
}
