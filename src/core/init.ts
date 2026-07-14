import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, readJson, readText, writeJsonAtomic, writeTextAtomic, mergeManagedBlock, nowIso, PACKAGE_VERSION, exists } from './fsx.js';
import { DEFAULT_RETENTION_POLICY } from './retention.js';
import { DEFAULT_DB_SAFETY_POLICY } from './db-safety.js';
import { isHarnessSourceProject, writeHarnessGuardPolicy } from './harness-guard.js';
import { repairSksGeneratedArtifacts } from './harness-conflicts.js';
import { disableVersionGitHook } from './version-manager.js';
import { OFFICIAL_SUBAGENT_REVIEW_POLICY_TEXT } from './team-review-policy.js';
import { AWESOME_DESIGN_MD_REFERENCE, CODEX_APP_IMAGE_GENERATION_DOC_URL, CODEX_COMPUTER_USE_ONLY_POLICY, CODEX_IMAGEGEN_REQUIRED_POLICY, CODEX_WEB_VERIFICATION_POLICY, DEFAULT_CODEX_APP_PLUGINS, DESIGN_SYSTEM_SSOT, DOLLAR_COMMANDS, DOLLAR_COMMAND_ALIASES, DOLLAR_SKILL_NAMES, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS, GETDESIGN_REFERENCE, IMAGEGEN_SOCIAL_SOURCE_POLICY, OPENAI_CHATGPT_IMAGES_2_DOC_URL, OPENAI_GPT_IMAGE_2_MODEL_DOC_URL, OPENAI_IMAGE_GENERATION_DOC_URL, PPT_CONDITIONAL_SKILL_ALLOWLIST, PPT_PIPELINE_MCP_ALLOWLIST, PPT_PIPELINE_SKILL_ALLOWLIST, RECOMMENDED_DESIGN_REFERENCES, RECOMMENDED_MCP_SERVERS, RECOMMENDED_SKILLS, RESERVED_CODEX_PLUGIN_SKILL_NAMES, SOLUTION_SCOUT_SKILL_NAME, chatCaptureIntakeText, context7ConfigToml, getdesignReferencePolicyText, imageUxReviewPipelinePolicyText, leanEngineeringCompactText, outcomeRubricPolicyText, pptPipelineAllowlistPolicyText, productDesignPluginPolicyText, solutionScoutPolicyText, speedLanePolicyText, stackCurrentDocsPolicyText, triwikiContextTracking, triwikiContextTrackingText, triwikiStagePolicyText } from './routes.js';
import { SKILL_DREAM_POLICY, skillDreamPolicyText } from './skill-forge.js';
import { CODEX_HOOK_EVENT_STATE_KEYS } from './codex-compat/codex-hook-events.js';
import { codexCommandHookCurrentHash } from './codex-hooks/codex-hook-hash.js';
import { buildSksCoreSkillManifest, isCoreSkillName } from './codex-native/core-skill-manifest.js';
import { syncCoreSkillsIntegrity } from './codex-native/core-skill-integrity.js';
import { dbSafetyGuardSkillText, madDbSkillText } from './mad-db/mad-db-policy.js';
import { currentGeneratedFileInventory, installCodexAgents, installGlobalSkills, installProjectSkills, installSkills, pruneStaleGeneratedFiles } from './init/skills.js';
import {
  backupInvalidToml,
  inspectOfficialSubagentToml,
  mergeOfficialSubagentConfig,
  officialSubagentConfigOwnershipProof,
  officialSubagentConfigWarnings,
  readInheritedOfficialSubagentConfigText,
  resolveInheritedOfficialSubagentConfigPath
} from './subagents/official-subagent-config.js';
export { installGlobalSkills, installProjectSkills, installSkills } from './init/skills.js';

const REFLECTION_MEMORY_PATH = '.sneakoscope/memory/q2_facts/post-route-reflection.md';
const SKS_GENERATED_GIT_PATTERNS = [
  '.sneakoscope/missions/',
  '.sneakoscope/reports/',
  '.sneakoscope/tmp/',
  '.sneakoscope/cache/',
  '.sneakoscope/arenas/',
  '.sneakoscope/processes/',
  '.sneakoscope/bench/',
  '.sneakoscope/blackbox/',
  '.sneakoscope/logs/',
  '.sneakoscope/state/',
  '.sneakoscope/db/',
  '.sneakoscope/evidence/',
  '.sneakoscope/proof/',
  '.sneakoscope/perf/',
  '.sneakoscope/research/',
  '.sneakoscope/skills/',
  '.sneakoscope/smoke-archives/',
  '.sneakoscope/memory/',
  '.sneakoscope/wiki/indexes/',
  '.sneakoscope/wiki/context-packs/',
  '.sneakoscope/wiki/tmp/',
  '.sneakoscope/wiki/context-pack.json',
  '.sneakoscope/wiki/image-assets.json',
  '.sneakoscope/wiki/image-voxel-ledger.json',
  '.sneakoscope/wiki/visual-anchors.json',
  '.sneakoscope/wiki/last-sweep-report.json',
  '.codex/',
  '.agents/',
  'AGENTS.md'
];
const SKS_SKILL_MANIFEST_FILE = '.sks-generated.json';
const GENERATED_PRUNE_POLICY = 'remove_previous_sks_generated_paths_absent_from_current_manifest';

export const REQUIRED_GENERATED_CODEX_APP_FEATURE_FLAGS = [
  'hooks',
  'multi_agent',
  'fast_mode',
  'apps'
];

export function hasTopLevelCodexModeLock(text: any = '') {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const top = (firstTable === -1 ? lines : lines.slice(0, firstTable)).join('\n');
  return /^model_reasoning_effort\s*=/m.test(top);
}

export function hasDeprecatedCodexHooksFeatureFlag(text: any = '') {
  const lines = String(text || '').split('\n');
  const start = lines.findIndex((line: any) => line.trim() === '[features]');
  if (start === -1) return false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[i] || '')) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).some((line: any) => /^\s*codex_hooks\s*=/.test(line));
}

export function missingGeneratedCodexAppFeatureFlags(text: any = '') {
  if (text && typeof text === 'object') return REQUIRED_GENERATED_CODEX_APP_FEATURE_FLAGS.filter((name: any) => text[name] !== true);
  return REQUIRED_GENERATED_CODEX_APP_FEATURE_FLAGS.filter((name: any) => !String(text || '').includes(`${name} = true`));
}

export function hasCodexUnstableFeatureWarningSuppression(text: any = '') {
  return /(^|\n)\s*suppress_unstable_features_warning\s*=\s*true\s*(?:#.*)?(?=\n|$)/.test(String(text || ''));
}

export function assertCodexWarningSuppressed(text: any = '', label: any = 'Codex config') {
  if (!hasCodexUnstableFeatureWarningSuppression(text)) {
    throw new Error(`selftest: ${label} missing suppress_unstable_features_warning`);
  }
}

function reflectionInstructionText(commandPrefix: any = 'sks') {
  return `Post-route reflection: full routes load \`reflection\` after work/tests and before final; DFix/Answer/Help/Wiki/SKS discovery are exempt. Write reflection.md; record only real misses/gaps, or no_issue_acknowledged. For lessons, append TriWiki claim rows to ${REFLECTION_MEMORY_PATH}. Run "${commandPrefix} wiki refresh" or pack, validate, then pass reflection-gate.json.`;
}

export function normalizeInstallScope(scope: any = 'global') {
  const value = String(scope || 'global').trim().toLowerCase();
  if (value === 'global' || value === 'project') return value;
  throw new Error(`Invalid install scope: ${scope}. Use "global" or "project".`);
}

export function sksCommandPrefix(scope: any = 'global', opts: any = {}) {
  return normalizeInstallScope(scope) === 'project'
    ? 'node ./node_modules/sneakoscope/dist/bin/sks.js'
    : (opts.globalCommand || 'sks');
}

function sksHookCommand(commandPrefix: any, hookName: any) {
  return `${commandPrefix} hook ${hookName}`;
}

const MANAGED_HOOKS = {
  SessionStart: [{ hooks: [{ type: 'command', command: null, hookName: 'session-start', statusMessage: 'SKS preparing session context' }] }],
  UserPromptSubmit: [{ hooks: [{ type: 'command', command: null, hookName: 'user-prompt-submit', statusMessage: 'SKS routing prompt and context' }] }],
  PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: null, hookName: 'pre-tool', statusMessage: 'SKS checking tool safety' }] }],
  PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: null, hookName: 'post-tool', statusMessage: 'SKS recording tool evidence' }] }],
  PermissionRequest: [{ matcher: '*', hooks: [{ type: 'command', command: null, hookName: 'permission-request', statusMessage: 'SKS reviewing permission request' }] }],
  PreCompact: [{ hooks: [{ type: 'command', command: null, hookName: 'pre-compact', statusMessage: 'SKS preparing compact context' }] }],
  PostCompact: [{ hooks: [{ type: 'command', command: null, hookName: 'post-compact', statusMessage: 'SKS recording compact context' }] }],
  SubagentStart: [{ hooks: [{ type: 'command', command: null, hookName: 'subagent-start', statusMessage: 'SKS recording subagent start' }] }],
  SubagentStop: [{ hooks: [{ type: 'command', command: null, hookName: 'subagent-stop', statusMessage: 'SKS recording subagent stop' }] }],
  Stop: [{ hooks: [{ type: 'command', command: null, hookName: 'stop', statusMessage: 'SKS checking done gate' }] }]
};

function buildManagedHooks(commandPrefix: any) {
  const hooks: Record<string, any> = {};
  for (const [eventName, entries] of Object.entries(MANAGED_HOOKS)) {
    hooks[eventName] = entries.map((entry: any) => ({
      ...('matcher' in entry ? { matcher: entry.matcher } : {}),
      hooks: entry.hooks.map(({ hookName, ...hook }: any) => ({
        ...hook,
        command: sksHookCommand(commandPrefix, hookName)
      }))
    }));
  }
  return { hooks };
}

const CODEX_HOOK_EVENT_KEYS: Record<string, string> = { ...CODEX_HOOK_EVENT_STATE_KEYS };

export function buildManagedHookTrustStateToml(root: string, commandPrefix: string): string {
  const source = path.join(root, '.codex', 'hooks.json');
  const managed = buildManagedHooks(commandPrefix).hooks;
  const blocks: string[] = [];
  for (const [eventName, entries] of Object.entries(managed) as Array<[string, any[]]>) {
    const eventKey = CODEX_HOOK_EVENT_KEYS[eventName] || eventName;
    entries.forEach((entry, groupIndex) => {
      (entry.hooks || []).forEach((hook: any, handlerIndex: number) => {
        const key = `${source}:${eventKey}:${groupIndex}:${handlerIndex}`;
        const table = `hooks.state."${tomlQuotedKey(key)}"`;
        blocks.push(`[${table}]\ntrusted_hash = "${codexHookTrustedHash(eventName, entry, hook)}"`);
      });
    });
  }
  return `${blocks.join('\n\n')}\n`;
}

export function mergeManagedHookTrustStateToml(existingContent: string, root: string, commandPrefix: string): string {
  let next = String(existingContent || '').trimEnd();
  for (const block of buildManagedHookTrustStateToml(root, commandPrefix).trim().split(/\n\n+/)) {
    const table = block.match(/^\[([^\]]+)\]/)?.[1];
    if (table) next = upsertCodexTrustTomlTable(next, table, block);
  }
  return `${next.trim()}\n`;
}

export function codexHookTrustedHash(eventName: string, entry: any, hook: any): string {
  return codexCommandHookCurrentHash({
    event: eventName as any,
    matcher: !['UserPromptSubmit', 'Stop', 'SessionStart', 'SubagentStart', 'SubagentStop', 'PreCompact', 'PostCompact'].includes(eventName) && entry?.matcher != null ? String(entry.matcher) : null,
    command: String(hook.command || ''),
    timeout: Number(hook.timeout || 600),
    async: Boolean(hook.async),
    statusMessage: String(hook.statusMessage || '')
  });
}

function tomlQuotedKey(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function upsertCodexTrustTomlTable(text: string, table: string, block: string): string {
  let lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') lines = [];
  const header = `[${table}]`;
  const start = lines.findIndex((line) => line.trim() === header);
  const blockLines = String(block || '').trim().split('\n');
  if (start === -1) return [...lines, ...(lines.length ? [''] : []), ...blockLines].join('\n').replace(/\n{3,}/g, '\n\n');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[i] || '')) {
      end = i;
      break;
    }
  }
  lines.splice(start, end - start, ...blockLines);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function mergeManagedHooksJson(existingContent: any, commandPrefix: any) {
  let root: any = {};
  try {
    root = existingContent?.trim() ? JSON.parse(existingContent) : {};
    if (!root || typeof root !== 'object' || Array.isArray(root)) root = {};
  } catch {
    root = {};
  }
  const managed: any = buildManagedHooks(commandPrefix);
  const currentHooks = root.hooks && typeof root.hooks === 'object' && !Array.isArray(root.hooks) ? root.hooks : {};
  const nextHooks = { ...currentHooks };
  for (const [eventName, managedEntries] of Object.entries(managed.hooks) as Array<[string, any[]]>) {
    const existingEntries = Array.isArray(currentHooks[eventName]) ? currentHooks[eventName] : [];
    const preserved: any[] = [];
    for (const entry of existingEntries) {
      const stripped = stripSksManagedHookEntry(entry);
      if (stripped) preserved.push(stripped);
    }
    nextHooks[eventName] = [...preserved, ...managedEntries];
  }
  return `${JSON.stringify({ ...root, hooks: nextHooks }, null, 2)}\n`;
}

function stripSksManagedHookEntry(entry: any) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !Array.isArray(entry.hooks)) return entry;
  const next = entry.hooks.filter((hook: any) => !isSksManagedHook(hook));
  if (next.length === entry.hooks.length) return entry;
  if (!next.length) return null;
  return { ...entry, hooks: next };
}

function isSksManagedHook(hook: any) {
  if (!hook || typeof hook !== 'object' || Array.isArray(hook)) return false;
  const command = String(hook.command || '');
  return hook.type === 'command' && /\bhook\s+(?:session-start|user-prompt-submit|pre-tool|post-tool|permission-request|pre-compact|post-compact|subagent-start|subagent-stop|stop)\b/.test(command) && /\b(?:sks|sneakoscope|sks\.js)\b/.test(command);
}

const AGENTS_BLOCK = "\n# Sneakoscope Codex Managed Rules\n\nThis repository uses Sneakoscope Codex.\n\n## Core Rules\n\n- Codex native `/goal` workflows are the persisted continuation surface; Ralph is removed from the user-facing SKS surface.\n- Keep runtime state bounded: raw logs go to files, prompts get tails/summaries, and `sks gc` may prune stale artifacts.\n- Codex App hooks, launch paths, and `sks doctor --fix` do not force SKS update prompts during ordinary work. Manual CLI update surfaces (`sks update-check`, `sks update check`, and `sks update now`) remain available when the operator explicitly asks for them.\n- Versioning is explicit: use `sks versioning bump` when preparing release metadata. SKS must not install Git pre-commit hooks.\n- Installed harness files are immutable to LLM edits: `.codex/*`, `.agents/skills/`, `.codex/agents/`, `.sneakoscope/*policy*.json`, `AGENTS.md`, and `node_modules/sneakoscope`. The Sneakoscope engine source repo is the only automatic exception.\n- OMX/DCodex conflicts block setup/doctor. Show `sks conflicts prompt`; cleanup requires explicit human approval.\n- Do not stop at a plan when implementation was requested. Finish, verify, or report the hard blocker.\n- Do not create unrequested fallback implementation code. If the requested path is impossible, block with evidence instead of inventing substitute behavior.\n\n## Routes\n\n- General execution/code-changing prompts default to `$Team`: native agent intake agents, TriWiki refresh/validate, read-only debate, consensus, concrete runtime task graph/inboxes, fresh executor team, minimum five-lane Team review, integration, Honest Mode.\n- `$Computer-Use` / `$CU` is the maximum-speed Codex Computer Use lane for native macOS, desktop-app, OS-settings, and non-web visual tasks only. Web, browser, localhost, website, webapp, and web-based app verification must use the Codex Chrome Extension path first and halt rapidly if the extension is not installed/enabled.\n- `$Goal` is a fast bridge/overlay for Codex native `/goal` create/pause/resume/clear persistence controls; implementation continues through the selected SKS execution route.\n- TriWiki recall must stay bounded. Use `sks wiki sweep` to record demote, soft-forget, archive, delete, promote-to-skill, and promote-to-rule candidates instead of injecting every old claim.\n- Team missions must keep schema-backed evidence current: `work-order-ledger.json`, `effort-decision.json`, `team-dashboard-state.json`, and route-specific visual/dogfood artifacts where applicable. Team completion requires at least five independent reviewer/QA validation lanes before integration or final, even when a prompt requests fewer reviewers. Use `sks validate-artifacts latest` before claiming those artifacts pass.\n- `$DFix` is Direct Fix: only tiny copy/config/docs/labels/spacing/translation/simple mechanical edits, bypassing the main pipeline, Team, TriWiki/TriFix/reflection recording, and persistent route state; it still uses a one-line DFix-specific Honest check before final. Broad implementation stays on `$Team`, while UI design specifics follow the relevant design/UI route rules. `$PPT` is the restrained, information-first HTML/PDF presentation route and must seal delivery context, audience profile, STP, decision context, and 3+ pain-point/solution/aha mappings before design/render work. It must avoid over-designed visuals, carry detail through hierarchy, spacing, alignment, thin rules, source clarity, and subtle accents, preserve editable source HTML under `source-html/`, record `ppt-parallel-report.json`, and clean PPT-only temporary build files before completion. `$Image-UX-Review` / `$UX-Review` is the imagegen/gpt-image-2 UI/UX review route: source screenshots must become generated annotated review images, those generated images must be extracted into issue ledgers, and text-only critique cannot pass the route gate. `$Answer`, `$Help`, and `$Wiki` stay lightweight.\n- For code work, surface route/guard/write scopes first, split independent worker scopes when available, and keep parent-owned integration and verification.\n- Design work reads `design.md` as the only design decision SSOT. If missing, create it through `design-system-builder` from `docs/Design-Sys-Prompt.md`; getdesign.md, getdesign-reference, and curated DESIGN.md examples from https://github.com/VoltAgent/awesome-design-md are source inputs to fuse into that SSOT or route-local style tokens, not parallel design authorities. Image/logo/raster assets use `imagegen`, which must prefer official Codex App built-in image generation via `$imagegen` / `gpt-image-2`; for newest-model image requests prompt explicitly for ChatGPT Images 2.0 / GPT Image 2.0 with `gpt-image-2`. Do not replace required raster evidence with placeholder SVG/HTML/CSS, prose-only reviews, or fabricated files.\n- Research, AutoResearch, performance, token, accuracy, SEO/GEO, or workflow-improvement claims need experiment/eval evidence. Do not claim live model accuracy without a scored dataset.\n- Treat handwritten files above 3000 lines as split-review risks. Run `sks code-structure scan` and prefer extraction before adding substantial logic.\n- Skill dreaming stays lightweight: route use records JSON counters in `.sneakoscope/skills/dream-state.json`, and full skill inventory/recommendation runs only after the configured 10-route-event threshold and cooldown. Reports are recommendation-only; deleting or merging skills needs explicit user approval.\n\n## Evidence And Context\n\n- Context7 is required for external libraries, APIs, MCPs, package managers, SDKs, and generated docs: resolve-library-id then query-docs.\n- When tech stack, framework, package, runtime, or deployment-platform versions change, use Context7 or official vendor web docs, record current syntax/security/limit guidance as high-priority TriWiki claims, then refresh and validate before coding.\n- TriWiki is the context-tracking SSOT for long-running missions, Team handoffs, and context-pressure recovery. Read `.sneakoscope/wiki/context-pack.json` before each stage, use `attention.use_first` for compact high-trust recall, hydrate `attention.hydrate_first` from source before risky or lower-trust decisions, refresh after findings or artifact changes, and validate before handoffs/final claims.\n- Source priority: current code/tests/config, decision contract, vgraph, beta, GX render/snapshot metadata, LLM Wiki coordinate index, then model knowledge only if allowed.\n- Final response before stop: summarize what was done, what changed for the user/repo, what was verified, and what remains unverified or blocked; then run Honest Mode. Say what passed and what was not verified.\n- `$From-Chat-IMG` uses forensic visual effort, not ordinary Team effort. Completion is blocked until source inventory, visual mapping, work-order coverage, scoped dogfood/QA, and post-fix verification artifacts are present and valid.\n\n## Safety\n\n- Database access is high risk. Use read-only inspection by default; live data mutation is out of scope unless a sealed contract allows local or branch-only migration files.\n- MAD and MAD-SKS widen only explicit scoped permissions; they still do not authorize unrequested fallback implementation code.\n- Task completion requires relevant tests or justification, zero unsupported critical claims, accepted visual/wiki drift, and final evidence.\n\n## Codex App\n\nUse `.codex/SNEAKOSCOPE.md`, generated `.agents/skills`, `.codex/hooks.json`, and SKS dollar commands (`$sks`, `$team`, `$computer-use`, `$cu`, `$ppt`, `$image-ux-review`, `$ux-review`, `$goal`, `$dfix`, `$qa-loop`, etc.) as the app control surface.\n";

function agentsBlockText() {
  return AGENTS_BLOCK
    .replace(
      'General execution/code-changing prompts default to `$Team`: native agent intake agents, TriWiki refresh/validate, read-only debate, consensus, concrete runtime task graph/inboxes, fresh executor team, minimum five-lane Team review, integration, Honest Mode.',
      'General execution/code-changing prompts default to `$Team`, a compatibility alias for the `$Naruto` Codex official subagent workflow: parent-owned decomposition, project-scoped custom agents, disjoint write scopes, bounded query-aware TriWiki use, two independent children for non-trivial work, risk-scoped expansion to at most three automatic children, parent integration, and Honest Mode.'
    )
    .replace(
      'Team missions must keep schema-backed evidence current: `work-order-ledger.json`, `effort-decision.json`, `team-dashboard-state.json`, and route-specific visual/dogfood artifacts where applicable. Team completion requires at least five independent reviewer/QA validation lanes before integration or final, even when a prompt requests fewer reviewers. Use `sks validate-artifacts latest` before claiming those artifacts pass.',
      'New `$Team` execution redirects to the Naruto official subagent workflow and must keep `subagent-plan.json`, `subagent-events.jsonl`, `subagent-parent-summary.json`, `subagent-evidence.json`, the work-order ledger, and route-specific visual/dogfood artifacts current where applicable. New work uses one focused reviewer by default, two only for independent review domains, and at most three automatic reviewers for critical multi-domain risk. Legacy Team observe/watch commands remain read-only for old missions. Use `sks validate-artifacts latest` before claiming artifacts pass.'
    )
    .replace('TriWiki is the context-tracking SSOT for long-running missions, Team handoffs, and context-pressure recovery.', 'TriWiki is the context-tracking SSOT for long-running missions, official subagent handoffs, and context-pressure recovery.');
}

export async function initProject(root: any, opts: any = {}) {
  const created: any[] = [];
  const installScope = normalizeInstallScope(opts.installScope || 'global');
  const localOnly = Boolean(opts.localOnly);
  const sourceProject = await isHarnessSourceProject(root).catch(() => false);
  const requestedHookCommandPrefix = opts.hookCommandPrefix || sksCommandPrefix(installScope, { globalCommand: opts.globalCommand });
  const hookCommandPrefix = sourceProject ? 'node ./dist/bin/sks.js' : requestedHookCommandPrefix;
  const sine = path.join(root, '.sneakoscope');
  const manifestPath = path.join(sine, 'manifest.json');
  const previousManifest = await readJson(manifestPath, null);
  const preRepairCodexConfig = opts.repair ? await readText(path.join(root, '.codex', 'config.toml'), '') : '';
  if (opts.repair) {
    const repair = await repairSksGeneratedArtifacts(root, {
      resetState: Boolean(opts.resetState),
      preserveCodexAgents: true
    });
    if (repair.removed.length) created.push(`repaired generated SKS files (${repair.removed.length})`);
  }
  const dirs = [
    '.sneakoscope/state', '.sneakoscope/missions', '.sneakoscope/db', '.sneakoscope/bus', '.sneakoscope/hproof', '.sneakoscope/db', '.sneakoscope/wiki', '.sneakoscope/skills', '.sneakoscope/memory/q0_raw', '.sneakoscope/memory/q1_evidence', '.sneakoscope/memory/q2_facts', '.sneakoscope/memory/q3_tags', '.sneakoscope/memory/q4_bits', '.sneakoscope/gx/cartridges', '.sneakoscope/model/fingerprints', '.sneakoscope/genome/candidates', '.sneakoscope/trajectories/raw', '.sneakoscope/locks', '.sneakoscope/tmp', '.sneakoscope/arenas', '.sneakoscope/reports', '.codex', '.codex/agents', '.agents/skills'
  ];
  for (const d of dirs) await ensureDir(path.join(root, d));
  const sharedIgnoreWanted = !localOnly && await shouldWriteSharedGitIgnore(root, installScope);
  const localExclude = localOnly ? await ensureLocalOnlyGitExclude(root) : null;
  const sharedIgnore = sharedIgnoreWanted ? await ensureSharedGitIgnore(root) : null;
  if (localExclude?.path) created.push(`${path.relative(root, localExclude.path)} local-only excludes`);
  if (sharedIgnore?.changed) created.push(`${path.relative(root, sharedIgnore.path)} SKS generated files ignore`);

  const manifest: any = {
    package: 'sneakoscope',
    version: PACKAGE_VERSION,
    initialized_at: nowIso(),
    no_external_tools: true,
    codex_required: true,
    codex_app_supported: true,
    native_runtime_dependencies: 0,
    installation: {
      scope: installScope,
      default_scope: 'global',
      hook_command_prefix: hookCommandPrefix,
      global_command: opts.globalCommand || 'sks',
      project_command: 'node ./node_modules/sneakoscope/dist/bin/sks.js'
    },
    codex_app: {
      config: '.codex/config.toml',
      hooks: '.codex/hooks.json',
      skills: '.agents/skills',
      legacy_skills_dir_removed: '.codex/skills',
      agents: '.codex/agents',
      quick_reference: '.codex/SNEAKOSCOPE.md',
      agents_rules: 'AGENTS.md'
    },
    prompt_pipeline: {
      default_enabled: true,
      dollar_commands: DOLLAR_COMMANDS.map((c: any) => c.command),
      dollar_skill_names: DOLLAR_SKILL_NAMES,
      direct_fix_command: '$DFix',
      ppt_skill_allowlist: PPT_PIPELINE_SKILL_ALLOWLIST,
      ppt_conditional_skill_allowlist: PPT_CONDITIONAL_SKILL_ALLOWLIST,
      ppt_mcp_allowlist: PPT_PIPELINE_MCP_ALLOWLIST
    },
    recommended_skills: RECOMMENDED_SKILLS,
    recommended_mcp_servers: RECOMMENDED_MCP_SERVERS,
    design_system_ssot: DESIGN_SYSTEM_SSOT,
    recommended_design_references: RECOMMENDED_DESIGN_REFERENCES,
    skill_dreaming: {
      state: SKILL_DREAM_POLICY.state_path,
      latest_report: SKILL_DREAM_POLICY.latest_report_path,
      min_events_between_runs: SKILL_DREAM_POLICY.min_events_between_runs,
      min_interval_hours: SKILL_DREAM_POLICY.min_interval_hours,
      apply_mode: SKILL_DREAM_POLICY.apply_mode,
      no_auto_delete: SKILL_DREAM_POLICY.no_auto_delete
    },
    harness_guard: {
      enabled: true,
      policy: '.sneakoscope/harness-guard.json',
      immutable_to_llm_edits: true
    },
    harness_conflicts: {
      block_other_codex_harnesses: true,
      hard_blockers: ['OMX', 'DCodex'],
      cleanup_prompt_command: `${hookCommandPrefix} conflicts prompt`,
      human_approval_required: true
    },
    llm_wiki: {
      ssot: 'triwiki',
      coordinate_schema: 'sks.wiki-coordinate.v1',
      voxel_overlay_schema: 'sks.wiki-voxel.v1',
      default_pack: triwikiContextTracking().default_pack,
      context_tracking: triwikiContextTracking(),
      channel_map: { r: 'domainAngle', g: 'layerRadius', b: 'phase', a: 'concentration' },
      continuity_model: 'selected_text_plus_hydratable_rgba_trig_anchors',
      required_pack_shape: 'coordinate_index_with_voxel_overlay',
      migration_model: 'setup_or_wiki_refresh_regenerates_required_voxel_overlay'
    },
    git: {
      local_only: localOnly,
      ignore_path: sharedIgnore?.path ? path.relative(root, sharedIgnore.path) : null,
      ignored_patterns: sharedIgnore?.patterns || [],
      exclude_path: localExclude?.path ? path.relative(root, localExclude.path) : null,
      excluded_patterns: localExclude?.patterns || [],
      versioning: {
        enabled: false,
        bump: 'patch',
        lock: 'git-common-dir/sks-version.lock',
        state: 'git-common-dir/sks-version-state.json'
      }
    },
    database_safety: 'default_safe; $MAD-SKS scoped permission profile keeps catastrophic safeguards active; first-class $MAD-DB is the explicit SQL-plane execution exception with mission-local write transport and read-back proof',
    gx_renderer: 'deterministic_svg_html'
  };
  await writeJsonAtomic(manifestPath, manifest);
  created.push('.sneakoscope/manifest.json');

  const dbSafetyPath = path.join(sine, 'db-safety.json');
  if (!(await exists(dbSafetyPath)) || opts.force) {
    await writeJsonAtomic(dbSafetyPath, DEFAULT_DB_SAFETY_POLICY);
    created.push('.sneakoscope/db-safety.json');
  }

  const policyPath = path.join(sine, 'policy.json');
  if (!(await exists(policyPath)) || opts.force) {
    await writeJsonAtomic(policyPath, defaultPolicy(installScope, hookCommandPrefix));
    created.push('.sneakoscope/policy.json');
  } else {
    const policy = await readJson(policyPath, {});
    await writeJsonAtomic(policyPath, {
      ...policy,
      installation: installPolicy(installScope, hookCommandPrefix),
      git: {
        ...(policy.git || {}),
        local_only: localOnly || Boolean(policy.git?.local_only),
        ignore_path: sharedIgnore?.path ? path.relative(root, sharedIgnore.path) : policy.git?.ignore_path || null,
        ignored_patterns: sharedIgnore?.patterns || policy.git?.ignored_patterns || [],
        exclude_path: localExclude?.path ? path.relative(root, localExclude.path) : policy.git?.exclude_path || null,
        excluded_patterns: localExclude?.patterns || policy.git?.excluded_patterns || [],
        versioning: {
          ...(policy.git?.versioning || {}),
          enabled: false,
          bump: policy.git?.versioning?.bump || 'patch',
          lock: 'git-common-dir/sks-version.lock',
          state: 'git-common-dir/sks-version-state.json'
        }
      },
      versioning: {
        ...(policy.versioning || {}),
        enabled: false,
        bump: policy.versioning?.bump || 'patch',
        trigger: 'manual',
        lock_scope: 'git-common-dir',
        managed_files: ['package.json', 'package-lock.json', 'npm-shrinkwrap.json']
      },
      prompt_pipeline: {
        ...(policy.prompt_pipeline || {}),
        default_enabled: true,
        route_without_command: true,
        dollar_commands: DOLLAR_COMMANDS.map((c: any) => c.command),
        dollar_skill_names: DOLLAR_SKILL_NAMES,
        direct_fix_command: '$DFix',
        ppt_skill_allowlist: PPT_PIPELINE_SKILL_ALLOWLIST,
        ppt_conditional_skill_allowlist: PPT_CONDITIONAL_SKILL_ALLOWLIST,
        ppt_mcp_allowlist: PPT_PIPELINE_MCP_ALLOWLIST
      },
      context7: {
        ...(policy.context7 || {}),
        required_for_external_docs: true,
        default_transport: 'remote',
        mcp_config: '.codex/config.toml',
        required_flow: ['resolve-library-id', 'query-docs']
      },
      harness_guard: {
        ...(policy.harness_guard || {}),
        enabled: true,
        policy: '.sneakoscope/harness-guard.json',
        immutable_to_llm_edits: true,
        engine_source_exception_only: true
      },
      harness_conflicts: {
        ...(policy.harness_conflicts || {}),
        block_other_codex_harnesses: true,
        hard_blockers: ['OMX', 'DCodex'],
        cleanup_prompt_command: `${hookCommandPrefix} conflicts prompt`,
        human_approval_required: true
      },
      llm_wiki: {
        ...(policy.llm_wiki || {}),
        ssot: 'triwiki',
        voxel_overlay_schema: 'sks.wiki-voxel.v1',
        default_pack: triwikiContextTracking().default_pack,
        context_tracking: triwikiContextTracking(),
        compression_policy: 'preserve_ids_hashes_sources_rgba_coordinates_for_hydration',
        required_pack_shape: 'coordinate_index_with_voxel_overlay',
        migration_model: 'setup_or_wiki_refresh_regenerates_required_voxel_overlay'
      },
      recommended_skills: RECOMMENDED_SKILLS,
      recommended_mcp_servers: RECOMMENDED_MCP_SERVERS,
      design_system_ssot: DESIGN_SYSTEM_SSOT,
      recommended_design_references: RECOMMENDED_DESIGN_REFERENCES
    });
  }

  function defaultPolicy(scope: any, commandPrefix: any) {
    return {
      schema_version: 1,
      installation: installPolicy(scope, commandPrefix),
      git: {
        local_only: localOnly,
        ignore_path: sharedIgnore?.path ? path.relative(root, sharedIgnore.path) : null,
        ignored_patterns: sharedIgnore?.patterns || [],
        exclude_path: localExclude?.path ? path.relative(root, localExclude.path) : null,
        excluded_patterns: localExclude?.patterns || [],
        versioning: {
          enabled: false,
          bump: 'patch',
          lock: 'git-common-dir/sks-version.lock',
          state: 'git-common-dir/sks-version-state.json'
        }
      },
      retention: DEFAULT_RETENTION_POLICY,
      update_check: {
        enabled: true,
        package: 'sneakoscope',
        prompt_user_before_work: true,
        skip_scope: 'conversation_only'
      },
      versioning: {
        enabled: false,
        bump: 'patch',
        trigger: 'manual',
        lock_scope: 'git-common-dir',
        managed_files: ['package.json', 'package-lock.json', 'npm-shrinkwrap.json'],
        collision_policy: 'explicit_bump_only'
      },
      honest_mode: {
        required_before_final: true,
        verify_goal_evidence_tests_gaps: true
      },
      database_safety: {
        ...DEFAULT_DB_SAFETY_POLICY,
        mad_sks_live_full_access: true,
        mad_sks_gate_module: 'src/core/permission-gates.ts'
      },
      performance: {
        max_parallel_sessions: 2,
        process_tail_bytes: 262144,
        codex_timeout_ms: 1800000,
        prefer_streaming_logs: true,
        eval_thresholds: {
          min_token_savings_pct: 0.1,
          min_accuracy_delta: 0.03,
          min_required_recall: 0.95
        }
      },
      llm_wiki: {
        ssot: 'triwiki',
        coordinate_schema: 'sks.wiki-coordinate.v1',
        voxel_overlay_schema: 'sks.wiki-voxel.v1',
        default_pack: '.sneakoscope/wiki/context-pack.json',
        context_tracking: triwikiContextTracking(),
        compression_policy: 'preserve_ids_hashes_sources_rgba_coordinates_for_hydration',
        required_pack_shape: 'coordinate_index_with_voxel_overlay',
        channel_map: { r: 'domainAngle', g: 'layerRadius_sin', b: 'phase', a: 'concentration' }
      },
      package: {
        zero_runtime_dependencies: true,
        rust_default_runtime: false,
        rust_reason: 'Native Rust binaries would increase package size and break npm install portability. Optional Rust source is provided for future acceleration, but default runtime is dependency-free Node.js.'
      },
      database: {
        guardian_enabled: true,
        live_database_mode: 'read_only',
        destructive_operations_allowed: false,
        mcp_write_tools_allowed: false
      },
      gx: {
        renderer: 'deterministic_svg_html',
        source_of_truth: 'vgraph.json',
        external_image_generation: false
      },
      codex_app: {
        supported: true,
        config: '.codex/config.toml',
        hooks: '.codex/hooks.json',
        skills: '.agents/skills',
        legacy_skills_dir_removed: '.codex/skills',
        agents: '.codex/agents',
        quick_reference: '.codex/SNEAKOSCOPE.md',
        agents_rules: 'AGENTS.md'
      },
      prompt_pipeline: {
        default_enabled: true,
        route_without_command: true,
        dollar_commands: DOLLAR_COMMANDS.map((c: any) => c.command),
        dollar_skill_names: DOLLAR_SKILL_NAMES,
        direct_fix_command: '$DFix',
        ppt_skill_allowlist: PPT_PIPELINE_SKILL_ALLOWLIST,
        ppt_conditional_skill_allowlist: PPT_CONDITIONAL_SKILL_ALLOWLIST,
        ppt_mcp_allowlist: PPT_PIPELINE_MCP_ALLOWLIST
      },
      context7: {
        required_for_external_docs: true,
        default_transport: 'remote',
        mcp_config: '.codex/config.toml',
        required_flow: ['resolve-library-id', 'query-docs']
      },
      harness_guard: {
        enabled: true,
        policy: '.sneakoscope/harness-guard.json',
        immutable_to_llm_edits: true,
        engine_source_exception_only: true
      },
      harness_conflicts: {
        block_other_codex_harnesses: true,
        hard_blockers: ['OMX', 'DCodex'],
        cleanup_prompt_command: `${commandPrefix} conflicts prompt`,
        cleanup_model_policy: 'inherit_codex_selection',
        cleanup_reasoning_effort: 'high',
        human_approval_required: true
      },
      recommended_skills: RECOMMENDED_SKILLS,
      recommended_mcp_servers: RECOMMENDED_MCP_SERVERS,
      design_system_ssot: DESIGN_SYSTEM_SSOT,
      recommended_design_references: RECOMMENDED_DESIGN_REFERENCES
    };
  }

function installPolicy(scope: any, commandPrefix: any) {
  return {
    scope,
    default_scope: 'global',
    hook_command_prefix: commandPrefix,
    global_install: 'npm i -g sneakoscope',
    project_install: 'npm i -D sneakoscope && npx sks setup --install-scope project'
  };
}

// SKS-managed Codex App feature flags. Seeded as defaults for fresh configs but
// NEVER force-re-enabled on upgrade: force-writing these reverted a user's
// `enabled = false` and blanked/broke the Codex App UI (same rationale as the
// install-helpers path). All are SET-IF-ABSENT below.
// Only flags present in the current official [features] reference. Flags SKS
// wrote before the 2026-07 renewal that no longer exist (remote_control,
// fast_mode_ui, codex_git_commit, computer_use, browser_use, browser_use_external,
// image_generation, in_app_browser, guardian_approval, tool_suggest, plugins) are
// stripped below instead.
const MANAGED_CODEX_FEATURE_FLAGS = ['hooks', 'multi_agent', 'fast_mode', 'apps'];
const REMOVED_CODEX_FEATURE_FLAGS = [
  'remote_control', 'fast_mode_ui', 'codex_git_commit', 'computer_use', 'browser_use',
  'browser_use_external', 'image_generation', 'in_app_browser', 'guardian_approval',
  'tool_suggest', 'plugins', 'codex_hooks'
];

function mergeManagedCodexConfigToml(existingContent: any = '', opts: any = {}) {
  let next = String(existingContent || '').trimEnd();
  next = removeTomlTableKey(next, 'notice', 'fast_default_opt_out');
  next = removeTomlTableKey(next, 'features', 'codex_hooks');
  next = upsertTopLevelTomlBooleanIfAbsent(next, 'suppress_unstable_features_warning', true);
  // Codex App feature flags: SET-IF-ABSENT only (see note above); flags the
  // 2026-07 renewal removed from the schema are stripped.
  for (const flag of MANAGED_CODEX_FEATURE_FLAGS) {
    next = upsertTomlTableKeyIfAbsent(next, 'features', `${flag} = true`);
  }
  for (const flag of REMOVED_CODEX_FEATURE_FLAGS) {
    next = removeTomlTableKey(next, 'features', flag);
  }
  next = removeWholeTomlTable(next, 'user.fast_mode');
  next = removeWholeTomlTable(next, 'profiles.sks-fast-high');
  next = removeWholeTomlTable(next, 'features.multi_agent_v2');
  next = mergeOfficialSubagentConfig(next, {
    sksOwned: opts.sksOwned === true,
    inheritedText: opts.inheritedText || ''
  });
  for (const block of managedCodexConfigBlocks()) {
    if (block.preserveExisting === true && hasTomlTable(next, block.table)) continue;
    next = upsertTomlTable(next, block.table, block.text);
  }
  // Plugin tables broke the Codex App UI by force-reverting user `enabled=false`.
  // Auto-enable is opt-in only, and even then never overwrites an existing table.
  if (process.env.SKS_MANAGE_CODEX_APP_PLUGINS === '1') {
    for (const [name, marketplace] of DEFAULT_CODEX_APP_PLUGINS) {
      const table = `plugins."${name}@${marketplace}"`;
      if (!hasTomlTable(next, table)) {
        next = upsertTomlTable(next, table, `[${table}]\nenabled = true`);
      }
    }
  }
  return `${next.trim()}\n`;
}

async function mergeGlobalCodexConfigIfAvailable(configText: any = '', configPath: any = '', opts: any = {}) {
  const selectedRe = /(^|\n)\s*model_provider\s*=\s*"codex-lb"\s*(?:#.*)?(?=\n|$)/;
  const home = opts.home || process.env.HOME || '';
  if (!home) return configText;
  const codexHome = opts.codexHome || process.env.CODEX_HOME || path.join(home, '.codex');
  const globalConfigPath = path.join(codexHome, 'config.toml');
  if (configPath && path.resolve(configPath) === path.resolve(globalConfigPath)) return configText;
  const globalConfig = await readText(globalConfigPath, '');
  let next = mergeGlobalMcpServers(configText, globalConfig);
  next = mergeGlobalCodexAppRuntimeTables(next, globalConfig);
  if (selectedRe.test(next) && /\[model_providers\.codex-lb\]/.test(next)) {
    return `${next.trim()}\n`;
  }
  const envPath = path.join(codexHome, 'sks-codex-lb.env');
  if (!(await exists(envPath))) return next;
  const envText = await readText(envPath, '');
  const baseUrl = globalConfig.match(/(^|\n)\[model_providers\.codex-lb\][\s\S]*?\n\s*base_url\s*=\s*"([^"]+)"/)?.[2] || parseCodexLbEnvBaseUrl(envText);
  if (!parseCodexLbEnvKey(envText) || !baseUrl) return next;
  const shouldSelectCodexLb = selectedRe.test(next) || selectedRe.test(globalConfig);
  next = shouldSelectCodexLb
    ? upsertTopLevelTomlString(next, 'model_provider', 'codex-lb')
    : removeTopLevelTomlKeyIfValue(next, 'model_provider', 'codex-lb');
  next = upsertTomlTable(next, 'model_providers.codex-lb', `[model_providers.codex-lb]\nname = "openai"\nbase_url = "${baseUrl}"\nwire_api = "responses"\nenv_key = "CODEX_LB_API_KEY"\nsupports_websockets = true\nrequires_openai_auth = true`);
  return `${next.trim()}\n`;
}

function parseCodexLbEnvKey(text: any = '') {
  return parseShellEnvValue(text, 'CODEX_LB_API_KEY');
}

function parseCodexLbEnvBaseUrl(text: any = '') {
  const value = parseShellEnvValue(text, 'CODEX_LB_BASE_URL');
  if (!value) return '';
  let host = value.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) host = `https://${host}`;
  host = host.replace(/\/+$/, '');
  return /\/backend-api\/codex$/i.test(host) ? host : `${host}/backend-api/codex`;
}

function parseShellEnvValue(text: any = '', key: any = '') {
  const re = new RegExp(`^\\s*(?:export\\s+)?${escapeRegExp(key)}\\s*=\\s*(.+?)\\s*$`, 'm');
  const raw = String(text || '').match(re)?.[1]?.trim() || '';
  if (!raw) return '';
  if (raw.startsWith("'")) return raw.endsWith("'") && raw.length > 1 ? raw.slice(1, -1).replace(/'\\''/g, "'") : '';
  if (raw.startsWith('"')) return raw.endsWith('"') && raw.length > 1 ? raw.slice(1, -1).replace(/\\"/g, '"') : '';
  if (raw.includes("'") || raw.includes('"') || /\s/.test(raw)) return '';
  return raw;
}

function mergeGlobalMcpServers(configText: any = '', globalConfig: any = '') {
  let next = configText;
  const re = /(?:^|\n)(\[(mcp_servers\.[^\]\r\n]+)\][\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/g;
  for (const match of String(globalConfig || '').matchAll(re)) {
      const block = (match[1] || '').trim();
      const table = (match[2] || '').trim();
    if (!new RegExp(`(^|\\n)\\[${escapeRegExp(table)}\\]`).test(next)) next = upsertTomlTable(next, table, block);
  }
  return next;
}

function mergeGlobalCodexAppRuntimeTables(configText: any = '', globalConfig: any = '') {
  let next = configText;
  const re = /(?:^|\n)(\[((?:marketplaces|plugins)\.[^\]\r\n]+)\][\s\S]*?)(?=\n\[[^\]]+\]|\s*$)/g;
  for (const match of String(globalConfig || '').matchAll(re)) {
      const block = (match[1] || '').trim();
      const table = (match[2] || '').trim();
    if (!new RegExp(`(^|\\n)\\[${escapeRegExp(table)}\\]`).test(next)) next = upsertTomlTable(next, table, block);
  }
  return next;
}

function removeWholeTomlTable(text: any = '', table: any = '') {
  const lines = String(text || '').trimEnd().split('\n');
  const header = `[${table}]`;
  const start = lines.findIndex((x: any) => x.trim() === header);
  if (start === -1) return String(text || '');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const ln = lines[i];
    if (ln !== undefined && /^\s*\[.+\]\s*$/.test(ln)) { end = i; break; }
  }
  return lines.filter((_: any, index: any) => index < start || index >= end).join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function removeTopLevelTomlKeyIfValue(text: any = '', key: any = '', value: any = '') {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"${escapeRegExp(value)}"\\s*(?:#.*)?$`);
  return lines.filter((line: any, index: any) => index >= end || !keyPattern.test(line)).join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function upsertTopLevelTomlString(text: any, key: any, value: any) {
  const line = `${key} = "${value}"`;
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  for (let i = 0; i < end; i += 1) {
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(lines[i] || '')) {
      lines[i] = line;
      return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }
  }
  lines.splice(end, 0, line);
  return lines.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function upsertTopLevelTomlBoolean(text: any, key: any, value: any) {
  const line = `${key} = ${value ? 'true' : 'false'}`;
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  for (let i = 0; i < end; i += 1) {
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(lines[i] || '')) {
      lines[i] = line;
      return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }
  }
  lines.splice(end, 0, line);
  return lines.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function hasTopLevelTomlKey(text: any, key: any): boolean {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  for (let i = 0; i < end; i += 1) if (re.test(lines[i] || '')) return true;
  return false;
}

function upsertTopLevelTomlBooleanIfAbsent(text: any, key: any, value: any) {
  return hasTopLevelTomlKey(text, key) ? String(text || '') : upsertTopLevelTomlBoolean(text, key, value);
}

function hasTomlTable(text: any, table: any): boolean {
  return new RegExp(`(^|\\n)\\s*\\[${escapeRegExp(table)}\\]\\s*(?:#.*)?(?=\\n|$)`).test(String(text || ''));
}

function hasTomlTableKey(text: any, table: any, key: any): boolean {
  const lines = String(text || '').split('\n');
  const header = `[${table}]`;
  const start = lines.findIndex((x: any) => x.trim() === header);
  if (start === -1) return false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[i] || '')) { end = i; break; }
  }
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  for (let i = start + 1; i < end; i += 1) if (re.test(lines[i] || '')) return true;
  return false;
}

function upsertTomlTableKeyIfAbsent(text: any, table: any, line: any) {
  const key = (String(line).split('=')[0] || '').trim();
  return hasTomlTableKey(text, table, key) ? String(text || '') : upsertTomlTableKey(text, table, line);
}

function removeTomlTableKey(text: any, table: any, key: any) {
  const lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') return '';
  const header = `[${table}]`;
  const start = lines.findIndex((x: any) => x.trim() === header);
  if (start === -1) return String(text || '');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[i] || '')) {
      end = i;
      break;
    }
  }
  const keyPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  return lines.filter((line: any, index: any) => index <= start || index >= end || !keyPattern.test(line)).join('\n').replace(/\n{3,}/g, '\n\n');
}

function managedCodexConfigBlocks() {
  return [
    // Context7 credentials may live directly in this table as args/env/headers/url
    // depending on the user's MCP client setup. Seed the default only when absent;
    // never replace an existing Context7 block during setup/update.
    // Seed the REMOTE (streamable HTTP `url`) transport, not local stdio: Codex
    // merges the global ~/.codex/config.toml and the project config per-key, so a
    // local-stdio `command` here merging with a remote `url` in the global config
    // yields a stdio server that also carries a `url` — which Codex 0.140 rejects
    // with `url is not supported for stdio`. Remote is also the transport the doctor
    // migrates everyone to (local stdio can block interactive Codex launch).
    { table: 'mcp_servers.context7', text: context7ConfigToml('remote').trim(), preserveExisting: true },
    // NOTE: SKS config profiles are NO LONGER emitted as `[profiles.sks-*]` tables.
    // Codex 0.134+ deprecated config-profile tables / the `profile=` selector (warns at
    // startup) in favor of per-file `$CODEX_HOME/<name>.config.toml` overlays loaded by
    // `--profile <name>`. Those per-file profiles are owned by migrateSksProfilesToPerFile
    // (src/core/auto-review.ts), invoked on `sks --mad`. Emitting the tables here only got
    // them relocated into the home config by the splitter, re-triggering the warning.
    {
      table: 'auto_review',
      text: '[auto_review]\npolicy = "In MAD-SKS launches, allow only the scoped non-MadDB high-risk surfaces approved for the active invocation and keep catastrophic DB wipe/all-row safeguards active. In first-class MAD-DB cycles, the explicit $MAD-DB or sks mad-db run|exec|apply-migration invocation is the SQL-plane approval boundary: execute requested execute_sql/apply_migration mutations with mission-local write transport, read-back proof, and final read-only restoration. Supabase project/account/billing/credential control-plane actions remain denied."'
    }
  ];
}


function upsertTomlTableKey(text: any, table: any, line: any) {
  const key = (String(line).split('=')[0] || '').trim();
  let lines = String(text || '').split('\n');
  if (lines.length === 1 && lines[0] === '') lines = [];
  const header = `[${table}]`;
  let start = lines.findIndex((x: any) => x.trim() === header);
  if (start === -1) {
    const prefix = lines.length && (lines[lines.length - 1] || '').trim() ? ['', header, line] : [header, line];
    return [...lines, ...prefix].join('\n').replace(/\n{3,}/g, '\n\n');
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[.+\]\s*$/.test(lines[i] || '')) {
      end = i;
      break;
    }
  }
  for (let i = start + 1; i < end; i++) {
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(lines[i] || '')) {
      lines[i] = line;
      return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }
  }
  lines.splice(start + 1, 0, line);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function upsertTomlTable(text: any, table: any, block: any) {
  let lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') lines = [];
  const header = `[${table}]`;
  const start = lines.findIndex((x: any) => x.trim() === header);
  const blockLines = String(block || '').trim().split('\n');
  if (start === -1) {
    return [...lines, ...(lines.length ? [''] : []), ...blockLines].join('\n').replace(/\n{3,}/g, '\n\n');
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[.+\]\s*$/.test(lines[i] || '')) {
      end = i;
      break;
    }
  }
  lines.splice(start, end - start, ...blockLines);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

  const currentState = path.join(sine, 'state', 'current.json');
  if (!(await exists(currentState)) || opts.force) {
    await writeJsonAtomic(currentState, { mode: 'IDLE', phase: 'IDLE', updated_at: nowIso() });
    created.push('.sneakoscope/state/current.json');
  }

  const agentsMdPath = path.join(root, 'AGENTS.md');
  const existingAgents = await readText(agentsMdPath, '');
  const hasManagedAgentsBlock = existingAgents.includes('BEGIN Sneakoscope Codex GX MANAGED BLOCK');
  if (localOnly && existingAgents && !hasManagedAgentsBlock) {
    created.push('AGENTS.md skipped (local-only existing file)');
  } else {
    await mergeManagedBlock(agentsMdPath, 'Sneakoscope Codex GX MANAGED BLOCK', agentsBlockText());
    created.push('AGENTS.md managed block');
  }

  const generatedCodexConfigPath = path.join(root, '.codex', 'config.toml');
  const existingCodexConfig = await readText(generatedCodexConfigPath, '') || preRepairCodexConfig;
  const configOwnershipProof = officialSubagentConfigOwnershipProof({
    text: existingCodexConfig,
    manifest: previousManifest,
    migrationReceipt: await readJson(path.join(root, '.sneakoscope', 'update', 'migration-receipt.json'), null)
  });
  const configPreviouslySksOwned = configOwnershipProof.owned;
  const configWasFresh = !String(existingCodexConfig || '').trim();
  const existingConfigValidation = inspectOfficialSubagentToml(existingCodexConfig);
  let codexConfigInstall: any;
  if (!existingConfigValidation.ok) {
    const backupPath = await backupInvalidToml(generatedCodexConfigPath, existingCodexConfig, 'project-config-invalid');
    // repairSksGeneratedArtifacts may have removed the path before this stage;
    // invalid user TOML is still restored byte-for-byte and never normalized.
    await writeTextAtomic(generatedCodexConfigPath, existingCodexConfig);
    codexConfigInstall = {
      ok: false,
      status: 'unparseable_config_preserved',
      config_path: generatedCodexConfigPath,
      backup_path: backupPath,
      manual_blockers: ['manual_invalid_project_codex_config'],
      warnings: []
    };
    created.push('.codex/config.toml invalid TOML preserved (manual repair required)');
  } else {
    const inheritedCodexConfig = await readInheritedOfficialSubagentConfigText(generatedCodexConfigPath, {
      home: opts.home,
      codexHome: opts.codexHome
    });
    const inheritedConfigValidation = inspectOfficialSubagentToml(inheritedCodexConfig);
    if (!inheritedConfigValidation.ok) {
      // A malformed inherited CODEX_HOME config is an operator-owned blocker,
      // not an empty layer. Do not derive or write a project config from it.
      // Repair mode may have removed an SKS-generated project config earlier,
      // so restore that project text byte-for-byte while leaving the inherited
      // file untouched.
      if (String(existingCodexConfig || '').length > 0) {
        await writeTextAtomic(generatedCodexConfigPath, existingCodexConfig);
      }
      const inheritedConfigPath = resolveInheritedOfficialSubagentConfigPath(generatedCodexConfigPath, {
        home: opts.home,
        codexHome: opts.codexHome
      });
      const backupPath = inheritedConfigPath
        ? await backupInvalidToml(inheritedConfigPath, inheritedCodexConfig, 'inherited-global-config-invalid')
        : null;
      codexConfigInstall = {
        ok: false,
        status: 'invalid_inherited_global_config_preserved',
        config_path: generatedCodexConfigPath,
        backup_path: backupPath,
        inherited_config_preserved: true,
        inherited_config_error: inheritedConfigValidation.error,
        manual_blockers: ['manual_invalid_inherited_global_codex_config'],
        warnings: []
      };
      created.push('inherited global Codex config invalid and preserved (manual repair required)');
    } else {
      const managedCodexConfig = await mergeGlobalCodexConfigIfAvailable(
        mergeManagedCodexConfigToml(existingCodexConfig, {
          sksOwned: configPreviouslySksOwned,
          inheritedText: inheritedCodexConfig
        }),
        generatedCodexConfigPath,
        { home: opts.home, codexHome: opts.codexHome }
      );
      const managedConfigValidation = inspectOfficialSubagentToml(managedCodexConfig);
      if (!managedConfigValidation.ok) {
        await writeTextAtomic(generatedCodexConfigPath, existingCodexConfig);
        codexConfigInstall = {
          ok: false,
          status: 'unsafe_config_merge_preserved',
          config_path: generatedCodexConfigPath,
          backup_path: null,
          manual_blockers: ['manual_project_codex_config_merge_invalid'],
          warnings: []
        };
        created.push('.codex/config.toml merge skipped (manual repair required)');
      } else {
        await writeTextAtomic(generatedCodexConfigPath, managedCodexConfig);
        codexConfigInstall = {
          ok: true,
          status: managedCodexConfig === existingCodexConfig ? 'present' : 'written',
          config_path: generatedCodexConfigPath,
          backup_path: null,
          manual_blockers: [],
          warnings: officialSubagentConfigWarnings(managedCodexConfig, inheritedCodexConfig)
        };
        created.push('.codex/config.toml');
      }
    }
  }
  codexConfigInstall.ownership_proof = configOwnershipProof;

  await writeTextAtomic(path.join(root, '.codex', 'SNEAKOSCOPE.md'), codexAppQuickReference(installScope, hookCommandPrefix));
  created.push('.codex/SNEAKOSCOPE.md');

  const hooksPath = path.join(root, '.codex', 'hooks.json');
  await writeTextAtomic(hooksPath, mergeManagedHooksJson(await readText(hooksPath, ''), hookCommandPrefix));
  created.push(`.codex/hooks.json (${installScope})`);
  if (codexConfigInstall.ok) {
    await writeTextAtomic(
      generatedCodexConfigPath,
      mergeManagedHookTrustStateToml(await readText(generatedCodexConfigPath, ''), root, hookCommandPrefix)
    );
    created.push('.codex/config.toml hook trust state');
  }

  const skillInstall = installScope === 'project' ? await installProjectSkills(root) : await installGlobalSkills(root);
  created.push(installScope === 'project' ? '.agents/skills official residue reconciled' : '.agents/skills/*');
  const removedStaleGeneratedSkills = (skillInstall as any).removed_stale_generated_skills || (skillInstall as any).removed || [];
  const removedAgentSkillAliases = (skillInstall as any).removed_agent_skill_aliases || [];
  const removedCodexSkillMirrors = (skillInstall as any).removed_codex_skill_mirrors || [];
  if (removedStaleGeneratedSkills.length) created.push(`stale generated skills removed (${removedStaleGeneratedSkills.length})`);
  if (removedAgentSkillAliases.length) created.push(`deprecated generated skill aliases removed (${removedAgentSkillAliases.length})`);
  if (removedCodexSkillMirrors.length) created.push(`.codex/skills generated mirrors removed (${removedCodexSkillMirrors.length})`);
  const agentInstall = await installCodexAgents(root);
  created.push(`.codex/agents official subagent catalog (${agentInstall.installed_agents?.length || 0})`);
  if (agentInstall.removed_legacy?.length) created.push(`legacy SKS agent TOMLs removed (${agentInstall.removed_legacy.length})`);
  if (agentInstall.manual_blockers?.length) created.push(`official subagent agent config manual blockers (${agentInstall.manual_blockers.length})`);
  const configInventoryOwned = codexConfigInstall.ok && (configWasFresh || configPreviouslySksOwned);
  const generatedFiles = currentGeneratedFileInventory(skillInstall, agentInstall, {
    includeCodexConfig: configInventoryOwned
  });
  const generatedCleanup = await pruneStaleGeneratedFiles(root, previousManifest, generatedFiles);
  if (generatedCleanup.pruned.length) created.push(`stale generated files pruned (${generatedCleanup.pruned.length})`);
  manifest.generated_files = {
    schema_version: 1,
    generated_by: 'sneakoscope',
    prune_policy: GENERATED_PRUNE_POLICY,
    files: generatedFiles
  };
  manifest.generated_cleanup = {
    schema_version: 1,
    last_run_at: nowIso(),
    previous_version: previousManifest?.version || null,
    current_version: PACKAGE_VERSION,
    pruned: generatedCleanup.pruned,
    already_absent: generatedCleanup.already_absent || []
  };
  manifest.codex_app.official_subagents = {
    config: codexConfigInstall,
    agents: agentInstall,
    manual_blockers: [
      ...(codexConfigInstall.manual_blockers || []),
      ...(agentInstall.manual_blockers || [])
    ],
    warnings: codexConfigInstall.warnings || []
  };
  await writeJsonAtomic(manifestPath, manifest);
  await writeHarnessGuardPolicy(root);
  created.push('.sneakoscope/harness-guard.json');
  const versionHookCleanup = await disableVersionGitHook(root);
  created.push(versionHookCleanup.hook_removed ? '.git/hooks/pre-commit SKS version guard removed' : `version guard disabled (${versionHookCleanup.reason || 'policy updated'})`);
  return {
    created,
    generated_cleanup: generatedCleanup,
    skill_install: skillInstall,
    agent_install: agentInstall,
    codex_config_install: codexConfigInstall
  };
}

async function ensureSharedGitIgnore(root: any) {
  const patterns = SKS_GENERATED_GIT_PATTERNS;
  const ignorePath = path.join(root, '.gitignore');
  const markerStart = '# BEGIN Sneakoscope Codex generated files';
  const markerEnd = '# END Sneakoscope Codex generated files';
  const managedBlock = `${markerStart}\n${patterns.join('\n')}\n${markerEnd}\n`;
  const current = await readText(ignorePath, '');
  if (current.includes(markerStart)) {
    const re = new RegExp(`${escapeRegExp(markerStart)}[\\s\\S]*?${escapeRegExp(markerEnd)}\\n?`);
    const next = current.replace(re, managedBlock);
    if (next !== current) await writeTextAtomic(ignorePath, next.endsWith('\n') ? next : `${next}\n`);
    return { path: ignorePath, patterns, changed: next !== current };
  }
  const existing = new Set(current.split(/\r?\n/).map((line: any) => line.trim()).filter(Boolean));
  const missing = patterns.filter((pattern: any) => !existing.has(pattern));
  if (!missing.length) return { path: ignorePath, patterns, changed: false };
  const block = missing.length === patterns.length
    ? managedBlock
    : `${markerStart}\n${missing.join('\n')}\n${markerEnd}\n`;
  await writeTextAtomic(ignorePath, `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}`);
  return { path: ignorePath, patterns, changed: true };
}

async function shouldWriteSharedGitIgnore(root: any, installScope: any) {
  if (normalizeInstallScope(installScope) === 'project') return true;
  if (await exists(path.join(root, '.git'))) return true;
  if (await exists(path.join(root, '.gitignore'))) return true;
  return false;
}

async function ensureLocalOnlyGitExclude(root: any) {
  const gitDir = await resolveGitDir(root);
  if (!gitDir) return { path: null, patterns: [] };
  const patterns = SKS_GENERATED_GIT_PATTERNS;
  const excludePath = path.join(gitDir, 'info', 'exclude');
  await ensureDir(path.dirname(excludePath));
  const markerStart = '# Sneakoscope Codex local-only generated files';
  const current = await readText(excludePath, '');
  if (!current.includes(markerStart)) {
    const block = `${markerStart}\n${patterns.join('\n')}\n`;
    await writeTextAtomic(excludePath, `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}`);
  }
  return { path: excludePath, patterns };
}

async function resolveGitDir(root: any) {
  const dotGit = path.join(root, '.git');
  if (!(await exists(dotGit))) return null;
  const text = await readText(dotGit, null);
  if (typeof text === 'string') {
    const match = text.match(/^gitdir:\s*(.+)\s*$/m);
    if (match?.[1]) return path.resolve(root, match[1]);
  }
  return dotGit;
}

function codexAppQuickReference(scope: any, commandPrefix: any) {
  return [
    '# ㅅㅋㅅ',
    `Install scope: \`${scope}\``,
    `Command: \`${commandPrefix} <command>\``,
    'Files: AGENTS.md, .codex/hooks.json, .codex/config.toml, .codex/SNEAKOSCOPE.md, .agents/skills, .codex/agents, .sneakoscope/missions.',
    `Discover: ${commandPrefix} bootstrap; ${commandPrefix} deps check; ${commandPrefix} commands; ${commandPrefix} codex-app check; ${commandPrefix} codex-app remote-control --status; npm run zellij:capability; ${commandPrefix} dollar-commands; ${commandPrefix} pipeline status; ${commandPrefix} pipeline plan.`,
    'dollar-commands:',
    ...DOLLAR_COMMANDS.map((c: any) => `- \`${c.command}\`: ${c.route}`),
    `Picker skills: ${DOLLAR_COMMAND_ALIASES.map((x: any) => x.app_skill).join(', ')}.`,
    'Routing: Answer direct, DFix ultralight no-record, execution routes infer scope/safety/behavior/acceptance answers from prompt, TriWiki/current-code defaults, and conservative policy before sealing contracts.',
    getdesignReferencePolicyText(),
    CODEX_IMAGEGEN_REQUIRED_POLICY,
    `Full routes write reflection.md, record lessons to ${REFLECTION_MEMORY_PATH}, refresh/pack TriWiki, validate, then final-answer with a user-visible completion summary plus Honest Mode.`,
    `Runtime root: ${commandPrefix} root shows whether SKS is using the nearest project root or the per-user global SKS runtime root; outside any project marker, runtime commands use the global root instead of writing .sneakoscope into the current random directory.`,
    `Context Tracking: TriWiki SSOT. Before each route phase read only the latest coordinate+voxel overlay pack at .sneakoscope/wiki/context-pack.json; coordinate-only legacy packs are invalid. Use attention.use_first for compact high-trust recall and hydrate attention.hydrate_first from source before risky/lower-trust decisions. During every stage hydrate low-trust claims from source/hash/RGBA anchors; after changes run ${commandPrefix} wiki refresh or pack; before handoff/final run ${commandPrefix} wiki validate .sneakoscope/wiki/context-pack.json.`,
    stackCurrentDocsPolicyText(commandPrefix),
    `Team review: ${OFFICIAL_SUBAGENT_REVIEW_POLICY_TEXT}`,
    `Official subagents: ${commandPrefix} naruto run "task" [--agents N] [--max-threads N] prepares bounded Codex agent threads and requires subagent-plan.json, lifecycle events, a trustworthy subagent-parent-summary.json, and correlated evidence. Legacy ${commandPrefix} team log|tail|watch|lane|status commands are read-only observation for existing Team missions and are not the default execution runtime.`,
    `Runtime: open Codex App once, then run ${commandPrefix} bootstrap and ${commandPrefix} deps check. Zellij remains optional for ${commandPrefix} --mad only. Official Naruto execution uses Codex agent threads. ${commandPrefix} bootstrap --yes, ${commandPrefix} deps check --yes, and ${commandPrefix} --mad --yes can install or repair Codex CLI/Zellij on macOS/Homebrew. npm postinstall reports missing CLI tools but does not mutate Homebrew/npm globals unless SKS_POSTINSTALL_AUTO_INSTALL_CLI_TOOLS=1 is set. Launch paths do not run sneakoscope npm update checks; use ${commandPrefix} update-check or ${commandPrefix} update now explicitly when you want that. ${commandPrefix} doctor --fix repairs the local SKS/Codex setup without running a global SKS package update. ${commandPrefix} codex-app remote-control wraps the supported Codex CLI headless remote-control entrypoint.`,
    'Team compatibility: existing Team observation is file-based and read-only; it does not use Zellij as an execution runtime.',
    `Guard: generated harness files are immutable outside the engine source repo; check ${commandPrefix} guard check; conflicts use ${commandPrefix} conflicts prompt with human approval.`
  ].join('\n') + '\n';
}

function escapeRegExp(value: any) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
