#!/usr/bin/env node
import { MAD_SKS_SQL_PLANE_POLICY, dbSafetyGuardSkillText, madSksSqlPlanePolicyText } from '../core/mad-sks/sql-plane/policy.js'
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const madSksSqlPlaneSkill = madSksSqlPlanePolicyText()
const dbSafetySkill = dbSafetyGuardSkillText()
const initText = `${readText('src/core/init.ts')}\n${readText('src/core/init/skills.ts')}`

for (const token of ['table/schema DROP', 'all-row mutations', 'TRUNCATE', 'execute_sql', 'apply_migration']) {
  assertGate(madSksSqlPlaneSkill.includes(token), `MAD-SKS SQL-plane skill SSOT missing ${token}`, { madSksSqlPlaneSkill })
}
assertGate(dbSafetySkill.includes('Active MAD-SKS sql-plane is the explicit exception'), 'db safety skill must name active MAD-SKS sql-plane exception', { dbSafetySkill })
assertGate(!madSksSqlPlaneSkill.includes('Keep catastrophic safeguards active: whole database/schema/table removal'), 'MAD-SKS SQL-plane skill must not carry old destructive-operation denial text', { madSksSqlPlaneSkill })
assertGate(madSksSqlPlaneSkill.includes('Do not add prompt-only SQL deny lists inside active sql-plane'), 'MAD-SKS SQL-plane skill must prevent SQL-plane prompt veto lists', { madSksSqlPlaneSkill })
assertGate(!dbSafetySkill.includes('do not run DROP'), 'db safety skill must not conflict with active MAD-SKS SQL-plane SQL-plane allowance', { dbSafetySkill })
assertGate(dbSafetySkill.includes('Default read-only restrictions do not apply to SQL-plane work while the active MAD-SKS sql-plane capability v2 is bound'), 'db safety skill must explicitly remove default restrictions during active MAD-SKS sql-plane', { dbSafetySkill })
assertGate(initText.includes('madSksSqlPlanePolicyText()') && initText.includes('dbSafetyGuardSkillText()'), 'init must generate skills from typed MAD-SKS SQL-plane policy SSOT', {})
assertGate(MAD_SKS_SQL_PLANE_POLICY.active_mode.sql_plane === 'allow_all_mutations' && MAD_SKS_SQL_PLANE_POLICY.normal_supabase_mcp.read_only_required === true, 'typed policy must encode active SQL-plane and normal read-only modes', MAD_SKS_SQL_PLANE_POLICY)
emitGate('mad-sks-sql-plane:skill-policy', { schema: MAD_SKS_SQL_PLANE_POLICY.schema, operation_classes: MAD_SKS_SQL_PLANE_POLICY.sql_plane_allowed.length })
