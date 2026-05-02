import path from 'node:path';
import { nowIso, writeJsonAtomic, writeTextAtomic } from './fsx.mjs';
import { ARTIFACT_FILES, validateFromChatImgVisualMap } from './artifact-schemas.mjs';

export const FROM_CHAT_IMG_WORK_ORDER_MD = 'from-chat-img-work-order.md';
export const FROM_CHAT_IMG_SOURCE_INVENTORY = 'from-chat-img-source-inventory.json';

export function buildFromChatImgInventory({ missionId = 'unassigned', chatMessages = [], chatImages = [], referenceImages = [], zipAssets = [], nonImageAssets = [] } = {}) {
  const sources = [
    ...chatMessages.map((item, i) => source(`chat-message-${i + 1}`, 'chat_message', item)),
    ...chatImages.map((item, i) => source(`chat-img-${i + 1}`, 'chat_image', item)),
    ...referenceImages.map((item, i) => source(`reference-img-${i + 1}`, 'reference_image', item)),
    ...zipAssets.map((item, i) => source(`zip-asset-${i + 1}`, 'zip_asset', item)),
    ...nonImageAssets.map((item, i) => source(`non-image-asset-${i + 1}`, 'non_image_asset', item))
  ];
  return {
    schema_version: 1,
    mission_id: missionId,
    generated_at: nowIso(),
    source_inventory_complete: sources.length > 0 && sources.every((entry) => entry.accounted_for === true || entry.relevant === false),
    sources
  };
}

export function buildFromChatImgVisualMap({ missionId = 'unassigned', sources = [], regions = [] } = {}) {
  const map = {
    schema_version: 1,
    mission_id: missionId,
    generated_at: nowIso(),
    source_inventory_complete: sources.length > 0 && sources.every((entry) => entry.accounted_for === true || entry.relevant === false),
    visual_mapping_complete: regions.length > 0 && regions.every((region) => ['mapped', 'irrelevant'].includes(region.status)),
    sources,
    regions: regions.map((region, index) => ({
      image_id: region.image_id || 'chat-img-1',
      region_id: region.region_id || `R${String(index + 1).padStart(2, '0')}`,
      observed_detail: region.observed_detail || '',
      matched_customer_request_ids: region.matched_customer_request_ids || [],
      matched_reference_assets: region.matched_reference_assets || [],
      confidence: Number.isFinite(Number(region.confidence)) ? Number(region.confidence) : 0,
      status: region.status || 'uncertain',
      unresolved_reason: region.unresolved_reason || null
    }))
  };
  return map;
}

export async function writeFromChatImgArtifacts(dir, data = {}) {
  const inventory = buildFromChatImgInventory(data);
  const visualMap = buildFromChatImgVisualMap({ missionId: data.missionId, sources: inventory.sources, regions: data.regions || [] });
  await writeJsonAtomic(path.join(dir, FROM_CHAT_IMG_SOURCE_INVENTORY), inventory);
  await writeJsonAtomic(path.join(dir, ARTIFACT_FILES.from_chat_img_visual_map), visualMap);
  await writeTextAtomic(path.join(dir, FROM_CHAT_IMG_WORK_ORDER_MD), renderFromChatImgWorkOrder({ ...data, inventory, visualMap }));
  return validateFromChatImgVisualMap(visualMap);
}

export function renderFromChatImgWorkOrder({ inventory = {}, visualMap = {}, requests = [], tasks = [], ambiguities = [] } = {}) {
  const sourceLines = (inventory.sources || []).map((item) => `- ${item.id}: ${item.type} ${item.location || ''}`.trim()).join('\n') || '- none recorded';
  const requestLines = requests.length
    ? requests.map((request, i) => `- [ ] Request ${i + 1}: "${String(request.verbatim || request.text || '').replace(/"/g, '\\"')}"`).join('\n')
    : '- [ ] Request 1: "<not extracted>"';
  const rows = (visualMap.regions || []).map((region) => `| ${region.image_id} | ${region.region_id} | ${region.observed_detail || ''} | ${(region.matched_customer_request_ids || []).join(', ')} | ${(region.matched_reference_assets || []).join(', ')} | ${region.confidence} | ${region.status} |`).join('\n');
  const taskLines = tasks.length ? tasks.map((task, i) => `- [ ] WO-${String(i + 1).padStart(3, '0')} - ${task}`).join('\n') : '- [ ] WO-001 - <not decomposed>';
  const ambiguityLines = ambiguities.length ? ambiguities.map((item) => `- Ambiguity: ${item}`).join('\n') : '- Ambiguity: none recorded yet';
  return `# From-Chat-IMG Work Order

## Source Inventory
${sourceLines}

## Verbatim Customer Requests
${requestLines}

## Visual Evidence Map
| Image/Asset | Region ID | Observed Detail | Matched Request | Matched Reference | Confidence | Status |
|---|---:|---|---|---|---:|---|
${rows || '| none | R00 | not mapped |  |  | 0 | blocked |'}

## Task Breakdown
${taskLines}

## Ambiguities and Honest Mode
${ambiguityLines}

## QA and Dogfooding Plan
- Scenario: scoped QA over the exact customer-request work-order range.
- Expected result: every work item verified or blocked with evidence.
- Evidence required: coverage ledger, checklist, visual map, dogfood report, and post-fix verification.

## Final No-Omission Audit
- [ ] Every customer request is preserved verbatim.
- [ ] Every request is mapped to at least one work item.
- [ ] Every screenshot region is accounted for.
- [ ] Every reference asset is accounted for.
- [ ] Every implementation item is verified.
- [ ] Every fixable QA finding has post-fix verification.
`;
}

function source(id, type, item) {
  if (typeof item === 'string') return { id, type, location: item, relevant: true, accounted_for: false };
  return {
    id: item.id || id,
    type: item.type || type,
    location: item.location || item.path || item.name || id,
    relevant: item.relevant !== false,
    accounted_for: item.accounted_for === true,
    notes: item.notes || null
  };
}
