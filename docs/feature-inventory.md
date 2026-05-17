# SKS Feature Inventory

Generated from `sks commands --json`, `src/cli/main.mjs`, `src/core/routes.mjs`, docs, and skill manifests.

## Coverage

- Status: coverage-ok
- Features: 102
- CLI commands: 56
- Handler keys: 56
- Dollar routes: 19
- App skill aliases: 21
- Skills: 47

## Release Coverage Rule

`sks features check --json` fails when a CLI command, hidden handler, dollar route, app skill alias, or project skill is not mapped to the feature registry. `npm run release:check` runs that check.

## Stable / Beta / Labs Map

| Feature | Category | Maturity | Commands / Routes | Known Gaps |
| --- | --- | --- | --- | --- |
| `cli-help` | core-cli | stable | sks help [topic] | none recorded |
| `cli-version` | core-cli | stable | sks version \| sks --version | none recorded |
| `cli-update-check` | core-cli | stable | sks update-check [--json] | none recorded |
| `cli-wizard` | core-cli | labs | sks wizard<br>sks ui | none recorded |
| `cli-commands` | core-cli | stable | sks commands [--json] | none recorded |
| `cli-usage` | core-cli | stable | sks usage [install\|setup\|bootstrap\|root\|deps\|tmux\|auto-review\|team\|qa-loop\|ppt\|image-ux-review\|goal\|research\|db\|codex-app\|hooks\|features\|all-features\|openclaw\|dfix\|design\|imagegen\|dollar\|context7\|pipeline\|reasoning\|guard\|conflicts\|versioning\|eval\|harness\|hproof\|gx\|wiki\|code-structure\|proof-field\|skill-dream] | none recorded |
| `cli-quickstart` | core-cli | stable | sks quickstart | none recorded |
| `cli-bootstrap` | install | labs | sks bootstrap [--install-scope global\|project] [--local-only] [--json] | none recorded |
| `cli-root` | core-cli | stable | sks root [--json] | none recorded |
| `cli-deps` | install | labs | sks deps check\|install [tmux\|codex\|context7\|all] [--yes] | none recorded |
| `cli-codex-app` | integration | beta | sks codex-app [check\|open\|pat status\|remote-control] | mobile/event payload details remain unknown |
| `cli-hooks` | integration | beta | sks hooks explain [--json]<br>sks hook | mobile/event payload details remain unknown |
| `cli-codex-lb` | integration | beta | sks codex-lb status\|health\|repair\|setup --host <domain> --api-key <key><br>sks auth | none recorded |
| `cli-auth` | integration | labs | sks auth status\|health\|repair\|setup --host <domain> --api-key <key> | none recorded |
| `cli-openclaw` | integration | labs | sks openclaw install\|path\|print [--dir path] [--force] [--json] | none recorded |
| `cli-tmux` | core-cli | labs | sks \| sks tmux open\|check\|status [--workspace name] | none recorded |
| `cli-mad` | core-cli | labs | sks --mad [--high] | none recorded |
| `cli-auto-review` | core-cli | labs | sks auto-review status\|enable\|start [--high] \| sks --Auto-review --high | none recorded |
| `cli-dollar-commands` | core-cli | labs | sks dollar-commands [--json] | none recorded |
| `cli-dfix` | core-cli | labs | sks dfix | none recorded |
| `cli-qa-loop` | loop | labs | sks qa-loop prepare\|answer\|run\|status ... | none recorded |
| `cli-ppt` | visual-memory | labs | sks ppt build\|status <mission-id\|latest> [--json] | none recorded |
| `cli-image-ux-review` | visual-memory | labs | sks image-ux-review status <mission-id\|latest> [--json]<br>sks ui-ux-review<br>sks ux-review<br>sks visual-review | none recorded |
| `cli-context7` | integration | labs | sks context7 check\|setup\|tools\|resolve\|docs\|evidence ... | none recorded |
| `cli-recallpulse` | loop | labs | sks recallpulse run\|status\|eval\|governance\|checklist <mission-id\|latest> | none recorded |
| `cli-pipeline` | proof-route | beta | sks pipeline status\|resume\|plan\|answer ... | none recorded |
| `cli-guard` | safety | beta | sks guard check [--json] | none recorded |
| `cli-conflicts` | safety | labs | sks conflicts check\|prompt [--json] | none recorded |
| `cli-versioning` | safety | labs | sks versioning status\|bump\|disable [--json] | none recorded |
| `cli-features` | core-cli | beta | sks features list\|check\|inventory [--json] [--write-docs] | feature fixtures remain progressive |
| `cli-all-features` | core-cli | beta | sks all-features selftest --mock [--json] | feature fixtures remain progressive |
| `cli-aliases` | core-cli | labs | sks aliases | none recorded |
| `cli-setup` | install | stable | sks setup [--bootstrap] [--install-scope global\|project] [--local-only] [--force] [--json] | none recorded |
| `cli-fix-path` | install | labs | sks fix-path [--install-scope global\|project] [--json] | none recorded |
| `cli-doctor` | install | stable | sks doctor [--fix] [--local-only] [--json] [--install-scope global\|project] | none recorded |
| `cli-init` | install | labs | sks init [--force] [--local-only] [--install-scope global\|project] | none recorded |
| `cli-selftest` | core-cli | stable | sks selftest [--mock] | none recorded |
| `cli-goal` | proof-route | beta | sks goal create\|pause\|resume\|clear\|status ... | none recorded |
| `cli-research` | loop | labs | sks research prepare\|run\|status ... | none recorded |
| `cli-db` | safety | beta | sks db policy\|scan\|mcp-config\|classify\|check ... | none recorded |
| `cli-eval` | loop | labs | sks eval run\|compare\|thresholds ... | none recorded |
| `cli-harness` | safety | labs | sks harness fixture\|review [--json] | none recorded |
| `cli-perf` | loop | labs | sks perf run\|workflow [--json] [--iterations N] [--intent "task"] [--changed file1,file2] | none recorded |
| `cli-proof-field` | proof-route | labs | sks proof-field scan [--json] [--intent "task"] [--changed file1,file2] | none recorded |
| `cli-skill-dream` | loop | labs | sks skill-dream status\|run\|record [--json] | none recorded |
| `cli-code-structure` | core-cli | labs | sks code-structure scan [--json] | none recorded |
| `cli-validate-artifacts` | proof-route | labs | sks validate-artifacts [mission-id\|latest] [--json] | none recorded |
| `cli-wiki` | visual-memory | beta | sks wiki coords\|pack\|refresh\|prune\|validate ... | none recorded |
| `cli-hproof` | proof-route | labs | sks hproof check [mission-id\|latest] | none recorded |
| `cli-team` | proof-route | beta | sks team "task" [executor:5 reviewer:6 user:1]\|log\|tail\|watch\|lane\|status\|dashboard\|event\|message\|open-tmux\|attach-tmux\|cleanup-tmux ... | none recorded |
| `cli-reasoning` | core-cli | labs | sks reasoning ["prompt"] [--json] | none recorded |
| `cli-gx` | visual-memory | labs | sks gx init\|render\|validate\|drift\|snapshot [name] | none recorded |
| `cli-profile` | core-cli | labs | sks profile show\|set <model> | none recorded |
| `cli-gc` | core-cli | labs | sks gc [--dry-run] [--json]<br>sks memory | none recorded |
| `cli-memory` | core-cli | labs | sks memory [--dry-run] [--json] | none recorded |
| `cli-stats` | core-cli | labs | sks stats [--json] | none recorded |
| `handler-postinstall` | internal | beta | sks postinstall | hidden handler docs needed if promoted |
| `route-dfix` | route | stable | $DFix<br>$dfix | none recorded |
| `route-answer` | route | stable | $Answer<br>$answer | none recorded |
| `route-sks` | route | stable | $SKS<br>$sks | none recorded |
| `route-team` | route | beta | $Team<br>$team<br>$from-chat-img | none recorded |
| `route-from-chat-img` | route | labs | $From-Chat-IMG | none recorded |
| `route-qa-loop` | route | beta | $QA-LOOP<br>$qa-loop | none recorded |
| `route-ppt` | route | labs | $PPT<br>$ppt | live imagegen/CU evidence required |
| `route-image-ux-review` | route | labs | $Image-UX-Review<br>$image-ux-review<br>$ux-review<br>$visual-review<br>$ui-ux-review | live imagegen/CU evidence required |
| `route-ux-review` | route | labs | $UX-Review | live imagegen/CU evidence required |
| `route-computer-use` | route | beta | $Computer-Use<br>$computer-use-fast<br>$cu | none recorded |
| `route-cu` | route | beta | $CU | none recorded |
| `route-goal` | route | beta | $Goal<br>$goal | none recorded |
| `route-research` | route | labs | $Research<br>$research | none recorded |
| `route-autoresearch` | route | labs | $AutoResearch<br>$autoresearch | none recorded |
| `route-db` | route | beta | $DB<br>$db | none recorded |
| `route-mad-sks` | route | beta | $MAD-SKS<br>$mad-sks | permission closed by owning gate |
| `route-gx` | route | labs | $GX<br>$gx | none recorded |
| `route-wiki` | route | stable | $Wiki<br>$wiki | none recorded |
| `route-help` | route | stable | $Help<br>$help | none recorded |
| `skill-autoresearch-loop` | skill | labs | $autoresearch-loop | runtime fixtures owned by route |
| `skill-context7-docs` | skill | labs | $context7-docs | runtime fixtures owned by route |
| `skill-db-safety-guard` | skill | labs | $db-safety-guard | runtime fixtures owned by route |
| `skill-design-artifact-expert` | skill | labs | $design-artifact-expert | runtime fixtures owned by route |
| `skill-design-system-builder` | skill | labs | $design-system-builder | runtime fixtures owned by route |
| `skill-design-ui-editor` | skill | labs | $design-ui-editor | runtime fixtures owned by route |
| `skill-getdesign-reference` | skill | labs | $getdesign-reference | runtime fixtures owned by route |
| `skill-gx-visual-generate` | skill | labs | $gx-visual-generate | runtime fixtures owned by route |
| `skill-gx-visual-read` | skill | labs | $gx-visual-read | runtime fixtures owned by route |
| `skill-gx-visual-validate` | skill | labs | $gx-visual-validate | runtime fixtures owned by route |
| `skill-honest-mode` | skill | labs | $honest-mode | runtime fixtures owned by route |
| `skill-hproof-claim-ledger` | skill | labs | $hproof-claim-ledger | runtime fixtures owned by route |
| `skill-hproof-evidence-bind` | skill | labs | $hproof-evidence-bind | runtime fixtures owned by route |
| `skill-imagegen` | skill | labs | $imagegen | runtime fixtures owned by route |
| `skill-performance-evaluator` | skill | labs | $performance-evaluator | runtime fixtures owned by route |
| `skill-pipeline-runner` | skill | labs | $pipeline-runner | runtime fixtures owned by route |
| `skill-prompt-pipeline` | skill | labs | $prompt-pipeline | runtime fixtures owned by route |
| `skill-ralph` | skill | labs | $ralph | runtime fixtures owned by route |
| `skill-ralph-resolver` | skill | labs | $ralph-resolver | runtime fixtures owned by route |
| `skill-ralph-supervisor` | skill | labs | $ralph-supervisor | runtime fixtures owned by route |
| `skill-reasoning-router` | skill | labs | $reasoning-router | runtime fixtures owned by route |
| `skill-reflection` | skill | labs | $reflection | runtime fixtures owned by route |
| `skill-research-discovery` | skill | labs | $research-discovery | runtime fixtures owned by route |
| `skill-seo-geo-optimizer` | skill | labs | $seo-geo-optimizer | runtime fixtures owned by route |
| `skill-solution-scout` | skill | labs | $solution-scout | runtime fixtures owned by route |
| `skill-turbo-context-pack` | skill | labs | $turbo-context-pack | runtime fixtures owned by route |

## Unmapped Coverage

- cli_command_names: none
- handler_keys: none
- dollar_commands: none
- app_skill_aliases: none
- skills: none

## Prompt Checklist Coverage

- [x] Collected `sks commands --json` command surface via `COMMAND_CATALOG`.
- [x] Parsed `src/cli/main.mjs` handler keys, including hidden handlers and aliases.
- [x] Collected dollar routes and app skill aliases from `src/core/routes.mjs`.
- [x] Scanned README, Codex quick reference, AGENTS, and generated skill manifest for dollar-route mentions.
- [x] Mapped project skills from `.agents/skills` into the registry.
- [x] Exposed the registry through `sks features list --json`.
- [x] Added a release coverage check through `sks features check --json`.
