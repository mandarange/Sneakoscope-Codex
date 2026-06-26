import { auditSeo } from './analyzers.js';
import { detectProject, discoverSiteInventory } from './discovery.js';
import { verifySearchVisibility } from './verifier.js';
import type { DetectionResult, Finding, ProjectContext, SearchVisibilityAdapter, SiteInventory } from './types.js';

class GenericSearchVisibilityAdapter implements SearchVisibilityAdapter {
  id = 'generic-search-visibility';

  async detect(ctx: ProjectContext): Promise<DetectionResult> {
    return detectProject(ctx);
  }

  async discover(ctx: ProjectContext, detection: DetectionResult): Promise<SiteInventory> {
    return discoverSiteInventory(ctx, detection);
  }

  async audit(ctx: ProjectContext, inventory: SiteInventory): Promise<Finding[]> {
    return auditSeo(ctx.root, inventory);
  }

  async verify(ctx: ProjectContext, inventory: SiteInventory) {
    return verifySearchVisibility(ctx, inventory, null);
  }
}

const GENERIC_ADAPTER = new GenericSearchVisibilityAdapter();

export function adapterForDetection(_detection: DetectionResult): SearchVisibilityAdapter {
  return GENERIC_ADAPTER;
}

export function searchVisibilityAdapters(): SearchVisibilityAdapter[] {
  return [GENERIC_ADAPTER];
}
