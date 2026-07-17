export const SKS_DOLLAR_ROOT_SKILL = 'sks';
export const SKS_DOLLAR_SKILL_PREFIX = 'sks-';

export function normalizeDollarSkillName(value: unknown): string {
  return String(value || '').trim().replace(/^\$/, '').toLowerCase();
}

export function unprefixedSksSkillName(value: unknown): string {
  const name = normalizeDollarSkillName(value);
  return name.startsWith(SKS_DOLLAR_SKILL_PREFIX)
    ? name.slice(SKS_DOLLAR_SKILL_PREFIX.length)
    : name;
}

export function sksPrefixedSkillName(value: unknown): string {
  const name = normalizeDollarSkillName(value);
  if (!name || name === SKS_DOLLAR_ROOT_SKILL || name.startsWith(SKS_DOLLAR_SKILL_PREFIX)) return name;
  return `${SKS_DOLLAR_SKILL_PREFIX}${name}`;
}

export function sksPrefixedDollarCommand(value: unknown): string {
  const name = sksPrefixedSkillName(value);
  return name ? `$${name}` : '$sks';
}

export function prefixKnownSksDollarReferences(text: unknown, legacyNames: readonly string[]): string {
  const known = new Set(legacyNames.map(normalizeDollarSkillName).filter(Boolean));
  return String(text || '').replace(/\$([A-Za-z][A-Za-z0-9_-]*)/g, (match, token) => (
    known.has(normalizeDollarSkillName(token)) ? sksPrefixedDollarCommand(token) : match
  ));
}
