import path from 'node:path';
import { projectRoot } from '../core/fsx.mjs';
import { flag, readOption } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
import { addImageRelation, addVisualAnchor, ingestImage, imageVoxelSummary, readImageVoxelLedger } from '../core/wiki-image/image-voxel-ledger.mjs';
import { imageVoxelProofEvidence } from '../core/wiki-image/proof-linker.mjs';
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
    const result = { schema: 'sks.image-voxel-validation.v1', ...validateImageVoxelLedger(ledger, {
      requireAnchors: flag(args, '--require-anchors'),
      requireRelations: flag(args, '--require-relations'),
      route: readOption(args, '--route', '$Wiki')
    }) };
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
  if (action === 'anchor-add') {
    const result = await addVisualAnchor(root, {
      imageId: readOption(args, '--image-id', null),
      bbox: parseBbox(readOption(args, '--bbox', '')),
      label: readOption(args, '--label', 'Visual anchor'),
      source: readOption(args, '--source', 'manual'),
      evidencePath: readOption(args, '--evidence', null),
      route: readOption(args, '--route', '$Wiki'),
      claimId: readOption(args, '--claim-id', null),
      missionId: readOption(args, '--mission-id', null)
    });
    if (flag(args, '--json')) return printJson(result);
    console.log(`Visual anchor: ${result.ok ? 'added' : 'blocked'} ${result.anchor.id}`);
    for (const issue of result.validation.issues) console.log(`- ${issue}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'relation-add') {
    const result = await addImageRelation(root, {
      type: readOption(args, '--type', 'before_after'),
      beforeImageId: readOption(args, '--before', null),
      afterImageId: readOption(args, '--after', null),
      anchors: String(readOption(args, '--anchors', '') || '').split(',').map((x) => x.trim()).filter(Boolean),
      verification: readOption(args, '--verification', 'changed-screen-recheck'),
      status: readOption(args, '--status', 'verified_partial'),
      route: readOption(args, '--route', '$Wiki'),
      missionId: readOption(args, '--mission-id', null)
    });
    if (flag(args, '--json')) return printJson(result);
    console.log(`Image relation: ${result.ok ? 'added' : 'blocked'} ${result.relation.type}`);
    for (const issue of result.validation.issues) console.log(`- ${issue}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'image-link-proof') {
    const result = await imageVoxelProofEvidence(root);
    if (flag(args, '--json')) return printJson(result);
    console.log(`Image voxel proof link: ${result.ok ? 'ok' : 'blocked'}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const legacy = await import('../cli/legacy-main.mjs');
  return legacy.main(['wiki', ...args]);
}

function parseBbox(raw) {
  const parts = String(raw || '').split(',').map((part) => Number(part.trim()));
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : null;
}
