import assert from 'node:assert/strict';
import { adminLabel } from './src/admin.js';
import { auditLabel } from './src/audit.js';
import { profileLabel } from './src/profile.js';

const user = { name: ' Mina ', role: 'admin' };
assert.equal(adminLabel(user), 'Mina (admin)');
assert.equal(auditLabel(user), 'Mina (admin)');
assert.equal(profileLabel(user), 'Mina (admin)');
