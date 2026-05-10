import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, readJson, readText, writeJsonAtomic, writeTextAtomic, mergeManagedBlock, nowIso, PACKAGE_VERSION, exists } from './fsx.mjs';
import { DEFAULT_RETENTION_POLICY } from './retention.mjs';
import { DEFAULT_DB_SAFETY_POLICY } from './db-safety.mjs';
import { isHarnessSourceProject, writeHarnessGuardPolicy } from './harness-guard.mjs';
import { repairSksGeneratedArtifacts } from './harness-conflicts.mjs';
import { installVersionGitHook } from './version-manager.mjs';
import { MIN_TEAM_REVIEWER_LANES, MIN_TEAM_REVIEW_POLICY_TEXT } from './team-review-policy.mjs';
import { AWESOME_DESIGN_MD_REFERENCE, CODEX_APP_IMAGE_GENERATION_DOC_URL, CODEX_COMPUTER_USE_ONLY_POLICY, CODEX_IMAGEGEN_REQUIRED_POLICY, DESIGN_SYSTEM_SSOT, DOLLAR_COMMANDS, DOLLAR_COMMAND_ALIASES, DOLLAR_SKILL_NAMES, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS, GETDESIGN_REFERENCE, PPT_CONDITIONAL_SKILL_ALLOWLIST, PPT_PIPELINE_MCP_ALLOWLIST, PPT_PIPELINE_SKILL_ALLOWLIST, RECOMMENDED_DESIGN_REFERENCES, RECOMMENDED_MCP_SERVERS, RECOMMENDED_SKILLS, chatCaptureIntakeText, context7ConfigToml, getdesignReferencePolicyText, imageUxReviewPipelinePolicyText, outcomeRubricPolicyText, pptPipelineAllowlistPolicyText, speedLanePolicyText, stackCurrentDocsPolicyText, triwikiContextTracking, triwikiContextTrackingText, triwikiStagePolicyText } from './routes.mjs';
import { SKILL_DREAM_POLICY, skillDreamPolicyText } from './skill-forge.mjs';

const REFLECTION_MEMORY_PATH = '.sneakoscope/memory/q2_facts/post-route-reflection.md';
const SKS_GENERATED_GIT_PATTERNS = ['.sneakoscope/', '.codex/', '.agents/', 'AGENTS.md'];
const SKS_SKILL_MANIFEST_FILE = '.sks-generated.json';
const GENERATED_PRUNE_POLICY = 'remove_previous_sks_generated_paths_absent_from_current_manifest';

function reflectionInstructionText(commandPrefix = 'sks') {
  return `Post-route reflection: full routes load \`reflection\` after work/tests and before final; DFix/Answer/Help/Wiki/SKS discovery are exempt. Write reflection.md; record only real misses/gaps, or no_issue_acknowledged. For lessons, append TriWiki claim rows to ${REFLECTION_MEMORY_PATH}. Run "${commandPrefix} wiki refresh" or pack, validate, then pass reflection-gate.json.`;
}

export function normalizeInstallScope(scope = 'global') {
  const value = String(scope || 'global').trim().toLowerCase();
  if (value === 'global' || value === 'project') return value;
  throw new Error(`Invalid install scope: ${scope}. Use "global" or "project".`);
}

export function sksCommandPrefix(scope = 'global', opts = {}) {
  return normalizeInstallScope(scope) === 'project'
    ? 'node ./node_modules/sneakoscope/bin/sks.mjs'
    : (opts.globalCommand || 'sks');
}

function sksHookCommand(commandPrefix, hookName) {
  return `${commandPrefix} hook ${hookName}`;
}

const MANAGED_HOOKS = {
  UserPromptSubmit: [{ hooks: [{ type: 'command', command: null, hookName: 'user-prompt-submit', statusMessage: 'SKS routing prompt and context' }] }],
  PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: null, hookName: 'pre-tool', statusMessage: 'SKS checking tool safety' }] }],
  PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: null, hookName: 'post-tool', statusMessage: 'SKS recording tool evidence' }] }],
  PermissionRequest: [{ matcher: '*', hooks: [{ type: 'command', command: null, hookName: 'permission-request', statusMessage: 'SKS reviewing permission request' }] }],
  Stop: [{ hooks: [{ type: 'command', command: null, hookName: 'stop', statusMessage: 'SKS checking done gate' }] }]
};

function buildManagedHooks(commandPrefix) {
  const hooks = {};
  for (const [eventName, entries] of Object.entries(MANAGED_HOOKS)) {
    hooks[eventName] = entries.map((entry) => ({
      ...('matcher' in entry ? { matcher: entry.matcher } : {}),
      hooks: entry.hooks.map(({ hookName, ...hook }) => ({
        ...hook,
        command: sksHookCommand(commandPrefix, hookName)
      }))
    }));
  }
  return { hooks };
}

export function mergeManagedHooksJson(existingContent, commandPrefix) {
  let root = {};
  try {
    root = existingContent?.trim() ? JSON.parse(existingContent) : {};
    if (!root || typeof root !== 'object' || Array.isArray(root)) root = {};
  } catch {
    root = {};
  }
  const managed = buildManagedHooks(commandPrefix);
  const currentHooks = root.hooks && typeof root.hooks === 'object' && !Array.isArray(root.hooks) ? root.hooks : {};
  const nextHooks = { ...currentHooks };
  for (const [eventName, managedEntries] of Object.entries(managed.hooks)) {
    const existingEntries = Array.isArray(currentHooks[eventName]) ? currentHooks[eventName] : [];
    const preserved = [];
    for (const entry of existingEntries) {
      const stripped = stripSksManagedHookEntry(entry);
      if (stripped) preserved.push(stripped);
    }
    nextHooks[eventName] = [...preserved, ...managedEntries];
  }
  return `${JSON.stringify({ ...root, hooks: nextHooks }, null, 2)}\n`;
}

function stripSksManagedHookEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !Array.isArray(entry.hooks)) return entry;
  const next = entry.hooks.filter((hook) => !isSksManagedHook(hook));
  if (next.length === entry.hooks.length) return entry;
  if (!next.length) return null;
  return { ...entry, hooks: next };
}

function isSksManagedHook(hook) {
  if (!hook || typeof hook !== 'object' || Array.isArray(hook)) return false;
  const command = String(hook.command || '');
  return hook.type === 'command' && /\bhook\s+(?:user-prompt-submit|pre-tool|post-tool|permission-request|stop)\b/.test(command) && /\b(?:sks|sneakoscope|sks\.mjs)\b/.test(command);
}

const AGENTS_BLOCK = "\n# Sneakoscope Codex Managed Rules\n\nThis repository uses Sneakoscope Codex.\n\n## Core Rules\n\n- Codex native `/goal` workflows are the persisted continuation surface; Ralph is removed from the user-facing SKS surface.\n- Keep runtime state bounded: raw logs go to files, prompts get tails/summaries, and `sks gc` may prune stale artifacts.\n- Before substantive work, SKS checks npm for a newer package. If newer, ask update-now vs skip-for-this-conversation.\n- Versioning is managed by the SKS pre-commit hook; check `sks versioning status`. Bypass only with `SKS_DISABLE_VERSIONING=1`.\n- Installed harness files are immutable to LLM edits: `.codex/*`, `.agents/skills/`, `.codex/agents/`, `.sneakoscope/*policy*.json`, `AGENTS.md`, and `node_modules/sneakoscope`. The Sneakoscope engine source repo is the only automatic exception.\n- OMX/DCodex conflicts block setup/doctor. Show `sks conflicts prompt`; cleanup requires explicit human approval.\n- Do not stop at a plan when implementation was requested. Finish, verify, or report the hard blocker.\n- Do not create unrequested fallback implementation code. If the requested path is impossible, block with evidence instead of inventing substitute behavior.\n\n## Routes\n\n- General execution/code-changing prompts default to `$Team`: analysis scouts, TriWiki refresh/validate, read-only debate, consensus, concrete runtime task graph/inboxes, fresh executor team, minimum five-lane Team review, integration, Honest Mode.\n- `$Computer-Use` / `$CU` is the maximum-speed Codex Computer Use lane for UI/browser/visual tasks: skip Team debate and upfront TriWiki loops, use Codex Computer Use directly, then refresh/validate TriWiki and run Honest Mode at final closeout.\n- `$Goal` is a fast bridge/overlay for Codex native `/goal` create/pause/resume/clear persistence controls; implementation continues through the selected SKS execution route.\n- TriWiki recall must stay bounded. Use `sks wiki sweep` to record demote, soft-forget, archive, delete, promote-to-skill, and promote-to-rule candidates instead of injecting every old claim.\n- Team missions must keep schema-backed evidence current: `work-order-ledger.json`, `effort-decision.json`, `team-dashboard-state.json`, and route-specific visual/dogfood artifacts where applicable. Team completion requires at least five independent reviewer/QA validation lanes before integration or final, even when a prompt requests fewer reviewers. Use `sks validate-artifacts latest` before claiming those artifacts pass.\n- `$DFix` is only for tiny design/content edits and bypasses the main pipeline, Team, TriWiki/TriFix/reflection recording, and persistent route state; it still uses a one-line DFix-specific Honest check before final. `$PPT` is the restrained, information-first HTML/PDF presentation route and must seal delivery context, audience profile, STP, decision context, and 3+ pain-point/solution/aha mappings before design/render work. It must avoid over-designed visuals, carry detail through hierarchy, spacing, alignment, thin rules, source clarity, and subtle accents, preserve editable source HTML under `source-html/`, record `ppt-parallel-report.json`, and clean PPT-only temporary build files before completion. `$Answer`, `$Help`, and `$Wiki` stay lightweight.\n- For code work, surface route/guard/write scopes first, split independent worker scopes when available, and keep parent-owned integration and verification.\n- Design work reads `design.md` as the only design decision SSOT. If missing, create it through `design-system-builder` from `docs/Design-Sys-Prompt.md`; getdesign.md, getdesign-reference, and curated DESIGN.md examples from https://github.com/VoltAgent/awesome-design-md are source inputs to fuse into that SSOT or route-local style tokens, not parallel design authorities. Image/logo/raster assets use `imagegen`, which must prefer official Codex App built-in image generation via `$imagegen` / `gpt-image-2` before API generation and must not be replaced by placeholder SVG/HTML/CSS, prose-only reviews, or fabricated files when generated raster evidence is required.\n- Research, AutoResearch, performance, token, accuracy, SEO/GEO, or workflow-improvement claims need experiment/eval evidence. Do not claim live model accuracy without a scored dataset.\n- Treat handwritten files above 3000 lines as split-review risks. Run `sks code-structure scan` and prefer extraction before adding substantial logic.\n- Skill dreaming stays lightweight: route use records JSON counters in `.sneakoscope/skills/dream-state.json`, and full skill inventory/recommendation runs only after the configured count/cooldown threshold. Reports are recommendation-only; deleting or merging skills needs explicit user approval.\n\n## Evidence And Context\n\n- Context7 is required for external libraries, APIs, MCPs, package managers, SDKs, and generated docs: resolve-library-id then query-docs.\n- When tech stack, framework, package, runtime, or deployment-platform versions change, use Context7 or official vendor web docs, record current syntax/security/limit guidance as high-priority TriWiki claims, then refresh and validate before coding.\n- TriWiki is the context-tracking SSOT for long-running missions, Team handoffs, and context-pressure recovery. Read `.sneakoscope/wiki/context-pack.json` before each stage, use `attention.use_first` for compact high-trust recall, hydrate `attention.hydrate_first` from source before risky or lower-trust decisions, refresh after findings or artifact changes, and validate before handoffs/final claims.\n- Source priority: current code/tests/config, decision contract, vgraph, beta, GX render/snapshot metadata, LLM Wiki coordinate index, then model knowledge only if allowed.\n- Final response before stop: summarize what was done, what changed for the user/repo, what was verified, and what remains unverified or blocked; then run Honest Mode. Say what passed and what was not verified.\n- `$From-Chat-IMG` uses forensic visual effort, not ordinary Team effort. Completion is blocked until source inventory, visual mapping, work-order coverage, scoped dogfood/QA, and post-fix verification artifacts are present and valid.\n\n## Safety\n\n- Database access is high risk. Use read-only inspection by default; live data mutation is out of scope unless a sealed contract allows local or branch-only migration files.\n- MAD and MAD-SKS widen only explicit scoped permissions; they still do not authorize unrequested fallback implementation code.\n- Task completion requires relevant tests or justification, zero unsupported critical claims, accepted visual/wiki drift, and final evidence.\n\n## Codex App\n\nUse `.codex/SNEAKOSCOPE.md`, generated `.agents/skills`, `.codex/hooks.json`, and SKS dollar commands (`$sks`, `$team`, `$computer-use`, `$cu`, `$ppt`, `$goal`, `$dfix`, `$qa-loop`, etc.) as the app control surface.\n";

function agentsBlockText() {
  return AGENTS_BLOCK
    .replace('`$Answer`, `$Help`, and `$Wiki` stay lightweight.', '`$Image-UX-Review` / `$UX-Review` is the imagegen/gpt-image-2 UI/UX review route: source screenshots must become generated annotated review images, those generated images must be extracted into issue ledgers, and text-only critique cannot pass the route gate. `$Answer`, `$Help`, and `$Wiki` stay lightweight.')
    .replace('`$ppt`, `$goal`, `$dfix`, `$qa-loop`', '`$ppt`, `$image-ux-review`, `$ux-review`, `$goal`, `$dfix`, `$qa-loop`');
}

export async function initProject(root, opts = {}) {
  const created = [];
  const installScope = normalizeInstallScope(opts.installScope || 'global');
  const localOnly = Boolean(opts.localOnly);
  const sourceProject = await isHarnessSourceProject(root).catch(() => false);
  const requestedHookCommandPrefix = opts.hookCommandPrefix || sksCommandPrefix(installScope, { globalCommand: opts.globalCommand });
  const hookCommandPrefix = sourceProject ? 'node ./bin/sks.mjs' : requestedHookCommandPrefix;
  const sine = path.join(root, '.sneakoscope');
  const manifestPath = path.join(sine, 'manifest.json');
  const previousManifest = await readJson(manifestPath, null);
  if (opts.repair) {
    const repair = await repairSksGeneratedArtifacts(root, { resetState: Boolean(opts.resetState) });
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

  const manifest = {
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
      project_command: 'node ./node_modules/sneakoscope/bin/sks.mjs'
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
      dollar_commands: DOLLAR_COMMANDS.map((c) => c.command),
      dollar_skill_names: DOLLAR_SKILL_NAMES,
      fast_design_command: '$DFix',
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
        enabled: true,
        hook: 'pre-commit',
        bump: 'patch',
        lock: 'git-common-dir/sks-version.lock',
        state: 'git-common-dir/sks-version-state.json'
      }
    },
    database_safety: 'default_safe; $MAD-SKS live-full-access profile is centralized in src/core/permission-gates.mjs and keeps only catastrophic DB safeguards',
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
          enabled: true,
          hook: 'pre-commit',
          bump: policy.git?.versioning?.bump || 'patch',
          lock: 'git-common-dir/sks-version.lock',
          state: 'git-common-dir/sks-version-state.json'
        }
      },
      versioning: {
        ...(policy.versioning || {}),
        enabled: true,
        bump: policy.versioning?.bump || 'patch',
        trigger: 'git-pre-commit',
        lock_scope: 'git-common-dir',
        managed_files: ['package.json', 'package-lock.json', 'npm-shrinkwrap.json']
      },
      prompt_pipeline: {
        ...(policy.prompt_pipeline || {}),
        default_enabled: true,
        route_without_command: true,
        dollar_commands: DOLLAR_COMMANDS.map((c) => c.command),
        dollar_skill_names: DOLLAR_SKILL_NAMES,
        fast_design_command: '$DFix',
        ppt_skill_allowlist: PPT_PIPELINE_SKILL_ALLOWLIST,
        ppt_conditional_skill_allowlist: PPT_CONDITIONAL_SKILL_ALLOWLIST,
        ppt_mcp_allowlist: PPT_PIPELINE_MCP_ALLOWLIST
      },
      context7: {
        ...(policy.context7 || {}),
        required_for_external_docs: true,
        default_transport: 'local',
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

  function defaultPolicy(scope, commandPrefix) {
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
          enabled: true,
          hook: 'pre-commit',
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
        enabled: true,
        bump: 'patch',
        trigger: 'git-pre-commit',
        lock_scope: 'git-common-dir',
        managed_files: ['package.json', 'package-lock.json', 'npm-shrinkwrap.json'],
        collision_policy: 'lock_then_bump_above_last_seen_version'
      },
      honest_mode: {
        required_before_final: true,
        verify_goal_evidence_tests_gaps: true
      },
      database_safety: {
        ...DEFAULT_DB_SAFETY_POLICY,
        mad_sks_live_full_access: true,
        mad_sks_gate_module: 'src/core/permission-gates.mjs'
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
        dollar_commands: DOLLAR_COMMANDS.map((c) => c.command),
        dollar_skill_names: DOLLAR_SKILL_NAMES,
        fast_design_command: '$DFix',
        ppt_skill_allowlist: PPT_PIPELINE_SKILL_ALLOWLIST,
        ppt_conditional_skill_allowlist: PPT_CONDITIONAL_SKILL_ALLOWLIST,
        ppt_mcp_allowlist: PPT_PIPELINE_MCP_ALLOWLIST
      },
      context7: {
        required_for_external_docs: true,
        default_transport: 'local',
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
        cleanup_model: 'gpt-5.5',
        cleanup_reasoning_effort: 'high',
        human_approval_required: true
      },
      recommended_skills: RECOMMENDED_SKILLS,
      recommended_mcp_servers: RECOMMENDED_MCP_SERVERS,
      design_system_ssot: DESIGN_SYSTEM_SSOT,
      recommended_design_references: RECOMMENDED_DESIGN_REFERENCES
    };
  }

function installPolicy(scope, commandPrefix) {
  return {
    scope,
    default_scope: 'global',
    hook_command_prefix: commandPrefix,
    global_install: 'npm i -g sneakoscope',
    project_install: 'npm i -D sneakoscope && npx sks setup --install-scope project'
  };
}

function mergeManagedCodexConfigToml(existingContent = '') {
  let next = removeLegacyTopLevelCodexModeLocks(String(existingContent || '').trimEnd());
  next = removeTomlTableKey(next, 'notice', 'fast_default_opt_out');
  next = upsertTopLevelTomlString(next, 'service_tier', 'fast');
  next = upsertTomlTableKey(next, 'features', 'codex_hooks = true');
  next = upsertTomlTableKey(next, 'features', 'multi_agent = true');
  next = upsertTomlTableKey(next, 'features', 'fast_mode = true');
  next = upsertTomlTableKey(next, 'features', 'fast_mode_ui = true');
  next = upsertTomlTableKey(next, 'user.fast_mode', 'visible = true');
  next = upsertTomlTableKey(next, 'user.fast_mode', 'enabled = true');
  next = upsertTomlTableKey(next, 'user.fast_mode', 'default_profile = "sks-fast-high"');
  next = upsertTomlTableKey(next, 'agents', 'max_threads = 6');
  next = upsertTomlTableKey(next, 'agents', 'max_depth = 1');
  for (const block of managedCodexConfigBlocks()) {
    next = upsertTomlTable(next, block.table, block.text);
  }
  return `${next.trim()}\n`;
}

function removeLegacyTopLevelCodexModeLocks(text = '') {
  const legacy = {
    model: new Set(['gpt-5.5']),
    model_reasoning_effort: new Set(['high'])
  };
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  return lines.filter((line, index) => {
    if (index >= end) return true;
    const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*"([^"]*)"\s*(?:#.*)?$/);
    if (!match) return true;
    return !legacy[match[1]]?.has(match[2]);
  }).join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function upsertTopLevelTomlString(text, key, value) {
  const line = `${key} = "${value}"`;
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  for (let i = 0; i < end; i += 1) {
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(lines[i])) {
      lines[i] = line;
      return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }
  }
  lines.splice(end, 0, line);
  return lines.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function removeTomlTableKey(text, table, key) {
  const lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') return '';
  const header = `[${table}]`;
  const start = lines.findIndex((x) => x.trim() === header);
  if (start === -1) return String(text || '');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const keyPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  return lines.filter((line, index) => index <= start || index >= end || !keyPattern.test(line)).join('\n').replace(/\n{3,}/g, '\n\n');
}

function managedCodexConfigBlocks() {
  return [
    { table: 'mcp_servers.context7', text: context7ConfigToml().trim() },
    { table: 'agents.analysis_scout', text: agentConfigBlock('analysis_scout', 'Read-only SKS scout.', './agents/analysis-scout.toml', ['Scout', 'Mapper']) },
    { table: 'agents.team_consensus', text: agentConfigBlock('team_consensus', 'SKS planning/debate agent.', './agents/team-consensus.toml', ['Consensus', 'Atlas']) },
    { table: 'agents.implementation_worker', text: agentConfigBlock('implementation_worker', 'SKS bounded implementation worker.', './agents/implementation-worker.toml', ['Builder', 'Mason']) },
    { table: 'agents.db_safety_reviewer', text: agentConfigBlock('db_safety_reviewer', 'Read-only DB safety reviewer.', './agents/db-safety-reviewer.toml', ['Sentinel', 'Ledger']) },
    { table: 'agents.qa_reviewer', text: agentConfigBlock('qa_reviewer', 'Read-only QA reviewer.', './agents/qa-reviewer.toml', ['Verifier', 'Scout']) },
    { table: 'profiles.sks-task-low', text: profileConfigBlock('sks-task-low', 'low') },
    { table: 'profiles.sks-task-medium', text: profileConfigBlock('sks-task-medium', 'medium') },
    { table: 'profiles.sks-logic-high', text: profileConfigBlock('sks-logic-high', 'high') },
    { table: 'profiles.sks-fast-high', text: profileConfigBlock('sks-fast-high', 'high', { serviceTier: 'fast' }) },
    { table: 'profiles.sks-research-xhigh', text: profileConfigBlock('sks-research-xhigh', 'xhigh') },
    { table: 'profiles.sks-research', text: profileConfigBlock('sks-research', 'xhigh', { approval: 'never' }) },
    { table: 'profiles.sks-team', text: profileConfigBlock('sks-team', 'high') },
    { table: 'profiles.sks-mad-high', text: profileConfigBlock('sks-mad-high', 'high', { approval: 'never', sandbox: 'danger-full-access', approvalsReviewer: 'auto_review' }) },
    {
      table: 'auto_review',
      text: '[auto_review]\npolicy = "In MAD launches, allow live-server work, normal DB writes, Supabase MCP DB writes, direct execute SQL, schema cleanup, and migration application for the active invocation. Deny only catastrophic database wipes, all-row value deletion/update, dangerous project or branch management, credential exfiltration, persistent security weakening, broad unrelated file deletion, and unrequested fallback implementation code."'
    },
    { table: 'profiles.sks-default', text: profileConfigBlock('sks-default', 'high') }
  ];
}

function agentConfigBlock(table, description, configFile, nicknames = []) {
  return [
    `[agents.${table}]`,
    `description = "${description}"`,
    `config_file = "${configFile}"`,
    `nickname_candidates = [${nicknames.map((name) => `"${name}"`).join(', ')}]`
  ].join('\n');
}

function profileConfigBlock(profile, effort, opts = {}) {
  return [
    `[profiles.${profile}]`,
    'model = "gpt-5.5"',
    ...(opts.serviceTier ? [`service_tier = "${opts.serviceTier}"`] : []),
    `approval_policy = "${opts.approval || 'on-request'}"`,
    ...(opts.approvalsReviewer ? [`approvals_reviewer = "${opts.approvalsReviewer}"`] : []),
    `sandbox_mode = "${opts.sandbox || 'workspace-write'}"`,
    `model_reasoning_effort = "${effort}"`
  ].join('\n');
}

function upsertTomlTableKey(text, table, line) {
  const key = String(line).split('=')[0].trim();
  let lines = String(text || '').split('\n');
  if (lines.length === 1 && lines[0] === '') lines = [];
  const header = `[${table}]`;
  let start = lines.findIndex((x) => x.trim() === header);
  if (start === -1) {
    const prefix = lines.length && lines[lines.length - 1].trim() ? ['', header, line] : [header, line];
    return [...lines, ...prefix].join('\n').replace(/\n{3,}/g, '\n\n');
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[.+\]\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  for (let i = start + 1; i < end; i++) {
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(lines[i])) {
      lines[i] = line;
      return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }
  }
  lines.splice(start + 1, 0, line);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function upsertTomlTable(text, table, block) {
  let lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') lines = [];
  const header = `[${table}]`;
  const start = lines.findIndex((x) => x.trim() === header);
  const blockLines = String(block || '').trim().split('\n');
  if (start === -1) {
    return [...lines, ...(lines.length ? [''] : []), ...blockLines].join('\n').replace(/\n{3,}/g, '\n\n');
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[.+\]\s*$/.test(lines[i])) {
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
  const existingCodexConfig = await readText(generatedCodexConfigPath, '');
  await writeTextAtomic(generatedCodexConfigPath, mergeManagedCodexConfigToml(existingCodexConfig));
  created.push('.codex/config.toml');

  await writeTextAtomic(path.join(root, '.codex', 'SNEAKOSCOPE.md'), codexAppQuickReference(installScope, hookCommandPrefix));
  created.push('.codex/SNEAKOSCOPE.md');

  const hooksPath = path.join(root, '.codex', 'hooks.json');
  await writeTextAtomic(hooksPath, mergeManagedHooksJson(await readText(hooksPath, ''), hookCommandPrefix));
  created.push(`.codex/hooks.json (${installScope})`);

  const skillInstall = await installSkills(root);
  created.push('.agents/skills/*');
  if (skillInstall.removed_stale_generated_skills.length) created.push(`stale generated skills removed (${skillInstall.removed_stale_generated_skills.length})`);
  if (skillInstall.removed_agent_skill_aliases.length) created.push(`deprecated generated skill aliases removed (${skillInstall.removed_agent_skill_aliases.length})`);
  if (skillInstall.removed_codex_skill_mirrors.length) created.push(`.codex/skills generated mirrors removed (${skillInstall.removed_codex_skill_mirrors.length})`);
  const agentInstall = await installCodexAgents(root);
  created.push('.codex/agents/*');
  const generatedFiles = currentGeneratedFileInventory(skillInstall, agentInstall);
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
  await writeJsonAtomic(manifestPath, manifest);
  await writeHarnessGuardPolicy(root);
  created.push('.sneakoscope/harness-guard.json');
  const versionHookCommand = sourceProject ? 'node ./bin/sks.mjs' : hookCommandPrefix;
  const versionHook = await installVersionGitHook(root, versionHookCommand);
  if (versionHook.installed) created.push('.git/hooks/pre-commit SKS version guard');
  else created.push(`version guard skipped (${versionHook.reason})`);
  return { created, generated_cleanup: generatedCleanup, skill_install: skillInstall };
}

async function ensureSharedGitIgnore(root) {
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
  const existing = new Set(current.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const missing = patterns.filter((pattern) => !existing.has(pattern));
  if (!missing.length) return { path: ignorePath, patterns, changed: false };
  const block = missing.length === patterns.length
    ? managedBlock
    : `${markerStart}\n${missing.join('\n')}\n${markerEnd}\n`;
  await writeTextAtomic(ignorePath, `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}`);
  return { path: ignorePath, patterns, changed: true };
}

async function shouldWriteSharedGitIgnore(root, installScope) {
  if (normalizeInstallScope(installScope) === 'project') return true;
  if (await exists(path.join(root, '.git'))) return true;
  if (await exists(path.join(root, '.gitignore'))) return true;
  return false;
}

async function ensureLocalOnlyGitExclude(root) {
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

async function resolveGitDir(root) {
  const dotGit = path.join(root, '.git');
  if (!(await exists(dotGit))) return null;
  const text = await readText(dotGit, null);
  if (typeof text === 'string') {
    const match = text.match(/^gitdir:\s*(.+)\s*$/m);
    if (match) return path.resolve(root, match[1]);
  }
  return dotGit;
}

function codexAppQuickReference(scope, commandPrefix) {
  return [
    '# ㅅㅋㅅ',
    `Install scope: \`${scope}\``,
    `Command: \`${commandPrefix} <command>\``,
    'Files: AGENTS.md, .codex/hooks.json, .codex/config.toml, .codex/SNEAKOSCOPE.md, .agents/skills, .codex/agents, .sneakoscope/missions.',
    `Discover: ${commandPrefix} bootstrap; ${commandPrefix} deps check; ${commandPrefix} commands; ${commandPrefix} codex-app check; ${commandPrefix} codex-app remote-control --status; ${commandPrefix} tmux check; ${commandPrefix} dollar-commands; ${commandPrefix} pipeline status; ${commandPrefix} pipeline plan.`,
    'dollar-commands:',
    ...DOLLAR_COMMANDS.map((c) => `- \`${c.command}\`: ${c.route}`),
    `Picker skills: ${DOLLAR_COMMAND_ALIASES.map((x) => x.app_skill).join(', ')}.`,
    'Routing: Answer direct, DFix ultralight no-record, execution routes ask only scope/safety/behavior/acceptance-changing questions before sealing answers.',
    getdesignReferencePolicyText(),
    CODEX_IMAGEGEN_REQUIRED_POLICY,
    `Full routes write reflection.md, record lessons to ${REFLECTION_MEMORY_PATH}, refresh/pack TriWiki, validate, then final-answer with a user-visible completion summary plus Honest Mode.`,
    `Runtime root: ${commandPrefix} root shows whether SKS is using the nearest project root or the per-user global SKS runtime root; outside any project marker, runtime commands use the global root instead of writing .sneakoscope into the current random directory.`,
    `Context Tracking: TriWiki SSOT. Before each route phase read only the latest coordinate+voxel overlay pack at .sneakoscope/wiki/context-pack.json; coordinate-only legacy packs are invalid. Use attention.use_first for compact high-trust recall and hydrate attention.hydrate_first from source before risky/lower-trust decisions. During every stage hydrate low-trust claims from source/hash/RGBA anchors; after changes run ${commandPrefix} wiki refresh or pack; before handoff/final run ${commandPrefix} wiki validate .sneakoscope/wiki/context-pack.json.`,
    stackCurrentDocsPolicyText(commandPrefix),
    `Team review: ${MIN_TEAM_REVIEW_POLICY_TEXT}`,
    `Team tmux view: ${commandPrefix} team "task" prepares live watch/lane commands without opening a Team tmux view by default; add --open-tmux when you explicitly want a named Team tmux session with an overview watch pane plus color-coded split per-agent lanes; ${commandPrefix} team lane latest --agent analysis_scout_1 --follow shows one agent's status, assigned runtime tasks, recent agent events, direct messages, and fallback global tail; ${commandPrefix} team message latest --from analysis_scout_1 --to executor_1 --message "handoff note" mirrors bounded agent communication into transcript/lane panes; ${commandPrefix} team cleanup-tmux latest marks the SKS session record complete and asks follow panes to show a cleanup summary then stop.`,
    `Runtime: open Codex App once, then run ${commandPrefix} bootstrap and ${commandPrefix} deps check. Bare ${commandPrefix} opens or reuses the default tmux/Codex CLI session; before launch it checks npm @openai/codex@latest and prompts Y/n when the installed Codex CLI is missing or outdated. ${commandPrefix} codex-app remote-control wraps the Codex CLI 0.130.0+ headless remote-control entrypoint. ${commandPrefix} tmux open is the explicit form for session/workspace flags.`,
    `Guard: generated harness files are immutable outside the engine source repo; check ${commandPrefix} guard check; conflicts use ${commandPrefix} conflicts prompt with human approval.`
  ].join('\n') + '\n';
}

export async function installSkills(root) {
  const imageUxReviewSkill = (name) => `---\nname: ${name}\ndescription: $Image-UX-Review/$UX-Review imagegen/gpt-image-2 annotated UI/UX review loop.\n---\n\nUse only for $Image-UX-Review, $UX-Review, $visual-review, or $ui-ux-review UI/UX review requests. ${imageUxReviewPipelinePolicyText()} ${CODEX_IMAGEGEN_REQUIRED_POLICY} Core loop: capture or attach source UI screenshots, then invoke Codex App $imagegen with gpt-image-2 to create a new generated annotated review image from each source screenshot, then analyze the generated review image with vision/OCR into image-ux-issue-ledger.json, then apply only requested safe fixes and recheck changed screens. Text-only screenshot critique cannot satisfy this route; missing generated annotated review images must keep image-ux-review-gate.json blocked. Use Codex Computer Use for live UI/browser capture when available; browser automation screenshots are not a substitute for Codex Computer Use evidence. Required artifacts: image-ux-review-policy.json, image-ux-screen-inventory.json, image-ux-generated-review-ledger.json, image-ux-issue-ledger.json, image-ux-iteration-report.json, image-ux-review-gate.json. Finish with reflection and Honest Mode.\n`;
  const skills = {
    'dfix': `---\nname: dfix\ndescription: Ultralight fast design/content fix mode for $DFix or $dfix requests and inferred simple edits such as text color, copy, labels, spacing, or translation.\n---\n\nUse for tiny copy/color/label/spacing/translation edits. List exact micro-edits, inspect only needed files, apply only those edits, and run cheap verification. Bypass broad SKS routing, mission state, TriWiki/TriFix/reflection/state recording, Goal, Research, eval, redesign, and repeated full-route Honest Mode loops. Start the final answer with \`DFix 완료 요약:\` and include one \`DFix 솔직모드:\` line covering verified, not verified, and remaining issues. Read \`design.md\` for UI work when present; use imagegen for image/logo/raster assets. ${CODEX_IMAGEGEN_REQUIRED_POLICY}\n`,
    'answer': `---\nname: answer\ndescription: Answer-only research route for ordinary questions that should not start implementation.\n---\n\nUse for explanations, comparisons, status, facts, source-backed research, or docs guidance. Use repo/TriWiki first for project-local facts; hydrate low-trust claims from source. Browse or use Context7 for current external package/API/framework/MCP docs. End with a concise answer summary plus Honest Mode; do not create missions, subagents, or file edits.\n`,
    'sks': `---\nname: sks\ndescription: General Sneakoscope Codex command route for $SKS or $sks usage, setup, status, and workflow help.\n---\n\nUse local SKS commands: bootstrap, deps, commands, quickstart, codex-app, context7, guard, conflicts, reasoning, wiki, pipeline status, pipeline plan, skill-dream. Promote code-changing work to Team unless Answer/DFix/Help/Wiki/safety route fits. Surface route/guard/scope, use TriWiki, do not edit installed harness files outside this engine repo, and require human-approved conflict cleanup. ${skillDreamPolicyText()}\n`,
    'wiki': `---\nname: wiki\ndescription: Dollar-command route for $Wiki TriWiki refresh, pack, validate, and prune commands.\n---\n\nUse for $Wiki or Korean wiki-refresh requests. Refresh/update/갱신: run sks wiki refresh, then validate .sneakoscope/wiki/context-pack.json. Pack: run sks wiki pack, then validate. Prune/clean/정리: use sks wiki refresh --prune, or sks wiki prune --dry-run for inspection. Report claims, anchors, trust, attention.use_first/hydrate_first, validation, and blockers. Do not start ambiguity-gated implementation, subagents, or unrelated work.\n`,
    'team': `---\nname: team\ndescription: SKS Team orchestration for $Team/code work; $From-Chat-IMG is the explicit chat-image alias.\n---\n\nUse for $Team/code work. Ambiguity gate first, but score goal, constraints, success criteria, and codebase context before asking; ask only the lowest-clarity scope/safety/behavior/acceptance question(s), otherwise auto-seal inferred answers. Read pipeline-plan.json or run sks pipeline plan to see the runtime lane, kept/skipped stages, and verification before implementation. Write team-roster.json; team-gate.json needs team_roster_confirmed=true. executor:N means N scouts, N debate voices, then fresh N executors. ${MIN_TEAM_REVIEW_POLICY_TEXT} After consensus, compile team-graph.json, team-runtime-tasks.json, team-decomposition-report.json, and team-inbox/ so worker handoff uses concrete runtime task ids with role/path/domain/lane hints. Refresh/validate TriWiki before debate, implementation, review, and final; consume attention.use_first and hydrate attention.hydrate_first before risky decisions. ${outcomeRubricPolicyText()} ${speedLanePolicyText()} ${skillDreamPolicyText()} Log events and use sks team message for bounded inter-agent communication in transcript/lane panes. Color-coded tmux lanes distinguish overview/scout/planning/execution/review/safety sessions in one tmux window using split panes when tmux is available. $Team/$team plus sks --mad uses the MAD-SKS permission gate module: live server work, normal DB writes, Supabase MCP writes, direct SQL, schema cleanup, and needed migrations are open for the active invocation; only catastrophic DB wipe/all-row/project-management guards remain. End with cleanup-tmux or a cleanup event so follow panes show cleanup and stop; pass team-session-cleanup.json, then reflection and Honest Mode. Parent integrates/verifies.\n\n${chatCaptureIntakeText()}\n`,
    'from-chat-img': `---\nname: from-chat-img\ndescription: Explicit $From-Chat-IMG Team alias for chat screenshot plus attachment analysis.\n---\n\nUse only for From-Chat-IMG/$From-Chat-IMG. It enters the normal Team pipeline. Treat uploads as chat screenshot plus originals. Use Codex Computer Use visual inspection when available, list requirements first, match regions to attachments with confidence, write ${FROM_CHAT_IMG_COVERAGE_ARTIFACT}, ${FROM_CHAT_IMG_CHECKLIST_ARTIFACT}, ${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT}, and ${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}, then continue Team gates, review, reflection, and Honest Mode. ${CODEX_COMPUTER_USE_ONLY_POLICY} The ledger must account for every visible customer request, screenshot image region, and separate attachment; ${FROM_CHAT_IMG_CHECKLIST_ARTIFACT} must have a checked item for each request, image-region/attachment match, work item, scoped QA-LOOP, and verification step; ${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT} stores temporary TriWiki-backed session context with expires_after_sessions=${FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS}. ${FROM_CHAT_IMG_QA_LOOP_ARTIFACT} must prove QA-LOOP ran over the exact customer-request work-order range after implementation, with every work item covered, post-fix verification complete, and zero unresolved findings. team-gate.json cannot pass From-Chat-IMG completion until unresolved_items is empty, every checklist box is checked, and scoped_qa_loop_completed=true.\n`,
    'qa-loop': `---\nname: qa-loop\ndescription: $QA-LOOP dogfoods UI/API as human proxy with safety gates, Codex Computer Use-only UI evidence, safe fixes, rechecks, and a QA report.\n---\n\nUse only $QA-LOOP. Ask scope, target, mutation, login. Credentials are runtime-only; never save secrets. UI-level E2E needs Codex Computer Use evidence or must be marked unverified; Chrome MCP, Browser Use, Playwright, Selenium, Puppeteer, and other browser automation do not satisfy UI/browser verification. Deployed targets are read-only; destructive removal is forbidden. After answer/run, dogfood real flows, apply safe contract-allowed code/test/docs fixes, recheck, and do not pass qa-gate.json with unresolved findings or without post_fix_verification_complete. Finish qa-ledger, date/version report, gate, completion summary, and Honest Mode.\n`,
    'ppt': `---\nname: ppt\ndescription: $PPT information-first HTML/PDF presentation pipeline with STP, audience, pain-point, format, research, design-system, and verification questions.\n---\n\nUse only when the user invokes $PPT or asks to create a presentation, deck, slides, pitch deck, proposal deck, HTML presentation, or PDF presentation artifact. Before artifact work, seal presentation-specific ambiguity answers: delivery context, target audience profile including role/average age/job/industry/topic familiarity/decision power, STP strategy, decision context and objections, and 3+ pain-point to solution mappings with expected aha moments. Presentation design must be simple, restrained, and information-first: avoid over-designed decoration, ornamental gradients, nested cards, and effects that compete with the message. Design detail should be embedded through typography hierarchy, spacing, alignment, thin rules, source clarity, and subtle accents. ${pptPipelineAllowlistPolicyText()} Use design.md as the only design decision SSOT. If design.md is missing, use docs/Design-Sys-Prompt.md plus getdesign-reference and curated DESIGN.md examples from ${AWESOME_DESIGN_MD_REFERENCE.url} only as source inputs, then fuse them into route-local PPT style tokens with a recorded design_ssot instead of treating references as parallel authorities. If generated image assets or slide visual critique are needed, use imagegen/gpt-image-2 only when that asset/review need is explicitly sealed in the $PPT contract; prefer Codex App built-in image generation (${CODEX_APP_IMAGE_GENERATION_DOC_URL}) and use the OpenAI Image API with OPENAI_API_KEY when CLI-side required image assets can be generated. ${CODEX_IMAGEGEN_REQUIRED_POLICY} Use web or Context7 evidence only when external facts/libraries/current docs are required by the PPT contract, record verified claims in ppt-fact-ledger.json, record generated image asset plans/results/blockers in ppt-image-asset-ledger.json, then create the PDF plus editable source HTML under source-html/, keep independent strategy/render/file-write phases parallel where inputs allow, record ppt-parallel-report.json, run the bounded ppt-review-policy/ppt-review-ledger/ppt-iteration-report loop, and verify readability, overlap, format fit, source coverage, export state, unsupported-claim status, image-asset completion, review-loop termination, and temporary build files cleanup. Finish with reflection and Honest Mode; do not skip STP/audience questions for presentation artifacts.\n`,
    'computer-use': `---\nname: computer-use\ndescription: Maximum-speed $Computer-Use/$CU lane for Codex Computer Use UI/browser/visual tasks.\n---\n\nUse only when the user invokes $Computer-Use/$CU or asks for a Computer Use-specific fast lane. Skip Team debate, QA-LOOP clarification, upfront TriWiki refresh, Context7, subagents, and reflection unless explicitly requested. Infer the smallest target, use Codex Computer Use directly, and never substitute Playwright, Chrome MCP, Browser Use, Selenium, Puppeteer, or other browser automation for UI/browser evidence. If Computer Use is unavailable, mark UI/browser evidence unverified and stop with the blocker. At the end only, refresh or pack TriWiki, validate it, then provide a concise completion summary plus Honest Mode.\n`,
    'computer-use-fast': `---\nname: computer-use-fast\ndescription: Alias for the maximum-speed $Computer-Use/$CU Codex Computer Use lane.\n---\n\nUse the same rules as computer-use: skip Team debate, QA-LOOP clarification, upfront TriWiki refresh, Context7, subagents, and reflection unless explicitly requested. Use Codex Computer Use directly; never substitute Playwright, Chrome MCP, Browser Use, Selenium, Puppeteer, or other browser automation for UI/browser evidence. At the end only, refresh/pack TriWiki, validate it, then provide a concise completion summary plus Honest Mode.\n`,
    'cu': `---\nname: cu\ndescription: Short alias for the maximum-speed $Computer-Use Codex Computer Use lane.\n---\n\nUse the same rules as computer-use. This is a speed lane for focused UI/browser/visual tasks that require Codex Computer Use evidence, with TriWiki refresh/validate and Honest Mode deferred to final closeout.\n`,
    'goal': `---\nname: goal\ndescription: Fast $Goal/$goal bridge overlay for Codex native persisted /goal workflows.\n---\n\nUse when the user invokes $Goal/$goal or asks to persist a workflow with Codex native /goal continuation. Prepare with sks goal create or the $Goal route, write only the lightweight bridge artifacts, then use native Codex /goal create, pause, resume, and clear controls where available. Goal does not replace Team, QA, DB, or other SKS execution routes; continue implementation through the selected route and use Context7 only when external API/library docs are involved. Do not recreate the old no-question loop.\n`,
    'research': `---\nname: research\ndescription: Dollar-command route for $Research or $research frontier discovery workflows.\n---\n\nUse when the user invokes $Research/$research or asks for research, hypotheses, new mechanisms, falsification, or testable predictions. Prefer sks research prepare and sks research run. Keep the loop short: frame outcome, compare a few mechanisms, falsify, keep the smallest useful probe, and avoid adding background process unless it reduces net route weight. Do not use for ordinary code edits.\n`,
    'autoresearch': `---\nname: autoresearch\ndescription: Dollar-command route for $AutoResearch or $autoresearch iterative experiment loops.\n---\n\nUse for $AutoResearch, iterative improvement, SEO/GEO, ranking, workflow, benchmark, or experiments. Define program, hypothesis, experiment, metric, keep/discard, falsification, next step, and Honest Mode. Load seo-geo-optimizer for README/npm/GitHub/schema/AI-search work.\n`,
    'db': `---\nname: db\ndescription: Dollar-command route for $DB or $db database and Supabase safety checks.\n---\n\nUse when the user invokes $DB/$db or the task touches SQL, Supabase, Postgres, migrations, Prisma, Drizzle, Knex, MCP database tools, or production data. Run or follow sks db policy, sks db scan, sks db classify, and sks db check. Destructive database operations remain forbidden.\n`,
    'mad-sks': `---\nname: mad-sks\ndescription: Explicit high-risk authorization modifier for $MAD-SKS scoped Supabase MCP DB permission widening.\n---\n\nUse only when the user explicitly invokes $MAD-SKS or top-level sks --mad. It can be combined with another route, such as $MAD-SKS $Team or $DB ... $MAD-SKS; in that case the other command remains the primary workflow and MAD-SKS is only the temporary permission grant. The widened permission applies only while the active mission gate is open, must be deactivated when the task ends, and opens live server work, Supabase MCP database writes, column/schema cleanup, direct execute SQL, migration application when required, and normal targeted DB writes. Keep only catastrophic safeguards: whole database/schema/table removal, truncate, all-row delete/update, reset, dangerous project/branch management, credential exfiltration, persistent security weakening, and unrequested fallback implementation remain blocked. Do not carry MAD-SKS permission into later prompts or routes. The permission profile is centralized in src/core/permission-gates.mjs so skill/hook/MCP-style gates share one decision function.\n`,
    'gx': `---\nname: gx\ndescription: Dollar-command route for $GX or $gx deterministic GX visual context cartridges.\n---\n\nUse when the user invokes $GX/$gx or asks for architecture/context visualization through SKS. Prefer sks gx init, render, validate, drift, and snapshot. vgraph.json remains the source of truth.\n`,
    'help': `---\nname: help\ndescription: Dollar-command route for $Help or $help explaining installed SKS commands and workflows.\n---\n\nUse when the user invokes $Help/$help or asks what commands exist. Prefer concise output from sks commands, sks usage <topic>, sks quickstart, sks aliases, and sks codex-app.\n`,
    'prompt-pipeline': `---\nname: prompt-pipeline\ndescription: Default SKS prompt optimization pipeline for execution prompts; Answer and DFix bypass it.\n---\n\nClassify intent: Answer only for real questions; question-shaped implicit instructions, complaints, and mandatory-policy statements route to Team. DFix handles tiny design/content; code defaults to Team unless safety/research/GX route fits. Infer goal, target, constraints, acceptance, risk, and smallest safe route. Score ambiguity first using goal, constraints, success criteria, and codebase context; ask only the lowest-clarity scope/safety/behavior/acceptance-changing questions within a small question budget, otherwise seal inferred answers. Materialize pipeline-plan.json for the runtime lane, kept/skipped stages, no-fallback invariant, and verification; inspect with sks pipeline plan, adding --proof-field when changed files are known. Code work surfaces route/guard/scopes, materializes team-roster.json from default or explicit counts before implementation, compiles concrete Team runtime graph/inbox artifacts after consensus, and parent owns integration/tests/Context7/Honest Mode. ${outcomeRubricPolicyText()} ${speedLanePolicyText()} ${skillDreamPolicyText()}\n\n${chatCaptureIntakeText()}\n\nDesign: non-PPT UI/UX reads design.md; if missing use design-system-builder; use imagegen for image/logo/raster, and imagegen must prefer Codex App built-in image generation (${CODEX_APP_IMAGE_GENERATION_DOC_URL}) before API generation. ${CODEX_IMAGEGEN_REQUIRED_POLICY} For UI/UX review/audit requests that mention image generation, gpt-image-2, callouts, or annotated review images, route to $Image-UX-Review/$UX-Review and require generated annotated review image evidence before issue extraction; do not satisfy that route with text-only critique. For $PPT, ${pptPipelineAllowlistPolicyText()} ${getdesignReferencePolicyText()} TriWiki context-tracking SSOT: .sneakoscope/wiki/context-pack.json; read only the latest coordinate+voxel overlay pack before every route stage, run sks wiki refresh/pack after changes, validate before handoffs/final.\n`,
    'reasoning-router': `---\nname: reasoning-router\ndescription: Temporary SKS reasoning-effort routing for every command and pipeline route.\n---\n\nmedium: simple copy/color/discovery/setup/mechanical edits. high: logic, safety, architecture, DB, orchestration, refactor, multi-file work. xhigh: research, AutoResearch, falsification, benchmarks, SEO/GEO, open-ended discovery, and From-Chat-IMG image work-order analysis. Routing is temporary; return to default after the gate. Inspect with sks reasoning and sks pipeline status.\n`,
    'pipeline-runner': `---\nname: pipeline-runner\ndescription: Execute SKS dollar-command routes as stateful pipelines with mission artifacts, route gates, Context7 evidence, temporary reasoning routing, reflection, and Honest Mode.\n---\n\nEvery $ command is a route. Use current.json, mission artifacts, and pipeline-plan.json as the execution plan: it records the lane, skipped stages, kept stages, verification, and no-unrequested-fallback invariant. Use temporary reasoning, TriWiki before stages, source hydration, Context7 when required, Team cleanup before reflection, reflection for full routes, and completion summary plus Honest Mode before final. Surface guard/scopes, record evidence, refresh/pack/validate TriWiki, and check sks pipeline status/resume/plan. ${speedLanePolicyText()} ${skillDreamPolicyText()}\n`,
    'context7-docs': `---\nname: context7-docs\ndescription: Enforce Context7 MCP documentation evidence for SKS routes that depend on external libraries, frameworks, APIs, MCPs, package managers, DB SDKs, or generated docs.\n---\n\nWhen required, resolve-library-id, then query-docs for the resolved id. Legacy get-library-docs evidence is accepted. Prefer sks context7 tools/resolve/docs/evidence and finish only after both evidence stages exist. Check setup with sks context7 check.\n`,
    'seo-geo-optimizer': `---\nname: seo-geo-optimizer\ndescription: SEO/GEO support for README, npm, GitHub, keywords, snippets, schema, and AI-search visibility.\n---\n\nUse for SEO/GEO, package metadata, README ranking, snippets, schema, and AI search. Optimize README, package.json, docs, badges, topics, quickstart, examples, command discovery, exact names, keywords, and AI Answer Snapshot. Do not invent metrics; use $AutoResearch unless it is a tiny copy edit.\n`,
    'reflection': `---\nname: reflection\ndescription: Post-route self-review for full SKS routes that records real misses, gaps, and corrective lessons into TriWiki memory.\n---\n\nUse after full route work/tests and before final. DFix, Answer, Help, Wiki, SKS discovery are exempt. Do not invent faults. Write reflection.md; append real lessons to ${REFLECTION_MEMORY_PATH}; refresh/pack, validate context-pack.json, pass reflection-gate.json.\n\n${reflectionInstructionText()}\n`,
    'honest-mode': `---\nname: honest-mode\ndescription: Required final SKS verification pass before claiming a task is complete.\n---\n\nBefore final: include a completion summary explaining what was done, what changed for the user/repo, what was verified, and what remains unverified or blocked. Then restate the goal, compare result to evidence, list tests/commands/inspections, state uncertainty or blockers plainly, and do not claim completion beyond evidence. Full routes must pass reflection-gate.json first. Include concise SKS Honest Mode or 솔직모드 when required.\n`,
    'autoresearch-loop': `---\nname: autoresearch-loop\ndescription: Iterative AutoResearch-style loop for open-ended improvement, discovery, prompt, ranking, SEO/GEO, and workflow-quality tasks.\n---\n\nUse for research, ranking, prompt/workflow improvement, benchmark gains, or repeated refinement. Loop: program, hypothesis, smallest falsifying experiment, metric, keep/discard, falsify, next step. Keep a ledger and do not claim improvement without evidence.\n`,
    'hproof-claim-ledger': `---\nname: hproof-claim-ledger\ndescription: Extract atomic claims and classify support status.\n---\n\nEvery factual statement must become an atomic claim. Unsupported critical claims cannot be used for implementation or final answer. Database claims require DB safety evidence.\n`,
    'hproof-evidence-bind': `---\nname: hproof-evidence-bind\ndescription: Bind claims to code, tests, decision contract, vgraph, beta, wiki, or GX render evidence.\n---\n\nEvidence priority: current code/tests, decision-contract.json, vgraph.json, beta.json, GX snapshot/render metadata, LLM Wiki coordinate index, user prompt. Database claims must respect .sneakoscope/db-safety.json. Wiki claims should carry id, hash, source path, and RGBA/trig coordinate anchors so they can be hydrated instead of treated as unsupported summaries.\n`,
    'db-safety-guard': `---\nname: db-safety-guard\ndescription: Enforce Sneakoscope Codex database safety before using SQL, Supabase MCP, Postgres, Prisma, Drizzle, Knex, or migration commands.\n---\n\nRules:\n- Never run DROP, TRUNCATE, mass DELETE/UPDATE, db reset, db push, project deletion, branch reset/merge/delete, or RLS-disabling operations.\n- Supabase MCP must be read-only and project-scoped by default.\n- Live writes through execute_sql are blocked; use migration files and only local/preview branches if explicitly allowed.\n- Production writes are forbidden.\n- If unsure, read-only only.\n`,
    'gx-visual-generate': `---\nname: gx-visual-generate\ndescription: Render a deterministic SVG/HTML visual sheet from vgraph.json and beta.json.\n---\n\nUse sks gx render. vgraph.json is source of truth; renders embed source hash and RGBA wiki anchors.\n`,
    'gx-visual-read': `---\nname: gx-visual-read\ndescription: Read a Sneakoscope Codex deterministic visual sheet and produce context notes.\n---\n\nExtract nodes, edges, invariants, tests, risks, uncertainties, and RGBA anchors from source/render/snapshot. Do not infer hidden nodes.\n`,
    'gx-visual-validate': `---\nname: gx-visual-validate\ndescription: Validate render metadata against vgraph.json and beta.json.\n---\n\nRun sks gx validate and drift; fail stale or incomplete hashes, nodes, edges, invariants, or anchors.\n`,
    'turbo-context-pack': `---\nname: turbo-context-pack\ndescription: Build ultra-low-token context packet with Q4 bits, Q3 tags, top-K claims, and minimal evidence.\n---\n\nDefault to Q4/Q3 plus TriWiki RGBA anchors and attention.use_first. Add Q2/Q1 only when needed or when attention.hydrate_first says source hydration is required. Keep id, hash, path, and coordinate tuple for hydration.\n`,
    'research-discovery': `---\nname: research-discovery\ndescription: Run SKS Research Mode for frontier-style research, hypotheses, novelty ledgers, falsification, and experiments.\n---\n\nFrame criteria, map assumptions, generate hypotheses, falsify, keep surviving insights, and record novelty/confidence/falsifiers/next experiments. Do not overclaim.\n`,
    'performance-evaluator': `---\nname: performance-evaluator\ndescription: Evaluate SKS performance, token-saving, accuracy-proxy, context-compression, or workflow improvements.\n---\n\nUse sks eval run/compare before claims. Report token_savings_pct, accuracy_delta/proxy, required_recall, support, and meaningful_improvement.\n`,
    'image-ux-review': imageUxReviewSkill('image-ux-review'),
    'ux-review': imageUxReviewSkill('ux-review'),
    'visual-review': imageUxReviewSkill('visual-review'),
    'ui-ux-review': imageUxReviewSkill('ui-ux-review'),
    'imagegen': `---\nname: imagegen\ndescription: Required bridge to Codex App built-in image generation for logos, image assets, raster visuals, and image edits.\n---\n\nUse for generated or edited image assets: logo, product image, illustration, sprite, mockup, texture, cutout, or bitmap. Prefer the official Codex App built-in image generation feature documented at ${CODEX_APP_IMAGE_GENERATION_DOC_URL}: ask naturally or invoke \`$imagegen\`; Codex uses built-in image generation with gpt-image-2 and counts it against Codex usage limits. For larger batches only, use the API path when OPENAI_API_KEY is explicitly available and the user or route contract allows API-priced generation. ${CODEX_IMAGEGEN_REQUIRED_POLICY} Do not substitute placeholder SVG/HTML/CSS for requested raster assets; follow design.md when relevant.\n`,
    'getdesign-reference': `---\nname: getdesign-reference\ndescription: Use getdesign.md official design reference as an input to the design.md SSOT for UI/UX, presentation, and HTML/PDF systems.\n---\n\nUse when creating or improving design.md, UI/UX design systems, deck-like HTML artifacts, presentation PDFs, or brand-inspired visual systems. design.md is the only design decision SSOT; reference ${GETDESIGN_REFERENCE.url}, ${GETDESIGN_REFERENCE.docs_url}, and ${AWESOME_DESIGN_MD_REFERENCE.url} only as source inputs to synthesize or update that SSOT or a route-local style-token artifact. Prefer the official Codex skill if available with \`${GETDESIGN_REFERENCE.codex_skill_install}\`. If the skill CLI is unavailable, use this generated skill plus official docs/API/CLI/SDK references and curated DESIGN.md examples as inputs. Do not claim getdesign MCP is configured unless a current official MCP surface is actually installed.\n`,
    'design-system-builder': `---\nname: design-system-builder\ndescription: Create the single design.md SSOT from docs/Design-Sys-Prompt.md when UI/UX work has no design system.\n---\n\nWhen \`design.md\` is missing, read docs/Design-Sys-Prompt.md as the builder prompt, inspect product/UI context, and use getdesign-reference, official getdesign.md docs, and curated DESIGN.md examples from ${AWESOME_DESIGN_MD_REFERENCE.url} only as source inputs. Fuse those inputs into one design.md SSOT with tokens, components, states, imagery, accessibility, and verification rules; do not leave multiple design files or references as competing authorities. Use the plan tool only for real ambiguity plus default font recommendation. Use imagegen for assets. ${CODEX_IMAGEGEN_REQUIRED_POLICY}\n`,
    'design-ui-editor': `---\nname: design-ui-editor\ndescription: Edit UI/UX using design.md, getdesign-reference, and design-artifact-expert.\n---\n\nRead \`design.md\`, inspect relevant UI/assets/tests, consult getdesign-reference when improving the design system, apply the smallest design-system-conformant change, use imagegen for image/logo/raster assets, and verify render quality. ${CODEX_IMAGEGEN_REQUIRED_POLICY} If missing, use design-system-builder first.\n`,
    'design-artifact-expert': `---\nname: design-artifact-expert\ndescription: Create or revise high-fidelity HTML, UI, prototype, deck-like, or visual design artifacts with rendered verification.\n---\n\nUse for design/UI/prototype/HTML visual work, including presentation-like HTML/PDF artifacts. Read design.md when present, consult getdesign-reference for design-system grounding, build the usable artifact first, preserve state, verify overlap/readability/responsiveness, and use imagegen for required assets. ${CODEX_IMAGEGEN_REQUIRED_POLICY}\n`
  };
  for (const [name, content] of Object.entries(skills)) {
    const dir = path.join(root, '.agents', 'skills', name);
    const skillContent = enrichSkillContent(name, content);
    await ensureDir(dir);
    await writeTextAtomic(path.join(dir, 'SKILL.md'), `${skillContent.trim()}\n`);
    await writeSkillMetadata(dir, name);
  }
  const skillNames = Object.keys(skills);
  const removedStaleGeneratedSkills = await removeStaleGeneratedSkillsFromManifest(root, skillNames);
  await writeGeneratedSkillManifest(root, skillNames);
  return {
    installed_skills: skillNames,
    generated_files: generatedSkillFiles(skillNames),
    removed_stale_generated_skills: removedStaleGeneratedSkills,
    removed_agent_skill_aliases: await removeGeneratedAgentSkillAliases(root, skillNames),
    removed_codex_skill_mirrors: await removeGeneratedCodexSkillMirrors(root, skillNames)
  };
}

function generatedSkillFiles(skillNames) {
  return skillNames.flatMap((name) => [
    `.agents/skills/${name}/SKILL.md`,
    `.agents/skills/${name}/agents/openai.yaml`
  ]).sort();
}

function generatedSkillManifestPath(root) {
  return path.join(root, '.agents', 'skills', SKS_SKILL_MANIFEST_FILE);
}

async function writeGeneratedSkillManifest(root, skillNames) {
  const manifestPath = generatedSkillManifestPath(root);
  await writeJsonAtomic(manifestPath, {
    schema_version: 1,
    generated_by: 'sneakoscope',
    version: PACKAGE_VERSION,
    prune_policy: GENERATED_PRUNE_POLICY,
    skills: [...skillNames].sort(),
    files: generatedSkillFiles(skillNames)
  });
}

async function removeStaleGeneratedSkillsFromManifest(root, skillNames) {
  const previous = await readJson(generatedSkillManifestPath(root), null);
  const previousSkills = Array.isArray(previous?.skills) ? previous.skills : [];
  if (!previousSkills.length) return [];
  const current = new Set(skillNames);
  const removed = [];
  for (const name of previousSkills) {
    const skillName = String(name || '').trim();
    if (!skillName || current.has(skillName) || !/^[a-z0-9-]+$/.test(skillName)) continue;
    const dir = path.join(root, '.agents', 'skills', skillName);
    if (!(await exists(dir))) continue;
    await fsp.rm(dir, { recursive: true, force: true });
    removed.push(path.relative(root, dir));
  }
  return removed.sort();
}

function enrichSkillContent(name, content) {
  if (!['sks', 'answer', 'wiki', 'team', 'qa-loop', 'ppt', 'image-ux-review', 'ux-review', 'visual-review', 'ui-ux-review', 'computer-use', 'computer-use-fast', 'cu', 'goal', 'research', 'autoresearch', 'db', 'gx', 'reflection', 'prompt-pipeline', 'pipeline-runner', 'context7-docs', 'turbo-context-pack', 'hproof-evidence-bind'].includes(name)) return content;
  const text = String(content || '').trimEnd();
  const activation = pipelineActivationText(name);
  if (text.includes('TriWiki context-tracking SSOT')) {
    return activation && !text.includes('Codex App pipeline activation:') ? `${text}\n\n${activation}` : text;
  }
  return `${text}${activation ? `\n\n${activation}` : ''}

Context tracking:
- Ask only ambiguity that can change scope, safety, behavior, or acceptance; infer the rest from TriWiki/current code and seal answers before execution.
- TriWiki SSOT: .sneakoscope/wiki/context-pack.json. Use only the latest coordinate+voxel overlay pack; coordinate-only legacy packs are invalid and must be refreshed before use. Use attention.use_first for compact high-trust recall and hydrate attention.hydrate_first from source before risky/lower-trust decisions. Refresh/pack after findings or artifact changes; validate before handoffs/final claims.
- ${stackCurrentDocsPolicyText()}
- Keep non-selected claims hydratable by id, hash, source path, and RGBA/trig coordinate. Hydrate low-trust claims before relying on them.
- Hook output is limited; use mission files, team events, or normal updates for live detail.
`;
}

function pipelineActivationText(name) {
  const stateful = new Set(['sks', 'team', 'qa-loop', 'ppt', 'image-ux-review', 'ux-review', 'visual-review', 'ui-ux-review', 'computer-use', 'computer-use-fast', 'cu', 'goal', 'research', 'autoresearch', 'db', 'gx', 'prompt-pipeline', 'pipeline-runner']);
  if (!stateful.has(name)) return '';
  return `Codex App pipeline activation:
- If the SKS UserPromptSubmit hook already injected route context, follow that context.
- If no SKS hook context is visible in the current turn, immediately run \`sks hook user-prompt-submit\` from the target repo root with JSON input containing the current prompt, for example: \`printf '%s' '{"prompt":"<user prompt>","cwd":"<repo root>"}' | sks hook user-prompt-submit\`.
- Use the returned \`hookSpecificOutput.additionalContext\` as authoritative route context before answering or editing. If it creates a mission, continue through \`sks pipeline status\`, \`sks pipeline plan\`, and \`sks pipeline answer\` as directed.
- Do not treat this skill text alone as completion of the SKS route; a stateful SKS route must materialize mission/pipeline artifacts or explicitly report why the hook could not run.`;
}

async function writeSkillMetadata(dir, name) {
  const effort = ['computer-use', 'computer-use-fast', 'cu'].includes(name)
    ? 'low'
    : ['research', 'autoresearch', 'research-discovery', 'autoresearch-loop', 'from-chat-img'].includes(name)
    ? 'xhigh'
    : (['dfix', 'sks', 'help'].includes(name) ? 'medium' : 'high');
  await ensureDir(path.join(dir, 'agents'));
  await writeTextAtomic(path.join(dir, 'agents', 'openai.yaml'), `name: ${name}\nmodel_reasoning_effort: ${effort}\nrouting: temporary\nreturn_to_default_after_route: true\n`);
}

async function removeGeneratedCodexSkillMirrors(root, skillNames) {
  const legacyRoot = path.join(root, '.codex', 'skills');
  if (!(await exists(legacyRoot))) return [];
  const removed = [];
  const names = Array.from(new Set([...skillNames, ...DOLLAR_COMMANDS.map((c) => c.command.slice(1)), 'ralph', 'Ralph', 'ralph-supervisor', 'ralph-resolver']));
  for (const name of names) {
    const dir = path.join(legacyRoot, name);
    const skillPath = path.join(dir, 'SKILL.md');
    const text = await readText(skillPath, null);
    if (!isGeneratedSksLegacySkill(text, name)) continue;
    await fsp.rm(dir, { recursive: true, force: true });
    removed.push(path.relative(root, dir));
  }
  await removeDirIfEmpty(legacyRoot);
  await removeDirIfEmpty(path.join(root, '.agents'));
  return removed;
}

async function removeGeneratedAgentSkillAliases(root, skillNames) {
  const current = new Set(skillNames);
  const obsolete = ['agent-team', 'qaloop', 'wiki-refresh', 'wikirefresh', 'ralph', 'ralph-supervisor', 'ralph-resolver'];
  const removed = [];
  for (const name of obsolete) {
    if (current.has(name)) continue;
    const dir = path.join(root, '.agents', 'skills', name);
    const skillPath = path.join(dir, 'SKILL.md');
    const text = await readText(skillPath, null);
    if (!isGeneratedSksAgentSkill(text, name)) continue;
    await fsp.rm(dir, { recursive: true, force: true });
    removed.push(path.relative(root, dir));
  }
  return removed;
}

function isGeneratedSksAgentSkill(text, name) {
  if (!text) return false;
  const s = String(text);
  if (!new RegExp(`name:\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s)) return false;
  if (/\bnot generated by SKS\b/i.test(s)) return false;
  return /Sneakoscope generated|Fallback Codex App picker alias|Codex App picker alias for|Dollar-command route generated by SKS/i.test(s);
}

function isGeneratedSksLegacySkill(text, name) {
  if (typeof text !== 'string') return false;
  return text.startsWith('---') && new RegExp(`^name:\\s*${escapeRegExp(name)}\\s*$`, 'm').test(text);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function removeDirIfEmpty(dir) {
  try {
    const entries = await fsp.readdir(dir);
    if (!entries.length) await fsp.rmdir(dir);
  } catch {}
}

async function installCodexAgents(root) {
  const agents = {
    'analysis-scout.toml': `name = "analysis_scout"\ndescription = "Read-only Team analysis scout. Maps one independent repo/docs/tests/API/risk/user-friction slice and returns TriWiki-ready source-backed findings before debate starts."\nmodel = "gpt-5.5"\nmodel_reasoning_effort = "high"\nsandbox_mode = "read-only"\ndeveloper_instructions = """\nYou are an SKS Team analysis scout.\nDo not edit files.\nOwn exactly one investigation slice assigned by the parent orchestrator.\nMap relevant source files, docs, tests, APIs, DB or safety risks, UX friction, and likely implementation boundaries.\nReturn concise source-backed claims suitable for team-analysis.md and TriWiki ingestion: claim, source path, evidence hash or quoted anchor, risk, confidence, and recommended implementation slice.\nDo not debate the final plan and do not implement code.\nAlso return a concise LIVE_EVENT line that the parent can record with sks team event.\n"""\n`,
    'team-consensus.toml': `name = "team_consensus"\ndescription = "Planning and debate specialist for SKS Team mode. Maps options, constraints, role-persona risks, and proposes the agreed objective before implementation starts."\nmodel = "gpt-5.5"\nmodel_reasoning_effort = "high"\nsandbox_mode = "read-only"\ndeveloper_instructions = """\nYou are the SKS Team consensus specialist.\nDo not edit files.\nMap the affected code paths, viable approaches, constraints, risks, and acceptance criteria.\nRun the debate as role-persona synthesis: final users are low-context, self-interested, stubborn, and inconvenience-averse; executors are capable developers; reviewers are strict.\nArgue for the smallest coherent objective that can be handed to a fresh executor_N development team.\nPlan for at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA validation lanes before integration or final.\nReturn: recommended objective, rejected alternatives, implementation slices, required reviewers, user-friction risks, and unresolved risks.\nAlso return a concise LIVE_EVENT line that the parent can record with sks team event.\n"""\n`,
    'implementation-worker.toml': `name = "implementation_worker"\ndescription = "Implementation specialist for SKS Team mode. Owns one bounded write set and coordinates with other executor_N workers."\nmodel = "gpt-5.5"\nmodel_reasoning_effort = "high"\nsandbox_mode = "workspace-write"\ndeveloper_instructions = """\nYou are an SKS Team executor/developer in the fresh development bundle.\nYou are not alone in the codebase. Other executor_N workers may be editing disjoint files.\nOnly edit the files or module slice assigned to you.\nDo not revert or overwrite edits made by others.\nRead local patterns first, make the smallest correct change, avoid adding user friction, run focused verification for your slice, and report changed paths plus evidence.\nDo not create fallback implementation code, substitute behavior, mock behavior, or compatibility shims unless the user or sealed decision contract explicitly requested them.\nRespect all SKS hooks, DB safety rules, no-question run rules, and H-Proof completion gates.\nAlso return concise LIVE_EVENT lines for started, blocked, changed files, verification, and final result so the parent can record them.\n"""\n`,
    'db-safety-reviewer.toml': `name = "db_safety_reviewer"\ndescription = "Read-only database safety reviewer for SQL, migrations, Supabase, RLS, destructive-operation risk, and rollback safety."\nmodel = "gpt-5.5"\nmodel_reasoning_effort = "high"\nsandbox_mode = "read-only"\ndeveloper_instructions = """\nYou are a database safety reviewer.\nNever modify files or execute destructive commands.\nReview migrations, SQL, Supabase RLS, transaction boundaries, rollback safety, and MCP database tool usage.\nBlock DROP, TRUNCATE, mass DELETE/UPDATE, db reset, db push, project deletion, branch reset/merge/delete, RLS disabling, and live execute_sql writes.\nReturn concrete risks, exact file references, and required fixes.\nAlso return a concise LIVE_EVENT line that the parent can record with sks team event.\n"""\n`,
    'qa-reviewer.toml': `name = "qa_reviewer"\ndescription = "Strict read-only verification reviewer for correctness, regressions, missing tests, user friction, and final evidence."\nmodel = "gpt-5.5"\nmodel_reasoning_effort = "high"\nsandbox_mode = "read-only"\ndeveloper_instructions = """\nYou are an SKS Team strict reviewer.\nDo not edit files.\nReview correctness, edge cases, regression risk, missing tests, unsupported claims, and whether the final evidence proves the claimed outcome.\nTeam review must cover at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA validation lanes before integration or final; flag missing review lane evidence.\nAlso evaluate practical friction from the viewpoint of a stubborn, low-context final user who dislikes inconvenience.\nPrioritize concrete findings with file references and focused verification suggestions.\nFlag any unrequested fallback implementation code, substitute behavior, mock behavior, or compatibility shim as a blocking finding unless the user or sealed decision contract explicitly requested it.\nReturn no findings if the implementation is sound, and clearly list residual test gaps.\nAlso return a concise LIVE_EVENT line that the parent can record with sks team event.\n"""\n`
  };
  const dir = path.join(root, '.codex', 'agents');
  await ensureDir(dir);
  for (const [file, content] of Object.entries(agents)) {
    await writeTextAtomic(path.join(dir, file), content);
  }
  return {
    installed_agents: Object.keys(agents),
    generated_files: Object.keys(agents).map((file) => `.codex/agents/${file}`).sort()
  };
}

function currentGeneratedFileInventory(skillInstall = {}, agentInstall = {}) {
  return Array.from(new Set([
    '.codex/config.toml',
    '.codex/SNEAKOSCOPE.md',
    '.codex/hooks.json',
    '.sneakoscope/harness-guard.json',
    '.sneakoscope/db-safety.json',
    '.sneakoscope/policy.json',
    '.agents/skills/.sks-generated.json',
    ...(Array.isArray(skillInstall.generated_files) ? skillInstall.generated_files : []),
    ...(Array.isArray(agentInstall.generated_files) ? agentInstall.generated_files : [])
  ])).sort();
}

async function pruneStaleGeneratedFiles(root, previousManifest, currentFiles) {
  const previousFiles = Array.isArray(previousManifest?.generated_files?.files) ? previousManifest.generated_files.files : [];
  if (!previousFiles.length) return { pruned: [] };
  const current = new Set(currentFiles);
  const pruned = [];
  const already_absent = [];
  for (const rel of previousFiles) {
    const relPath = normalizeGeneratedRelPath(rel);
    if (!relPath || current.has(relPath) || !isPrunableGeneratedPath(relPath)) continue;
    const removed = await removeGeneratedRelPath(root, relPath);
    if (removed) pruned.push(removed);
    else already_absent.push(relPath);
  }
  return { pruned: pruned.sort(), already_absent: already_absent.sort() };
}

function normalizeGeneratedRelPath(value) {
  const rel = String(value || '').trim().replaceAll('\\', '/');
  if (!rel || rel.startsWith('/') || rel.includes('\0')) return null;
  if (rel.split('/').some((part) => part === '..')) return null;
  return rel;
}

function isPrunableGeneratedPath(rel) {
  if (rel.startsWith('.agents/skills/')) return true;
  if (rel.startsWith('.codex/agents/')) return true;
  if (rel.startsWith('.codex/skills/')) return true;
  return new Set([
    '.codex/config.toml',
    '.codex/SNEAKOSCOPE.md',
    '.codex/hooks.json',
    '.sneakoscope/harness-guard.json',
    '.sneakoscope/db-safety.json',
    '.sneakoscope/policy.json'
  ]).has(rel);
}

async function removeGeneratedRelPath(root, rel) {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, rel);
  if (abs !== absRoot && !abs.startsWith(`${absRoot}${path.sep}`)) return null;
  if (!(await exists(abs))) return null;
  await fsp.rm(abs, { recursive: true, force: true });
  await removeEmptyGeneratedParents(root, rel);
  return rel;
}

async function removeEmptyGeneratedParents(root, rel) {
  const parts = rel.split('/');
  if (parts.length <= 1) return;
  const stopDirs = new Set([
    path.resolve(root, '.agents', 'skills'),
    path.resolve(root, '.codex', 'agents'),
    path.resolve(root, '.codex', 'skills'),
    path.resolve(root, '.codex'),
    path.resolve(root, '.sneakoscope')
  ]);
  let dir = path.resolve(root, ...parts.slice(0, -1));
  while (!stopDirs.has(dir) && dir.startsWith(path.resolve(root))) {
    await removeDirIfEmpty(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (rel.startsWith('.codex/skills/')) await removeDirIfEmpty(path.join(root, '.codex', 'skills'));
}
