#!/usr/bin/env node
import { MAD_DB_POLICY, dbSafetyGuardSkillText, madDbSkillText } from '../core/mad-db/mad-db-policy.js'
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const madDbSkill = madDbSkillText()
const dbSafetySkill = dbSafetyGuardSkillText()
const initText = `${readText('src/core/init.ts')}\n${readText('src/core/init/skills.ts')}`

for (const token of ['table/schema DROP', 'all-row mutations', 'TRUNCATE', 'execute_sql', 'apply_migration']) {
  assertGate(madDbSkill.includes(token), `MadDB skill SSOT missing ${token}`, { madDbSkill })
}
assertGate(dbSafetySkill.includes('Active MAD-SKS sql-plane is the explicit exception'), 'db safety skill must name active MAD-SKS sql-plane exception', { dbSafetySkill })
assertGate(!madDbSkill.includes('Keep catastrophic safeguards active: whole database/schema/table removal'), 'MadDB skill must not carry old destructive-operation denial text', { madDbSkill })
assertGate(madDbSkill.includes('Do not add prompt-only SQL deny lists inside active sql-plane'), 'MadDB skill must prevent SQL-plane prompt veto lists', { madDbSkill })
assertGate(!dbSafetySkill.includes('do not run DROP'), 'db safety skill must not conflict with active MadDB SQL-plane allowance', { dbSafetySkill })
assertGate(dbSafetySkill.includes('Default read-only restrictions do not apply to SQL-plane work while the active MAD-SKS sql-plane capability v2 is bound'), 'db safety skill must explicitly remove default restrictions during active MAD-SKS sql-plane', { dbSafetySkill })
assertGate(initText.includes('madDbSkillText()') && initText.includes('dbSafetyGuardSkillText()'), 'init must generate skills from typed MadDB policy SSOT', {})
assertGate(MAD_DB_POLICY.active_mode.sql_plane === 'allow_all_mutations' && MAD_DB_POLICY.normal_supabase_mcp.read_only_required === true, 'typed policy must encode active SQL-plane and normal read-only modes', MAD_DB_POLICY)
emitGate('mad-db:skill-policy', { schema: MAD_DB_POLICY.schema, operation_classes: MAD_DB_POLICY.sql_plane_allowed.length })
