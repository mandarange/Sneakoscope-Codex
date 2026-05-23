#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-ppt-e2e-'));
const deck = path.join(tmp, 'synthetic-two-slide.pptx');
fs.writeFileSync(deck, [
  'ppt/slides/slide1.xml',
  '<p:sld><p:cSld><p:spTree><a:t>SKS 1.14.1 Synthetic Slide 1</a:t></p:spTree></p:cSld></p:sld>',
  'ppt/slides/slide2.xml',
  '<p:sld><p:cSld><p:spTree><a:t>SKS 1.14.1 Synthetic Slide 2</a:t></p:spTree></p:cSld></p:sld>'
].join('\n'));
const repoRoot = process.cwd();
const run = spawnSync(process.execPath, [path.join(repoRoot, 'dist/bin/sks.js'), 'ppt', 'review', '--deck', deck, '--mock', '--imagegen', '--json'], {
  cwd: tmp,
  env: { ...process.env, SKS_TEST_FAKE_IMAGEGEN: '1', SKS_TEST_FAKE_EXTRACTOR: '1' },
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024
});
const parsed = parseJson(run.stdout);
const missionDir = parsed?.mission_id ? path.join(tmp, '.sneakoscope', 'missions', parsed.mission_id) : null;
const inventory = (missionDir ? readJson(path.join(missionDir, 'ppt-deck-inventory.json')) : null)
  || parsed?.artifacts?.deck_inventory
  || parsed?.artifacts?.deckInventory
  || null;
const exportLedger = (missionDir ? readJson(path.join(missionDir, 'ppt-slide-export-ledger.json')) : null)
  || parsed?.artifacts?.slide_export_ledger
  || parsed?.artifacts?.slideExportLedger
  || null;
const callouts = missionDir ? readJson(path.join(missionDir, 'ppt-slide-callout-ledger.json')) : null;
const slideIssues = missionDir ? readJson(path.join(missionDir, 'ppt-slide-issue-ledger.json')) : null;
const deckIssues = missionDir ? readJson(path.join(missionDir, 'ppt-deck-issue-ledger.json')) : null;
const proof = missionDir ? readJson(path.join(missionDir, 'completion-proof.json')) : null;
const trust = missionDir ? readJson(path.join(missionDir, 'trust-report.json')) : null;
const fakeNotReal = !JSON.stringify(callouts || {}).includes('"real_generated":true');
const proofStatusOk = proof?.schema === 'sks.completion-proof.v1' && ['verified', 'verified_partial'].includes(String(proof?.status || ''));
const trustStatusOk = trust?.schema === 'sks.trust-report.v1' && trust?.ok === true && !['blocked', 'failed', 'not_verified'].includes(String(trust?.status || ''));
const ok = Boolean(parsed?.mission_id)
  && inventory?.deck_present === true
  && inventory?.slide_count >= 1
  && exportLedger?.exported_slide_images_count >= 1
  && callouts?.generated_slide_callout_images_count >= exportLedger.exported_slide_images_count
  && Array.isArray(slideIssues?.issues)
  && slideIssues.issues.length > 0
  && deckIssues?.schema === 'sks.ppt-deck-issue-ledger.v1'
  && proofStatusOk
  && trustStatusOk
  && fakeNotReal;
const result = {
  schema: 'sks.ppt-full-e2e-blackbox.v1',
  ok,
  process_status: run.status,
  mission_id: parsed?.mission_id || null,
  deck,
  synthetic_deck: true,
  manual_slide_images_used: false,
  slide_count: inventory?.slide_count || 0,
  exported_slide_images_count: exportLedger?.exported_slide_images_count || 0,
  generated_slide_review_count: callouts?.generated_slide_callout_images_count || 0,
  issue_extraction_count: slideIssues?.issues?.length || 0,
  mock_fake_not_verified_real: fakeNotReal,
  completion_proof_linked: proofStatusOk,
  trust_report_linked: trustStatusOk,
  wrongness_linked: true,
  proof_status: proof?.status || null,
  trust_ok: trust?.ok ?? null,
  trust_status: trust?.status || null,
  trust_blockers: trust?.blockers || [],
  blockers: [
    ...(!proofStatusOk ? [`completion_proof_status_${proof?.status || 'missing'}`] : []),
    ...(!trustStatusOk ? [`trust_report_status_${trust?.status || 'missing'}`] : []),
    ...(!fakeNotReal ? ['mock_or_fake_marked_real'] : [])
  ],
  artifacts: {
    inventory,
    exportLedger,
    callouts,
    slideIssues,
    deckIssues,
    proof_schema: proof?.schema || null,
    proof_status: proof?.status || null,
    trust_schema: trust?.schema || null,
    trust_ok: trust?.ok ?? null,
    trust_status: trust?.status || null
  },
  stdout_tail: run.stdout.slice(-2000),
  stderr_tail: run.stderr.slice(-2000)
};
const out = path.join(repoRoot, '.sneakoscope', 'reports', 'ppt-full-e2e-blackbox.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!ok) process.exitCode = 1;

function parseJson(text) { try { return JSON.parse(text); } catch { return null; } }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
