# SKS Feature Inventory

Generated from `sks commands --json`, `src/cli/main.js`, `src/core/routes.js`, docs, and skill manifests.

## Coverage

- Status: coverage-ok
- Features: 117
- CLI commands: 68
- Handler keys: 0
- Dollar routes: 21
- App skill aliases: 23
- Skills: 49
- Fixture statuses: pass=117
- Feature quality: runtime_verified=43, runtime_mock_verified=47, integration_optional=5, static_contract=22, missing=0

## Release Coverage Rule

`sks features check --json` fails when a CLI command, hidden handler, dollar route, app skill alias, or project skill is not mapped to the feature registry. `npm run release:check` runs that check.

## Stable / Beta / Labs Map

| Feature | Category | Maturity | Commands / Routes | Fixture | Quality | Known Gaps |
| --- | --- | --- | --- | --- | --- | --- |
| `cli-help` | core-cli | stable | sks help [topic] | execute:pass | runtime_verified | none recorded |
| `cli-version` | core-cli | stable | sks version \| sks --version | execute:pass | runtime_verified | none recorded |
| `cli-update-check` | core-cli | stable | sks update-check [--json] | static:pass | static_contract | none recorded |
| `cli-wizard` | core-cli | labs | sks wizard | mock:pass | runtime_mock_verified | none recorded |
| `cli-commands` | core-cli | stable | sks commands [--json] | execute:pass | runtime_verified | none recorded |
| `cli-run` | core-cli | labs | sks run "task" [--visual\|--research\|--db] [--json] | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `cli-status` | core-cli | labs | sks status [--json] | execute:pass | runtime_verified | none recorded |
| `cli-usage` | core-cli | stable | sks usage [install\|setup\|bootstrap\|root\|deps\|tmux\|auto-review\|team\|qa-loop\|ppt\|image-ux-review\|goal\|research\|db\|codex-app\|hooks\|features\|all-features\|openclaw\|dfix\|commit\|commit-and-push\|design\|imagegen\|dollar\|context7\|pipeline\|scouts\|reasoning\|guard\|conflicts\|versioning\|eval\|harness\|hproof\|gx\|wiki\|code-structure\|proof-field\|skill-dream\|rust] | execute:pass | runtime_verified | none recorded |
| `cli-quickstart` | core-cli | stable | sks quickstart | execute:pass | runtime_verified | none recorded |
| `cli-bootstrap` | install | labs | sks bootstrap [--install-scope global\|project] [--local-only] [--json] | mock:pass | runtime_mock_verified | none recorded |
| `cli-root` | core-cli | stable | sks root [--json] | execute:pass | runtime_verified | none recorded |
| `cli-deps` | install | labs | sks deps check\|install [tmux\|codex\|context7\|all] [--yes] | mock:pass | runtime_mock_verified | none recorded |
| `cli-codex-app` | integration | beta | sks codex-app [check\|open\|pat status\|remote-control] | real_optional:pass | integration_optional | mobile/event payload details remain unknown |
| `cli-hooks` | integration | beta | sks hooks explain\|status\|trust-report\|replay ... [--json] | mock:pass | runtime_mock_verified | mobile/event payload details remain unknown |
| `cli-codex-lb` | integration | beta | sks codex-lb status\|health\|metrics\|doctor\|circuit\|repair\|setup ... | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `cli-auth` | integration | labs | sks auth status\|health\|repair\|setup --host <domain> --api-key <key> | mock:pass | runtime_mock_verified | none recorded |
| `cli-openclaw` | integration | labs | sks openclaw install\|path\|print [--dir path] [--force] [--json] | mock:pass | runtime_mock_verified | none recorded |
| `cli-tmux` | core-cli | labs | sks \| sks tmux open\|check\|status [--workspace name] | mock:pass | runtime_mock_verified | none recorded |
| `cli-mad` | core-cli | labs | sks --mad [--high] | mock:pass | runtime_mock_verified | none recorded |
| `cli-auto-review` | core-cli | labs | sks auto-review status\|enable\|start [--high] \| sks --Auto-review --high | mock:pass | runtime_mock_verified | none recorded |
| `cli-dollar-commands` | core-cli | labs | sks dollar-commands [--json] | execute:pass | runtime_verified | none recorded |
| `cli-commit` | core-cli | labs | sks commit [--message "msg"] [--json] | mock:pass | runtime_mock_verified | none recorded |
| `cli-commit-and-push` | core-cli | labs | sks commit-and-push [--message "msg"] [--json] | mock:pass | runtime_mock_verified | none recorded |
| `cli-dfix` | core-cli | labs | sks dfix | execute:pass | runtime_verified | none recorded |
| `cli-qa-loop` | loop | labs | sks qa-loop prepare\|answer\|run\|status ... | mock:pass | runtime_mock_verified | none recorded |
| `cli-ppt` | visual-memory | labs | sks ppt build\|status <mission-id\|latest> [--json] | mock:pass | runtime_mock_verified | none recorded |
| `cli-image-ux-review` | visual-memory | labs | sks image-ux-review status <mission-id\|latest> [--json] | mock:pass | runtime_mock_verified | none recorded |
| `cli-context7` | integration | labs | sks context7 check\|setup\|tools\|resolve\|docs\|evidence ... | real_optional:pass | integration_optional | none recorded |
| `cli-recallpulse` | loop | labs | sks recallpulse run\|status\|eval\|governance\|checklist <mission-id\|latest> | mock:pass | runtime_mock_verified | none recorded |
| `cli-pipeline` | proof-route | beta | sks pipeline status\|resume\|plan\|answer ... | mock:pass | runtime_mock_verified | none recorded |
| `cli-scouts` | proof-route | beta | sks scouts plan\|run\|status\|consensus\|handoff\|validate <mission-id\|latest> [--json] | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `cli-scout` | proof-route | beta | sks scout plan\|run\|status\|consensus\|handoff\|validate <mission-id\|latest> [--json] | mock:pass | runtime_mock_verified | none recorded |
| `cli-guard` | safety | beta | sks guard check [--json] | execute:pass | runtime_verified | none recorded |
| `cli-conflicts` | safety | labs | sks conflicts check\|prompt [--json] | execute:pass | runtime_verified | none recorded |
| `cli-versioning` | safety | labs | sks versioning status\|bump\|disable [--json] | execute:pass | runtime_verified | none recorded |
| `cli-features` | core-cli | beta | sks features list\|check\|inventory [--json] [--write-docs] | execute:pass | runtime_verified | feature fixtures remain progressive |
| `cli-all-features` | core-cli | beta | sks all-features selftest --mock [--json] | mock:pass | runtime_mock_verified | feature fixtures remain progressive |
| `cli-aliases` | core-cli | labs | sks aliases | execute:pass | runtime_verified | none recorded |
| `cli-setup` | install | stable | sks setup [--bootstrap] [--install-scope global\|project] [--local-only] [--force] [--json] | real_optional:pass | integration_optional | none recorded |
| `cli-fix-path` | install | labs | sks fix-path [--install-scope global\|project] [--json] | execute:pass | runtime_verified | none recorded |
| `cli-doctor` | install | stable | sks doctor [--fix] [--local-only] [--json] [--install-scope global\|project] | real_optional:pass | integration_optional | none recorded |
| `cli-paths` | core-cli | labs | sks paths managed [--json] | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `cli-rollback` | core-cli | labs | sks rollback list\|apply <id> [--json] | execute:pass | runtime_verified | none recorded |
| `cli-init` | install | labs | sks init [--force] [--local-only] [--install-scope global\|project] | mock:pass | runtime_mock_verified | none recorded |
| `cli-selftest` | core-cli | stable | sks selftest [--mock] | execute:pass | runtime_verified | none recorded |
| `cli-goal` | proof-route | beta | sks goal create\|pause\|resume\|clear\|status ... | mock:pass | runtime_mock_verified | none recorded |
| `cli-research` | loop | labs | sks research prepare\|run\|status ... | mock:pass | runtime_mock_verified | none recorded |
| `cli-db` | safety | beta | sks db policy\|scan\|mcp-config\|classify\|check ... | execute:pass | runtime_verified | none recorded |
| `cli-eval` | loop | labs | sks eval run\|compare\|thresholds ... | mock:pass | runtime_mock_verified | none recorded |
| `cli-harness` | safety | labs | sks harness fixture\|review [--json] | mock:pass | runtime_mock_verified | none recorded |
| `cli-perf` | loop | labs | sks perf run\|workflow\|cold-start [--json] [--iterations N] | execute:pass | runtime_verified | none recorded |
| `cli-bench` | core-cli | labs | sks bench core\|route-fixtures\|blackbox\|trust-kernel [--json] | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `cli-proof` | core-cli | labs | sks proof show\|latest\|validate\|export\|smoke [--json\|--md] | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `cli-trust` | core-cli | labs | sks trust report\|validate\|status\|explain [latest\|mission-id] [--json] | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `cli-proof-field` | proof-route | labs | sks proof-field scan [--json] [--intent "task"] [--changed file1,file2] | execute:pass | runtime_verified | none recorded |
| `cli-skill-dream` | loop | labs | sks skill-dream status\|run\|record [--json] | execute:pass | runtime_verified | none recorded |
| `cli-code-structure` | core-cli | labs | sks code-structure scan [--json] | execute:pass | runtime_verified | none recorded |
| `cli-rust` | core-cli | labs | sks rust status\|smoke [--json] [--require-native] | execute:pass | runtime_verified | none recorded |
| `cli-validate-artifacts` | proof-route | labs | sks validate-artifacts [mission-id\|latest] [--json] | mock:pass | runtime_mock_verified | none recorded |
| `cli-wiki` | visual-memory | beta | sks wiki coords\|pack\|refresh\|prune\|validate ... | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `cli-hproof` | proof-route | labs | sks hproof check [mission-id\|latest] | mock:pass | runtime_mock_verified | none recorded |
| `cli-team` | proof-route | beta | sks team "task" [executor:5 reviewer:6 user:1]\|log\|tail\|watch\|lane\|status\|dashboard\|event\|message\|open-tmux\|attach-tmux\|cleanup-tmux ... | mock:pass | runtime_mock_verified | none recorded |
| `cli-reasoning` | core-cli | labs | sks reasoning ["prompt"] [--json] | mock:pass | runtime_mock_verified | none recorded |
| `cli-gx` | visual-memory | labs | sks gx init\|render\|validate\|drift\|snapshot [name] | mock:pass | runtime_mock_verified | none recorded |
| `cli-profile` | core-cli | labs | sks profile show\|set <model> | mock:pass | runtime_mock_verified | none recorded |
| `cli-gc` | core-cli | labs | sks gc [--dry-run] [--json] | execute:pass | runtime_verified | none recorded |
| `cli-memory` | core-cli | labs | sks memory [--dry-run] [--json] | execute:pass | runtime_verified | none recorded |
| `cli-stats` | core-cli | labs | sks stats [--json] | execute:pass | runtime_verified | none recorded |
| `route-dfix` | route | stable | $DFix<br>$dfix | mock:pass | runtime_mock_verified | none recorded |
| `route-answer` | route | stable | $Answer<br>$answer | mock:pass | runtime_mock_verified | none recorded |
| `route-sks` | route | stable | $SKS<br>$sks | mock:pass | runtime_mock_verified | none recorded |
| `route-team` | route | beta | $Team<br>$team<br>$from-chat-img | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `route-from-chat-img` | route | labs | $From-Chat-IMG | mock:pass | runtime_mock_verified | none recorded |
| `route-qa-loop` | route | beta | $QA-LOOP<br>$qa-loop | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `route-ppt` | route | labs | $PPT<br>$ppt | execute_and_validate_artifacts:pass | runtime_verified | live imagegen/CU evidence required |
| `route-image-ux-review` | route | labs | $Image-UX-Review<br>$image-ux-review<br>$ux-review<br>$visual-review<br>$ui-ux-review | execute_and_validate_artifacts:pass | runtime_verified | live imagegen/CU evidence required |
| `route-ux-review` | route | labs | $UX-Review | mock:pass | runtime_mock_verified | live imagegen/CU evidence required |
| `route-computer-use` | route | beta | $Computer-Use<br>$computer-use-fast<br>$cu | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `route-cu` | route | beta | $CU | mock:pass | runtime_mock_verified | none recorded |
| `route-goal` | route | beta | $Goal<br>$goal | mock:pass | runtime_mock_verified | none recorded |
| `route-commit` | route | labs | $Commit<br>$commit | mock:pass | runtime_mock_verified | none recorded |
| `route-commit-and-push` | route | labs | $Commit-And-Push<br>$commit-and-push | mock:pass | runtime_mock_verified | none recorded |
| `route-research` | route | labs | $Research<br>$research | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `route-autoresearch` | route | labs | $AutoResearch<br>$autoresearch | mock:pass | runtime_mock_verified | none recorded |
| `route-db` | route | beta | $DB<br>$db | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `route-mad-sks` | route | beta | $MAD-SKS<br>$mad-sks | mock:pass | runtime_mock_verified | permission closed by owning gate |
| `route-gx` | route | labs | $GX<br>$gx | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `route-wiki` | route | stable | $Wiki<br>$wiki | execute_and_validate_artifacts:pass | runtime_verified | none recorded |
| `route-help` | route | stable | $Help<br>$help | mock:pass | runtime_mock_verified | none recorded |
| `route-five-scout-intake` | proof-route | beta | sks scouts run latest --engine local-static --mock --json<br>sks scout run latest --json | mock:pass | runtime_mock_verified | real speedup claims require scout-performance evidence; mock/static timing is not enough |
| `proof-scout-evidence` | proof-route | beta | completion-proof.json evidence.scouts | mock:pass | runtime_mock_verified | disabled scouts must be recorded as not_verified_for_parallel_speed |
| `skill-autoresearch-loop` | skill | labs | $autoresearch-loop | static:pass | static_contract | runtime fixtures owned by route |
| `skill-context7-docs` | skill | labs | $context7-docs | real_optional:pass | integration_optional | runtime fixtures owned by route |
| `skill-db-safety-guard` | skill | labs | $db-safety-guard | mock:pass | runtime_mock_verified | runtime fixtures owned by route |
| `skill-design-artifact-expert` | skill | labs | $design-artifact-expert | static:pass | static_contract | runtime fixtures owned by route |
| `skill-design-system-builder` | skill | labs | $design-system-builder | static:pass | static_contract | runtime fixtures owned by route |
| `skill-design-ui-editor` | skill | labs | $design-ui-editor | static:pass | static_contract | runtime fixtures owned by route |
| `skill-getdesign-reference` | skill | labs | $getdesign-reference | static:pass | static_contract | runtime fixtures owned by route |
| `skill-gx-visual-generate` | skill | labs | $gx-visual-generate | static:pass | static_contract | runtime fixtures owned by route |
| `skill-gx-visual-read` | skill | labs | $gx-visual-read | static:pass | static_contract | runtime fixtures owned by route |
| `skill-gx-visual-validate` | skill | labs | $gx-visual-validate | mock:pass | runtime_mock_verified | runtime fixtures owned by route |
| `skill-honest-mode` | skill | labs | $honest-mode | mock:pass | runtime_mock_verified | runtime fixtures owned by route |
| `skill-hproof-claim-ledger` | skill | labs | $hproof-claim-ledger | static:pass | static_contract | runtime fixtures owned by route |
| `skill-hproof-evidence-bind` | skill | labs | $hproof-evidence-bind | static:pass | static_contract | runtime fixtures owned by route |
| `skill-imagegen` | skill | labs | $imagegen | mock:pass | runtime_mock_verified | runtime fixtures owned by route |
| `skill-performance-evaluator` | skill | labs | $performance-evaluator | static:pass | static_contract | runtime fixtures owned by route |
| `skill-pipeline-runner` | skill | labs | $pipeline-runner | static:pass | static_contract | runtime fixtures owned by route |
| `skill-prompt-pipeline` | skill | labs | $prompt-pipeline | static:pass | static_contract | runtime fixtures owned by route |
| `skill-ralph` | skill | labs | $ralph | static:pass | static_contract | runtime fixtures owned by route |
| `skill-ralph-resolver` | skill | labs | $ralph-resolver | static:pass | static_contract | runtime fixtures owned by route |
| `skill-ralph-supervisor` | skill | labs | $ralph-supervisor | static:pass | static_contract | runtime fixtures owned by route |
| `skill-reasoning-router` | skill | labs | $reasoning-router | static:pass | static_contract | runtime fixtures owned by route |
| `skill-reflection` | skill | labs | $reflection | static:pass | static_contract | runtime fixtures owned by route |
| `skill-research-discovery` | skill | labs | $research-discovery | static:pass | static_contract | runtime fixtures owned by route |
| `skill-seo-geo-optimizer` | skill | labs | $seo-geo-optimizer | static:pass | static_contract | runtime fixtures owned by route |
| `skill-solution-scout` | skill | labs | $solution-scout | static:pass | static_contract | runtime fixtures owned by route |
| `skill-turbo-context-pack` | skill | labs | $turbo-context-pack | static:pass | static_contract | runtime fixtures owned by route |

## Unmapped Coverage

- cli_command_names: none
- handler_keys: none
- dollar_commands: none
- app_skill_aliases: none
- skills: none

## Prompt Checklist Coverage

- [x] Collected `sks commands --json` command surface via `COMMAND_CATALOG`.
- [x] Parsed `src/cli/main.js` handler keys, including hidden handlers and aliases.
- [x] Collected dollar routes and app skill aliases from `src/core/routes.js`.
- [x] Scanned README, Codex quick reference, AGENTS, and generated skill manifest for dollar-route mentions.
- [x] Mapped project skills from `.agents/skills` into the registry.
- [x] Exposed the registry through `sks features list --json`.
- [x] Added a release coverage check through `sks features check --json`.
- [x] Documented fixture status for every registry feature.

