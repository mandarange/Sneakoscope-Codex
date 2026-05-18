import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from '../fsx.mjs';
import { rollbackId, rollbackList } from '../managed-paths.mjs';
import { flag, positionalArgs, readFlagValue } from './command-utils.mjs';

export async function rollbackCommand(args = []) {
  const action = args[0] || 'list';
  const root = await projectRoot();
  if (action === 'list') {
    const report = await rollbackList(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
    console.log('SKS rollback actions');
    for (const row of report.actions) console.log(`- ${row.id}: ${row.path} ${row.exists ? 'exists' : 'missing'}`);
    return report;
  }
  if (action === 'apply') {
    const id = positionalArgs(args.slice(1))[0];
    const confirm = readFlagValue(args, '--confirm', '');
    const list = await rollbackList(root);
    const row = list.actions.find((entry) => entry.id === id || rollbackId(entry.path) === id);
    if (!row) {
      console.error(`Unknown rollback id: ${id || 'missing'}`);
      process.exitCode = 2;
      return;
    }
    if (confirm !== 'apply-managed-rollback') {
      const blocked = { schema: 'sks.rollback-apply.v1', ok: false, status: 'blocked', id, reason: 'confirmation_required', required_confirmation: 'apply-managed-rollback' };
      process.exitCode = 1;
      if (flag(args, '--json')) return console.log(JSON.stringify(blocked, null, 2));
      console.log(`Rollback blocked for ${row.path}; rerun with --confirm apply-managed-rollback.`);
      return blocked;
    }
    await fs.rm(path.join(root, row.path), { recursive: true, force: true });
    const result = { schema: 'sks.rollback-apply.v1', ok: true, status: 'applied', id: row.id, path: row.path };
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Rollback applied: ${row.path}`);
    return result;
  }
  console.error('Usage: sks rollback list|apply <id> [--confirm apply-managed-rollback] [--json]');
  process.exitCode = 2;
}
