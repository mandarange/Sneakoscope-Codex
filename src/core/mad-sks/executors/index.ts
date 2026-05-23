import { buildMadSksPermissionModel, parseMadSksFlags } from '../permission-model.js';
import { createMadSksExecutorContext, type MadSksExecutorInput, type MadSksExecutorResult } from './executor-base.js';
import { fileWriteExecutor } from './file-write-executor.js';
import { shellCommandExecutor } from './shell-command-executor.js';
import { packageInstallExecutor } from './package-install-executor.js';
import { serviceControlExecutor } from './service-control-executor.js';
import { dbWriteExecutor } from './db-write-executor.js';
import { browserUseExecutor, computerUseExecutor, generatedAssetExecutor } from './computer-use-executor.js';

const EXECUTORS = {
  'file-write': fileWriteExecutor,
  file_write: fileWriteExecutor,
  shell: shellCommandExecutor,
  'shell-command': shellCommandExecutor,
  package: packageInstallExecutor,
  'package-install': packageInstallExecutor,
  service: serviceControlExecutor,
  'service-control': serviceControlExecutor,
  db: dbWriteExecutor,
  'db-write': dbWriteExecutor,
  computer: computerUseExecutor,
  'computer-use': computerUseExecutor,
  browser: browserUseExecutor,
  'browser-use': browserUseExecutor,
  asset: generatedAssetExecutor,
  'generated-asset': generatedAssetExecutor
} as const;

export function madSksExecutorIds() {
  return [...new Set(Object.values(EXECUTORS).map((executor) => executor.id))];
}

export async function runMadSksExecutor(input: MadSksExecutorInput): Promise<MadSksExecutorResult> {
  const id = String(input.executor || 'file-write') as keyof typeof EXECUTORS;
  const executor = EXECUTORS[id] || fileWriteExecutor;
  const permissionInput: any = {
    userIntent: String(input.user_intent || 'MAD-SKS executor run'),
    flags: parseMadSksFlags(['--mad-sks', ...(input.dry_run ? ['--dry-run'] : []), ...(input.yes ? ['--yes'] : [])])
  };
  if (input.target_root) permissionInput.targetRoot = input.target_root;
  const permission_model = input.permission_model || buildMadSksPermissionModel(permissionInput);
  const context = createMadSksExecutorContext({ ...input, permission_model });
  return input.dry_run ? executor.dryRun(input, context) : executor.apply(input, context);
}
