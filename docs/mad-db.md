# MadDB 4.2.0 Execution Contract

MadDB is a first-class SQL-plane execution route. It is entered only by explicit `$MAD-DB` prompt routing or by `sks mad-db run`, `sks mad-db exec`, and `sks mad-db apply-migration`.

The explicit invocation is the approval boundary for the active cycle. Within that bound cycle, requested Supabase SQL-plane mutations must execute: `execute_sql`, `apply_migration`, table/schema `DROP`, column add/drop/rename, `INSERT`, `UPDATE`, `DELETE` including all-row operations, and `TRUNCATE`.

Normal Supabase MCP configuration remains read-only. MadDB creates a mission-local runtime profile under the active mission, omits `read_only=true` only in that ephemeral profile, verifies `execute_sql` and `apply_migration`, records tool-call lifecycle by canonical `tool_call_id`, performs read-back verification, then closes the capability/profile in `finally` and writes read-only restoration proof.

MadDB never authorizes Supabase account, project, organization, billing, credential, branch-management, or token control-plane operations.

`$MAD-SKS` also has a SQL-plane path (`sql-plane-executor.ts`): when explicitly invoked with a SQL/migration action, it runs the same `runSqlPlaneCycle` as MadDB, creating its own mission-local capability and runtime profile (`route: 'MadSKS'`, mission mode `mad-sks`, tracked separately from MadDB's `mad-db` mission mode) that permits real SQL-plane mutations for that bound cycle. Ordinary `sks --mad` file/shell/service actions outside that explicit SQL-plane path keep the ordinary catastrophic DB safeguards active. Use the first-class MadDB route (`sks mad-db ...`, deprecated in favor of `sks mad-sks sql ...` / `sks mad-sks apply-migration ...`) when SQL-plane execution is the primary intent.
