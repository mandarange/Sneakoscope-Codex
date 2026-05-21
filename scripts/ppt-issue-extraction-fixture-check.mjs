#!/usr/bin/env node
import { assertGate, emitGate, runPptReview } from './sks-1-11-gate-lib.mjs';

const result = runPptReview('extract-issues');
assertGate(result.artifacts.slideIssues?.issues?.length > 0 && result.proof_evidence.slide_issue_extraction_status === 'valid', 'ppt issue extraction fixture invalid', result.artifacts.slideIssues);
emitGate('ppt:issue-extraction-fixture', { mission_id: result.mission_id, issues: result.artifacts.slideIssues.issues.length });
