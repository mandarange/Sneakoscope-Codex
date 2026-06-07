# Zellij Slot UI

The default Zellij worker UX is compact slot-only. A main pane starts first, then the first visible worker creates a `SLOTS` anchor to the right and worker slot panes stack downward from that anchor.

Compact mode renders slot status panes with `pane_kind=slot_status_renderer` and `scaling_primitive=native_cli_process_with_zellij_slot_renderer`. Full-debug mode remains opt-in and records actual worker command panes as `pane_kind=worker_codex_sdk`.

Worker pane records must keep `direction_requested=down` for visible worker slots. The right split is reserved for the slot-column anchor, not for worker pane records.

Real geometry proof is available through `SKS_REQUIRE_ZELLIJ=1 npm run zellij:first-slot-down-stack:real`.
