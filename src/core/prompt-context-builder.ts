import { nowIso } from './fsx.js';

export function buildPromptContext({ stable = [], policies = [], tools = [], skills = [], dynamic = [] }: any = {}) {
  const stableBlocks = normalizeBlocks([...stable, ...policies, ...tools, ...skills]);
  const dynamicBlocks = normalizeBlocks(dynamic);
  const blocks = [...stableBlocks.map((block: any) => ({ ...block, cache_region: 'stable_prefix' })), ...dynamicBlocks.map((block: any) => ({ ...block, cache_region: 'dynamic_suffix' }))];
  const text = blocks.map((block: any) => block.text).join('\n\n');
  return {
    schema_version: 1,
    built_at: nowIso(),
    ordering: ['stable_instructions', 'stable_policies', 'stable_tool_descriptions', 'stable_skill_summaries', 'dynamic_context'],
    blocks,
    approximate_chars: text.length,
    approximate_tokens: Math.ceil(text.length / 4),
    text
  };
}

export function selectSkillSummaries(skills: any = [], { route = '', taskSignature = '', topK = 3 }: any = {}) {
  const hay = `${route} ${taskSignature}`.toLowerCase();
  return skills
    .filter((skill: any) => skill.status !== 'deprecated')
    .map((skill: any) => ({
      ...skill,
      score: (skill.triggers || []).reduce((sum: any, trigger: any) => sum + (hay.includes(String(trigger).toLowerCase().replace(/^\$/, '')) ? 1 : 0), 0)
    }))
    .filter((skill: any) => skill.score > 0 || skill.always_include)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, topK)
    .map((skill: any) => `${skill.id || skill.name}: ${skill.summary || skill.description || ''}`.trim());
}

function normalizeBlocks(items: any = []) {
  return items.filter(Boolean).map((item: any, index: any) => {
    if (typeof item === 'string') return { id: `block-${index + 1}`, text: item };
    return { id: item.id || `block-${index + 1}`, text: String(item.text || item.summary || '') };
  }).filter((block: any) => block.text.trim());
}
