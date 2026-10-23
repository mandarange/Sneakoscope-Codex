import { compareModelVersions, parseGptModelId } from '../../subagents/model-tiers.js';
import type { BridgeCatalogModel } from '../bridge-contracts.js';

function isListed(model: BridgeCatalogModel): boolean {
  const visibility = String(model.visibility || 'list').toLowerCase();
  return visibility !== 'hide' && visibility !== 'hidden';
}

/**
 * Keep every `gpt-<version>-<family>` family on its newest generation in the
 * catalog Codex Desktop reads, so the picker and the spawn_agent model list
 * never advertise a superseded generation next to the current one. A row that
 * is not the newest listed row of its family is hidden, not removed, so a
 * thread or `model =` line that still names it keeps routing.
 *
 * `upgrade` (Codex's model-migration prompt) is the provider's, served as is:
 * retargeting it at the newest row put a model the provider never named into
 * the prompt, and moved it again with every generation, so an acknowledged
 * notice kept coming back. A row this hides loses its `upgrade` instead — the
 * hidden row is retired from the picker already.
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
  return models.map((model) => {
    const id = parseGptModelId(model.public_id);
    if (!id || !isListed(model)) return model;
    const best = newest.get(id.family);
    if (!best || compareModelVersions(parseGptModelId(best.public_id)!.version, id.version) <= 0) return model;
    const { upgrade: _retired, ...rest } = model;
    return { ...rest, visibility: 'hide' } as BridgeCatalogModel;
  });
}
