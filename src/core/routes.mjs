const REFLECTION_SKILL_NAME = 'reflection';
export const SOLUTION_SCOUT_SKILL_NAME = 'solution-scout';
export const SOLUTION_SCOUT_STAGE_ID = 'solution_scout';

export function looksLikeProblemSolvingRequest(prompt = '') {
  const text = String(prompt || '').trim();
  if (!text) return false;
  const problemCue = /(문제|오류|에러|버그|고장|깨짐|실패|안\s*(?:됨|돼|되|나옴|보임|돌아|먹)|작동\s*안|해결|고쳐|수정|복구|troubleshoot|not\s+working|broken|bug|error|failure|fails?|crash|fix|repair|resolve|solve)/i.test(text);
  const actionCue = /(해줘|해달|해라|되게|찾아|검색|기반|수정|진행|apply|implement|fix|repair|resolve|solve|troubleshoot|patch|update|change)/i.test(text);
  return problemCue && actionCue;
}

export function solutionScoutPolicyText(prompt = '') {
  if (!looksLikeProblemSolvingRequest(prompt)) return '';
  return [
    'Solution Scout hook: this prompt looks like a problem-solving or repair request.',
    'Before code edits, run a short web search for similar error reports, bug fixes, docs notes, or prior resolution patterns using the concrete symptom, stack, package, and error text from the repo.',
    'Prefer primary sources and official docs for package/API behavior; use Context7 when the fix depends on a library, SDK, MCP, package manager, or generated documentation.',
    'Summarize the relevant external patterns in 2-3 bullets, then design the local SKS fix from current code/tests plus those patterns. Do not copy a workaround blindly.',
    'If web search is unavailable or the issue is fully local and trivial, state that the external-similarity search is unverified and continue from local evidence only.'
  ].join('\n');
}
export const FROM_CHAT_IMG_COVERAGE_ARTIFACT = 'from-chat-img-coverage-ledger.json';
export const FROM_CHAT_IMG_WORK_ORDER_ARTIFACT = 'from-chat-img-work-order.md';
export const FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT = 'from-chat-img-source-inventory.json';
export const FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT = 'from-chat-img-visual-map.json';
export const FROM_CHAT_IMG_CHECKLIST_ARTIFACT = 'from-chat-img-checklist.md';
export const FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT = 'from-chat-img-temp-triwiki.json';
export const FROM_CHAT_IMG_QA_LOOP_ARTIFACT = 'from-chat-img-qa-loop.json';
export const FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS = 5;
export const USAGE_TOPICS = 'install|setup|bootstrap|root|deps|tmux|auto-review|team|qa-loop|ppt|image-ux-review|goal|research|db|codex-app|openclaw|dfix|design|imagegen|dollar|context7|pipeline|reasoning|guard|conflicts|versioning|eval|harness|hproof|gx|wiki|code-structure|proof-field|skill-dream';
export const CODEX_COMPUTER_USE_EVIDENCE_SOURCE = 'codex_computer_use';
export const CODEX_IMAGEGEN_EVIDENCE_SOURCE = 'codex_app_imagegen_gpt_image_2';
export const CODEX_APP_IMAGE_GENERATION_DOC_URL = 'https://developers.openai.com/codex/app/features#image-generation';
export const OPENAI_IMAGE_GENERATION_DOC_URL = 'https://developers.openai.com/api/docs/guides/image-generation';
export const CODEX_COMPUTER_USE_ONLY_POLICY = 'Pipeline UI/browser verification and visual inspection must use Codex Computer Use only. Do not use or install Playwright packages, Chrome MCP, Browser Use, Selenium, Puppeteer, or any other browser automation substitute; if Codex Computer Use is unavailable for the target UI, mark the UI/browser evidence unverified instead of substituting another tool. Codex App readiness/config verification is not target-UI evidence: use the Codex-provided control surfaces `codex features list`, `codex mcp list`, `sks codex-app check`, remote-control status, and plugin/tool exposure, not direct OS Accessibility control of the Codex App bundle. In Codex App prompts, invoke @Computer or @AppName in a new thread when live Computer Use tools are needed for the actual target app or screen; SKS hooks and skills can require the policy but cannot attach missing host tools to an already-started turn.';
export const CODEX_IMAGEGEN_REQUIRED_POLICY = 'Pipeline image generation, raster asset creation/editing, and generated image-review evidence must use real Codex App imagegen/$imagegen with gpt-image-2 when that evidence is required. Do not substitute placeholder SVG/HTML/CSS, prose-only critique, stock-like stand-ins, manually fabricated files, or missing-output ledgers for requested/generated raster assets or required generated review images. If imagegen/gpt-image-2 is unavailable, record the blocker and mark the image asset or review evidence unverified instead of passing the gate. In Codex App prompts, invoke $imagegen when live image generation is needed; SKS hooks and skills can require the policy but cannot attach missing host image-generation tools to an already-started turn.';
export const RESERVED_CODEX_PLUGIN_SKILL_NAMES = Object.freeze(['computer-use', 'browser', 'browser-use']);
export const FORBIDDEN_BROWSER_AUTOMATION_RE = /\b(playwright|chrome\s+mcp|browser\s+use|selenium|puppeteer)\b/i;

export function evidenceMentionsForbiddenBrowserAutomation(value, seen = new Set()) {
  if (value == null) return false;
  if (typeof value === 'string') return FORBIDDEN_BROWSER_AUTOMATION_RE.test(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => evidenceMentionsForbiddenBrowserAutomation(item, seen));
  return Object.values(value).some((item) => evidenceMentionsForbiddenBrowserAutomation(item, seen));
}

export const RECOMMENDED_MCP_SERVERS = [
  {
    id: 'context7',
    required: true,
    transport: 'local',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp@latest'],
    remote_url: 'https://mcp.context7.com/mcp',
    purpose: 'Current library/API/framework documentation for route gates.'
  }
];

export const GETDESIGN_REFERENCE = {
  id: 'getdesign',
  url: 'https://getdesign.md/',
  docs_url: 'https://docs.getdesign.app/',
  official_urls_url: 'https://docs.getdesign.app/resources/official-urls/',
  codex_guide_url: 'https://docs.getdesign.app/guides/use-with-codex/',
  codex_skill: 'MohtashamMurshid/getdesign',
  codex_skill_install: 'skills add MohtashamMurshid/getdesign',
  npm_cli: '@getdesign/cli',
  npm_sdk: '@getdesign/sdk',
  official_mcp_available: false,
  surfaces: ['web', 'api', 'cli', 'sdk', 'skill'],
  purpose: 'Ground DESIGN.md, UI/UX design systems, and presentation-like HTML/PDF artifacts in current design references.'
};

export const DESIGN_SYSTEM_SSOT = {
  id: 'design-system-ssot',
  authority_file: 'design.md',
  builder_prompt: 'docs/Design-Sys-Prompt.md',
  rule: 'design.md is the single design decision authority. When it is missing, synthesize it from the builder prompt plus approved source inputs; external references must be fused into design.md or route artifacts and must not become parallel design authorities.'
};

export const AWESOME_DESIGN_MD_REFERENCE = {
  id: 'awesome-design-md',
  url: 'https://github.com/VoltAgent/awesome-design-md',
  purpose: 'Curated ready-to-use DESIGN.md examples extracted from public brand and product websites; use only as source input to the design SSOT, not as a parallel authority.'
};

export const RECOMMENDED_DESIGN_REFERENCES = [GETDESIGN_REFERENCE, AWESOME_DESIGN_MD_REFERENCE];

export const PPT_PIPELINE_SKILL_ALLOWLIST = Object.freeze([
  'ppt',
  'imagegen',
  'getdesign-reference',
  'prompt-pipeline',
  REFLECTION_SKILL_NAME,
  'honest-mode'
]);

export const PPT_CONDITIONAL_SKILL_ALLOWLIST = Object.freeze([]);

export const PPT_PIPELINE_MCP_ALLOWLIST = Object.freeze([
  {
    mcp: 'context7',
    condition: 'only_when_current_external_documentation_is_required_for_sources_or_package_api_usage'
  }
]);

export function pptPipelineAllowlistPolicyText() {
  const conditionalSkills = PPT_CONDITIONAL_SKILL_ALLOWLIST.length
    ? PPT_CONDITIONAL_SKILL_ALLOWLIST.map((entry) => `${entry.skill}=${entry.condition}`).join('; ')
    : 'none';
  return `PPT pipeline allowlist: during $PPT design/render work, ignore installed skills and MCPs that are not explicitly part of the $PPT pipeline. The purpose is to prevent AI-like generic presentation design: decorative gradients, nested cards, vague SaaS visuals, and style choices not grounded in the audience, source material, getdesign reference, or the project design SSOT. Required skills are ${PPT_PIPELINE_SKILL_ALLOWLIST.join(', ')}. The imagegen skill is required for $PPT so Codex App can invoke official built-in $imagegen/gpt-image-2 for every generated raster asset or generated visual-review image; do not route PPT imagery through direct API fallback. Do not use generic design skills such as design-artifact-expert, design-ui-editor, or design-system-builder for $PPT just because they are installed. $PPT design must use getdesign-reference plus the built-in PPT design implementation pipeline: ${DESIGN_SYSTEM_SSOT.authority_file} when present, ${DESIGN_SYSTEM_SSOT.builder_prompt} as the builder prompt when missing, and route-local ppt-style-tokens.json as the fused design projection. Conditional skills/MCPs are allowed only when their condition is sealed in the contract: ${conditionalSkills}; ${PPT_PIPELINE_MCP_ALLOWLIST.map((entry) => `${entry.mcp}=${entry.condition}`).join('; ')}. Fact, image, and review evidence are first-class artifacts: gather user-provided context and required web/Context7 evidence into ppt-fact-ledger.json, block unsupported critical claims, plan required image resources through ppt-image-asset-ledger.json, then run a bounded review loop recorded in ppt-review-policy.json, ppt-review-ledger.json, and ppt-iteration-report.json. Required raster asset or generated visual-review evidence must come from Codex App $imagegen/gpt-image-2; direct API fallback, placeholder files, and prose-only substitutes do not satisfy the route gate. The review loop caps full-deck passes at 2, slide retries at 2, requires P0/P1 issue count to be zero, targets score >= 0.88, and stops when improvement delta is below 0.03 or evidence is missing. For Codex App visual critique, invoke $imagegen/gpt-image-2 (${CODEX_APP_IMAGE_GENERATION_DOC_URL}) when required; never simulate missing gpt-image-2 output. If required image-review evidence is unavailable, record the blocker instead of passing the gate. ${CODEX_IMAGEGEN_REQUIRED_POLICY}`;
}

export function getdesignReferencePolicyText() {
  return `Design SSOT policy: ${DESIGN_SYSTEM_SSOT.authority_file} is the single design decision authority. If it is missing, create or update it through ${DESIGN_SYSTEM_SSOT.builder_prompt}; getdesign.md (${GETDESIGN_REFERENCE.url}), its official docs, and curated DESIGN.md examples at ${AWESOME_DESIGN_MD_REFERENCE.url} are source inputs to fuse into that SSOT or into route-local style tokens, not parallel authorities. Prefer the official Codex skill when available (${GETDESIGN_REFERENCE.codex_skill_install}); otherwise use the generated getdesign-reference skill plus official Web/API/CLI/SDK docs and curated DESIGN.md examples as inputs. Do not claim an official getdesign MCP server is configured unless a current official MCP surface is actually available.`;
}

export function imageUxReviewPipelinePolicyText() {
  return `Image UX review pipeline: the core mechanism is not text-only screenshot critique. Capture or receive source UI screenshots, then use Codex App imagegen/$imagegen with gpt-image-2 (${CODEX_APP_IMAGE_GENERATION_DOC_URL}) to create new annotated review images from those screenshots as reference inputs. The generated review image must visibly mark numbered callouts, P0/P1/P2/P3 labels, eye-flow, hierarchy, contrast, alignment, density, affordance problems, and a small corrected mini-comp or before/after strip when useful. Then analyze that generated review image with vision/OCR and convert the visible callouts into image-ux-issue-ledger.json rows. Missing generated review images block image-ux-review-gate.json; never pass this route from a direct API fallback, hand-written text-only substitute, placeholder asset, or fabricated ledger. ${CODEX_IMAGEGEN_REQUIRED_POLICY}`;
}

export const RECOMMENDED_SKILLS = [
  'reasoning-router',
  'pipeline-runner',
  'solution-scout',
  'context7-docs',
  'seo-geo-optimizer',
  'autoresearch-loop',
  'performance-evaluator',
  'design-artifact-expert',
  'design-system-builder',
  'design-ui-editor',
  'getdesign-reference',
  'imagegen',
  'image-ux-review',
  'computer-use-fast',
  'db-safety-guard',
  REFLECTION_SKILL_NAME,
  'honest-mode'
];

export function dollarSkillName(commandOrId) {
  return String(commandOrId || '').replace(/^\$/, '').toLowerCase();
}

export function stripVisibleDecisionAnswerBlocks(value = '') {
  return stripNonAuthoritativeLiveChatBlocks(String(value || ''))
    .replace(/\s*\[(?=[^\]]*\b[A-Z][A-Z0-9_]{2,}\s*:)[^\]]{0,6000}\]\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripNonAuthoritativeLiveChatBlocks(value = '') {
  return String(value || '')
    .replace(/(?:^|\n)\s*[›>]\s*\[## Live Chat[\s\S]*?\]\s*(?=(?:이|이거|그리고|근데|계속|고쳐|수정|해결|Pane|pane|please|fix|also|and|$))/g, '\n')
    .replace(/(?:^|\n)\s*\[## Live Chat[\s\S]*?\]\s*(?=(?:이|이거|그리고|근데|계속|고쳐|수정|해결|Pane|pane|please|fix|also|and|$))/g, '\n')
    .replace(/^\s*-?\s*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s+\S+\s+\[[^\]]+\]:.*$/gm, '')
    .replace(/^\s*## Live Chat\s*$/gm, '')
    .trim();
}

export function triwikiContextTracking(commandPrefix = 'sks') {
  const prefix = String(commandPrefix || 'sks');
  return {
    ssot: 'triwiki',
    default_pack: '.sneakoscope/wiki/context-pack.json',
    pack_command: `${prefix} wiki pack`,
    refresh_command: `${prefix} wiki refresh`,
    prune_command: `${prefix} wiki prune`,
    validate_command: `${prefix} wiki validate .sneakoscope/wiki/context-pack.json`,
    hydrate_policy: 'hydrate_by_id_hash_source_path_rgba_trig_coordinate',
    attention_policy: 'use_attention_use_first_for_fast_high_trust_recall_and_hydrate_attention_hydrate_first_before_risky_or_lower_trust_decisions',
    required_schema: 'sks.wiki-coordinate.v1+vx:sks.wiki-voxel.v1',
    selected_text_policy: 'selected_text_is_only_the_visible_slice',
    stack_current_docs: stackCurrentDocsPolicy(prefix),
    stage_policy: [
      'before_each_route_stage_read_relevant_context_pack',
      'require_latest_coordinate_plus_voxel_overlay_pack',
      'during_each_stage_hydrate_relevant_low_trust_claims_from_source',
      'after_new_findings_or_artifact_changes_refresh_or_pack',
      'before_each_handoff_validate_context_pack',
      'before_final_answer_recheck_relevant_wiki_claims_against_sources'
    ],
    required_for: ['every_work_stage', 'long_running_routes', 'team_handoffs', 'context_pressure', 'cross_turn_continuity']
  };
}


export function stackCurrentDocsPolicy(commandPrefix = 'sks') {
  const prefix = String(commandPrefix || 'sks');
  return {
    trigger: 'when_tech_stack_is_added_or_package_framework_runtime_version_changes',
    evidence_required: ['context7_resolve_library_id_and_query_docs', 'or_official_vendor_web_docs'],
    memory_path: '.sneakoscope/memory/q2_facts/stack-current-docs.md',
    refresh_command: `${prefix} wiki refresh`,
    validate_command: `${prefix} wiki validate .sneakoscope/wiki/context-pack.json`,
    priority: 'must_precede_coding_style_defaults',
    examples: [
      'Supabase hosted projects should prefer sb_publishable_ and sb_secret_ keys over legacy anon/service_role keys when current docs apply.',
      'Next.js 16 deprecates the middleware file convention in favor of proxy.ts/proxy.js.',
      'Vercel Function duration limits, including the 300s default with Fluid Compute, are deployment constraints that must shape long-running server work.'
    ]
  };
}

export function stackCurrentDocsPolicyText(commandPrefix = 'sks') {
  const policy = stackCurrentDocsPolicy(commandPrefix);
  return `Stack current-docs policy: whenever project tech stack is added or a framework/package/runtime/platform version changes, fetch current docs with Context7 (resolve-library-id then query-docs) or official vendor web docs before coding, record the syntax/limits/security guidance as high-priority TriWiki claims in ${policy.memory_path}, run "${policy.refresh_command}", then "${policy.validate_command}". Treat these claims as higher priority than model-memory defaults. Examples include Supabase publishable/secret keys replacing legacy anon/service_role guidance for hosted projects, Next.js 16 proxy.ts/proxy.js replacing the deprecated middleware file convention, avoiding stale webpack defaults when newer framework guidance says otherwise, and Vercel Function duration limits such as the 300s default under Fluid Compute.`;
}

export function triwikiContextTrackingText(commandPrefix = 'sks') {
  const ctx = triwikiContextTracking(commandPrefix);
  return `Context tracking SSOT: TriWiki. Use only the latest TriWiki pack shape at every work stage: ${ctx.required_schema}; coordinate-only legacy packs are invalid and must be refreshed before use. Read ${ctx.default_pack} before each route phase, consume attention.use_first as the compact high-trust recall set, hydrate attention.hydrate_first from source before risky or lower-trust decisions, refresh with "${ctx.refresh_command}" or "${ctx.pack_command}" after new findings/artifact changes, prune stale/oversized wiki state with "${ctx.prune_command}" when retention matters, and validate with "${ctx.validate_command}" before each handoff or final claim. Selected text is only the visible slice; non-selected claims remain hydratable by id, hash, source path, and RGBA/trig coordinate. Follow high-trust claims unless newer source evidence contradicts them; low-trust claims should trigger source/evidence hydration before implementation or final claims. ${stackCurrentDocsPolicyText(commandPrefix)}`;
}

export function triwikiStagePolicyText(commandPrefix = 'sks') {
  const ctx = triwikiContextTracking(commandPrefix);
  return [
    'TriWiki stage policy:',
    `- Before each route phase, read the relevant parts of ${ctx.default_pack} instead of relying on memory or a one-time initial summary; the pack must validate as ${ctx.required_schema}.`,
    '- Consume `attention.use_first` for the fastest high-trust context path; hydrate `attention.hydrate_first` from source before making risky, user-visible, or final claims.',
    `- If a TriWiki pack is coordinate-only or lacks voxel overlay metadata, run "${ctx.refresh_command}" or "${ctx.pack_command}" and do not use the legacy pack for pipeline decisions.`,
    '- During the phase, when a decision touches a wiki claim, hydrate low-trust or stale claims from their source path/hash/RGBA anchor before relying on them.',
    `- After new findings, changed artifacts, scout results, debate conclusions, implementation changes, reviews, or blockers, run "${ctx.refresh_command}" or "${ctx.pack_command}" so later stages see the update.`,
    `- When package manifests, framework versions, runtime targets, MCPs, SDKs, DB clients, or deployment platforms change, add current official docs or Context7 evidence to ${stackCurrentDocsPolicy(commandPrefix).memory_path}, refresh/validate TriWiki, and make those claims the coding baseline.`,
    `- Before every handoff and before final output, run or require "${ctx.validate_command}" and re-check high-impact claims against current sources.`
  ].join('\n');
}

export function chatCaptureIntakeText() {
  return `From-Chat-IMG intake: explicit signal only. Select forensic visual effort. Treat uploads as chat screenshot plus originals, use Codex Computer Use visual inspection when available, list requirements first in source order, match regions to attachments with confidence, and write ${FROM_CHAT_IMG_WORK_ORDER_ARTIFACT}, ${FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT}, ${FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT}, ${FROM_CHAT_IMG_COVERAGE_ARTIFACT}, ${FROM_CHAT_IMG_CHECKLIST_ARTIFACT}, ${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT}, and ${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}. ${CODEX_COMPUTER_USE_ONLY_POLICY} Preserve each visible customer request as source-bound text, account for every screenshot image region and separate attachment, map each item to work-order actions, perform the customer-request work, then run a scoped QA-LOOP over that exact work-order range before Team completion. Update checklist checkboxes as work proceeds until all boxes are checked, unresolved_items is empty, scoped_qa_loop_completed=true, QA unresolved findings are zero, and schema validation passes. ${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT} is temporary TriWiki-backed session context with expires_after_sessions=${FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS}, so it can be forgotten by retention after enough later sessions. Do not assume ordinary image prompts are chat captures.`;
}

export function noUnrequestedFallbackCodePolicyText() {
  return 'No unrequested fallback implementation code: every pipeline stage, executor, reviewer, auto-review profile, and MAD/MAD-SKS invocation must implement only the requested contract. Do not invent alternate code paths, substitute features, compatibility shims, mock behavior, or hidden fallbacks unless the user explicitly requested them or the sealed decision contract names them; if the requested path is impossible, block with evidence instead.';
}

export function outcomeRubricPolicyText() {
  return 'Outcome rubric policy: before adding pipeline stages, use the existing Proof Field, route gate, reflection, and Honest Mode evidence as a compact rubric: goal fit, minimum touched surface, bounded verification, and explicit escalation triggers. Apply Hyperplan-derived adversarial lenses inside that rubric: challenge framing, subtract surface, demand evidence, test integration risk, and consider one simpler alternative. Prefer deleting or skipping unrelated work with evidence over adding a background loop; only add a new mechanism when it reduces net route weight or closes a proven gate gap.';
}

export function speedLanePolicyText() {
  return 'Proof Field speed lane policy: after the intended write scope is known, run or mentally apply `sks proof-field scan --intent "<goal>" --changed <files>`. If `execution_lane.lane` is `proof_field_fast_lane`, keep the parent-owned minimal patch, listed verification, TriWiki validate, and Honest Mode while skipping Team debate, fresh executor teams, broad route rework, and unrelated checks. If blockers include database, security, visual-forensic, unknown surface, broad change set, failed verification, or unsupported claims, fail closed to the normal Team/Honest path.';
}

export function hasFromChatImgSignal(prompt = '') {
  return /(?:^|\s)\$?from-chat-img(?:\s|:|$)/i.test(String(prompt || ''));
}

export function looksLikeChatCaptureRequest(prompt = '') {
  const text = String(prompt || '');
  return hasFromChatImgSignal(text)
    && /(chat|conversation|message|messenger|kakao|slack|discord|whatsapp|채팅|대화|메신저|카톡|캡처|스크린샷)/i.test(text)
    && /(image|photo|screenshot|capture|attachment|attached|이미지|사진|첨부)/i.test(text)
    && /(client|customer|request|change|modify|fix|match|ocr|extract|text|work\s*order|고객사|클라이언트|요청|수정|변경|매칭|추출|글자|텍스트|작업|지시서)/i.test(text);
}

export const ROUTES = [
  {
    id: 'DFix',
    command: '$DFix',
    mode: 'DFIX',
    route: 'fast direct fix',
    description: 'Tiny simple direct edits such as copy, labels, typos, wording, spacing, colors, or clearly scoped one-line changes. Bypasses the general SKS pipeline and runs an ultralight, no-record task-list path.',
    requiredSkills: ['dfix'],
    lifecycle: ['micro_task_list', 'targeted_inspection', 'listed_edits_only', 'cheap_verification'],
    context7Policy: 'optional',
    reasoningPolicy: 'medium',
    stopGate: 'none',
    cliEntrypoint: 'sks dfix',
    examples: ['$DFix 글자 색 바꿔줘', '$DFix README 오타 고쳐줘']
  },
  {
    id: 'Answer',
    command: '$Answer',
    mode: 'ANSWER',
    route: 'answer-only research',
    description: 'Answer questions without starting implementation. Uses TriWiki, web, Context7 when relevant, and Honest Mode fact-checking.',
    requiredSkills: ['answer', 'honest-mode'],
    lifecycle: ['intent_classification', 'triwiki_hydration', 'web_or_context7_evidence_when_needed', 'honest_fact_check', 'direct_answer'],
    context7Policy: 'if_external_docs',
    reasoningPolicy: 'medium',
    stopGate: 'none',
    cliEntrypoint: 'implicit question route',
    examples: ['이 파이프라인이 왜 이렇게 동작해?', 'What does this hook do?']
  },
  {
    id: 'SKS',
    command: '$SKS',
    mode: 'SKS',
    route: 'general SKS workflow',
    description: 'General Sneakoscope setup, help, status, and workflow routing.',
    requiredSkills: ['sks', 'prompt-pipeline', 'honest-mode'],
    lifecycle: ['skill_context', 'command_discovery_or_lightest_route', 'honest_mode'],
    context7Policy: 'optional',
    reasoningPolicy: 'medium',
    stopGate: 'honest_mode',
    cliEntrypoint: 'sks commands',
    examples: ['$SKS show me available workflows']
  },
  {
    id: 'Team',
    command: '$Team',
    mode: 'TEAM',
    route: 'multi-agent team orchestration',
    description: 'Run substantial work through Team only when the proof cone is broad enough: scouts, TriWiki, debate, runtime task graph, fresh executors, review, cleanup, reflection, and Honest Mode.',
    requiredSkills: ['team', 'pipeline-runner', 'context7-docs', 'prompt-pipeline', REFLECTION_SKILL_NAME, 'honest-mode'],
    dollarAliases: ['$From-Chat-IMG'],
    appSkillAliases: ['from-chat-img'],
    lifecycle: ['parallel_analysis_scouting', 'triwiki_refresh', 'planning_debate', 'live_transcript', 'consensus_artifact', 'fresh_implementation_team', 'review_artifact', 'integration_evidence', 'session_cleanup', 'post_route_reflection', 'honest_mode'],
    context7Policy: 'optional',
    reasoningPolicy: 'high',
    stopGate: 'team-gate.json',
    cliEntrypoint: 'sks team "task" [executor:5 reviewer:6 user:1] | sks team log|tail|watch|lane|status|event|message|open-tmux|attach-tmux|cleanup-tmux',
    examples: ['$Team executor:5 agree on the best plan and implement it', '$From-Chat-IMG 채팅+첨부 이미지 작업 지시서']
  },
  {
    id: 'QALoop',
    command: '$QA-LOOP',
    mode: 'QALOOP',
    route: 'QA loop',
    description: 'Dogfood UI/API as human proxy with safety gates, Codex Computer Use-only UI evidence, safe fixes, rechecks, Honest Mode.',
    requiredSkills: ['qa-loop', 'pipeline-runner', REFLECTION_SKILL_NAME, 'honest-mode'],
    lifecycle: ['qa_questions_answered', 'contract_sealed', 'qa_checklist', 'qa_loop_cycles', 'safe_remediation', 'focused_reverification', 'qa_report_md', 'qa_gate', 'post_route_reflection', 'honest_mode'],
    context7Policy: 'optional',
    reasoningPolicy: 'high',
    stopGate: 'qa-gate.json',
    cliEntrypoint: 'sks qa-loop prepare|answer|run|status',
    examples: ['$QA-LOOP dogfood UI and API against local dev', '$QA-LOOP deployed smoke only']
  },
  {
    id: 'PPT',
    command: '$PPT',
    mode: 'PPT',
    route: 'HTML/PDF presentation pipeline',
    description: 'Create restrained, information-first HTML/PDF presentation artifacts after delivery context, audience profile, STP, decision context, pain-point, research, design-system, and verification questions are sealed.',
    requiredSkills: [...PPT_PIPELINE_SKILL_ALLOWLIST],
    lifecycle: ['stp_audience_questions', 'audience_strategy_artifact', 'contract_sealed', 'source_ledger', 'storyboard_aha_moments', 'design_system', 'html_artifact', 'pdf_export', 'render_qa', 'post_route_reflection', 'honest_mode'],
    context7Policy: 'if_external_docs',
    reasoningPolicy: 'high',
    stopGate: 'ppt-gate.json',
    cliEntrypoint: 'Codex App prompt route only: $PPT <topic>',
    examples: ['$PPT 우리 SaaS 소개자료를 HTML 기반 PDF로 만들어줘', '$PPT 투자자용 피치덱 만들어줘']
  },
  {
    id: 'ImageUXReview',
    command: '$Image-UX-Review',
    mode: 'IMAGE_UX_REVIEW',
    route: 'image-generation UI/UX review loop',
    description: 'Review UI/UX through the imagegen/gpt-image-2 visual critique loop: source screenshots become generated annotated review images, those images become issue ledgers, then fixes are rechecked.',
    requiredSkills: ['image-ux-review', 'imagegen', 'cu', 'pipeline-runner', REFLECTION_SKILL_NAME, 'honest-mode'],
    dollarAliases: ['$UX-Review'],
    appSkillAliases: ['ux-review', 'visual-review', 'ui-ux-review'],
    lifecycle: ['target_and_capture_inventory', 'source_screenshots', 'gpt_image_2_annotated_review_image', 'generated_image_text_extraction', 'issue_ledger', 'optional_safe_fixes', 'changed_screen_recheck', 'post_route_reflection', 'honest_mode'],
    context7Policy: 'if_external_docs',
    reasoningPolicy: 'high',
    stopGate: 'image-ux-review-gate.json',
    cliEntrypoint: 'Codex App prompt route: $Image-UX-Review <target>; inspect with sks image-ux-review status latest',
    examples: ['$Image-UX-Review localhost 화면을 이미지 생성 리뷰 루프로 검수해줘', '$UX-Review 이 스크린샷을 gpt-image-2 콜아웃 리뷰로 분석하고 고쳐줘']
  },
  {
    id: 'ComputerUse',
    command: '$Computer-Use',
    mode: 'COMPUTER_USE',
    route: 'Computer Use fast lane',
    description: 'Maximum-speed Codex Computer Use lane for UI/browser/visual tasks: skip Team debate and upfront TriWiki loops, run only focused Computer Use steps, then finish with evidence, TriWiki refresh/validate, and Honest Mode.',
    requiredSkills: ['cu', 'honest-mode'],
    dollarAliases: ['$CU'],
    appSkillAliases: ['computer-use-fast', 'cu'],
    lifecycle: ['fast_intake', 'focused_computer_use_steps', 'evidence_summary', 'final_triwiki_refresh_validate', 'honest_mode'],
    context7Policy: 'optional',
    reasoningPolicy: 'low',
    stopGate: 'none',
    cliEntrypoint: 'Codex App prompt route only: $Computer-Use <target/task>',
    examples: ['$Computer-Use check the local UI as fast as possible', '$CU localhost screen smoke']
  },
  {
    id: 'Goal',
    command: '$Goal',
    mode: 'GOAL',
    route: 'native /goal persistence bridge',
    description: 'Fast overlay that records a bridge artifact for Codex native persisted /goal create, pause, resume, and clear controls; implementation continues through the selected SKS execution route.',
    requiredSkills: ['goal', 'honest-mode'],
    lifecycle: ['goal_bridge_artifact', 'native_goal_create_or_control', 'selected_sks_route_continuation', 'honest_mode'],
    context7Policy: 'if_external_docs',
    reasoningPolicy: 'medium',
    stopGate: 'none',
    cliEntrypoint: 'sks goal create|pause|resume|clear|status',
    examples: ['$Goal persist this migration workflow with native /goal continuation']
  },
  {
    id: 'Research',
    command: '$Research',
    mode: 'RESEARCH',
    route: 'research mission',
    description: 'Frontier discovery with named xhigh persona-lens scouts, Eureka ideas, vigorous evidence-bound debate, layered public source retrieval, falsification, a paper manuscript, a final genius-opinion summary, and testable predictions.',
    requiredSkills: ['research', 'research-discovery', 'pipeline-runner', REFLECTION_SKILL_NAME, 'honest-mode'],
    lifecycle: ['research_plan', 'source_skill', 'layered_source_ledger', 'xhigh_scout_council', 'eureka_moments', 'debate_ledger', 'report', 'paper', 'genius_opinion_summary', 'novelty_ledger', 'falsification_ledger', 'research_gate', 'post_route_reflection', 'honest_mode'],
    context7Policy: 'if_external_docs',
    reasoningPolicy: 'xhigh',
    stopGate: 'research-gate.json',
    cliEntrypoint: 'sks research prepare|run',
    examples: ['$Research investigate this idea']
  },
  {
    id: 'AutoResearch',
    command: '$AutoResearch',
    mode: 'AUTORESEARCH',
    route: 'iterative experiment loop',
    description: 'Program, hypothesize, test, measure, keep/discard, falsify, and report evidence.',
    requiredSkills: ['autoresearch', 'autoresearch-loop', 'seo-geo-optimizer', 'performance-evaluator', 'pipeline-runner', 'context7-docs', REFLECTION_SKILL_NAME, 'honest-mode'],
    lifecycle: ['experiment_ledger', 'metric', 'keep_or_discard', 'falsification', 'post_route_reflection', 'honest_conclusion'],
    context7Policy: 'required',
    reasoningPolicy: 'xhigh',
    stopGate: 'autoresearch-gate.json',
    cliEntrypoint: 'sks pipeline status',
    examples: ['$AutoResearch improve this workflow with experiments']
  },
  {
    id: 'DB',
    command: '$DB',
    mode: 'DB',
    route: 'database safety',
    description: 'Database, Supabase, migration, SQL, or MCP safety checks.',
    requiredSkills: ['db', 'db-safety-guard', 'pipeline-runner', 'context7-docs', REFLECTION_SKILL_NAME, 'honest-mode'],
    lifecycle: ['db_scan', 'safe_mcp_policy', 'destructive_operation_zero', 'context7_docs', 'post_route_reflection', 'honest_mode'],
    context7Policy: 'required',
    reasoningPolicy: 'high',
    stopGate: 'db-review.json',
    cliEntrypoint: 'sks db scan',
    examples: ['$DB check this migration safely']
  },
  {
    id: 'MadSKS',
    command: '$MAD-SKS',
    mode: 'MADSKS',
    route: 'explicit scoped database authorization modifier',
    description: 'Explicit high-risk authorization modifier that can be combined with other $ commands to temporarily open live server work, Supabase MCP DB writes, direct execute SQL, schema cleanup, migration application, and normal targeted DB writes for the active invocation, while blocking only catastrophic database-wipe/all-row/project-management operations.',
    requiredSkills: ['mad-sks', 'db-safety-guard', 'pipeline-runner', 'context7-docs', REFLECTION_SKILL_NAME, 'honest-mode'],
    lifecycle: ['explicit_invocation', 'auto_sealed_permission_scope', 'scoped_db_cleanup_override', 'catastrophic_db_guard', 'permission_deactivation', 'post_route_reflection', 'honest_mode'],
    context7Policy: 'required',
    reasoningPolicy: 'high',
    stopGate: 'mad-sks-gate.json',
    cliEntrypoint: 'Codex App prompt route only: $MAD-SKS <task>',
    examples: ['$MAD-SKS $Team Supabase MCP로 main 대상 DB 컬럼 정리를 수행해', '$DB Supabase 점검 $MAD-SKS']
  },
  {
    id: 'GX',
    command: '$GX',
    mode: 'GX',
    route: 'visual context',
    description: 'Deterministic GX visual context cartridges.',
    requiredSkills: ['gx', 'gx-visual-generate', 'gx-visual-read', 'gx-visual-validate', 'pipeline-runner', REFLECTION_SKILL_NAME, 'honest-mode'],
    lifecycle: ['vgraph_beta_render', 'validate', 'drift_snapshot', 'post_route_reflection', 'honest_mode'],
    context7Policy: 'required',
    reasoningPolicy: 'high',
    stopGate: 'gx-gate.json',
    cliEntrypoint: 'sks gx init|render|validate|drift|snapshot',
    examples: ['$GX render a visual context cartridge']
  },
  {
    id: 'Wiki',
    command: '$Wiki',
    mode: 'WIKI',
    route: 'TriWiki refresh and maintenance',
    description: 'Refresh, pack, validate, or prune TriWiki context packs from Codex App.',
    requiredSkills: ['wiki', 'sks', 'honest-mode'],
    lifecycle: ['intent_classification', 'wiki_refresh_or_pack', 'wiki_validate', 'honest_mode'],
    context7Policy: 'optional',
    reasoningPolicy: 'medium',
    stopGate: 'none',
    cliEntrypoint: 'sks wiki refresh|pack|validate|prune',
    examples: ['$Wiki refresh', '$Wiki prune and validate']
  },
  {
    id: 'Help',
    command: '$Help',
    mode: 'HELP',
    route: 'command help',
    description: 'Explain installed SKS commands and workflows.',
    requiredSkills: ['help', 'prompt-pipeline'],
    lifecycle: ['skill_context', 'discovery_output'],
    context7Policy: 'optional',
    reasoningPolicy: 'medium',
    stopGate: 'none',
    cliEntrypoint: 'sks help',
    examples: ['$Help show available SKS commands']
  }
];

export const DOLLAR_COMMANDS = ROUTES.flatMap(({ command, route, description, dollarAliases = [] }) => [
  { command, route, description },
  ...dollarAliases.map((alias) => ({ command: alias, route, description }))
]);
export function routeAppSkillNames(route) {
  const canonical = dollarSkillName(route.command);
  return [
    ...(RESERVED_CODEX_PLUGIN_SKILL_NAMES.includes(canonical) ? [] : [canonical]),
    ...(route.appSkillAliases || [])
  ];
}

export const DOLLAR_SKILL_NAMES = ROUTES.flatMap((route) => routeAppSkillNames(route));
export const DOLLAR_COMMAND_ALIASES = ROUTES.flatMap((route) => [
  ...routeAppSkillNames(route).map((alias) => ({ canonical: route.command, app_skill: `$${alias}` }))
]);

export const COMMAND_CATALOG = [
  { name: 'help', usage: 'sks help [topic]', description: 'Show CLI help or focused help for a topic.' },
  { name: 'version', usage: 'sks version | sks --version', description: 'Print the installed Sneakoscope Codex version.' },
  { name: 'update-check', usage: 'sks update-check [--json]', description: 'Check npm for the latest Sneakoscope Codex version.' },
  { name: 'wizard', usage: 'sks wizard', description: 'Open an interactive setup UI for install scope, setup, doctor, and verification.' },
  { name: 'commands', usage: 'sks commands [--json]', description: 'List every user-facing command with a short description.' },
  { name: 'usage', usage: `sks usage [${USAGE_TOPICS}]`, description: 'Print copy-ready workflows for common tasks.' },
  { name: 'quickstart', usage: 'sks quickstart', description: 'Show the shortest safe setup and verification flow.' },
  { name: 'bootstrap', usage: 'sks bootstrap [--install-scope global|project] [--local-only] [--json]', description: 'Initialize the current project, install SKS Codex App files/skills, check Context7/Codex App/tmux, and print ready true/false.' },
  { name: 'root', usage: 'sks root [--json]', description: 'Show whether SKS is using a project root or the per-user global SKS runtime root.' },
  { name: 'deps', usage: 'sks deps check|install [tmux|codex|context7|all] [--yes]', description: 'Check or guided-install Node/npm PATH, Codex CLI/App, Context7, Browser tooling, Computer Use, tmux, and Homebrew on macOS.' },
  { name: 'codex-app', usage: 'sks codex-app [check|open|remote-control]', description: 'Check Codex App install and first-party MCP/plugin readiness, then show app setup files, examples, and Codex CLI 0.130.0+ remote-control availability.' },
  { name: 'codex-lb', usage: 'sks codex-lb status|health|repair|setup --host <domain> --api-key <key>', description: 'Configure, health-check, or repair codex-lb provider auth by writing ~/.codex/config.toml, restoring CODEX_LB_API_KEY env auth from stored or legacy login-cache state, and preserving the shared Codex login cache unless explicitly requested.' },
  { name: 'auth', usage: 'sks auth status|health|repair|setup --host <domain> --api-key <key>', description: 'Shortcut for codex-lb provider auth status, health, repair, and setup commands.' },
  { name: 'openclaw', usage: 'sks openclaw install|path|print [--dir path] [--force] [--json]', description: 'Generate an OpenClaw skill package so OpenClaw agents can discover and use local SKS workflows.' },
  { name: 'tmux', usage: 'sks | sks tmux open|check|status [--workspace name]', description: 'Open the default SKS tmux runtime with bare sks, or use tmux subcommands for explicit launch/check/status.' },
  { name: 'mad', usage: 'sks --mad [--high]', description: 'Open a one-shot tmux Codex CLI workspace with the SKS MAD full-access auto-review profile.' },
  { name: 'auto-review', usage: 'sks auto-review status|enable|start [--high] | sks --Auto-review --high', description: 'Enable Codex automatic approval review and launch SKS tmux with the auto-review profile.' },
  { name: 'dollar-commands', usage: 'sks dollar-commands [--json]', description: 'List Codex App $ commands such as $DFix and $Team.' },
  { name: 'dfix', usage: 'sks dfix', description: 'Explain $DFix ultralight direct-fix mode.' },
  { name: 'qa-loop', usage: 'sks qa-loop prepare|answer|run|status ...', description: 'Dogfood UI/API as human proxy with safety gates, safe fixes, rechecks, Codex Computer Use-only UI evidence, report.' },
  { name: 'ppt', usage: 'sks ppt build|status <mission-id|latest> [--json]', description: 'Build or inspect $PPT HTML/PDF artifacts from a sealed presentation decision contract.' },
  { name: 'image-ux-review', usage: 'sks image-ux-review status <mission-id|latest> [--json]', description: 'Inspect $Image-UX-Review gpt-image-2/imagegen annotated UI/UX review artifacts.' },
  { name: 'context7', usage: 'sks context7 check|setup|tools|resolve|docs|evidence ...', description: 'Check, configure, and call the local Context7 MCP requirement.' },
  { name: 'recallpulse', usage: 'sks recallpulse run|status|eval|governance|checklist <mission-id|latest>', description: 'Run report-only RecallPulse active recall, durable status, proof capsule, evidence envelope, and governance checks.' },
  { name: 'pipeline', usage: 'sks pipeline status|resume|plan|answer ...', description: 'Inspect the active skill-first route, materialized execution plan, ambiguity gates, and completion gates.' },
  { name: 'guard', usage: 'sks guard check [--json]', description: 'Check SKS harness self-protection lock, fingerprints, and source-repo exception state.' },
  { name: 'conflicts', usage: 'sks conflicts check|prompt [--json]', description: 'Detect other Codex harnesses such as OMX/DCodex and print the GPT-5.5 high cleanup prompt.' },
  { name: 'versioning', usage: 'sks versioning status|bump|disable [--json]', description: 'Manage explicit project version syncs; SKS does not install Git pre-commit hooks.' },
  { name: 'aliases', usage: 'sks aliases', description: 'Show command aliases and npm binary names.' },
  { name: 'setup', usage: 'sks setup [--bootstrap] [--install-scope global|project] [--local-only] [--force] [--json]', description: 'Initialize SKS state, Codex App files, hooks, skills, and rules.' },
  { name: 'fix-path', usage: 'sks fix-path [--install-scope global|project] [--json]', description: 'Refresh hook commands with the resolved SKS binary path.' },
  { name: 'doctor', usage: 'sks doctor [--fix] [--local-only] [--json] [--install-scope global|project]', description: 'Check and repair SKS generated files, while blocking setup if another Codex harness is detected.' },
  { name: 'init', usage: 'sks init [--force] [--local-only] [--install-scope global|project]', description: 'Initialize the local SKS control surface.' },
  { name: 'selftest', usage: 'sks selftest [--mock]', description: 'Run local smoke tests without calling a model.' },
  { name: 'goal', usage: 'sks goal create|pause|resume|clear|status ...', description: 'Prepare and control the fast SKS bridge overlay for Codex native persisted /goal workflows.' },
  { name: 'research', usage: 'sks research prepare|run|status ...', description: 'Run long-form real research missions with xhigh scout Eureka ideas, debate, layered sources, paper, novelty, and falsification gates.' },
  { name: 'db', usage: 'sks db policy|scan|mcp-config|classify|check ...', description: 'Inspect and enforce database/Supabase safety policy.' },
  { name: 'eval', usage: 'sks eval run|compare|thresholds ...', description: 'Run deterministic context-quality and performance evidence checks.' },
  { name: 'harness', usage: 'sks harness fixture|review [--json]', description: 'Run Harness Growth Factory fixtures for forgetting, skills, experiments, tool taxonomy, permissions, MultiAgentV2, and tmux views.' },
  { name: 'perf', usage: 'sks perf run|workflow [--json] [--iterations N] [--intent "task"] [--changed file1,file2]', description: 'Measure structured GPT-5.5/SKS performance budgets, including Proof Field workflow decisions and fast-lane evidence.' },
  { name: 'proof-field', usage: 'sks proof-field scan [--json] [--intent "task"] [--changed file1,file2]', description: 'Analyze Potential Proof Field cones, negative-work cache, and fast-lane eligibility for a change set.' },
  { name: 'skill-dream', usage: 'sks skill-dream status|run|record [--json]', description: 'Track generated-skill usage in lightweight JSON and periodically report keep, merge, prune, and improvement candidates without deleting skills automatically.' },
  { name: 'code-structure', usage: 'sks code-structure scan [--json]', description: 'Scan handwritten source files for 1000/2000/3000-line structure gates and split-review exceptions.' },
  { name: 'validate-artifacts', usage: 'sks validate-artifacts [mission-id|latest] [--json]', description: 'Validate schema-backed mission artifacts for work orders, effort decisions, visual maps, dogfood reports, skills, mistake memory, Team dashboard state, and Honest Mode.' },
  { name: 'wiki', usage: 'sks wiki coords|pack|refresh|prune|validate ...', description: 'Build, refresh, prune, and validate RGBA/trig LLM Wiki context packs with attention.use_first and attention.hydrate_first for compact recall plus source hydration.' },
  { name: 'hproof', usage: 'sks hproof check [mission-id|latest]', description: 'Evaluate the H-Proof done gate for a mission.' },
  { name: 'team', usage: 'sks team "task" [executor:5 reviewer:6 user:1]|log|tail|watch|lane|status|dashboard|event|message|open-tmux|attach-tmux|cleanup-tmux ...', description: 'Create and observe a scout-first Team mission with at least five reviewer/QA validation lanes, current-session managed tmux lanes when available, transcript messages, and cleanup-aware follow panes.' },
  { name: 'reasoning', usage: 'sks reasoning ["prompt"] [--json]', description: 'Show SKS temporary reasoning-effort routing: medium for simple tasks, high for logic, xhigh for research.' },
  { name: 'gx', usage: 'sks gx init|render|validate|drift|snapshot [name]', description: 'Create and verify deterministic SVG/HTML visual context cartridges.' },
  { name: 'profile', usage: 'sks profile show|set <model>', description: 'Inspect or set the current SKS model profile metadata.' },
  { name: 'gc', usage: 'sks gc [--dry-run] [--json]', description: 'Compact oversized logs and prune stale runtime artifacts.' },
  { name: 'memory', usage: 'sks memory [--dry-run] [--json]', description: 'Alias for SKS garbage collection and retention handling.' },
  { name: 'stats', usage: 'sks stats [--json]', description: 'Show package and .sneakoscope storage size.' }
];

export function routeById(id) {
  const key = String(id || '').replace(/^\$/, '').toLowerCase();
  return ROUTES.find((route) => {
    const aliases = [
      route.id,
      route.mode,
      dollarSkillName(route.command),
      ...(route.appSkillAliases || [])
    ].map((x) => String(x || '').toLowerCase());
    return aliases.includes(key);
  }) || null;
}

export function routeByDollarCommand(commandName) {
  const key = String(commandName || '').replace(/^\$/, '').toLowerCase();
  return ROUTES.find((route) => [
    dollarSkillName(route.command),
    ...(route.dollarAliases || []).map((alias) => dollarSkillName(alias)),
    ...(route.appSkillAliases || [])
  ].includes(key)) || null;
}

function leadingDollarCommandMatch(prompt) {
  const text = String(prompt || '').trim();
  return text.match(/^\$([A-Za-z][A-Za-z0-9_-]*)(?:\s|:|$)/)
    || text.match(/^\[\$([A-Za-z][A-Za-z0-9_-]*)\]\([^)]+\)(?:\s|:|$)/);
}

function embeddedDollarCommandMatch(prompt) {
  const text = String(prompt || '');
  const matches = [];
  for (const match of text.matchAll(/\[\$([A-Za-z][A-Za-z0-9_-]*)\]\([^)]+\)/g)) matches.push({ index: match.index, command: match[1] });
  for (const match of text.matchAll(/(^|[\s([{<])\$([A-Za-z][A-Za-z0-9_-]*)(?=\s|:|$|[.,!?;)\]}])/g)) matches.push({ index: match.index + match[1].length, command: match[2] });
  return matches
    .sort((a, b) => a.index - b.index)
    .find((match) => routeByDollarCommand(match.command) || String(match.command || '').toUpperCase() === 'MAD-SKS') || null;
}

export function dollarCommand(prompt) {
  const leading = leadingDollarCommandMatch(prompt);
  if (leading) return leading[1].toUpperCase();
  const embedded = embeddedDollarCommandMatch(prompt);
  return embedded ? embedded.command.toUpperCase() : null;
}

export function hasMadSksSignal(prompt = '') {
  return /(?:^|\s)(?:\$MAD-SKS|\[\$MAD-SKS\]\([^)]+\))(?:\s|:|$)/i.test(String(prompt || ''));
}

export function stripMadSksSignal(prompt = '') {
  return String(prompt || '')
    .replace(/(?:^|\s)(?:\$MAD-SKS|\[\$MAD-SKS\]\([^)]+\))(?:\s|:)?/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripDollarCommand(prompt) {
  return String(prompt || '').trim()
    .replace(/^\$[A-Za-z][A-Za-z0-9_-]*(?:\s|:)?\s*/, '')
    .replace(/^\[\$[A-Za-z][A-Za-z0-9_-]*\]\([^)]+\)(?:\s|:)?\s*/, '')
    .trim();
}

export function looksLikeTinyDirectFix(prompt) {
  const text = String(prompt || '');
  if (looksLikeDirectFixQuestion(text)) return false;
  const broadCodeCue = /(구현|개발|리팩터|마이그레이션|버그|기능|로직|인증|데이터베이스|스키마|서버|API|테스트|동작|작동|implement|build|develop|refactor|rewrite|migrate|bug|feature|logic|auth|database|schema|server|endpoint|test|deploy|generator|workflow|flow|work(?:ing)?)/i.test(text);
  if (broadCodeCue) return false;
  const creationCue = /(?:\b(?:create|add|make|build|implement)\b.*\b(?:button|component|page|screen|form|modal|endpoint|feature|route|view|flow)\b)|(?:(?:버튼|컴포넌트|페이지|화면|폼|모달|엔드포인트|기능|플로우).*(?:만들|생성|추가|구현))/i.test(text);
  if (creationCue && !/(라벨|문구|텍스트|글자|색|컬러|간격|여백|정렬|label|copy|text|color|spacing|padding|margin|align)/i.test(text)) return false;
  const simpleSurfaceCue = /(글자|텍스트|문구|내용|색|컬러|폰트|간격|여백|정렬|라벨|영어|한국어|번역|오타|맞춤법|문장|제목|헤딩|README|문서|주석|메시지|버전|설정값|copy|text|color|font|spacing|padding|margin|align|label|translate|typo|spelling|grammar|wording|title|heading|docs?|comment|message|string|literal|placeholder|tooltip|config\s+value|package\.json|package-lock\.json|package\s+version|version\s*(?:to|만|으로))/i.test(text);
  const behaviorCue = /(\b(?:submit|save|delete|navigate|redirect|validate|send|fetch|call|trigger|execute|toggle|upload|download)\b|\b(?:on\s*click|click\s+handler|handler|event)\b|submit(?:s|ting)?\s+(?:the\s+)?form|폼\s*제출|제출(?:하|되|하게)|클릭|핸들러|이벤트|저장|삭제|이동|검증|전송|호출|실행|토글|업로드|다운로드)/i.test(text);
  if (behaviorCue && !simpleSurfaceCue) return false;
  const directCue = simpleSurfaceCue || /(버튼|button)/i.test(text);
  const changeCue = /(바꿔|변경|수정|교체|고쳐|영어로|한국어로|change|replace|update|make|turn|translate|fix)/i.test(text);
  return directCue && changeCue && (!looksLikeAnswerOnlyRequest(text) || looksLikeDirectWorkRequest(text));
}

function looksLikeDirectFixQuestion(prompt = '') {
  const text = String(prompt || '').trim();
  if (!text) return false;
  if (looksLikePoliteDirectWorkRequest(text)) return false;
  return looksLikeMethodQuestion(text)
    && /(fix|change|replace|update|edit|typo|wording|label|color|spacing|고치|바꾸|변경|수정|교체|오타|문구|라벨|색|간격)/i.test(text)
    && !/(해줘|고쳐줘|바꿔줘|변경해줘|수정해줘|교체해줘|please\s+(?:fix|change|replace|update|edit)|\b(?:fix|change|replace|update|edit)\b.*(?:for\s+me|now)$)/i.test(text);
}

function looksLikeMethodQuestion(prompt = '') {
  const text = String(prompt || '').trim();
  if (!text) return false;
  return /(?:\?|^(?:how\s+(?:do|can|could|should|would)\s+(?:i|we)\b|how\s+to\b|what(?:'s| is)?\s+(?:the\s+)?(?:best\s+)?way\b|(?:can|could|should|would)\s+(?:i|we)\b)|^(?:어떻게|방법|왜|무엇|뭐|언제|어디|가능|맞아|인가|인지)\b)/i.test(text);
}

function looksLikePoliteDirectWorkRequest(prompt = '') {
  const text = String(prompt || '').trim();
  if (!text) return false;
  return /^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:fix|change|replace|update|edit|make|turn|translate|create|add|build|implement|delete|remove)\b/i.test(text)
    || /(?:해줄\s*수|해\s*줄래|바꿔줄|고쳐줄|수정해줄|변경해줄|교체해줄)/i.test(text);
}

export function looksLikePresentationArtifactRequest(prompt = '') {
  const text = String(prompt || '');
  const lower = text.toLowerCase();
  const cue = /\b(ppt|presentation|deck|slide|slides|pitch\s*deck|proposal\s*deck)\b|발표자료|발표\s*자료|소개자료|제안서|피치덱|슬라이드|pdf\s*자료/i.test(text);
  if (!cue) return false;
  const meta = /커맨드|command|route|routing|파이프라인|pipeline|schema|스키마|모호성|ambiguity|질문|게이트|gate/i.test(text);
  if (meta) return false;
  return /만들|작성|생성|제작|디자인|export|pdf|html|create|generate|build|write|make/i.test(text) || /\b(ppt|presentation|deck|slides?)\b/.test(lower);
}

export function looksLikeImageUxReviewRequest(prompt = '') {
  const text = String(prompt || '');
  const reviewCue = /(ui\/?ux|ux|ui|screen|screenshot|visual|interface|화면|스크린|캡처|비주얼|인터페이스|사용성|유아이|유엑스)/i.test(text)
    && /(review|critique|audit|inspect|analy[sz]e|검수|리뷰|분석|평가|진단)/i.test(text);
  const imagegenCue = /(gpt-image-2|imagegen|\$imagegen|image\s*generation|generated\s*review|annotated\s*review|callout|이미지\s*생성|생성\s*이미지|콜아웃|주석\s*이미지)/i.test(text);
  const commandCue = /\$?(?:image-ux-review|ux-review|visual-review|ui-ux-review)\b/i.test(text);
  return commandCue || (reviewCue && imagegenCue);
}

export function routePrompt(prompt) {
  const text = stripVisibleDecisionAnswerBlocks(prompt);
  const command = dollarCommand(text);
  if (command) {
    if (command === 'MAD-SKS') {
      const afterModifier = stripMadSksSignal(text);
      const nestedCommand = dollarCommand(afterModifier);
      if (nestedCommand) return routeByDollarCommand(nestedCommand) || routeById('MadSKS');
      if (looksLikeAnswerOnlyRequest(afterModifier)) return routeById('Answer');
      if (looksLikeCodeChangingWork(afterModifier) || looksLikeDirectWorkRequest(afterModifier)) return routeById('Team');
      return routeById('MadSKS');
    }
    const route = routeByDollarCommand(command) || null;
    if (route?.id === 'SKS' && looksLikeTeamDefaultWork(stripDollarCommand(text))) return routeById('Team');
    if (route?.id === 'Team') return route;
    return route;
  }
  if (hasFromChatImgSignal(text)) return routeById('Team');
  if (looksLikePresentationArtifactRequest(text)) return routeById('PPT');
  if (looksLikeImageUxReviewRequest(text)) return routeById('ImageUXReview');
  if (looksLikeComputerUseFastLane(text)) return routeById('ComputerUse');
  if (looksLikeTinyDirectFix(text)) return routeById('DFix');
  if (looksLikeQuestionShapedDirective(text)) return routeById('Team');
  if (looksLikeAnswerOnlyRequest(text)) return routeById('Answer');
  if (/\b(SQL|Supabase|Postgres|migration|RLS|Prisma|Drizzle|Knex|database|DB|execute_sql|mcp)\b/i.test(text)) return routeById('DB');
  if (/\b(team|multi-agent|subagent|parallel agents|agent team)\b|병렬|팀/i.test(text)) return routeById('Team');
  if (looksLikeChatCaptureRequest(text) && !looksLikeAnswerOnlyRequest(text)) return routeById('Team');
  if (/\b(qa[-\s]?loop|qaloop|e2e\s+qa|qa\s+e2e)\b/i.test(text)) return routeById('QALoop');
  if (/\b(autoresearch|experiment|benchmark|SEO|GEO|ranking|optimi[sz]e|improve metric|discoverability|visibility|github stars?|npm downloads?|검색|노출|스타|다운로드)\b/i.test(text)) return routeById('AutoResearch');
  if (/\b(research|hypothesis|falsify|novelty|frontier|조사|연구)\b/i.test(text)) return routeById('Research');
  if (/(wiki\s+(refresh|pack|validate|prune)|triwiki\s+(refresh|pack|validate)|위키\s*(갱신|리프레시|정리|검증|패킹)|트라이위키|triwiki)/i.test(text) && !looksLikeDirectWorkRequest(text)) return routeById('Wiki');
  if (/\b(GX|vgraph|visual context|render cartridge|wiki coordinate|rgba|trig|llm wiki)\b/i.test(text)) return routeById('GX');
  if (looksLikeTeamDefaultWork(text)) return routeById('Team');
  return routeById('SKS');
}

export function looksLikeComputerUseFastLane(prompt = '') {
  const text = String(prompt || '');
  const computerUseCue = /\b(computer\s*use|codex\s+computer\s+use|computer-use)\b|컴퓨터\s*유즈|컴퓨터\s*사용|컴퓨터유즈/i.test(text);
  if (!computerUseCue) return false;
  return /\b(ui|browser|visual|screen|screenshot|e2e|qa|dogfood|fast|lane|pipeline|localhost|web|app|page)\b|화면|브라우저|시각|스크린|캡처|검증|빠른|고속|파이프라인|작업|속도/i.test(text);
}

export function looksLikeTeamDefaultWork(prompt = '') {
  const text = String(prompt || '').trim();
  if (!text) return false;
  if (looksLikeTinyDirectFix(text) || looksLikeAnswerOnlyRequest(text)) return false;
  return looksLikeCodeChangingWork(text) || looksLikeDirectWorkRequest(text);
}

export function looksLikeAnswerOnlyRequest(prompt = '') {
  const text = String(prompt || '').trim();
  if (!text) return false;
  if (looksLikeQuestionShapedDirective(text)) return false;
  const infoCue = /(왜|뭐야|무엇|뭔가|어떤|어떻게|언제|어디|누구|얼마|가능해|맞아|인가|인지|차이|의미|원리|이유|방법|설명|알려줘|요약|정리|비교|찾아줘|찾아봐|검색|조사|근거|출처|fact|source|cite|explain|what|why|how|when|where|who|which|whether|compare|summari[sz]e|search|look up|research|tell me|question|\?)/i.test(text);
  if (!infoCue) return false;
  return !looksLikeDirectWorkRequest(text);
}

export function looksLikeQuestionShapedDirective(prompt = '') {
  const text = String(prompt || '').trim();
  if (!text) return false;
  const directive = /(반드시|필수|무조건|해야\s*(?:해|함|돼|한다|하지|한다는|되는)|해야지|해야돼|해야한다|알지|기억해|파악해야|구분해야|막아야|보장해야|강제|기본적으로)/i.test(text);
  const pipelineCue = /(질문|질문형|암묵|지시|파이프라인|라우팅|route|routing|team|팀|sks|기본|구성|게이트|gate|작업|수정|구현|실행)/i.test(text);
  const complaint = /(왜|근데|그런데).*(안\s*하|안\s*되|없이|누락|빠뜨|생략|스킵|못\s*하).*(많|자주|계속|이렇게|함|하지|하냐|하니|\?)/i.test(text);
  return (directive && pipelineCue) || complaint;
}

export function looksLikeDirectWorkRequest(prompt = '') {
  const text = String(prompt || '');
  if (looksLikeDirectFixQuestion(text)) return false;
  if (looksLikeMethodQuestion(text) && !looksLikePoliteDirectWorkRequest(text) && !looksLikeQuestionShapedDirective(text)) return false;
  return looksLikeCodeChangingWork(text)
    || looksLikeChatCaptureRequest(text)
    || looksLikeQuestionShapedDirective(text)
    || /(작업|파이프라인|구현|수정|변경|추가|적용|반영|처리|수행|검수|설치|해결|리드미|README).*(해줘|해달|해라|해야|되게|줘야|줘야지|달라)/i.test(text)
    || /(진행해|수행해|작업해|처리해|적용해|반영해|검수해|고쳐줘|바꿔줘|해결해줘|만들어줘|해줘야|해줘야지|해달라|해야지|되게 해|install|run|execute|test|deploy|commit|push)/i.test(text);
}

export function routeNeedsContext7(route, prompt = '') {
  if (!route) return false;
  if (route.context7Policy === 'required') return true;
  if (route.context7Policy !== 'if_external_docs') return false;
  return /\b(package|library|framework|SDK|API|MCP|Supabase|React|Next|Vue|Svelte|Vite|Prisma|Drizzle|Knex|Postgres|npm|node_modules|docs?|documentation)\b/i.test(String(prompt || ''));
}

export function routeRequiresSubagents(route, prompt = '') {
  if (!route) return false;
  if (route.id === 'Team') return true;
  if (route.id === 'SKS') return looksLikeTeamDefaultWork(prompt);
  if (route.id === 'Help' || route.id === 'Answer' || route.id === 'Wiki' || route.id === 'ComputerUse') return false;
  if (route.id === 'PPT') return false;
  if (route.id === 'ImageUXReview') return false;
  if (route.id === 'Research' || route.id === 'AutoResearch') return true;
  if (route.id === 'Goal') return looksLikeExecutionWork(prompt) || looksLikeTeamDefaultWork(stripDollarCommand(prompt));
  if (route.id === 'DB' || route.id === 'GX') return looksLikeExecutionWork(prompt);
  if (route.id === 'DFix') return looksLikeCodeChangingWork(prompt) && !looksLikeTinyDirectFix(prompt);
  return looksLikeExecutionWork(prompt);
}

export function reflectionRequiredForRoute(route) {
  const id = String(route?.id || route?.mode || route?.route || route || '').replace(/^\$/, '');
  return /^(team|qaloop|qa-loop|ppt|imageuxreview|image-ux-review|research|autoresearch|db|database|madsks|mad-sks|gx)$/i.test(id);
}

export function looksLikeCodeChangingWork(prompt = '') {
  return /\b(implement|build|make|add|edit|modify|change|fix|refactor|rewrite|migrate|create|delete|remove|rename|update|patch|코드|구현|개발|수정|변경|추가|삭제|해결|고쳐|바꿔|리팩터|마이그레이션)\b/i.test(String(prompt || ''));
}

export function looksLikeExecutionWork(prompt = '') {
  const text = String(prompt || '');
  return looksLikeCodeChangingWork(text)
    || /\b(test|verify|run|doctor|setup|install|lint|typecheck|selftest|release|publish|execute|실행|검증|테스트|설치|배포)\b/i.test(text);
}

export function subagentExecutionPolicyText(route, prompt = '') {
  const required = routeRequiresSubagents(route, prompt);
  if (route?.id === 'Goal') {
    if (!required) return 'Subagent policy: Goal itself is a lightweight native /goal persistence overlay; subagents are not required for bridge creation/control.';
    return [
      'Subagent policy: Goal itself remains a lightweight native /goal persistence overlay.',
      'Because the prompt also asks for code-changing or execution work, continue that work through the selected SKS execution route and apply that route\'s worker/reviewer policy there.',
      noUnrequestedFallbackCodePolicyText()
    ].join(' ');
  }
  if (!required) {
    return 'Subagent policy: optional for this route; use subagents only when parallel exploration materially helps.';
  }
  return [
    'Subagent policy: REQUIRED for code-changing or execution work in this route.',
    'The selected SKS route itself authorizes route-owned worker/reviewer subagents; the user does not need to separately ask for subagents when the default Team pipeline is active.',
    'Before editing, the parent orchestrator must visibly state the SKS route, split independent write scopes, and spawn worker/reviewer subagents whenever the tools are available.',
    'Run workers in parallel only with disjoint ownership. The parent owns integration, verification, and final evidence.',
    'If subagent tools are unavailable or the work cannot be safely split, record that as explicit subagent evidence before editing.',
    noUnrequestedFallbackCodePolicyText()
  ].join(' ');
}

export const ALLOWED_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh']);

export function routeReasoning(route, prompt = '') {
  const text = String(prompt || '');
  const base = ALLOWED_REASONING_EFFORTS.has(route?.reasoningPolicy) ? route.reasoningPolicy : 'medium';
  if (hasFromChatImgSignal(text)) return reasoning('xhigh', 'from_chat_img_image_work_order_analysis');
  if (route?.id === 'Team') return teamRouteReasoning(text);
  if (route?.id === 'Research' || route?.id === 'AutoResearch') return reasoning('xhigh', 'research_or_experiment_route');
  if (route?.id === 'ImageUXReview') return reasoning('high', 'image_generation_visual_review_route');
  if (/\b(research|autoresearch|hypothesis|falsify|novelty|frontier|benchmark|experiment|SEO|GEO|ranking|연구|실험|가설|검증)\b/i.test(text)) return reasoning('xhigh', 'research_level_prompt');
  if (base === 'xhigh') return reasoning('xhigh', 'route_policy_xhigh');
  if (base === 'high' || /\b(architecture|design|migration|database|security|parallel|orchestrat|refactor|algorithm|logic|tradeoff|검토|설계|마이그레이션|보안|병렬|팀|논리)\b/i.test(text)) return reasoning('high', 'logical_or_safety_work');
  if (base === 'low') return reasoning('low', 'route_policy_low');
  return reasoning('medium', 'simple_fulfillment');
}

function teamRouteReasoning(text = '') {
  if (/(frontier|autoresearch|novelty|hypothesis|falsify|forensic|from-chat-img|가설|포렌식)/i.test(text)) return reasoning('xhigh', 'team_research_or_forensic_signal');
  if (/(research|current docs?|library|framework|sdk|api|database|supabase|sql|migration|security|permission|mad|release|publish|deploy|commit|push|architecture|algorithm|리서치|문서|데이터베이스|마이그레이션|보안|권한|배포|커밋|푸쉬)/i.test(text)) return reasoning('high', 'team_knowledge_safety_or_release_signal');
  if (/(tmux|terminal|cli|cmd|warp|tool(?:\s|-)?call|hook|router|routing|pipeline|multi[-\s]?pane|pane|process|config|터미널|라우팅|파이프라인|훅|도구|툴)/i.test(text)) return reasoning('medium', 'team_tooling_or_runtime_signal');
  if (/(tiny|simple|small|one[-\s]?line|typo|copy|label|spacing|rename|text|readme|docs?|간단|단순|오타|문구|라벨|간격|색상)/i.test(text)) return reasoning('low', 'team_simple_bounded_work_signal');
  return reasoning('medium', 'team_default_balanced_reasoning');
}

export function reasoningProfileName(effort) {
  if (effort === 'low') return 'sks-task-low';
  if (effort === 'xhigh') return 'sks-research-xhigh';
  if (effort === 'high') return 'sks-logic-high';
  return 'sks-task-medium';
}

export function reasoningInstruction(info) {
  const profile = reasoningProfileName(info?.effort);
  return `Temporary reasoning route: use ${info?.effort || 'medium'} reasoning (${profile}) in Fast service tier for this SKS route only; do not persist profile changes, and return to the default/user-selected profile after the route gate passes.`;
}

function reasoning(effort, reason) {
  const normalizedEffort = ALLOWED_REASONING_EFFORTS.has(effort) ? effort : 'medium';
  return { effort: normalizedEffort, profile: reasoningProfileName(normalizedEffort), reason, temporary: true };
}

export function context7RequirementText(required = true) {
  if (!required) return 'Context7 MCP is optional for this route unless external API/library documentation becomes relevant.';
  return 'Context7 MCP is required before completion: call resolve-library-id for the relevant package or API, then query-docs (or legacy get-library-docs), and let SKS record both PostToolUse events.';
}

export function formatDollarCommandsDetailed(indent = '') {
  const width = Math.max(...DOLLAR_COMMANDS.map((c) => c.command.length));
  return DOLLAR_COMMANDS.map((c) => `${indent}${c.command.padEnd(width)}  ${c.route}: ${c.description}`).join('\n');
}

export function formatDollarCommandsCompact(indent = '') {
  const width = Math.max(...DOLLAR_COMMANDS.map((c) => c.command.length));
  return DOLLAR_COMMANDS.map((c) => `${indent}${c.command.padEnd(width)}  ${c.route}`).join('\n');
}

export function dollarCommandNames() {
  return Array.from(new Set([
    ...DOLLAR_COMMANDS.map((c) => c.command),
    ...DOLLAR_COMMAND_ALIASES.map((alias) => alias.app_skill)
  ])).join(', ');
}

export function context7ConfigToml(transport = 'local') {
  if (transport === 'remote') return '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\n';
  return '[mcp_servers.context7]\ncommand = "npx"\nargs = ["-y", "@upstash/context7-mcp@latest"]\n';
}

export function hasContext7ConfigText(text) {
  const s = String(text || '');
  return /\[mcp_servers\.context7\]/.test(s)
    && (/@upstash\/context7-mcp@latest/.test(s) || /https:\/\/mcp\.context7\.com\/mcp/.test(s));
}
