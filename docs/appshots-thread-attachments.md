# Appshots Thread Attachments

SKS 1.18.9 adds Codex thread attachment provenance to Appshots evidence without claiming that the CLI can create Appshots.

SKS treats Appshots as operator-provided Codex App evidence. The CLI does not claim to create Appshots on its own.

`appshots:thread-attachment-discovery` verifies metadata that may be supplied by a Codex thread/session export or fixture:

- `thread_id`
- `attachment_id`
- attachment kind: `appshot`, `image`, `text`, or `unknown`
- `source_app` and `source_window`
- `local_only`

Visual proof still needs a local, redacted source path. Raw attachment content stays local-only and is represented by path, hash, and provenance fields in Appshots evidence artifacts.

If visual proof is required and no operator action, Appshots tool signal, or thread Appshot attachment is available, SKS returns `operator_action_required` instead of inventing substitute evidence.
