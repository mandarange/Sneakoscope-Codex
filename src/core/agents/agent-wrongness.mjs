import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.mjs';
const WRONGNESS_MAP = [
    ['recursion_attempt', /^recursion:/],
    ['lease_conflict', /(?:write_overlap|protected_write|lease_conflict)/],
    ['session_not_closed', /^session_open:/],
    ['schema_invalid_output', /^schema_invalid:/],
    ['stale_heartbeat', /stale_heartbeat/],
    ['legacy_multiagent_runtime_usage_attempt', /(?:legacy_multiagent_runtime|removed_multiagent_backend|parallel_analysis_legacy)/]
];
export async function writeAgentWrongnessRecords(root, blockers = []) {
    const records = blockers.flatMap((blocker) => WRONGNESS_MAP
        .filter(([, re]) => re.test(blocker))
        .map(([kind]) => ({
        schema: 'sks.agent-wrongness-record.v1',
        kind,
        blocker,
        created_at: nowIso(),
        status: 'active'
    })));
    const report = {
        schema: 'sks.agent-wrongness-records.v1',
        generated_at: nowIso(),
        records
    };
    await writeJsonAtomic(path.join(root, 'agent-wrongness-records.json'), report);
    return report;
}
//# sourceMappingURL=agent-wrongness.js.map