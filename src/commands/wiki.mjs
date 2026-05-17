import path from 'node:path';
import { projectRoot } from '../core/fsx.mjs';
import { flag, readOption } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
import { ingestImage, imageVoxelSummary, readImageVoxelLedger } from '../core/wiki-image/image-voxel-ledger.mjs';
import { validateImageVoxelLedger } from '../core/wiki-image/validation.mjs';

export async function run(_command, args = []) {
  const root = await projectRoot();
  const action = args[0] || 'help';
  if (action === 'image-ingest') {
    const imagePath = args.find((arg, i) => i > 0 && !String(arg).startsWith('--'));
    const result = await ingestImage(root, imagePath, {
      source: readOption(args, '--source', 'manual'),
      missionId: readOption(args, '--mission-id', null)
    });
    if (flag(args, '--json')) return printJson(result);
    console.log(`Image ingested: ${result.image.id}`);
    console.log(`Ledger: ${path.relative(root, path.join(root, '.sneakoscope', 'wiki', 'image-voxel-ledger.json'))}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'image-validate') {
    const ledgerPath = args.find((arg, i) => i > 0 && !String(arg).startsWith('--'));
    const ledger = await readImageVoxelLedger(root, ledgerPath ? path.resolve(root, ledgerPath) : undefined);
    const result = { schema: 'sks.image-voxel-validation.v1', ...validateImageVoxelLedger(ledger) };
    if (flag(args, '--json')) return printJson(result);
    console.log(`Image voxel ledger: ${result.ok ? 'pass' : 'blocked'}`);
    for (const issue of result.issues) console.log(`- ${issue}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'image-summary') {
    const result = await imageVoxelSummary(root);
    if (flag(args, '--json')) return printJson(result);
    console.log(`Images: ${result.images}`);
    console.log(`Anchors: ${result.anchors}`);
    console.log(`Relations: ${result.relations}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const legacy = await import('../cli/legacy-main.mjs');
  return legacy.main(['wiki', ...args]);
}
