import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { dedupeProjectSkills } from '../project-skill-dedupe.js';
import { buildSkillRegistryLedger } from '../skill-registry-ledger.js';
import { renderCoreSkillTemplate } from '../core-skill-manifest.js';

test('project skill dedupe scans HOME-equals-project only once and preserves the authoritative skill', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-project-skill-dedupe-same-root-'));
  const oldHome = process.env.HOME;
  const oldCodexHome = process.env.CODEX_HOME;
  try {
    process.env.HOME = root;
    process.env.CODEX_HOME = path.join(root, '.codex');
    const canonicalRoot = await fsp.realpath(root);
    const skill = path.join(root, '.agents', 'skills', 'sks-answer', 'SKILL.md');
    const text = [
      '---',
      'name: sks-answer',
      'description: managed fixture',
      '---',
      '',
      '<!-- BEGIN SKS MANAGED SKILL v-test name=sks-answer -->',
      ''
    ].join('\n');
    await fsp.mkdir(path.dirname(skill), { recursive: true });
    await fsp.writeFile(skill, text);

    const result = await dedupeProjectSkills({ root: canonicalRoot, fix: true, yes: true });

    assert.equal(await fsp.readFile(skill, 'utf8'), text);
    assert.equal(result.actions.some((action) => action.action === 'quarantined'), false);
    assert.equal(result.active_entries.filter((entry) => entry.canonical_name === 'sks-answer').length, 1);
    assert.equal(result.active_entries.find((entry) => entry.canonical_name === 'sks-answer')?.scope, 'global');
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = oldCodexHome;
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('project skill dedupe refuses a project .agents ancestor symlink without touching its external target', async () => {
  const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-project-skill-dedupe-symlink-'));
  const root = path.join(fixture, 'project');
  const home = path.join(fixture, 'home');
  const outsideAgents = path.join(fixture, 'outside-agents');
  const outsideSkill = path.join(outsideAgents, 'skills', 'sks-answer', 'SKILL.md');
  const oldHome = process.env.HOME;
  const oldCodexHome = process.env.CODEX_HOME;
  try {
    process.env.HOME = home;
    process.env.CODEX_HOME = path.join(home, '.codex');
    await fsp.mkdir(root, { recursive: true });
    await fsp.mkdir(path.dirname(outsideSkill), { recursive: true });
    const externalText = [
      '---',
      'name: sks-answer',
      'description: external managed fixture',
      '---',
      '',
      '<!-- BEGIN SKS MANAGED SKILL v-test name=sks-answer -->',
      'must remain unchanged',
      ''
    ].join('\n');
    await fsp.writeFile(outsideSkill, externalText);
    await fsp.symlink(outsideAgents, path.join(root, '.agents'));

    const result = await dedupeProjectSkills({ root, fix: true, yes: true });

    assert.equal(result.ok, false);
    assert.ok(result.blockers.some((blocker) => blocker.startsWith('unsafe_skill_scan_root:')));
    assert.equal(result.actions.length, 0);
    assert.equal(await fsp.readFile(outsideSkill, 'utf8'), externalText);
    assert.equal(await fsp.readlink(path.join(root, '.agents')), outsideAgents);
    await assert.rejects(fsp.access(path.join(root, '.sneakoscope', 'quarantine', 'skills')));
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = oldCodexHome;
    await fsp.rm(fixture, { recursive: true, force: true });
  }
});

test('skill registry blockers never expose an adversarial CODEX_HOME path through a symlink rejection', async () => {
  const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-skill-registry-sanitized-blocker-'));
  const root = path.join(fixture, 'project');
  const home = path.join(fixture, 'home');
  const secretMarker = 'ATTACKER_SECRET_MARKER';
  const codexHome = path.join(home, `unsafe-${secretMarker}\nforged-blocker`);
  const outsideSkills = path.join(fixture, 'outside-skills');
  const oldHome = process.env.HOME;
  const oldCodexHome = process.env.CODEX_HOME;
  try {
    process.env.HOME = home;
    process.env.CODEX_HOME = codexHome;
    await fsp.mkdir(root, { recursive: true });
    await fsp.mkdir(codexHome, { recursive: true });
    await fsp.mkdir(outsideSkills, { recursive: true });
    await fsp.symlink(outsideSkills, path.join(codexHome, 'skills'));

    const ledger = await buildSkillRegistryLedger({ root, reportPath: null });
    const dedupe = await dedupeProjectSkills({ root, reportPath: null });

    for (const blockers of [ledger.blockers, dedupe.blockers]) {
      assert.deepEqual(blockers, ['unsafe_skill_scan_root:codex-home:leaf_symlink']);
      assert.equal(blockers.some((blocker) => blocker.includes(codexHome)), false);
      assert.equal(blockers.some((blocker) => blocker.includes(secretMarker)), false);
      assert.equal(blockers.some((blocker) => /[\r\n/\\]/.test(blocker)), false);
    }
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = oldCodexHome;
    await fsp.rm(fixture, { recursive: true, force: true });
  }
});

test('project skill dedupe reports an external HOME duplicate without copying or deleting it', async () => {
  const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-project-skill-dedupe-home-boundary-'));
  const root = path.join(fixture, 'project');
  const home = path.join(fixture, 'home');
  const projectSkill = path.join(root, '.agents', 'skills', 'fixture-shared', 'SKILL.md');
  const homeSkill = path.join(home, '.agents', 'skills', 'fixture-shared', 'SKILL.md');
  const oldHome = process.env.HOME;
  const oldCodexHome = process.env.CODEX_HOME;
  try {
    process.env.HOME = home;
    process.env.CODEX_HOME = path.join(home, '.codex');
    const managedText = [
      '---',
      'name: fixture-shared',
      'description: managed fixture',
      '---',
      '',
      '<!-- BEGIN SKS MANAGED SKILL v-test name=fixture-shared -->',
      ''
    ].join('\n');
    await fsp.mkdir(path.dirname(projectSkill), { recursive: true });
    await fsp.mkdir(path.dirname(homeSkill), { recursive: true });
    await fsp.writeFile(projectSkill, managedText);
    await fsp.writeFile(homeSkill, managedText);

    const result = await dedupeProjectSkills({ root, fix: true, yes: true });

    assert.equal(result.ok, false);
    assert.ok(result.blockers.includes('duplicate_active_skill_name:fixture-shared'));
    assert.ok(result.actions.some((action) => action.path === homeSkill && action.action === 'reported'));
    assert.equal(await fsp.readFile(homeSkill, 'utf8'), managedText);
    assert.equal(await fsp.readFile(projectSkill, 'utf8'), managedText);
    await assert.rejects(fsp.access(path.join(root, '.sneakoscope', 'quarantine', 'skills')));
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = oldCodexHome;
    await fsp.rm(fixture, { recursive: true, force: true });
  }
});

test('project skill dedupe never quarantines a nested-HOME global skill', async () => {
  const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-project-skill-dedupe-nested-home-'));
  const root = path.join(fixture, 'project');
  const home = path.join(root, 'home');
  const globalSkill = path.join(home, '.agents', 'skills', 'sks-naruto', 'SKILL.md');
  const projectSkill = path.join(root, '.agents', 'skills', 'sks-naruto', 'SKILL.md');
  const oldHome = process.env.HOME;
  const oldCodexHome = process.env.CODEX_HOME;
  try {
    process.env.HOME = home;
    process.env.CODEX_HOME = path.join(home, '.codex');
    await fsp.mkdir(root, { recursive: true });
    const authoritativeText = renderCoreSkillTemplate('sks-naruto');
    await fsp.mkdir(path.dirname(globalSkill), { recursive: true });
    await fsp.writeFile(globalSkill, authoritativeText);
    assert.equal(await fsp.readFile(globalSkill, 'utf8'), authoritativeText);
    await fsp.mkdir(path.dirname(projectSkill), { recursive: true });
    await fsp.copyFile(globalSkill, projectSkill);
    const driftedGlobalText = `${authoritativeText}\nlocally drifted global fixture\n`;
    await fsp.writeFile(globalSkill, driftedGlobalText);

    const result = await dedupeProjectSkills({ root, fix: true, yes: true, reportPath: null });
    const ledger = await buildSkillRegistryLedger({ root, reportPath: null });

    assert.equal(await fsp.readFile(globalSkill, 'utf8'), driftedGlobalText);
    assert.equal(await fsp.readFile(projectSkill, 'utf8'), authoritativeText);
    assert.ok(result.actions.some((action) => action.path === projectSkill && action.action === 'kept'));
    assert.ok(result.actions.some((action) => action.path === globalSkill && action.action === 'reported'));
    assert.equal(result.actions.some((action) => action.path === globalSkill && action.action === 'quarantined'), false);
    assert.ok(result.duplicate_canonical_names.includes('sks-naruto'));
    assert.ok(ledger.entries.some((entry) => entry.path === globalSkill && entry.scope === 'global' && entry.status === 'managed-drift'));
    assert.ok(ledger.entries.some((entry) => entry.path === projectSkill && entry.scope === 'project' && entry.status === 'shadowed-official'));
    assert.deepEqual(result.blockers, ledger.blockers);
    await assert.rejects(fsp.access(path.join(root, '.sneakoscope', 'quarantine', 'skills')));
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = oldCodexHome;
    await fsp.rm(fixture, { recursive: true, force: true });
  }
});

test('project skill dedupe preserves a markerless user skill that uses an official name', async () => {
  const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-project-skill-dedupe-user-official-name-'));
  const root = path.join(fixture, 'project');
  const home = path.join(fixture, 'home');
  const globalSkill = path.join(home, '.agents', 'skills', 'sks-naruto', 'SKILL.md');
  const projectSkill = path.join(root, '.agents', 'skills', 'sks-naruto', 'SKILL.md');
  const attackerMarker = 'ATTACKER_CONTENT_MUST_NOT_BE_REFLECTED';
  const userText = [
    '---',
    'name: sks-naruto',
    'description: user-authored skill with an official name',
    '---',
    '',
    'Sneakoscope generated is discussed here as ordinary user-authored prose.',
    'Codex App pipeline activation: this sentence is not an ownership marker.',
    attackerMarker,
    ''
  ].join('\n');
  const oldHome = process.env.HOME;
  const oldCodexHome = process.env.CODEX_HOME;
  try {
    process.env.HOME = home;
    process.env.CODEX_HOME = path.join(home, '.codex');
    await fsp.mkdir(root, { recursive: true });
    const authoritativeText = renderCoreSkillTemplate('sks-naruto');
    await fsp.mkdir(path.dirname(globalSkill), { recursive: true });
    await fsp.writeFile(globalSkill, authoritativeText);
    assert.equal(await fsp.readFile(globalSkill, 'utf8'), authoritativeText);
    await fsp.mkdir(path.dirname(projectSkill), { recursive: true });
    await fsp.writeFile(projectSkill, userText);

    const result = await dedupeProjectSkills({ root, fix: true, yes: true, reportPath: null });
    const ledger = await buildSkillRegistryLedger({ root, reportPath: null });
    const projectEntry = ledger.entries.find((entry) => entry.path === projectSkill);
    const globalEntry = ledger.entries.find((entry) => entry.path === globalSkill);

    assert.equal(await fsp.readFile(projectSkill, 'utf8'), userText);
    assert.equal(await fsp.readFile(globalSkill, 'utf8'), authoritativeText);
    assert.equal(projectEntry?.managed_by_sks, false);
    assert.equal(projectEntry?.status, 'shadowed-official');
    assert.equal(globalEntry?.managed_by_sks, true);
    assert.equal(globalEntry?.status, 'managed-current');
    assert.ok(result.actions.some((action) => (
      action.path === projectSkill
      && action.action === 'kept'
      && action.reason === 'user-authored skill preserved'
    )));
    assert.equal(result.actions.some((action) => action.path === projectSkill && action.action === 'quarantined'), false);
    assert.equal(JSON.stringify(result).includes(attackerMarker), false);
    assert.equal(JSON.stringify(ledger).includes(attackerMarker), false);
    await assert.rejects(fsp.access(path.join(root, '.sneakoscope', 'quarantine', 'skills')));
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = oldCodexHome;
    await fsp.rm(fixture, { recursive: true, force: true });
  }
});

test('skill registry keeps a marked managed skill classified as managed when its content drifts', async () => {
  const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-skill-registry-marked-drift-'));
  const root = path.join(fixture, 'project');
  const home = path.join(fixture, 'home');
  const skill = path.join(root, '.agents', 'skills', 'sks-naruto', 'SKILL.md');
  const oldHome = process.env.HOME;
  const oldCodexHome = process.env.CODEX_HOME;
  try {
    process.env.HOME = home;
    process.env.CODEX_HOME = path.join(home, '.codex');
    await fsp.mkdir(path.dirname(skill), { recursive: true });
    await fsp.writeFile(skill, `${renderCoreSkillTemplate('sks-naruto')}\nmanaged drift fixture\n`);

    const ledger = await buildSkillRegistryLedger({ root, reportPath: null });
    const entry = ledger.entries.find((candidate) => candidate.path === skill);

    assert.equal(entry?.managed_by_sks, true);
    assert.equal(entry?.status, 'managed-drift');
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = oldCodexHome;
    await fsp.rm(fixture, { recursive: true, force: true });
  }
});

test('skill registry and project dedupe refuse symlinked or external report paths without touching the external tree', async () => {
  const fixture = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-skill-report-confinement-'));
  const root = path.join(fixture, 'project');
  const home = path.join(fixture, 'home');
  const outside = path.join(fixture, 'outside');
  const marker = path.join(outside, 'must-remain.txt');
  const oldHome = process.env.HOME;
  const oldCodexHome = process.env.CODEX_HOME;
  try {
    process.env.HOME = home;
    process.env.CODEX_HOME = path.join(home, '.codex');
    await Promise.all([
      fsp.mkdir(root, { recursive: true }),
      fsp.mkdir(home, { recursive: true }),
      fsp.mkdir(outside, { recursive: true })
    ]);
    await fsp.writeFile(marker, 'external tree must remain unchanged');
    await fsp.symlink(outside, path.join(root, '.sneakoscope'));
    const before = (await fsp.readdir(outside)).sort();

    const defaultLedger = await buildSkillRegistryLedger({ root });
    const defaultDedupe = await dedupeProjectSkills({ root });
    const externalLedger = await buildSkillRegistryLedger({
      root,
      reportPath: path.join(outside, 'custom-ledger.json')
    });
    const externalDedupe = await dedupeProjectSkills({
      root,
      reportPath: path.join(outside, 'custom-dedupe.json')
    });

    assert.equal(defaultLedger.ok, false);
    assert.ok(defaultLedger.blockers.includes('skill_registry_report_path_unsafe'));
    assert.equal(defaultDedupe.ok, false);
    assert.ok(defaultDedupe.blockers.includes('project_skill_dedupe_report_path_unsafe'));
    assert.equal(externalLedger.ok, false);
    assert.ok(externalLedger.blockers.includes('skill_registry_report_path_unsafe'));
    assert.equal(externalDedupe.ok, false);
    assert.ok(externalDedupe.blockers.includes('project_skill_dedupe_report_path_unsafe'));
    assert.deepEqual((await fsp.readdir(outside)).sort(), before);
    assert.equal(await fsp.readFile(marker, 'utf8'), 'external tree must remain unchanged');
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = oldCodexHome;
    await fsp.rm(fixture, { recursive: true, force: true });
  }
});
