import path from 'node:path';
import { writeJsonAtomic } from '../fsx.js';
import { ensureConfinedDirectory, inspectConfinedPath, isLexicallyConfined } from '../managed-path-safety.js';

export async function writeRootConfinedJsonReport<T>(input: {
  root: string;
  reportPath: string;
  value: T;
}): Promise<boolean> {
  const root = path.resolve(input.root);
  const reportPath = path.resolve(input.reportPath);
  if (!isLexicallyConfined(root, reportPath) || reportPath === root) return false;
  try {
    await ensureConfinedDirectory(root, path.dirname(reportPath));
    const before = await inspectConfinedPath(root, reportPath);
    if (before.exists && (before.leafSymlink || !before.stat?.isFile())) return false;
    await writeJsonAtomic(reportPath, input.value);
    const after = await inspectConfinedPath(root, reportPath);
    return after.exists && !after.leafSymlink && Boolean(after.stat?.isFile());
  } catch {
    return false;
  }
}
