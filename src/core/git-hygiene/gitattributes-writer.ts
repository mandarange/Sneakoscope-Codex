import path from 'node:path';
import { readText, writeTextAtomic } from '../fsx.js';
import { GIT_ATTRIBUTES_BLOCK, type SksGitPolicy } from './git-policy.js';
import { mergeHashBlock } from './gitignore-writer.js';

export function gitattributesBlock(policy?: SksGitPolicy): string {
  const lfs = policy?.large_artifacts?.image_binary_policy === 'lfs';
  return `# BEGIN ${GIT_ATTRIBUTES_BLOCK}
.sneakoscope/wiki/records/**/*.json merge=union
.sneakoscope/wiki/wrongness/**/*.json merge=union
.sneakoscope/wiki/avoidance-rules/**/*.json merge=union
.sneakoscope/wiki/summaries/**/*.md merge=union
.sneakoscope/wiki/image-voxels/**/*.json merge=union
${lfs ? '.sneakoscope/wiki/images/**/* filter=lfs diff=lfs merge=lfs -text\n' : '# Large raw visual artifacts should use LFS only if explicitly enabled.\n'}# END ${GIT_ATTRIBUTES_BLOCK}
`;
}

export async function installGitattributesBlock(root: string, policy?: SksGitPolicy): Promise<{ path: string; changed: boolean }> {
  const file = path.join(root, '.gitattributes');
  const current = await readText(file, '');
  const next = mergeHashBlock(current, GIT_ATTRIBUTES_BLOCK, gitattributesBlock(policy));
  if (next !== current) await writeTextAtomic(file, next);
  return { path: file, changed: next !== current };
}

export function hasGitattributesBlock(text: string): boolean {
  return String(text || '').includes(`# BEGIN ${GIT_ATTRIBUTES_BLOCK}`) && String(text || '').includes(`# END ${GIT_ATTRIBUTES_BLOCK}`);
}
