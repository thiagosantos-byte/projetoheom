import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_PROFILE_DEFINITIONS, isDemoProfileEmail } from './demo-accounts.js';

test('perfis de demonstração cobrem os quatro níveis de acesso', () => {
  assert.deepEqual(
    DEMO_PROFILE_DEFINITIONS.map((profile) => profile.role),
    ['ADMIN', 'GESTOR', 'OPERADOR', 'CONSULTA']
  );
});

test('e-mails de demonstração são únicos e identificados como locais', () => {
  const emails = DEMO_PROFILE_DEFINITIONS.map((profile) => profile.email);
  assert.equal(new Set(emails).size, emails.length);
  assert.ok(emails.every((email) => email.endsWith('@heom.local')));
  assert.ok(emails.every(isDemoProfileEmail));
  assert.equal(isDemoProfileEmail('funcionario@heom.local'), false);
});
