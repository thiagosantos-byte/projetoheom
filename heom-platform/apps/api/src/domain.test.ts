import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransitionMovement, trackingStatusForObservation } from './domain.js';

test('fluxo de movimentação exige aprovação antes da conclusão', () => {
  assert.equal(canTransitionMovement('PENDENTE', 'APROVADA'), true);
  assert.equal(canTransitionMovement('PENDENTE', 'REJEITADA'), true);
  assert.equal(canTransitionMovement('PENDENTE', 'CONCLUIDA'), false);
  assert.equal(canTransitionMovement('APROVADA', 'CONCLUIDA'), true);
  assert.equal(canTransitionMovement('REJEITADA', 'CONCLUIDA'), false);
  assert.equal(canTransitionMovement('CONCLUIDA', 'APROVADA'), false);
});

test('evento sem ambiente conhecido nunca é apresentado como localização atual confirmada', () => {
  assert.equal(trackingStatusForObservation(true), 'SETOR_ESTIMADO');
  assert.equal(trackingStatusForObservation(false), 'ULTIMA_LOCALIZACAO');
});
