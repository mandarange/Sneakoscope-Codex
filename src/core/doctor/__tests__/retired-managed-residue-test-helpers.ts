import fs from 'node:fs/promises';
import path from 'node:path';

export async function findFile(root: string, name: string): Promise<string | null> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFile(candidate, name);
      if (nested) return nested;
    } else if (entry.name === name) {
      return candidate;
    }
  }
  return null;
}
