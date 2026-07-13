export const DEFAULT_MAX_PACK_BYTES = 2414 * 1024
// 6.1.2 measured 11,016,751 unpacked bytes after the final official custom-
// agent catalog, Super Search provenance validation, and live Zellij activity
// reader were included. Keep a narrow 10.53125 MiB ceiling shared by every
// package-size gate; packed bytes remain under the existing 2414 KiB limit.
export const DEFAULT_MAX_UNPACKED_BYTES = 11_042_816
