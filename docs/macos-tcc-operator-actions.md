# macOS TCC Operator Actions

In SKS 1.18.12, EPERM can come from macOS privacy/TCC, ACLs, immutable flags, quarantine xattrs, symlink targets, or missing parent-directory traversal.

SKS reports automatic repairs separately from actions that may require the operator. When TCC is possible, grant the launching terminal or Codex app Full Disk Access or Files and Folders access, then rerun `sks doctor --fix`.
