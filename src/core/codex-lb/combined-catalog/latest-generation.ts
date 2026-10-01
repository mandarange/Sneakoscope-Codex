import { compareModelVersions, parseGptModelId } from '../../subagents/model-tiers.js';
import type { BridgeCatalogModel } from '../bridge-contracts.js';

function isListed(model: BridgeCatalogModel): boolean {
  const visibility = String(model.visibility || 'list').toLowerCase();
  return visibility !== 'hide' && visibility !== 'hidden';
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "GPT-5.6-Sol" also appears as "GPT-5.6 Sol" in migration text.
function displayNamePattern(displayName: string): RegExp {
  const body = escapeRegExp(displayName.trim()).replace(/\\?-|\s+/g, '[-\\s]');
  return new RegExp(`(?<![\\w-])${body}(?![\\w-])`, 'gi');
}

/**
 * Keep every `gpt-<version>-<family>` family on its newest generation in the
 * catalog Codex Desktop reads, so the picker and the spawn_agent model list
 * never advertise a superseded generation next to the current one:
 *
 * - a row that is not the newest listed row of its family is hidden, not
 *   removed, so a thread or `model =` line that still names it keeps routing;
 * - an `upgrade.model` pointer (Codex's migration prompt for a retiring model)
 *   that names a superseded generation is retargeted to the newest row of that
 *   family, with the old display name in the migration text swapped for the new.
 *
 * Only rows that parse as `gpt-<version>-<family>` are touched; vendor-prefixed
 * ids and ids without a family are left as served.
 */
export function pinCatalogToLatestGenerations(models: readonly BridgeCatalogModel[]): BridgeCatalogModel[] {
  const newest = new Map<string, BridgeCatalogModel>();
  for (const model of models) {
    const id = parseGptModelId(model.public_id);
    if (!id || !isListed(model)) continue;
    const best = newest.get(id.family);
    if (!best || compareModelVersions(id.version, parseGptModelId(best.public_id)!.version) > 0) newest.set(id.family, model);
  }
  const byId = new Map(models.map((model) => [model.public_id, model]));
  return models.map((model) => {
    const id = parseGptModelId(model.public_id);
    let next = model;
    if (id && isListed(model)) {
      const best = newest.get(id.family);
      if (best && compareModelVersions(parseGptModelId(best.public_id)!.version, id.version) > 0) next = { ...next, visibility: 'hide' };
    }
    const upgrade = model.upgrade;
    const target = upgrade && typeof upgrade === 'object' ? String((upgrade as { model?: unknown }).model || '') : '';
    const targetId = parseGptModelId(target);
    const replacement = targetId ? newest.get(targetId.family) : undefined;
    if (targetId && replacement && replacement.public_id !== target
      && compareModelVersions(parseGptModelId(replacement.public_id)!.version, targetId.version) > 0) {
      const old = byId.get(target);
      const markdown = (upgrade as { migration_markdown?: unknown }).migration_markdown;
      next = {
        ...next,
        upgrade: {
          ...(upgrade as Record<string, unknown>),
          model: replacement.public_id,
          ...(typeof markdown === 'string' && old?.display_name
            ? { migration_markdown: markdown.replace(displayNamePattern(old.display_name), () => replacement.display_name) }
            : {})
        }
      };
    }
    return next;
  });
}
