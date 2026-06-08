#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const update = await importDist('core/update/update-notice.js')
const notice = await update.checkSksUpdateNotice({ currentVersion: '2.0.15', env: { SKS_UPDATE_NOTICE_DISABLE: '1' } })
assertGate(notice.schema === update.SKS_UPDATE_NOTICE_SCHEMA, 'update notice schema mismatch', notice)
assertGate(notice.source === 'disabled' && notice.update_available === false, 'disabled update notice must be nonblocking', notice)
const directiveEnvNotice = await update.checkSksUpdateNotice({ currentVersion: '2.0.15', env: { SKS_DISABLE_UPDATE_NOTICE: '1' } })
assertGate(directiveEnvNotice.source === 'disabled' && directiveEnvNotice.update_available === false, 'directive disable env must be honored', directiveEnvNotice)
emitGate('update:notice', { source: notice.source, directive_env_source: directiveEnvNotice.source })
