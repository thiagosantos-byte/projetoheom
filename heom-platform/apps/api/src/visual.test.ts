import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDifferenceHash, similarityLabel } from './visual.js';

test('hashes idênticos têm similaridade máxima', () => {
  assert.deepEqual(compareDifferenceHash('0123456789abcdef', '0123456789abcdef'), { distance: 0, similarity: 1 });
});

test('hashes completamente diferentes têm distância máxima', () => {
  assert.deepEqual(compareDifferenceHash('0000000000000000', 'ffffffffffffffff'), { distance: 64, similarity: 0 });
});

test('classificação de similaridade não declara correspondência para baixa pontuação', () => {
  assert.equal(similarityLabel(0.91), 'ALTA_SIMILARIDADE');
  assert.equal(similarityLabel(0.76), 'POSSIVEL_CORRESPONDENCIA');
  assert.equal(similarityLabel(0.61), 'BAIXA_SIMILARIDADE');
  assert.equal(similarityLabel(0.2), 'SEM_CORRESPONDENCIA');
});
