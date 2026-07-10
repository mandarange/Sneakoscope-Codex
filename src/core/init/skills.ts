import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, exists, nowIso, PACKAGE_VERSION, readJson, readText, sha256, withScratchDir, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { MIN_TEAM_REVIEWER_LANES, MIN_TEAM_REVIEW_POLICY_TEXT } from '../team-review-policy.js';
import { buildSksCoreSkillManifest, isCoreSkillName } from '../codex-native/core-skill-manifest.js';
import { syncCoreSkillsIntegrity } from '../codex-native/core-skill-integrity.js';
import { dbSafetyGuardSkillText, madDbSkillText } from '../mad-db/mad-db-policy.js';
import { SKILL_DREAM_POLICY, skillDreamPolicyText } from '../skill-forge.js';
import { AWESOME_DESIGN_MD_REFERENCE, CODEX_APP_IMAGE_GENERATION_DOC_URL, CODEX_COMPUTER_USE_ONLY_POLICY, CODEX_IMAGEGEN_EVIDENCE_SOURCE, CODEX_IMAGEGEN_REQUIRED_POLICY, CODEX_WEB_VERIFICATION_POLICY, DEFAULT_CODEX_APP_PLUGINS, DESIGN_SYSTEM_SSOT, DOLLAR_COMMANDS, DOLLAR_SKILL_NAMES, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS, GETDESIGN_REFERENCE, IMAGEGEN_SOCIAL_SOURCE_POLICY, OPENAI_CHATGPT_IMAGES_2_DOC_URL, OPENAI_GPT_IMAGE_2_MODEL_DOC_URL, OPENAI_IMAGE_GENERATION_DOC_URL, PPT_CONDITIONAL_SKILL_ALLOWLIST, PPT_PIPELINE_MCP_ALLOWLIST, PPT_PIPELINE_SKILL_ALLOWLIST, RECOMMENDED_SKILLS, RESERVED_CODEX_PLUGIN_SKILL_NAMES, SOLUTION_SCOUT_SKILL_NAME, chatCaptureIntakeText, context7ConfigToml, getdesignReferencePolicyText, imageUxReviewPipelinePolicyText, leanEngineeringCompactText, outcomeRubricPolicyText, pptPipelineAllowlistPolicyText, productDesignPluginPolicyText, solutionScoutPolicyText, speedLanePolicyText, stackCurrentDocsPolicyText, triwikiContextTrackingText, triwikiStagePolicyText } from '../routes.js';
import { REQUIRED_CODEX_MODEL } from '../codex-model-guard.js';

const SKS_SKILL_MANIFEST_FILE = '.sks-generated.json';
const PACKAGED_SKILLS_MANIFEST_SCHEMA = 'sks.skills-manifest.v1';
const GENERATED_PRUNE_POLICY = 'remove_previous_sks_generated_paths_absent_from_current_manifest';
const REFLECTION_MEMORY_PATH = '.sneakoscope/memory/q2_facts/post-route-reflection.md';
const MANAGED_SKILL_MARKER_RE = /BEGIN SKS (?:IMMUTABLE CORE|MANAGED) SKILL/;
const FORGE_SKILL_MARKER_RE = /BEGIN SKS FORGE SKILL/;
const REMOVED_OFFICIAL_SKILLS = ['old-workflow', 'team-legacy'];
const DEPRECATED_SKILL_ALIASES: Record<string, string[]> = {
  naruto: ['shadow-clone-legacy'],
  team: ['agent-team'],
  'qa-loop': ['qaloop'],
  wiki: ['wiki-refresh', 'wikirefresh'],
  sks: ['ralph', 'Ralph', 'ralph-supervisor', 'ralph-resolver']
};

function reflectionInstructionText(commandPrefix: any = 'sks') {
  return `Post-route reflection: full routes load \`reflection\` after work/tests and before final; DFix/Answer/Help/Wiki/SKS discovery are exempt. Write reflection.md; record only real misses/gaps, or no_issue_acknowledged. For lessons, append TriWiki claim rows to ${REFLECTION_MEMORY_PATH}. Run "${commandPrefix} wiki refresh" or pack, validate, then pass reflection-gate.json.`;
}

async function installOfficialSkills(root: any) {
  const imageUxReviewSkill = (name: any) => `---\nname: ${name}\ndescription: $Image-UX-Review/$UX-Review imagegen/gpt-image-2 annotated UI/UX review loop.\n---\n\nUse only for $Image-UX-Review, $UX-Review, $visual-review, or $ui-ux-review UI/UX review requests. ${imageUxReviewPipelinePolicyText()} Route start must check Codex App imagegen capability and run the SKS imagegen repair loop once; if $imagegen/gpt-image-2 is still unavailable, stop with codex_imagegen_unavailable instead of doing text-only review or direct API substitution. Core loop: capture or attach source UI screenshots, then invoke Codex App $imagegen with gpt-image-2 to create a new generated annotated review image from each source screenshot, then analyze the generated review image with vision/OCR into image-ux-issue-ledger.json, then apply only requested safe fixes and recheck changed screens. Text-only screenshot critique cannot satisfy full verification; missing generated annotated review images keep full image-ux-review-gate.json verification blocked, but may close verified_partial/reference-only when source screenshots plus hashes, docs evidence, source Image Voxel anchors, and Honest Mode evidence exist. For live web/browser/webapp capture use Codex Chrome Extension first and halt if it is not installed/enabled; use Codex Computer Use only for native Mac/non-web app screens. Required artifacts: image-ux-review-policy.json, image-ux-screen-inventory.json, image-ux-generated-review-ledger.json, image-ux-issue-ledger.json, image-ux-iteration-report.json, image-ux-review-gate.json. Finish with reflection and Honest Mode.\n`;
  const mergedMadDbSqlPlanePolicy = madDbSkillText().replace(/^---[\s\S]*?---\s*/, '').trim();
  const skills = {
    'dfix': `---\nname: dfix\ndescription: Direct Fix mode for $DFix or $dfix requests and inferred tiny copy/config/docs/labels/spacing/translation/simple mechanical edits.\n---\n\nUse for tiny copy/config/docs/labels/spacing/translation/simple mechanical edits. List exact micro-edits, inspect only needed files, apply only those edits, and run cheap verification. Keep broad implementation routed to Team; for UI/UX micro-edits read \`design.md\` when present and use imagegen for image/logo/raster assets. Bypass broad SKS routing, mission state, TriWiki/TriFix/reflection/state recording, Goal, Research, eval, redesign, and repeated full-route Honest Mode loops. Start the final answer with \`DFix 완료 요약:\` and include one \`DFix 솔직모드:\` line covering verified, not verified, and remaining issues. ${CODEX_IMAGEGEN_REQUIRED_POLICY}\n`,
    'answer': `---\nname: answer\ndescription: Answer-only research route for ordinary questions that should not start implementation.\n---\n\nUse for explanations, comparisons, status, facts, source-backed research, or docs guidance. Use repo/TriWiki first for project-local facts; hydrate low-trust claims from source. Browse or use Context7 for current external package/API/framework/MCP docs. End with a concise answer summary plus Honest Mode; do not create missions, subagents, or file edits.\n`,
    'sks': `---\nname: sks\ndescription: General Sneakoscope Codex command route for $SKS or $sks usage, setup, status, and workflow help.\n---\n\nUse local SKS commands: bootstrap, deps, commands, quickstart, codex-app, context7, guard, conflicts, reasoning, wiki, pipeline status, pipeline plan, skill-dream. Promote code-changing work to Team unless Answer/DFix/Help/Wiki/safety route fits. Surface route/guard/scope, use TriWiki, do not edit installed harness files outside this engine repo, and require human-approved conflict cleanup. ${skillDreamPolicyText()}\n`,
    'plan': `---\nname: plan\ndescription: Plan scaffold only - writes a fixed-template .sneakoscope/plans/<slug>.md, never touches code. Not project-specific decision-complete planning. 예: $Plan "결제 모듈 리팩터"\n---\n\nUse when the user invokes $Plan or asks for a plan-only frontdoor. Produce a concrete plan artifact under .sneakoscope/plans/<slug>.md with goal, scope, files to inspect, implementation steps, acceptance checks, and rollback notes. Do not edit product/source files, generated harness files, package metadata, or docs beyond the plan artifact. Keep implementation_allowed=false and hand off execution to $Work only after the user or route explicitly moves from planning to work. Finish with what is planned, what remains unimplemented, and Honest Mode.\n`,
    'work': `---\nname: work\ndescription: Execute the latest plan with evidence-gated completion. 예: $Work\n---\n\nUse when the user invokes $Work or asks to execute the latest SKS plan. Resolve the newest .sneakoscope/plans/*.md, route execution through Naruto/Team evidence gates, keep leases and verification artifacts current, and do not claim completion without machine evidence or explicit blocker evidence. If no plan exists, block with a clear next action: run $Plan first or provide a task.\n`,
    'swarm': `---\nname: swarm\ndescription: Dynamic parallel swarm (naruto) with machine-verified gates. 예: $Swarm "fix all lint errors"\n---\n\nUse when the user invokes $Swarm or asks for dynamic parallel work. Delegate to the Naruto native shadow-clone swarm, preserve lease-safe write boundaries, keep agent ledgers and gate artifacts current, and sort machine verification evidence above LLM opinion. Finish through Naruto gate, reflection when required, and Honest Mode.\n`,
    'review': `---\nname: review\ndescription: Parallel diff review with machine-evidence first findings. 예: $Review 또는 sks review --staged\n---\n\nUse when the user asks for $Review or sks review. Review the selected diff read-only unless --fix is explicitly supplied. Machine evidence such as TypeScript, lint, tests, conflict markers, or secret scans outranks LLM findings and must be tagged evidence: machine; judgment-only findings must be tagged evidence: llm. --fix may attempt at most one machine-evidence fix pass and must re-run verification once. Do not mutate code for LLM-only opinions.\n`,
    'fast-mode': `---\nname: fast-mode\ndescription: Dollar-command route for $Fast-Mode, $Fast-On, and $Fast-Off global Codex Desktop Fast mode toggles.\n---\n\nUse when the user invokes $Fast-Mode, $Fast-On, $Fast-Off, or asks to turn SKS Fast mode on/off. Prefer \`sks fast-mode on|off|status|clear --json\`. By default on/off updates the global Codex Desktop config so GPT 5.5 Fast persists and also keeps .sneakoscope/state/fast-mode.json in sync for SKS workers. Use \`--project\` only when the user explicitly wants project-local worker preference without touching global Codex config. Explicit runtime flags still win: \`--fast\`, \`--no-fast\`, and \`--service-tier standard|fast\` override the saved preference for that run. Finish with a short status and Honest Mode; do not start Team or broad implementation for a toggle-only request.\n`,
    'fast-on': `---\nname: fast-on\ndescription: Alias for $Fast-On global Codex Desktop GPT 5.5 Fast enablement.\n---\n\nUse the same rules as fast-mode. Run or instruct \`sks fast-mode on --json\`, then report Global (desktop), Project (sks workers), state file, and the fact that explicit per-run flags still override the saved preference.\n`,
    'fast-off': `---\nname: fast-off\ndescription: Alias for $Fast-Off global Codex Desktop Fast mode disablement.\n---\n\nUse the same rules as fast-mode. Run or instruct \`sks fast-mode off --json\`, then report Global (desktop), Project (sks workers), state file, and the fact that explicit per-run flags still override the saved preference.\n`,
    'with-local-llm-on': `---\nname: with-local-llm-on\ndescription: Dollar-command route for $with-local-llm-on local Ollama worker enablement.\n---\n\nUse when the user invokes $with-local-llm-on or asks to enable the optional local Ollama worker backend. Prefer \`sks with-local-llm on --json\`. The command writes the machine-local config at \`~/.sneakoscope/local-model.json\`. Default off means SKS stays GPT-only until this command enables local workers. Enabled mode only lets policy-eligible simple code patch-envelope or read-only collection worker slices use Ollama; GPT/Codex still owns strategy, planning, design, review, verification, safety, and integration. \`--no-ollama\` and \`SKS_OLLAMA_WORKERS=0\` still force local workers off for a run. Finish with a short status and Honest Mode; do not start Team for a toggle-only request.\n`,
    'with-local-llm-off': `---\nname: with-local-llm-off\ndescription: Dollar-command route for $with-local-llm-off local Ollama worker disablement.\n---\n\nUse when the user invokes $with-local-llm-off or asks to disable the optional local Ollama worker backend. Prefer \`sks with-local-llm off --json\`. The command writes the machine-local config at \`~/.sneakoscope/local-model.json\`. Disabled mode keeps SKS GPT-only by default. Strategy, planning, design, review, verification, safety, and integration remain GPT/Codex-owned regardless of this toggle. Finish with a short status and Honest Mode; do not start Team for a toggle-only request.\n`,
    'wiki': `---\nname: wiki\ndescription: Dollar-command route for $Wiki TriWiki refresh, pack, validate, and prune commands.\n---\n\nUse for $Wiki or Korean wiki-refresh requests. Refresh/update/갱신: run sks wiki refresh, then validate .sneakoscope/wiki/context-pack.json. Pack: run sks wiki pack, then validate. Prune/clean/정리: use sks wiki refresh --prune, or sks wiki prune --dry-run for inspection. Report claims, anchors, trust, attention.use_first/hydrate_first, validation, and blockers. Do not start ambiguity-gated implementation, subagents, or unrelated work.\n`,
    'team': `---\nname: team\ndescription: Deprecated $Team compatibility alias; new execution missions route to $Naruto.\n---\n\nUse only to explain or follow legacy $Team prompts. $Team and \`sks team "<task>"\` are deprecated for new execution and redirect to the Naruto native shadow-clone swarm; legacy \`sks team log|tail|watch|lane|status|event|message|open-zellij|attach-zellij|cleanup-zellij\` remains read-only/observability support for old Team missions. For implementation, load the naruto skill, read pipeline-plan.json, run lease-safe Naruto workers, pass naruto-gate.json, then reflection and Honest Mode. ${leanEngineeringCompactText()} ${outcomeRubricPolicyText()} ${speedLanePolicyText()} ${solutionScoutPolicyText('fix this broken behavior')} ${skillDreamPolicyText()}\n`,
    'from-chat-img': `---\nname: from-chat-img\ndescription: Explicit $From-Chat-IMG Naruto add-on gate for chat screenshot plus attachment analysis.\n---\n\nUse only for From-Chat-IMG/$From-Chat-IMG. It enters the Naruto pipeline with from_chat_img_required=true and an add-on coverage gate, not the legacy Team pipeline. Treat uploads as chat screenshot plus originals. For web/browser/webapp targets use Codex Chrome Extension first; for native Mac/non-web app surfaces use Codex Computer Use visual inspection when available. List requirements first, match regions to attachments with confidence, write ${FROM_CHAT_IMG_COVERAGE_ARTIFACT}, ${FROM_CHAT_IMG_CHECKLIST_ARTIFACT}, ${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT}, and ${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}, then continue Naruto worker proof, review, reflection, and Honest Mode. ${CODEX_WEB_VERIFICATION_POLICY} ${CODEX_COMPUTER_USE_ONLY_POLICY} The ledger must account for every visible customer request, screenshot image region, and separate attachment; ${FROM_CHAT_IMG_CHECKLIST_ARTIFACT} must have a checked item for each request, image-region/attachment match, work item, scoped QA-LOOP, and verification step; ${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT} stores temporary TriWiki-backed session context with expires_after_sessions=${FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS}. ${FROM_CHAT_IMG_QA_LOOP_ARTIFACT} must prove QA-LOOP ran over the exact customer-request work-order range after implementation, with every work item covered, post-fix verification complete, and zero unresolved findings. naruto-gate.json cannot pass From-Chat-IMG completion until from_chat_img_request_coverage=true, unresolved_items is empty, every checklist box is checked, and scoped_qa_loop_completed=true.\n`,
    'naruto': `---\nname: naruto\ndescription: $Naruto Shadow Clone Swarm (影分身 / Kage Bunshin no Jutsu) fans out up to 100 parallel clone sessions on the native agent kernel for high-throughput work.\n---\n\nUse when the user invokes $Naruto, $ShadowClone, $Kagebunshin, $Team, $From-Chat-IMG, or asks to fan out many parallel agent clones for high-throughput sweeps. Naruto is the new execution SSOT: Team is only a deprecated compatibility alias. Prefer \`sks naruto run "<task>" [--clones N] [--backend codex-exec|fake] [--work-items N] [--real] [--readonly] [--json]\` and \`sks naruto status [--mission <id>] [--json]\`. Clones default to the native kernel and are throttled to host capacity (cores/free memory); the requested clone count is the ceiling, not a guarantee, and the scheduler backfills slots as clones complete. Shadow clones always run in fast service tier; \`--no-fast\`/standard requests are not honored for clones. Writes are lease-based and non-overlapping: each clone takes a path lease before writing so parallel clones never edit the same file, and every clone emits its own proof. Keep agent-central-ledger.json, agent-task-board.json, agent-effort-policy.json, agent-scheduler-state.json, agent-proof-evidence.json, naruto-gate.json, and agent-session-cleanup.json; the parent session owns integration, verification, and final claims. Use \`--backend fake\` only for fixtures/selftests; remove it when real clone evidence is intended. Lifecycle: clone roster build, work partition, parallel clone scheduling, lease-based write swarm, per-clone proof, session cleanup, then reflection and Honest Mode. Refresh/validate TriWiki before risky decisions and consume attention.use_first/hydrate_first. Catastrophic safeguards remain active for every clone. Finish with a concise completion summary and Honest Mode covering verified clones, unverified work, and any blockers.\n`,
    'shadow-clone': `---\nname: shadow-clone\ndescription: $ShadowClone alias for the $Naruto Shadow Clone Swarm high-scale parallel agent route.\n---\n\nUse the same rules as the naruto skill: this is the English alias for $Naruto / Kage Bunshin no Jutsu. Fan out up to 100 lease-safe parallel clone sessions on the native agent kernel via \`sks naruto run "<task>" [--clones N] [--backend codex-exec|fake] [--work-items N] [--json]\`. Clones run in fast service tier, are throttled to host capacity, take path leases for non-overlapping writes, and each emit per-clone proof; the parent integrates and verifies. Keep the same agent ledgers and finish with reflection and Honest Mode.\n`,
    'kage-bunshin': `---\nname: kage-bunshin\ndescription: $Kagebunshin alias for the $Naruto Shadow Clone Swarm (影分身) high-scale parallel agent route.\n---\n\nUse the same rules as the naruto skill: this is the 影分身 / Kage Bunshin no Jutsu alias for $Naruto. Fan out up to 100 lease-safe parallel clone sessions on the native agent kernel via \`sks naruto run "<task>" [--clones N] [--backend codex-exec|fake] [--work-items N] [--json]\`. Clones run in fast service tier, are throttled to host capacity, take path leases for non-overlapping writes, and each emit per-clone proof; the parent integrates and verifies. Keep the same agent ledgers and finish with reflection and Honest Mode.\n`,
    'qa-loop': `---\nname: qa-loop\ndescription: $QA-LOOP dogfoods UI/API as human proxy with safety gates, Codex Chrome Extension-first web UI evidence, safe fixes, rechecks, and a QA report.\n---\n\nUse only $QA-LOOP. Infer scope, target, mutation policy, and login boundary from the prompt plus TriWiki/current-code defaults; do not surface a prequestion sheet. Credentials are runtime-only; never save secrets. Web/browser/webapp UI-level E2E must run the Codex Chrome Extension readiness gate first; if the extension is missing or disabled, rapidly halt and ask the user to set it up, then resume only after the user confirms installation is complete. Codex Computer Use is reserved for native Mac/non-web surfaces and must not satisfy web UI evidence. Playwright, Selenium, Puppeteer, Browser Use, Chrome MCP, screenshots fabricated from code, and prose-only checks do not satisfy web UI/browser verification. ${CODEX_WEB_VERIFICATION_POLICY} Deployed targets are read-only; destructive removal is forbidden. After answer/run, dogfood real flows, apply safe contract-allowed code/test/docs fixes, recheck, and do not pass qa-gate.json with unresolved findings or without post_fix_verification_complete. Finish qa-ledger, date/version report, gate, completion summary, and Honest Mode.\n`,
    'ppt': `---\nname: ppt\ndescription: $PPT information-first HTML/PDF presentation pipeline with inferred STP, audience, pain-point, format, research, design-system, and verification contract.\n---\n\nUse only when the user invokes $PPT or asks to create a presentation, deck, slides, pitch deck, proposal deck, HTML presentation, or PDF presentation artifact. Before artifact work, auto-seal presentation-specific answers from prompt, TriWiki/current-code defaults, and conservative policy: delivery context, target audience profile including role/average age/job/industry/topic familiarity/decision power, STP strategy, decision context and objections, and 3+ pain-point to solution mappings with expected aha moments. Do not surface a prequestion sheet. Presentation design must be simple, restrained, and information-first: avoid over-designed decoration, ornamental gradients, nested cards, and effects that compete with the message. Design detail should be embedded through typography hierarchy, spacing, alignment, thin rules, source clarity, and subtle accents. ${pptPipelineAllowlistPolicyText()} Use Product Design plugin first for context, ideation, prototype direction, audit, design QA, and share handoff. Use design.md only as an existing project-local cache or fallback SSOT when Product Design is unavailable; if fallback creation is needed, use docs/Design-Sys-Prompt.md plus getdesign-reference and curated DESIGN.md examples from ${AWESOME_DESIGN_MD_REFERENCE.url} only as source inputs, then fuse them into route-local PPT style tokens with a recorded design_ssot instead of treating references as parallel authorities. The $PPT route always loads imagegen as a required skill, checks Codex App imagegen at route start, and runs SKS auto-repair once before any image-dependent build/review work. If repair fails, stop with codex_imagegen_unavailable and do not continue with image-free or API-substituted evidence. When the sealed contract needs a generated raster asset or generated slide visual critique, immediately invoke Codex App \`$imagegen\` with gpt-image-2, move/copy the selected output into the mission assets or review evidence path, and record the real file path in ppt-image-asset-ledger.json or ppt-review-ledger.json before building or passing the gate. Direct API fallback, placeholder files, HTML/CSS stand-ins, and prose-only substitutes do not satisfy the route gate. ${productDesignPluginPolicyText()} ${CODEX_IMAGEGEN_REQUIRED_POLICY} Use web or Context7 evidence only when external facts/libraries/current docs are required by the PPT contract, record verified claims in ppt-fact-ledger.json, record generated image asset plans/results/blockers in ppt-image-asset-ledger.json, then create the PDF plus editable source HTML under source-html/, keep independent strategy/render/file-write phases parallel where inputs allow, record ppt-parallel-report.json, run the bounded ppt-review-policy/ppt-review-ledger/ppt-iteration-report loop, and verify readability, overlap, format fit, source coverage, export state, unsupported-claim status, image-asset completion, review-loop termination, and temporary build files cleanup. Finish with reflection and Honest Mode.\n`,
    'computer-use-fast': `---\nname: computer-use-fast\ndescription: Alias for the maximum-speed $Computer-Use/$CU native Codex Computer Use lane.\n---\n\nUse the same rules as computer-use: skip Team debate, QA-LOOP clarification, upfront TriWiki refresh, Context7, subagents, and reflection unless explicitly requested. Use Codex Computer Use directly only for native macOS, desktop-app, OS-settings, or non-web visual tasks. Browser, localhost, website, webapp, and web-based app verification must use the Codex Chrome Extension path first and must halt if that extension is not installed/enabled. At the end only, refresh/pack TriWiki, validate it, then provide a concise completion summary plus Honest Mode. ${CODEX_WEB_VERIFICATION_POLICY} ${CODEX_COMPUTER_USE_ONLY_POLICY}\n`,
    'cu': `---\nname: cu\ndescription: Short alias for the maximum-speed native $Computer-Use Codex Computer Use lane.\n---\n\nUse the same rules as computer-use. This is a speed lane for native macOS, desktop-app, OS-settings, and non-web visual tasks requiring Codex Computer Use evidence, with TriWiki refresh/validate and Honest Mode deferred to final closeout. Web/browser/webapp verification must use Codex Chrome Extension first and stop if the extension is not installed/enabled. ${CODEX_WEB_VERIFICATION_POLICY} ${CODEX_COMPUTER_USE_ONLY_POLICY}\n`,
    'goal': `---\nname: goal\ndescription: Fast $Goal/$goal bridge overlay for Codex native persisted /goal workflows.\n---\n\nUse when the user invokes $Goal/$goal or asks to persist a workflow with Codex native /goal continuation. Prepare with sks goal create or the $Goal route, write only the lightweight bridge artifacts, then use native Codex /goal create, pause, resume, and clear controls where available. Goal does not replace Team, QA, DB, or other SKS execution routes; continue implementation through the selected route and use Context7 only when external API/library docs are involved. Do not recreate the old no-question loop.\n`,
    'release-review': `---\nname: release-review\ndescription: Native release review route for $Release-Review multi-session agent release audits.\n---\n\nUse only when the user invokes $Release-Review or asks for release-readiness review with native multi-session agents. Prefer \`sks agent run \"release audit\" --route \"$Release-Review\" --agents <n> --concurrency <n> --mock --json\` for deterministic fixtures and remove \`--mock\` only when real backend evidence is intended. Manual scaling is explicit: \`--agents N\` controls total agents and \`--concurrency M\` controls simultaneous sessions; keep leases/no-overlap proof, agent-central-ledger.json, agent-task-board.json, agent-effort-policy.json, agent-proof-evidence.json, and agent-session-cleanup.json. Dynamic effort is assigned by the main session per slice; parent owns integration and final release claims. Removed legacy multi-agent commands do not satisfy release collaboration proof. Finish with release-readiness verification and Honest Mode.\n`,
    'commit': `---\nname: commit\ndescription: Simple git-only route for $Commit requests that stage current changes and create one commit without the full SKS pipeline.\n---\n\nUse only when the user invokes $Commit or explicitly asks to commit the current repository changes without pushing. Keep this route lightweight: inspect git status and the relevant diff summary, avoid Team/pipeline/TriWiki route work unless separately requested, stage the intended current changes, and create one git commit. The commit message must summarize the actual work and include exactly one trailer: Co-authored-by: Codex <noreply@openai.com>. Do not push. If there are no changes, report that no commit was created. Finish with a concise result and a one-line Honest Mode covering the commit hash and any unverified items.\n`,
    'commit-and-push': `---\nname: commit-and-push\ndescription: Simple git-only route for $Commit-And-Push requests that stage current changes, create one commit, and push without the full SKS pipeline.\n---\n\nUse only when the user invokes $Commit-And-Push or explicitly asks to commit and push the current repository changes. Keep this route lightweight: inspect git status and the relevant diff summary, avoid Team/pipeline/TriWiki route work unless separately requested, stage the intended current changes, create one git commit, then push the current branch. The commit message must summarize the actual work and include exactly one trailer: Co-authored-by: Codex <noreply@openai.com>. If there are no changes, do not create an empty commit unless the user explicitly asks for one. Finish with a concise result and a one-line Honest Mode covering the commit hash, pushed branch, and any unverified items.\n`,
    'research': `---\nname: research\ndescription: Dollar-command route for $Research or $research frontier discovery workflows.\n---\n\nUse when the user invokes $Research/$research or asks for research, hypotheses, new mechanisms, falsification, or testable predictions. Prefer sks research prepare and sks research run. Research is not an implementation route: do not edit repository source, docs, package metadata, generated skills, or harness files; write only route-local mission artifacts under .sneakoscope/missions/<mission-id>/. Run the genius-lens agent council with named persona-inspired cognitive roles: Einstein Agent, Feynman Agent, Turing Agent, von Neumann Agent, and Skeptic Agent. These are lenses only; do not impersonate the historical people. Every Research agent ledger row must include display_name, persona, persona_boundary, effort=xhigh, reasoning_effort=xhigh, service_tier when available, one literal "Eureka!" idea, falsifiers, cheap_probes, and challenge_or_response before synthesis. This is not a fixed three-cycle route: repeat source gathering, Eureka ideas, evidence-bound debate, falsification, and synthesis pressure until every agent records final agreement, or until the explicit max-cycle safety cap pauses with an unpassed gate. Create research-source-skill.md as a route-local Skill Creator artifact, then maximize layered public web/source search across latest papers, official/government or leading-institution data, standards/primary docs, current news, public discourse, developer/practitioner sources, traditional background sources, and counterevidence before synthesis. Record research-source-skill.md, source-ledger.json, agent-ledger.json, debate-ledger.json, novelty-ledger.json, falsification-ledger.json, research-report.md, research-paper.md, genius-opinion-summary.md, and research-gate.json. debate-ledger.json must include consensus_iterations, unanimous_consensus, and per-agent agreements; research-gate.json cannot pass until unanimous_consensus=true with every agent agreement recorded. Context7 is optional and only needed when the research topic depends on external package/API/framework docs; do not use it as the default research evidence layer. Normal Research may take one or two hours when needed; favor real source collection, cross-layer comparison, falsification, and a concise paper manuscript over speed. Do not use --mock except for selftests or dry harness checks; if live source execution is unavailable, record a blocker and keep the gate unpassed. Do not use for ordinary code edits.\n`,
    'autoresearch': `---\nname: autoresearch\ndescription: Dollar-command route for $AutoResearch or $autoresearch iterative experiment loops.\n---\n\nUse for $AutoResearch, iterative improvement, ranking, workflow, benchmark, or experiments. Define program, hypothesis, experiment, metric, keep/discard, falsification, next step, and Honest Mode. Do not become the parent identity for SEO/GEO; $SEO-GEO-OPTIMIZER may call research as a child stage for query, market, or competitor discovery while keeping the parent mission, gate, and Completion Proof on $SEO-GEO-OPTIMIZER.\n`,
    'db': `---\nname: db\ndescription: Dollar-command route for $DB or $db database and Supabase safety checks.\n---\n\nUse when the user invokes $DB/$db or the task touches SQL, Supabase, Postgres, migrations, Prisma, Drizzle, Knex, MCP database tools, or production data. Run or follow sks db policy, sks db scan, sks db classify, and sks db check. Destructive database operations remain forbidden.\n`,
    'mad-db': `---\nname: mad-db\ndescription: Deprecated $MAD-DB compatibility alias; merged into mad-sks.\n---\n\n$MAD-DB and \`sks mad-db run|exec|apply-migration\` are deprecated aliases for MAD-SKS sql-plane. Warn the operator, translate to \`sks mad-sks sql|apply-migration\`, and follow the mad-sks skill as the single current authority.\n`,
    'mad-sks': `---\nname: mad-sks\ndescription: Explicit high-risk authorization modifier plus merged SQL-plane executor for $MAD-SKS.\n---\n\nUse only when the user explicitly invokes $MAD-SKS, top-level sks --mad, or \`sks mad-sks plan|run|apply|sql|apply-migration|status|close|rollback-apply\`. MAD-SKS is the single high-risk MAD route: it combines scoped permission widening across approved target-project surfaces with the former MAD-DB SQL-plane execution model. It can be combined with another route, such as $MAD-SKS $Team or $DB ... $MAD-SKS; in that case the other command remains the primary workflow and MAD-SKS is the temporary permission grant or sql-plane executor. The widened permission applies only while the active mission gate is open, must be deactivated when the task ends, and can open approved scopes such as target-project file writes, shell commands, package installs, local service control, network operations, browser/Computer Use workflows, generated assets, file permissions, migrations, Supabase MCP database writes, column/schema cleanup, direct execute SQL, and normal targeted DB writes.\n\nMerged SQL-plane policy from mad-db:\n${mergedMadDbSqlPlanePolicy}\n\nCatastrophic SQL boundary: TRUNCATE, all-row UPDATE/DELETE, table/schema/database DROP, and equivalent reset operations are allowed only through the sql-plane executor and only when the user's prompt or CLI SQL statement literally names that operation. Other MAD-SKS executors, including db-write, keep those catastrophic categories blocked. Whole database/schema/table removal outside sql-plane, dangerous project/branch management, credential exfiltration, persistent security weakening, destructive delete without explicit confirmation, and unrequested fallback implementation remain blocked. Do not carry MAD-SKS permission into later prompts or routes. The permission profile source is centralized in src/core/permission-gates.ts and emitted as dist/core/permission-gates.js so skill/hook/MCP-style gates share one decision function.\n`,
    'gx': `---\nname: gx\ndescription: Dollar-command route for $GX or $gx deterministic GX visual context cartridges.\n---\n\nUse when the user invokes $GX/$gx or asks for architecture/context visualization through SKS. Prefer sks gx init, render, validate, drift, and snapshot. vgraph.json remains the source of truth.\n`,
    'help': `---\nname: help\ndescription: Dollar-command route for $Help or $help explaining installed SKS commands and workflows.\n---\n\nUse when the user invokes $Help/$help or asks what commands exist. Prefer concise output from sks commands, sks usage <topic>, sks quickstart, sks aliases, and sks codex-app.\n`,
    'prompt-pipeline': `---\nname: prompt-pipeline\ndescription: Default SKS prompt optimization pipeline for execution prompts; Answer and DFix bypass it.\n---\n\nClassify intent: Answer only for real questions; question-shaped implicit instructions, complaints, and mandatory-policy statements route to Team. DFix handles Direct Fix work: tiny copy/config/docs/labels/spacing/translation/simple mechanical edits; code and broad implementation default to Team unless safety/research/GX route fits. Infer goal, target, constraints, acceptance, risk, and smallest safe route from prompt, TriWiki/current-code defaults, and conservative SKS policy. Do not surface a prequestion sheet. Materialize pipeline-plan.json for the runtime lane, kept/skipped stages, no-fallback invariant, lean_decision, and verification; inspect with sks pipeline plan, adding --proof-field when changed files are known. Code work surfaces route/guard/scopes, materializes team-roster.json from default or explicit counts before implementation, compiles concrete Team runtime graph/inbox artifacts after consensus, and parent owns integration/tests/Context7/Honest Mode. ${leanEngineeringCompactText()} ${outcomeRubricPolicyText()} ${speedLanePolicyText()} ${solutionScoutPolicyText('fix this broken behavior')} ${skillDreamPolicyText()}\n\n${chatCaptureIntakeText()}\n\nDesign: non-PPT UI/UX uses Product Design plugin first; legacy design.md/design-system-builder/design-ui-editor/design-artifact-expert/getdesign-reference are fallback only when the plugin is unavailable or an existing project design.md must be respected. Use imagegen for image/logo/raster, and imagegen must prefer Codex App built-in image generation (${CODEX_APP_IMAGE_GENERATION_DOC_URL}) before API generation. ${productDesignPluginPolicyText()} ${CODEX_IMAGEGEN_REQUIRED_POLICY} For UI/UX review/audit requests that mention image generation, gpt-image-2, callouts, or annotated review images, route to $Image-UX-Review/$UX-Review and require generated annotated review image evidence before issue extraction; do not satisfy that route with text-only critique. For $PPT, ${pptPipelineAllowlistPolicyText()} ${getdesignReferencePolicyText()} TriWiki context-tracking SSOT: .sneakoscope/wiki/context-pack.json; read only the latest coordinate+voxel overlay pack before every route stage, run sks wiki refresh/pack after changes, validate before handoffs/final.\n`,
    [SOLUTION_SCOUT_SKILL_NAME]: `---\nname: ${SOLUTION_SCOUT_SKILL_NAME}\ndescription: Web-similarity scout hook for SKS problem-solving and repair requests.\n---\n\n${solutionScoutPolicyText('fix this broken behavior')}\n\nUse this as a pipeline hook, not as a standalone route: when a user asks to solve, fix, repair, troubleshoot, or investigate broken behavior, search first for similar resolution cases, summarize the useful patterns with sources, then combine them with current repo evidence before editing. If browsing is unavailable, mark the external scout unverified and continue with local evidence only.\n`,
    'reasoning-router': `---\nname: reasoning-router\ndescription: Temporary SKS reasoning-effort routing for every command and pipeline route.\n---\n\nmedium: simple copy/color/discovery/setup/mechanical edits. high: logic, safety, architecture, DB, orchestration, refactor, multi-file work. xhigh: research, AutoResearch, falsification, benchmarks, SEO/GEO, open-ended discovery, and From-Chat-IMG image work-order analysis. Routing is temporary; return to default after the gate. Inspect with sks reasoning and sks pipeline status.\n`,
    'pipeline-runner': `---\nname: pipeline-runner\ndescription: Execute SKS dollar-command routes as stateful pipelines with mission artifacts, route gates, Context7 evidence, temporary reasoning routing, reflection, and Honest Mode.\n---\n\nEvery $ command is a route. Use current.json, mission artifacts, and pipeline-plan.json as the execution plan: it records the lane, skipped stages, kept stages, verification, lean_decision, and no-unrequested-fallback invariant. Use temporary reasoning, TriWiki before stages, source hydration, Context7 when required, Team cleanup before reflection, reflection for full routes, and completion summary plus Honest Mode before final. Surface guard/scopes, record evidence, refresh/pack/validate TriWiki, and check sks pipeline status/resume/plan. ${leanEngineeringCompactText()} ${speedLanePolicyText()} ${skillDreamPolicyText()}\n`,
    'context7-docs': `---\nname: context7-docs\ndescription: Enforce Context7 MCP documentation evidence for SKS routes that depend on external libraries, frameworks, APIs, MCPs, package managers, DB SDKs, or generated docs.\n---\n\nWhen required, resolve-library-id, then query-docs for the resolved id. Legacy get-library-docs evidence is accepted. Prefer sks context7 tools/resolve/docs/evidence and finish only after both evidence stages exist. Check setup with sks context7 check.\n`,
    'super-search': `---\nname: super-search\ndescription: Dollar-command route for $Super-Search provider-independent source intelligence.\n---\n\nUse when the user invokes $Super-Search or asks for Super-Search source intelligence, source acquisition, X-search-style collection, URL acquisition, source normalization, claim ledgers, or citation proof. Prefer \`sks super-search doctor --json\` for readiness and \`sks super-search run "<query>" --mode balanced --json\` for provider-independent source proof; use \`sks super-search x "<query>" --json\` for X-search intent and \`sks super-search fetch "<url>" --json\` for URL acquisition. Context7 is required only when the query depends on current package/API/framework/MCP/generated documentation behavior. xAI/Grok credentials are optional and must not be required for route readiness. Evidence/artifacts remain under \`.sneakoscope/missions/<super-search-* or route mission>/super-search/\`: intent.json, axes.json, query-variants.json, provider-plan.json, source-ledger.json, lead-ledger.json, claim-ledger.json, attempt-ledger.json, synthesis.md, super-search-proof.json, super-search-gate.json, and super-search-result.json. Do not turn weak discovery into supported claims; finish with an Honest Mode summary of verified sources, blockers, and unverified external coverage.\n`,
    'search-visibility-core': `---\nname: search-visibility-core\ndescription: Shared kernel for seo-geo-optimizer audit, plan, explicit apply, rollback, verification, gates, and Completion Proof.\n---\n\nPurpose: keep Search Engine Optimization and Generative Engine Optimization on one typed search-visibility kernel instead of duplicate implementations. Use when $SEO-GEO-OPTIMIZER or \`sks seo-geo-optimizer\` is selected. Workflow: doctor detects package/static/Next evidence; audit writes source-backed inventory and findings; plan compiles safe mutation operations; apply requires explicit \`--apply\`; verify separates source, build, HTTP, browser, production, and measured outcome; rollback only reverses mission-owned operations. Safety: default read-only, never overwrite unmanaged robots.txt, sitemap, llms.txt, metadata, or structured data; do not hard-code customer routes; do not invent prices, reviews, availability, rankings, traffic, or AI citation outcomes. Evidence/artifacts: search-visibility/intake.json, adapter-detection.json, site-inventory.json, route-graph.json, robots-policy.json, structured-data-ledger.json, mutation-plan.json, mutation-journal.jsonl, rollback-manifest.json, verification-report.json, route gate, and completion-proof.json. Failure/recovery: unsupported frameworks stay audit/plan-only; missing production/browser/Search Console evidence remains unverified, not fabricated. CLI entrypoint: \`sks seo-geo-optimizer ... --mode seo|geo\`.\n`,
    'seo-geo-optimizer': `---\nname: seo-geo-optimizer\ndescription: Unified $SEO-GEO-OPTIMIZER route for Search Engine Optimization and Generative Engine Optimization.\n---\n\nPurpose: use one route name for SEO and GEO work while keeping the internal search-visibility mode explicit. Use when: the user asks for SEO audit/fix/verification, package/npm/GitHub search visibility, canonical, sitemap, robots.txt, hreflang, metadata, structured data, AI answer visibility, LLM citation readiness, answerability, entity/claim provenance, crawler policy, OAI-SearchBot/GPTBot/ChatGPT-User, Claude-SearchBot/ClaudeBot/Claude-User, or optional llms.txt planning. GEO means Generative Engine Optimization, not geolocation, GeoIP, maps, CDN geography, location permission, or regional redirect bugs. Workflow: run \`sks seo-geo-optimizer doctor --mode seo|geo\`, then audit, plan, explicit apply, verify, status, and rollback. Use \`--mode seo\` for technical/package search optimization and \`--mode geo\` for entity facts, claim evidence, answerability, crawler policy, and optional llms.txt. Safety: audit and plan must not mutate source; apply checks base hashes, ownership, scope, protected paths, rollback manifest, and post-verify. AI crawler policy must split search, training, user-directed retrieval, and ads/other; never use one allow_ai toggle and never auto-allow training crawlers. Evidence/artifacts: site-inventory.json, route-graph.json, seo-findings.json or geo-findings.json, entity-facts.json, claim-evidence-ledger.json, answerability-report.json, ai-crawler-policy.json, llms-txt-plan.json, mutation-plan.json, verification-report.json, seo-gate.json or geo-gate.json, completion-proof.json. Failure/recovery: unsupported frameworks stay plan-only; browser/production/Search Console/analytics outcomes are marked unverified when not actually run. Forbidden claims: no ranking, indexing, traffic lift, rich-result, answer inclusion, or AI citation guarantee; no keyword stuffing, doorway pages, fake reviews, fake prices, fake availability, fake shipping, fake awards, hidden AI-only text, or scaled spam. CLI entrypoint: \`sks seo-geo-optimizer doctor|audit|plan|apply|verify|status|rollback|fixture --mode seo|geo\`.\n`,
    'reflection': `---\nname: reflection\ndescription: Post-route self-review for full SKS routes that records real misses, gaps, and corrective lessons into TriWiki memory.\n---\n\nUse after full route work/tests and before final. DFix, Answer, Help, Wiki, SKS discovery are exempt. Do not invent faults. Write reflection.md; append real lessons to ${REFLECTION_MEMORY_PATH}; refresh/pack, validate context-pack.json, pass reflection-gate.json.\n\n${reflectionInstructionText()}\n`,
    'honest-mode': `---\nname: honest-mode\ndescription: Required final SKS verification pass before claiming a task is complete.\n---\n\nBefore final: include a completion summary explaining what was done, what changed for the user/repo, what was verified, and what remains unverified or blocked. Then restate the goal, compare result to evidence, list tests/commands/inspections, state uncertainty or blockers plainly, and do not claim completion beyond evidence. Full routes must pass reflection-gate.json first. Include concise SKS Honest Mode or 솔직모드 when required.\n`,
    'autoresearch-loop': `---\nname: autoresearch-loop\ndescription: Iterative AutoResearch-style loop for open-ended improvement, discovery, prompt, ranking, SEO/GEO, and workflow-quality tasks.\n---\n\nUse for research, ranking, prompt/workflow improvement, benchmark gains, or repeated refinement. Loop: program, hypothesis, smallest falsifying experiment, metric, keep/discard, falsify, next step. Keep a ledger and do not claim improvement without evidence.\n`,
    'hproof-claim-ledger': `---\nname: hproof-claim-ledger\ndescription: Extract atomic claims and classify support status.\n---\n\nEvery factual statement must become an atomic claim. Unsupported critical claims cannot be used for implementation or final answer. Database claims require DB safety evidence.\n`,
    'hproof-evidence-bind': `---\nname: hproof-evidence-bind\ndescription: Bind claims to code, tests, decision contract, vgraph, beta, wiki, or GX render evidence.\n---\n\nEvidence priority: current code/tests, decision-contract.json, vgraph.json, beta.json, GX snapshot/render metadata, LLM Wiki coordinate index, user prompt. Database claims must respect .sneakoscope/db-safety.json. Wiki claims should carry id, hash, source path, and RGBA/trig coordinate anchors so they can be hydrated instead of treated as unsupported summaries.\n`,
    'db-safety-guard': `${dbSafetyGuardSkillText()}\n`,
    'gx-visual-generate': `---\nname: gx-visual-generate\ndescription: Render a deterministic SVG/HTML visual sheet from vgraph.json and beta.json.\n---\n\nUse sks gx render. vgraph.json is source of truth; renders embed source hash and RGBA wiki anchors.\n`,
    'gx-visual-read': `---\nname: gx-visual-read\ndescription: Read a Sneakoscope Codex deterministic visual sheet and produce context notes.\n---\n\nExtract nodes, edges, invariants, tests, risks, uncertainties, and RGBA anchors from source/render/snapshot. Do not infer hidden nodes.\n`,
    'gx-visual-validate': `---\nname: gx-visual-validate\ndescription: Validate render metadata against vgraph.json and beta.json.\n---\n\nRun sks gx validate and drift; fail stale or incomplete hashes, nodes, edges, invariants, or anchors.\n`,
    'turbo-context-pack': `---\nname: turbo-context-pack\ndescription: Build ultra-low-token context packet with Q4 bits, Q3 tags, top-K claims, and minimal evidence.\n---\n\nDefault to Q4/Q3 plus TriWiki RGBA anchors and attention.use_first. Add Q2/Q1 only when needed or when attention.hydrate_first says source hydration is required. Keep id, hash, path, and coordinate tuple for hydration.\n`,
    'research-discovery': `---\nname: research-discovery\ndescription: Run SKS Research Mode for frontier-style research, hypotheses, novelty ledgers, falsification, and experiments.\n---\n\nFrame criteria, map assumptions, run maximum available web/source search, generate xhigh agent intake findings through Einstein Agent, Feynman Agent, Turing Agent, von Neumann Agent, and Skeptic Agent persona-inspired lenses, require each agent to record display_name/persona/persona_boundary plus a literal "Eureka!" idea, run evidence-bound debate, falsify, keep surviving insights, and record source ids, novelty/confidence/falsifiers/next experiments. Do not impersonate historical people and do not overclaim.\n`,
    'performance-evaluator': `---\nname: performance-evaluator\ndescription: Evaluate SKS performance, token-saving, accuracy-proxy, context-compression, or workflow improvements.\n---\n\nUse sks eval run/compare before claims. Report token_savings_pct, accuracy_delta/proxy, required_recall, support, and meaningful_improvement.\n`,
    'image-ux-review': imageUxReviewSkill('image-ux-review'),
    'ux-review': imageUxReviewSkill('ux-review'),
    'visual-review': imageUxReviewSkill('visual-review'),
    'ui-ux-review': imageUxReviewSkill('ui-ux-review'),
    'imagegen': `---\nname: imagegen\ndescription: Required bridge to Codex App built-in image generation for logos, image assets, raster visuals, and image edits.\n---\n\nUse for generated or edited image assets: logo, product image, illustration, sprite, mockup, texture, cutout, or bitmap. Prefer the official Codex App built-in image generation feature documented at ${CODEX_APP_IMAGE_GENERATION_DOC_URL}: ask naturally or invoke \`$imagegen\`. SKS route code checks capability before image-dependent routes, attempts doctor imagegen repair once, and reports codex_imagegen_unavailable if Codex App $imagegen still is not ready. For newest-model requests, make the prompt explicit: "Use ChatGPT Images 2.0 / GPT Image 2.0 with gpt-image-2." Useful official references are ${OPENAI_CHATGPT_IMAGES_2_DOC_URL}, ${OPENAI_GPT_IMAGE_2_MODEL_DOC_URL}, and ${OPENAI_IMAGE_GENERATION_DOC_URL}. Codex App image generation counts against Codex usage limits. Capability detection is not output proof; full SKS evidence requires a real selected raster output path or generated review image artifact. Direct OpenAI API fallback is non-Codex evidence and does not satisfy SKS route evidence unless a separate non-Codex API task is explicitly requested. ${IMAGEGEN_SOCIAL_SOURCE_POLICY} ${CODEX_IMAGEGEN_REQUIRED_POLICY} Do not substitute placeholder SVG/HTML/CSS for requested raster assets; follow design.md when relevant.\n`,
    'imagegen-source-scout': `---\nname: imagegen-source-scout\ndescription: Source scout for current GPT Image 2.0/gpt-image-2 prompt guidance, official docs, and X/social workflow signals.\n---\n\nUse when the user asks for the latest imagegen docs, ChatGPT Images 2.0 / GPT Image 2.0 / gpt-image-2 behavior, X/social reactions, prompt examples, or community workflow hints before creating an image prompt or SKS imagegen policy. Source order: official OpenAI announcement (${OPENAI_CHATGPT_IMAGES_2_DOC_URL}), Codex App image generation docs (${CODEX_APP_IMAGE_GENERATION_DOC_URL}), gpt-image-2 model docs (${OPENAI_GPT_IMAGE_2_MODEL_DOC_URL}), OpenAI Image Generation API docs (${OPENAI_IMAGE_GENERATION_DOC_URL}), then public X/social/community search for prompt-quality heuristics only. ${IMAGEGEN_SOCIAL_SOURCE_POLICY} If X/Grok or web search is unavailable, record that social coverage is unverified and continue from official docs. Output a compact evidence split: official capability/evidence rules, prompt heuristics, social/workflow signals, and blockers. Do not generate images itself; pair this with the imagegen skill for actual raster output.\n`,
    'getdesign-reference': `---\nname: getdesign-reference\ndescription: Use getdesign.md official design reference as an input to the design.md SSOT for UI/UX, presentation, and HTML/PDF systems.\n---\n\nUse when creating or improving design.md, UI/UX design systems, deck-like HTML artifacts, presentation PDFs, or brand-inspired visual systems. design.md is the only design decision SSOT; reference ${GETDESIGN_REFERENCE.url}, ${GETDESIGN_REFERENCE.docs_url}, and ${AWESOME_DESIGN_MD_REFERENCE.url} only as source inputs to synthesize or update that SSOT or a route-local style-token artifact. Prefer the official Codex skill if available with \`${GETDESIGN_REFERENCE.codex_skill_install}\`. If the skill CLI is unavailable, use this generated skill plus official docs/API/CLI/SDK references and curated DESIGN.md examples as inputs. Do not claim getdesign MCP is configured unless a current official MCP surface is actually installed.\n`,
    'design-system-builder': `---\nname: design-system-builder\ndescription: Legacy fallback to create design.md from docs/Design-Sys-Prompt.md only when Product Design plugin is unavailable or explicit local SSOT is required.\n---\n\nUse Product Design plugin first. Only when the plugin is unavailable or the route explicitly needs a local fallback SSOT, read docs/Design-Sys-Prompt.md as the builder prompt, inspect product/UI context, and use getdesign-reference, official getdesign.md docs, and curated DESIGN.md examples from ${AWESOME_DESIGN_MD_REFERENCE.url} only as source inputs. Fuse those inputs into one design.md fallback/cache with tokens, components, states, imagery, accessibility, and verification rules; do not leave multiple design files or references as competing authorities. Use the plan tool only for real ambiguity plus default font recommendation. Use imagegen for assets. ${productDesignPluginPolicyText()} ${CODEX_IMAGEGEN_REQUIRED_POLICY}\n`,
    'design-ui-editor': `---\nname: design-ui-editor\ndescription: Legacy fallback UI/UX editor for existing design.md systems when Product Design plugin is unavailable.\n---\n\nUse Product Design plugin first. When falling back, read \`design.md\`, inspect relevant UI/assets/tests, consult getdesign-reference when improving the design system, apply the smallest design-system-conformant change, use imagegen for image/logo/raster assets, and verify render quality. ${productDesignPluginPolicyText()} ${CODEX_IMAGEGEN_REQUIRED_POLICY} If design.md is missing and Product Design is unavailable, use design-system-builder as fallback.\n`,
    'design-artifact-expert': `---\nname: design-artifact-expert\ndescription: Legacy fallback for high-fidelity HTML/UI/prototype artifacts when Product Design plugin cannot be used.\n---\n\nUse Product Design plugin first for design/UI/prototype work. When falling back, read design.md when present, consult getdesign-reference for design-system grounding, build the usable artifact first, preserve state, verify overlap/readability/responsiveness, and use imagegen for required assets. ${productDesignPluginPolicyText()} ${CODEX_IMAGEGEN_REQUIRED_POLICY}\n`
  };
  const nonCoreSkillNames = Object.keys(skills).filter((name) => !isCoreSkillName(name));
  for (const [name, content] of Object.entries(skills)) {
    if (isCoreSkillName(name)) continue;
    const dir = path.join(root, '.agents', 'skills', name);
    const skillContent = markManagedSkill(name, enrichSkillContent(name, content));
    const existingText = await readText(path.join(dir, 'SKILL.md'), null);
    if (typeof existingText === 'string' && !isSksManagedOrGeneratedOfficialSkill(existingText)) {
      await quarantineSkillDir(root, dir, name, 'global-official-name-user-collision');
    }
    await ensureDir(dir);
    await writeTextAtomic(path.join(dir, 'SKILL.md'), `${skillContent.trim()}\n`);
    await writeSkillMetadata(dir, name);
  }
  const coreManifest = buildSksCoreSkillManifest();
  const coreByName = new Map(coreManifest.skills.map((skill) => [skill.canonical_name, skill.content_sha256]));
  const coreIntegrity = await syncCoreSkillsIntegrity({
    root,
    apply: true,
    skillsRoot: path.join(root, '.agents', 'skills'),
    reportPath: path.join(root, '.sneakoscope', 'reports', 'core-skill-integrity.json')
  });
  const managedCoreSkillNames = coreIntegrity.rows
    .filter((row) => row.after_sha256 === coreByName.get(row.canonical_name) && row.action !== 'skip-user-authored')
    .map((row) => row.canonical_name);
  for (const name of managedCoreSkillNames) {
    await writeSkillMetadata(path.join(root, '.agents', 'skills', name), name);
  }
  const skillNames = [...nonCoreSkillNames, ...managedCoreSkillNames];
  const removedStaleGeneratedSkills = await removeStaleGeneratedSkillsFromManifest(root, skillNames);
  const removedPluginSkillCollisions = await removeGeneratedPluginSkillCollisions(root);
  await writeGeneratedSkillManifest(root, skillNames);
  return {
    installed_skills: skillNames,
    generated_files: generatedSkillFiles(skillNames),
    core_skill_integrity: {
      ok: coreIntegrity.ok,
      template_version: coreIntegrity.template_version,
      installed_count: coreIntegrity.installed_count,
      restored_count: coreIntegrity.restored_count,
      user_collision_count: coreIntegrity.user_collision_count,
      report: '.sneakoscope/reports/core-skill-integrity.json'
    },
    removed_stale_generated_skills: [...removedStaleGeneratedSkills, ...removedPluginSkillCollisions].sort(),
    removed_agent_skill_aliases: await removeGeneratedAgentSkillAliases(root, skillNames),
    removed_codex_skill_mirrors: await removeGeneratedCodexSkillMirrors(root, skillNames)
  };
}

export interface SkillReconcileReport {
  schema: 'sks.skill-reconcile.v1';
  scope: 'global' | 'project';
  target_dir: string;
  fix: boolean;
  installed: string[];
  updated: string[];
  removed: string[];
  preserved_forge: string[];
  preserved_user: string[];
  quarantined_user_collisions: string[];
  warnings: string[];
  installed_skills?: string[];
  generated_files?: string[];
  core_skill_integrity: {
    ok: boolean;
    template_version?: string;
    installed_count: number;
    restored_count: number;
    user_collision_count?: number;
    report?: string;
  };
  removed_stale_generated_skills?: string[];
  removed_agent_skill_aliases?: string[];
  removed_codex_skill_mirrors?: string[];
}

export async function installGlobalSkills(home: string): Promise<SkillReconcileReport> {
  return reconcileSkills({ targetDir: path.join(home, '.agents', 'skills'), scope: 'global', fix: true });
}

export async function installProjectSkills(root: string): Promise<SkillReconcileReport> {
  return reconcileSkills({ targetDir: path.join(root, '.agents', 'skills'), scope: 'project', fix: true });
}

export async function installSkills(root: any) {
  return installGlobalSkills(root);
}

export async function reconcileSkills(opts: {
  targetDir: string;
  scope: 'global' | 'project';
  fix: boolean;
}): Promise<SkillReconcileReport> {
  const targetDir = path.resolve(opts.targetDir);
  const root = rootFromSkillsDir(targetDir);
  const manifest = await loadSkillsManifest();
  const officialNames = new Set<string>(manifest.skills.map((skill: any) => canonicalSkillNameFromValue(skill.canonical_name)));
  const aliasNames = new Set<string>(manifest.skills.flatMap((skill: any) => (skill.deprecated_aliases || []).map((name: any) => canonicalSkillNameFromValue(name))));
  const removedNames = new Set<string>((manifest.removed_skills || []).map((name: any) => canonicalSkillNameFromValue(name)));
  const report: SkillReconcileReport = {
    schema: 'sks.skill-reconcile.v1',
    scope: opts.scope,
    target_dir: targetDir,
    fix: opts.fix === true,
    installed: [],
    updated: [],
    removed: [],
    preserved_forge: [],
    preserved_user: [],
    quarantined_user_collisions: [],
    warnings: [],
    core_skill_integrity: { ok: true, installed_count: 0, restored_count: 0, user_collision_count: 0 }
  };
  await ensureDir(targetDir);
  const existing = await listSkillDirs(targetDir);

  if (opts.scope === 'project') {
    await reconcileProjectSkillEntries(root, targetDir, existing, officialNames, aliasNames, removedNames, report, opts.fix);
    const legacyCodexSkillsDir = path.join(root, '.codex', 'skills');
    if (path.resolve(legacyCodexSkillsDir) !== targetDir) {
      const legacyEntries = await listSkillDirs(legacyCodexSkillsDir);
      if (legacyEntries.length) await reconcileProjectSkillEntries(root, legacyCodexSkillsDir, legacyEntries, officialNames, aliasNames, removedNames, report, opts.fix);
      await removeDirIfEmpty(legacyCodexSkillsDir);
    }
    if (opts.fix) await pruneProjectGeneratedManifest(targetDir);
    report.installed_skills = [];
    report.generated_files = [];
    report.removed_stale_generated_skills = [...report.removed];
    report.removed_agent_skill_aliases = [];
    report.removed_codex_skill_mirrors = [];
    report.core_skill_integrity = { ok: true, installed_count: 0, restored_count: 0, user_collision_count: 0 };
    await removeDirIfEmpty(targetDir);
    await removeDirIfEmpty(path.dirname(targetDir));
    return report;
  }

  const before = new Map(existing.map((entry) => [entry.canonical, entry.hash]));
  let install: any = null;
  if (opts.fix) {
    install = await installOfficialSkills(root);
    report.installed.push(...(install.installed_skills || []));
    report.removed.push(...(install.removed_stale_generated_skills || []));
  } else {
    for (const skill of manifest.skills) {
      if (!before.has(canonicalSkillNameFromValue(skill.canonical_name))) report.installed.push(skill.canonical_name);
    }
  }
  const after = await listSkillDirs(targetDir);
  for (const entry of after) {
    const oldHash = before.get(entry.canonical);
    if (oldHash && oldHash !== entry.hash) report.updated.push(entry.name);
  }
  if (opts.fix) await writePackagedSkillManifest(targetDir, await generatePackagedSkillsManifest());
  report.installed_skills = install?.installed_skills || [...report.installed];
  report.generated_files = install?.generated_files || generatedSkillFiles(report.installed_skills);
  report.core_skill_integrity = install?.core_skill_integrity || { ok: true, installed_count: 0, restored_count: 0, user_collision_count: 0 };
  report.removed_stale_generated_skills = install?.removed_stale_generated_skills || [...report.removed];
  report.removed_agent_skill_aliases = install?.removed_agent_skill_aliases || [];
  report.removed_codex_skill_mirrors = install?.removed_codex_skill_mirrors || [];
  return report;
}

function looksGeneratedOfficialSkill(text: string) {
  return /Sneakoscope|SKS|Codex App pipeline activation|Dollar-command route|Context tracking|Honest Mode|Route:/i.test(String(text || ''));
}

function isSksManagedOrGeneratedOfficialSkill(text: string) {
  return MANAGED_SKILL_MARKER_RE.test(String(text || '')) || looksGeneratedOfficialSkill(text);
}

async function reconcileProjectSkillEntries(
  root: string,
  targetDir: string,
  entries: any[],
  officialNames: Set<string>,
  aliasNames: Set<string>,
  removedNames: Set<string>,
  report: SkillReconcileReport,
  fix: boolean
) {
  for (const entry of entries) {
    const official = officialNames.has(entry.canonical) || aliasNames.has(entry.canonical) || removedNames.has(entry.canonical);
    const forge = FORGE_SKILL_MARKER_RE.test(entry.text);
    const managed = MANAGED_SKILL_MARKER_RE.test(entry.text) || official;
    if (forge) {
      report.preserved_forge.push(entry.name);
      continue;
    }
    if (official && !MANAGED_SKILL_MARKER_RE.test(entry.text) && !looksGeneratedOfficialSkill(entry.text)) {
      if (fix) await quarantineSkillDir(root, entry.dir, entry.name, 'project-official-name-user-collision');
      report.quarantined_user_collisions.push(entry.name);
      report.warnings.push(`official_name_user_collision_quarantined:${entry.name}`);
      continue;
    }
    if (managed) {
      if (fix) await fsp.rm(entry.dir, { recursive: true, force: true });
      report.removed.push(path.relative(root, entry.dir).split(path.sep).join('/'));
      continue;
    }
    report.preserved_user.push(entry.name);
  }
  await removeDirIfEmpty(targetDir);
}

async function quarantineSkillDir(root: string, sourceDir: string, name: string, reason: string) {
  const stamp = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const target = path.join(root, '.sneakoscope', 'quarantine', 'skills', canonicalSkillNameFromValue(name), stamp, path.basename(sourceDir));
  await ensureDir(path.dirname(target));
  await fsp.rename(sourceDir, target).catch(async () => {
    await fsp.cp(sourceDir, target, { recursive: true, force: false });
    await fsp.rm(sourceDir, { recursive: true, force: true });
  });
  await writeJsonAtomic(path.join(target, 'quarantine-record.json'), {
    schema: 'sks.skill-quarantine-record.v1',
    generated_at: nowIso(),
    source_path: sourceDir,
    quarantine_path: target,
    canonical_name: canonicalSkillNameFromValue(name),
    reason
  });
  return target;
}

export async function loadSkillsManifest(): Promise<any> {
  const candidates = [
    path.join(packageRootDir(), 'dist', 'config', 'skills-manifest.json'),
    path.join(packageRootDir(), 'config', 'skills-manifest.json')
  ];
  for (const file of candidates) {
    const data = await readJson(file, null);
    if (data?.schema === PACKAGED_SKILLS_MANIFEST_SCHEMA && Array.isArray(data.skills)) return data;
  }
  return buildFallbackSkillsManifest();
}

export async function generatePackagedSkillsManifest(): Promise<any> {
  return withScratchDir('skills-manifest-', async (dir) => {
    await installOfficialSkills(dir);
    const skillRoot = path.join(dir, '.agents', 'skills');
    const entries = await listSkillDirs(skillRoot);
    const skills = entries
      .filter((entry) => entry.name !== 'quarantine')
      .map((entry) => ({
        canonical_name: entry.canonical,
        type: isCoreSkillName(entry.canonical) ? 'core' : 'official',
        content_sha256: entry.hash,
        hash_history: [],
        deprecated_aliases: DEPRECATED_SKILL_ALIASES[entry.canonical] || []
      }))
      .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
    return {
      schema: PACKAGED_SKILLS_MANIFEST_SCHEMA,
      package_version: PACKAGE_VERSION,
      skills,
      removed_skills: REMOVED_OFFICIAL_SKILLS
    };
  });
}

export async function writePackagedSkillManifest(targetDir: string, manifest: any): Promise<string> {
  const file = path.join(targetDir, 'skills-manifest.json');
  await writeJsonAtomic(file, manifest);
  return file;
}

function buildFallbackSkillsManifest() {
  const names = new Set<string>([
    ...DOLLAR_SKILL_NAMES.map((name: any) => canonicalSkillNameFromValue(name)),
    ...RECOMMENDED_SKILLS.map((name: any) => canonicalSkillNameFromValue(name)),
    ...DOLLAR_COMMANDS.map((command: any) => canonicalSkillNameFromValue(String(command.command || '').replace(/^\$/, ''))),
    ...buildSksCoreSkillManifest().skills.map((skill) => skill.canonical_name)
  ].filter(Boolean));
  return {
    schema: PACKAGED_SKILLS_MANIFEST_SCHEMA,
    package_version: PACKAGE_VERSION,
    skills: [...names].sort().map((name) => ({
      canonical_name: name,
      type: isCoreSkillName(name) ? 'core' : 'official',
      content_sha256: '',
      hash_history: [],
      deprecated_aliases: DEPRECATED_SKILL_ALIASES[name] || []
    })),
    removed_skills: REMOVED_OFFICIAL_SKILLS
  };
}

async function listSkillDirs(targetDir: string) {
  const rows = await fsp.readdir(targetDir, { withFileTypes: true }).catch(() => []);
  const out: any[] = [];
  for (const row of rows) {
    if (!row.isDirectory()) continue;
    const dir = path.join(targetDir, row.name);
    const skillMdPath = path.join(dir, 'SKILL.md');
    const text = await readText(skillMdPath, null);
    if (typeof text !== 'string') continue;
    const displayName = /^name:\s*(.+)\s*$/m.exec(text)?.[1] || row.name;
    out.push({
      name: row.name,
      dir,
      skillMdPath,
      text,
      canonical: canonicalSkillNameFromValue(displayName),
      hash: sha256(text)
    });
  }
  return out;
}

function rootFromSkillsDir(targetDir: string) {
  const normalized = path.resolve(targetDir);
  if (path.basename(normalized) === 'skills' && path.basename(path.dirname(normalized)) === '.agents') {
    return path.dirname(path.dirname(normalized));
  }
  return path.dirname(path.dirname(normalized));
}

function canonicalSkillNameFromValue(value: any) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function packageRootDir() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
}

async function pruneProjectGeneratedManifest(targetDir: string) {
  await fsp.rm(path.join(targetDir, SKS_SKILL_MANIFEST_FILE), { force: true }).catch(() => undefined);
}

function generatedSkillFiles(skillNames: any) {
  return skillNames.flatMap((name: any) => [
    `.agents/skills/${name}/SKILL.md`,
    `.agents/skills/${name}/agents/openai.yaml`
  ]).sort();
}

function markManagedSkill(name: any, content: any) {
  const text = String(content || '').trim();
  if (MANAGED_SKILL_MARKER_RE.test(text)) return `${text}\n`;
  return `${text}\n\n<!-- BEGIN SKS MANAGED SKILL v${PACKAGE_VERSION} name=${name} -->\n`;
}

function generatedSkillManifestPath(root: any) {
  return path.join(root, '.agents', 'skills', SKS_SKILL_MANIFEST_FILE);
}

async function writeGeneratedSkillManifest(root: any, skillNames: any) {
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

async function removeStaleGeneratedSkillsFromManifest(root: any, skillNames: any) {
  const previous = await readJson(generatedSkillManifestPath(root), null);
  const previousSkills = Array.isArray(previous?.skills) ? previous.skills : [];
  if (!previousSkills.length) return [];
  const current = new Set(skillNames);
  const removed: any[] = [];
  for (const name of previousSkills) {
    const skillName = String(name || '').trim();
    if (!skillName || current.has(skillName) || !/^[a-z0-9-]+$/.test(skillName)) continue;
    if (isCoreSkillName(skillName)) continue;
    const dir = path.join(root, '.agents', 'skills', skillName);
    if (!(await exists(dir))) continue;
    await fsp.rm(dir, { recursive: true, force: true });
    removed.push(path.relative(root, dir));
  }
  return removed.sort();
}

async function removeGeneratedPluginSkillCollisions(root: any) {
  const removed: any[] = [];
  for (const name of RESERVED_CODEX_PLUGIN_SKILL_NAMES) {
    const dir = path.join(root, '.agents', 'skills', name);
    const skillPath = path.join(dir, 'SKILL.md');
    const text = await readText(skillPath, null);
    if (!isGeneratedSksPluginCollisionSkill(text, name)) continue;
    await fsp.rm(dir, { recursive: true, force: true });
    removed.push(path.relative(root, dir));
  }
  return removed.sort();
}

function isGeneratedSksPluginCollisionSkill(text: any, name: any) {
  if (typeof text !== 'string') return false;
  const s = String(text);
  if (!new RegExp(`^name:\\s*${escapeRegExp(name)}\\s*$`, 'm').test(s)) return false;
  if (/\bnot generated by SKS\b/i.test(s)) return false;
  return /Maximum-speed \$Computer-Use\/\$CU lane|Codex App pipeline activation:|Sneakoscope generated|Dollar-command route generated by SKS/i.test(s);
}

function enrichSkillContent(name: any, content: any) {
  if (!['sks', 'answer', 'wiki', 'team', 'qa-loop', 'ppt', 'image-ux-review', 'ux-review', 'visual-review', 'ui-ux-review', 'computer-use-fast', 'cu', 'goal', 'research', 'autoresearch', 'db', 'gx', 'reflection', 'prompt-pipeline', 'pipeline-runner', 'context7-docs', 'turbo-context-pack', 'hproof-evidence-bind'].includes(name)) return content;
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

function pipelineActivationText(name: any) {
  const stateful = new Set(['sks', 'team', 'qa-loop', 'ppt', 'image-ux-review', 'ux-review', 'visual-review', 'ui-ux-review', 'computer-use-fast', 'cu', 'goal', 'research', 'autoresearch', 'db', 'gx', 'prompt-pipeline', 'pipeline-runner']);
  if (!stateful.has(name)) return '';
  return `Codex App pipeline activation:
- If the SKS UserPromptSubmit hook already injected route context, follow that context.
- If no SKS hook context is visible in the current turn, immediately run \`sks hook user-prompt-submit\` from the target repo root with JSON input containing the current prompt, for example: \`printf '%s' '{"prompt":"<user prompt>","cwd":"<repo root>"}' | sks hook user-prompt-submit\`.
- Use the returned \`hookSpecificOutput.additionalContext\` as authoritative route context before answering or editing. If it creates a mission, continue through \`sks pipeline status\`, \`sks pipeline plan\`, and \`sks pipeline answer\` as directed.
- Do not treat this skill text alone as completion of the SKS route; a stateful SKS route must materialize mission/pipeline artifacts or explicitly report why the hook could not run.`;
}

async function writeSkillMetadata(dir: any, name: any) {
  const effort = ['computer-use-fast', 'cu'].includes(name)
    ? 'low'
    : ['research', 'autoresearch', 'research-discovery', 'autoresearch-loop', 'from-chat-img'].includes(name)
    ? 'xhigh'
    : (['dfix', 'sks', 'help'].includes(name) ? 'medium' : 'high');
  await ensureDir(path.join(dir, 'agents'));
  await writeTextAtomic(path.join(dir, 'agents', 'openai.yaml'), `name: ${name}\nmodel_reasoning_effort: ${effort}\nrouting: temporary\nreturn_to_default_after_route: true\n`);
}

async function removeGeneratedCodexSkillMirrors(root: any, skillNames: any) {
  const legacyRoot = path.join(root, '.codex', 'skills');
  if (!(await exists(legacyRoot))) return [];
  const removed: any[] = [];
  const names = Array.from(new Set([...skillNames, ...DOLLAR_COMMANDS.map((c: any) => c.command.slice(1)), 'ralph', 'Ralph', 'ralph-supervisor', 'ralph-resolver']));
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

async function removeGeneratedAgentSkillAliases(root: any, skillNames: any) {
  const current = new Set(skillNames);
  const obsolete = ['agent-team', 'qaloop', 'wiki-refresh', 'wikirefresh', 'ralph', 'ralph-supervisor', 'ralph-resolver'];
  const removed: any[] = [];
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

function isGeneratedSksAgentSkill(text: any, name: any) {
  if (!text) return false;
  const s = String(text);
  if (!new RegExp(`name:\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s)) return false;
  if (/\bnot generated by SKS\b/i.test(s)) return false;
  return /Sneakoscope generated|Fallback Codex App picker alias|Codex App picker alias for|Dollar-command route generated by SKS/i.test(s);
}

function isGeneratedSksLegacySkill(text: any, name: any) {
  if (typeof text !== 'string') return false;
  return text.startsWith('---') && new RegExp(`^name:\\s*${escapeRegExp(name)}\\s*$`, 'm').test(text);
}

function escapeRegExp(value: any) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function removeDirIfEmpty(dir: any) {
  try {
    const entries = await fsp.readdir(dir);
    if (!entries.length) await fsp.rmdir(dir);
  } catch {}
}

export async function installCodexAgents(root: any) {
  const agents = {
    'analysis-scout.toml': `name = "analysis_scout"\ndescription = "SKS analysis scout with bounded write capability retained for stale Codex agent-role config repair."\nmodel = "${REQUIRED_CODEX_MODEL}"\nmodel_reasoning_effort = "low"\nsandbox_mode = "workspace-write"\ndeveloper_instructions = """\nYou are an SKS analysis scout.\nOnly edit bounded files assigned by the parent orchestrator; otherwise inspect only and return concise source-backed findings.\n"""\n`,
    'native-agent-intake.toml': `name = "native_agent"\ndescription = "Team native agent with bounded write capability. Maps one independent repo/docs/tests/API/risk/user-friction slice and can produce patch-envelope work when assigned."\nmodel = "${REQUIRED_CODEX_MODEL}"\nmodel_reasoning_effort = "low"\nsandbox_mode = "workspace-write"\ndeveloper_instructions = """\nYou are an SKS Team native agent.\nOnly edit bounded files assigned by the parent orchestrator.\nOwn exactly one investigation or implementation slice assigned by the parent orchestrator.\nUse the mission roster or worker inbox model and model_reasoning_effort when the host exposes it: simple bounded work may use gpt-5.4-mini, ordinary tool work uses ${REQUIRED_CODEX_MODEL} low, and knowledge/research/safety/release work uses ${REQUIRED_CODEX_MODEL} high.\nMap relevant source files, docs, tests, APIs, DB or safety risks, UX friction, and likely implementation boundaries.\nReturn concise source-backed claims suitable for team-analysis.md and TriWiki ingestion: claim, source path, evidence hash or quoted anchor, risk, confidence, and recommended implementation slice.\nDo not debate the final plan. Implement only when the assigned slice includes write paths.\nAlso return a concise LIVE_EVENT line that the parent can record with sks team event.\n"""\n`,
    'team-consensus.toml': `name = "team_consensus"\ndescription = "Planning and debate specialist for SKS Team mode with bounded write capability. Maps options, constraints, role-persona risks, and proposes the agreed objective before implementation starts."\nmodel = "${REQUIRED_CODEX_MODEL}"\nmodel_reasoning_effort = "high"\nsandbox_mode = "workspace-write"\ndeveloper_instructions = """\nYou are the SKS Team consensus specialist.\nOnly edit bounded files assigned by the parent orchestrator.\nUse the mission roster model and model_reasoning_effort when the host exposes them; planning normally uses ${REQUIRED_CODEX_MODEL} low or high depending on risk.\nMap the affected code paths, viable approaches, constraints, risks, and acceptance criteria.\nRun the debate as role-persona synthesis: final users are low-context, self-interested, stubborn, and inconvenience-averse; executors are capable developers; reviewers are strict.\nArgue for the smallest coherent objective that can be handed to a fresh executor_N development team.\nPlan for at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA validation lanes before integration or final.\nReturn: recommended objective, rejected alternatives, implementation slices, required reviewers, user-friction risks, and unresolved risks.\nAlso return a concise LIVE_EVENT line that the parent can record with sks team event.\n"""\n`,
    'implementation-worker.toml': `name = "implementation_worker"\ndescription = "Implementation specialist for SKS Team mode. Owns one bounded write set and coordinates with other executor_N workers."\nmodel = "${REQUIRED_CODEX_MODEL}"\nmodel_reasoning_effort = "medium"\nsandbox_mode = "workspace-write"\ndeveloper_instructions = """\nYou are an SKS Team executor/developer in the fresh development bundle.\nYou are not alone in the codebase. Other executor_N workers may be editing disjoint files.\nUse the mission roster or worker inbox reasoning_effort when the host exposes it; simple bounded changes can use low, tool-heavy implementation medium, and safety/release/DB work high.\nOnly edit the files or module slice assigned to you.\nDo not revert or overwrite edits made by others.\nRead local patterns first, make the smallest correct change, avoid adding user friction, run focused verification for your slice, and report changed paths plus evidence.\nDo not create fallback implementation code, substitute behavior, mock behavior, or compatibility shims unless the user or sealed decision contract explicitly requested them.\nRespect all SKS hooks, DB safety rules, no-question run rules, and H-Proof completion gates.\nAlso return concise LIVE_EVENT lines for started, blocked, changed files, verification, and final result so the parent can record them.\n"""\n`,
    'db-safety-reviewer.toml': `name = "db_safety_reviewer"\ndescription = "Database safety reviewer with bounded write capability for SQL, migrations, Supabase, RLS, destructive-operation risk, and rollback safety."\nmodel = "${REQUIRED_CODEX_MODEL}"\nmodel_reasoning_effort = "high"\nsandbox_mode = "workspace-write"\ndeveloper_instructions = """\nYou are a database safety reviewer.\nOnly edit bounded files assigned by the parent orchestrator. Never execute destructive commands.\nReview migrations, SQL, Supabase RLS, transaction boundaries, rollback safety, and MCP database tool usage.\nBlock DROP, TRUNCATE, mass DELETE/UPDATE, db reset, db push, project deletion, branch reset/merge/delete, RLS disabling, and live execute_sql writes.\nReturn concrete risks, exact file references, and required fixes.\nAlso return a concise LIVE_EVENT line that the parent can record with sks team event.\n"""\n`,
    'qa-reviewer.toml': `name = "qa_reviewer"\ndescription = "Strict verification reviewer with bounded write capability for correctness, regressions, missing tests, user friction, and final evidence."\nmodel = "${REQUIRED_CODEX_MODEL}"\nmodel_reasoning_effort = "high"\nsandbox_mode = "workspace-write"\ndeveloper_instructions = """\nYou are an SKS Team strict reviewer.\nOnly edit bounded files assigned by the parent orchestrator.\nReview correctness, edge cases, regression risk, missing tests, unsupported claims, and whether the final evidence proves the claimed outcome.\nTeam review must cover at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA validation lanes before integration or final; flag missing review lane evidence.\nAlso evaluate practical friction from the viewpoint of a stubborn, low-context final user who dislikes inconvenience.\nPrioritize concrete findings with file references and focused verification suggestions.\nFlag any unrequested fallback implementation code, substitute behavior, mock behavior, or compatibility shim as a blocking finding unless the user or sealed decision contract explicitly requested it.\nReturn no findings if the implementation is sound, and clearly list residual test gaps.\nAlso return a concise LIVE_EVENT line that the parent can record with sks team event.\n"""\n`
  };
  const dir = path.join(root, '.codex', 'agents');
  await ensureDir(dir);
  for (const [file, content] of Object.entries(agents)) {
    await writeTextAtomic(path.join(dir, file), content);
  }
  return {
    installed_agents: Object.keys(agents),
    generated_files: Object.keys(agents).map((file: any) => `.codex/agents/${file}`).sort()
  };
}

export function currentGeneratedFileInventory(skillInstall: any = {}, agentInstall: any = {}) {
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

export async function pruneStaleGeneratedFiles(root: any, previousManifest: any, currentFiles: any) {
  const previousFiles = Array.isArray(previousManifest?.generated_files?.files) ? previousManifest.generated_files.files : [];
  if (!previousFiles.length) return { pruned: [] };
  const current = new Set(currentFiles);
  const pruned: any[] = [];
  const already_absent: any[] = [];
  for (const rel of previousFiles) {
    const relPath = normalizeGeneratedRelPath(rel);
    if (!relPath || current.has(relPath) || !isPrunableGeneratedPath(relPath)) continue;
    const removed = await removeGeneratedRelPath(root, relPath);
    if (removed) pruned.push(removed);
    else already_absent.push(relPath);
  }
  return { pruned: pruned.sort(), already_absent: already_absent.sort() };
}

function normalizeGeneratedRelPath(value: any) {
  const rel = String(value || '').trim().replaceAll('\\', '/');
  if (!rel || rel.startsWith('/') || rel.includes('\0')) return null;
  if (rel.split('/').some((part: any) => part === '..')) return null;
  return rel;
}

function isPrunableGeneratedPath(rel: any) {
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

async function removeGeneratedRelPath(root: any, rel: any) {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, rel);
  if (abs !== absRoot && !abs.startsWith(`${absRoot}${path.sep}`)) return null;
  if (!(await exists(abs))) return null;
  await fsp.rm(abs, { recursive: true, force: true });
  await removeEmptyGeneratedParents(root, rel);
  return rel;
}

async function removeEmptyGeneratedParents(root: any, rel: any) {
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
