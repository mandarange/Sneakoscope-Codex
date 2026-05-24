import fs from 'node:fs/promises';
import path from 'node:path';
const IGNORE = new Set(['.git', 'node_modules', 'dist', '.sneakoscope', '.codex', '.agents']);
export async function collectRepoInventory(root, opts = {}) {
    const files = [];
    await walk(root, root, files, opts.maxFiles || Number(process.env.SKS_AGENT_REPO_INVENTORY_MAX_FILES || 10000));
    const classify = (re) => files.filter((file) => re.test(file));
    return {
        schema: 'sks.agent-repo-inventory.v1',
        root,
        total_files: files.length,
        source_files: classify(/^(?:src|bin|crates)\//),
        tests: classify(/^test\//),
        docs: classify(/^(?:docs\/|README\.md|CHANGELOG\.md)/),
        schemas: classify(/^schemas\//),
        scripts: classify(/^scripts\//),
        generated_files: classify(/^(?:dist|\.sneakoscope|\.codex|\.agents)\//),
        protected_sks_core: classify(/^(?:\.codex|\.agents|AGENTS\.md|node_modules\/sneakoscope|\.sneakoscope\/.*policy.*\.json)/),
        files
    };
}
async function walk(root, dir, out, maxFiles) {
    if (out.length >= maxFiles)
        return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
        if (out.length >= maxFiles)
            return;
        if (IGNORE.has(entry.name))
            continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full).replace(/\\/g, '/');
        if (entry.isDirectory())
            await walk(root, full, out, maxFiles);
        else if (entry.isFile())
            out.push(rel);
    }
}
//# sourceMappingURL=repo-inventory.js.map