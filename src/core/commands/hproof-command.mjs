import { sksRoot } from '../fsx.mjs';
import { evaluateDoneGate } from '../hproof.mjs';
import { resolveMissionId } from './command-utils.mjs';

export async function hproofCommand(sub, args = []) {
  if (sub !== 'check') return console.error('Usage: sks hproof check [mission-id]');
  const root = await sksRoot();
  const id = await resolveMissionId(root, args[0]);
  if (!id) throw new Error('No mission found.');
  console.log(JSON.stringify(await evaluateDoneGate(root, id), null, 2));
}
