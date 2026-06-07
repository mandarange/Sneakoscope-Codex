#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

const source = readText('src/core/commands/research-command.ts');
assertGate(source.includes("backend: mock ? 'fake' : 'codex-sdk'"), 'Research pipeline must default native agents to codex-sdk');
assertGate(source.includes("flag(args, '--autoresearch') ? '$AutoResearch' : '$Research'"), 'Research/AutoResearch route selection missing');
assertGate(source.includes('narutoWorkGraph: researchWorkGraph'), 'Research pipeline must pass the stage-aware Naruto work graph');
assertGate(source.includes('readonly: true'), 'Research pipeline must force read-only native orchestration');
assertGate(source.includes('quality_metrics'), 'Research pipeline JSON output must include quality metrics');
const researchCore = readText('src/core/research.ts');
assertGate(researchCore.includes('readResearchQualityContract'), 'Research gate must read research-quality-contract.json');
assertGate(researchCore.includes('claim_evidence_matrix_missing'), 'Research gate must require claim-evidence-matrix.json');
assertGate(researchCore.includes('research_final_review_not_approved'), 'Research gate must require final reviewer approval');
emitGate('codex-sdk:research-pipeline', { route: '$Research' });
