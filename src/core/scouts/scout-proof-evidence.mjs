import path from 'node:path';
import { exists, readJson } from '../fsx.mjs';
import { missionDir } from '../mission.mjs';
import { SCOUT_COUNT, SCOUT_PROOF_EVIDENCE_SCHEMA } from './scout-schema.mjs';
export async function readScoutProofEvidence(root, missionId) {
    if (!missionId)
        return null;
    const dir = missionDir(root, missionId);
    const gateFile = path.join(dir, 'scout-gate.json');
    const consensusFile = path.join(dir, 'scout-consensus.json');
    const handoffFile = path.join(dir, 'scout-handoff.md');
    if (!(await exists(gateFile)) && !(await exists(consensusFile)) && !(await exists(handoffFile)))
        return null;
    const gate = await readJson(gateFile, null);
    const consensus = await readJson(consensusFile, null);
    const performance = await readJson(path.join(dir, 'scout-performance.json'), null);
    const engineResult = await readJson(path.join(dir, 'scout-engine-result.json'), null);
    return {
        schema: SCOUT_PROOF_EVIDENCE_SCHEMA,
        required: true,
        status: gate?.passed === true ? 'passed' : 'blocked',
        engine_run_id: engineResult?.engine_run_id || performance?.engine_run_id || gate?.engine_run_id || null,
        artifact_namespace: engineResult?.artifact_namespace || performance?.artifact_namespace || gate?.artifact_namespace || 'canonical',
        artifacts_dir: engineResult?.artifacts_dir || performance?.artifacts_dir || null,
        engine: engineResult?.engine || performance?.engine || gate?.engine || null,
        engine_mode: engineResult?.engine_mode || null,
        real_parallel: Boolean(engineResult?.real_parallel ?? performance?.real_parallel ?? gate?.real_parallel),
        output_schema_used: engineResult?.output_schema_used === true,
        output_schema_path: engineResult?.output_schema_path || null,
        scout_count: Number(consensus?.scout_count || gate?.required_scouts || SCOUT_COUNT),
        completed_scouts: Number(consensus?.completed_scouts || gate?.completed_scouts || 0),
        schema_valid_results: Number(consensus?.schema_valid_results || 0),
        schema_invalid_results: consensus?.schema_invalid_results || [],
        parallel_mode: consensus?.parallel_mode || null,
        gate: gate?.passed === true ? 'passed' : 'blocked',
        consensus: `.sneakoscope/missions/${missionId}/scout-consensus.json`,
        handoff: `.sneakoscope/missions/${missionId}/scout-handoff.md`,
        gate_file: `.sneakoscope/missions/${missionId}/scout-gate.json`,
        performance: performance ? `.sneakoscope/missions/${missionId}/scout-performance.json` : null,
        engine_result: engineResult ? `.sneakoscope/missions/${missionId}/scout-engine-result.json` : null,
        scout_artifacts: artifactListFor(missionId, engineResult?.artifact_namespace || performance?.artifact_namespace || 'canonical'),
        engine_jobs: engineResult?.jobs || [],
        read_only_confirmed: gate?.read_only_confirmed === true,
        schema_valid_confirmed: gate?.schema_valid_confirmed === true,
        speedup_claim_allowed: Boolean(performance?.claim_allowed),
        status_detail: performance?.real_parallel ? 'verified' : 'verified_partial',
        blockers: gate?.blockers || [],
        unverified: gate?.unverified || []
    };
}
function artifactListFor(missionId, namespace = 'canonical') {
    const prefix = namespace && namespace !== 'canonical'
        ? `.sneakoscope/missions/${missionId}/${namespace}`
        : `.sneakoscope/missions/${missionId}`;
    return [
        `${prefix}/scout-team-plan.json`,
        `${prefix}/scout-consensus.json`,
        `${prefix}/scout-handoff.md`,
        `${prefix}/scout-gate.json`,
        `${prefix}/scout-engine-result.json`,
        `${prefix}/scout-readonly-guard.json`,
        `${prefix}/scout-performance.json`
    ];
}
export function disabledScoutProofEvidence(reason = 'explicitly disabled by sealed contract') {
    return {
        schema: SCOUT_PROOF_EVIDENCE_SCHEMA,
        required: false,
        reason,
        real_parallel: false,
        speedup_claim_allowed: false,
        status: 'not_verified_for_parallel_speed'
    };
}
//# sourceMappingURL=scout-proof-evidence.js.map