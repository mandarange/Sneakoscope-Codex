# Sneakoscope Codex Design System

This file is the single source of truth for product UI decisions in this repository.

## Product character

Sneakoscope Codex is an operator utility. Interfaces should feel native, compact, trustworthy, and calm. Prefer platform conventions over branded decoration, and make consequential state changes explicit.

## Native macOS surfaces

- Use AppKit controls, system typography, system colors, and standard focus behavior.
- Use utility-window density: 12–15 pt text, 8–18 pt spacing, and standard rounded push buttons.
- Use color only to communicate state. Green may identify an enabled or healthy state; disabled and secondary information use the platform secondary label color.
- Avoid gradients, decorative cards, emoji, custom iconography, and non-native visual effects.
- Keep primary actions close to the data they affect and keep destructive actions behind confirmation.

## MCP manager

- Present MCP servers in a resizable utility panel, defaulting to 760 × 440 pt with a 640 × 360 pt minimum.
- Order information as: title, global-scope/restart explanation, server table, live status, actions.
- The table columns are State, Name, Transport, and Configuration. Never display command arguments, environment values, bearer tokens, URL paths, URL credentials, fragments, or query values.
- Actions are Add, Remove, Enable/Disable, Refresh, and Close. Disable selection-dependent actions until a row is selected and disable all mutation controls while work is in progress.
- Adding a server is progressive: choose Remote URL or Local command, then request only the fields for that transport. Local arguments are one per line; environment variables are `KEY=VALUE`, one per line.
- Removal always requires a destructive confirmation. Successful changes explain that they apply to new Codex sessions.
- Escape closes the panel, controls have accessibility labels, the table supports keyboard selection, and status text must remain readable when the window is resized.

## Content and error handling

- Use direct operator language: name the scope, action, and next step.
- Translate internal blocker codes into readable messages before showing an alert.
- Empty, loading, success, disabled, and failure states must all be explicit; do not rely on color alone.
- Security and restart implications belong in the interface at the point of action, not only in documentation.

## Verification

- The generated AppKit source must parse and compile with the supported Swift toolchain, and the signed menu-bar app must pass the idempotent install check.
- Template tests must prove that add, remove, enable/disable, refresh, confirmation, keyboard close, and global-scope messaging remain wired.
- MCP list and action-log output must be inspected for secret values, command arguments, URL credentials, paths, queries, and fragments before release.
