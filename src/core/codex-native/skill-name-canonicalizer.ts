export function canonicalSkillName(name: string): string {
  const normalizedPath = String(name || '').replace(/\\/g, '/').trim();
  const parts = normalizedPath.split('/').filter(Boolean);
  let leaf = parts.length ? String(parts[parts.length - 1]) : normalizedPath;
  if (/^SKILL\.md$/i.test(leaf) && parts.length > 1) leaf = String(parts[parts.length - 2]);
  leaf = leaf.replace(/\.md$/i, '');
  return leaf
    .trim()
    .toLowerCase()
    .replace(/^[$@#]+/, '')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function skillDisplayNameFromMarkdown(text: string, fallback: string): string {
  const match = String(text || '').match(/^name:\s*([^\n\r]+)/m);
  return String(match?.[1] || fallback || '').trim().replace(/^["']|["']$/g, '');
}
