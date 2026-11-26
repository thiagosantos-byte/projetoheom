import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_PROFILE_DEFINITIONS, isDemoProfileRole } from './demo-accounts.js';

test('perfis demonstrativos cobrem os quatro níveis de acesso', () => {
  assert.deepEqual(DEMO_PROFILE_DEFINITIONS.map((profile) => profile.role), ['ADMIN', 'GESTOR', 'OPERADOR', 'CONSULTA']);
});

test('perfis usam função como identificador e não contêm e-mail', () => {
  assert.ok(DEMO_PROFILE_DEFINITIONS.every((profile) => !('email' in profile)));
  assert.ok(DEMO_PROFILE_DEFINITIONS.every((profile) => isDemoProfileRole(profile.role)));
  assert.equal(isDemoProfileRole('ROOT'), false);
});
