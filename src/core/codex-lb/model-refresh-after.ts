import os from 'node:os';
import path from 'node:path';
import { exists } from '../fsx.js';
import { desktopBridgeServicePaths } from './desktop-service.js';

/**
 * The model-list refresh that ends `sks setup`, `sks menubar install` and
 * `sks codex update` (`sks update` and Doctor run theirs through the catalog
 * repair). It runs only for a managed bridge on macOS, never in an isolated
 * test run — the real one reaches launchd and the user's Codex config — and it
 * never fails the command that ran it: the returned summary carries the line
 * to print, and a failed refresh keeps the previous list.
 */
export async function refreshModelListAfter(reason: string): Promise<Record<string, unknown> | null> {
  if (process.platform !== 'darwin') return null;
  if (process.env.NODE_TEST_CONTEXT !== undefined || process.env.SKS_TEST_ISOLATION === '1' || process.env.SKS_RELEASE_UPGRADE_SMOKE === '1') return null;
  const home = path.resolve(process.env.HOME || os.homedir());
  if (!(await exists(desktopBridgeServicePaths(home).settings_path))) return null;
  const { executeDesktopBridgeCommandV3 } = await import('./desktop-controller-v3.js');
  const command = await executeDesktopBridgeCommandV3(
    { operation: 'models.refresh', reason, force: false, allow_config_writes: true },
    { home, env: process.env }
  ).catch(() => null) as { result?: { model_refresh?: Record<string, unknown> } } | null;
  return command?.result?.model_refresh ?? null;
}
