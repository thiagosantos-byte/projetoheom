import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeHeomQrPayload } from '../src/lib/qr-code.ts';

test('normaliza prefixo HEOM-ASSET antigo e remove espaços e quebras', () => {
  const parsed = normalizeHeomQrPayload('  HEOM-ASSET:\n  550e8400-e29b-41d4-a716-446655440000  ');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.id, '550e8400-e29b-41d4-a716-446655440000');
});

test('aceita diferenças de caixa do prefixo sem alterar o identificador', () => {
  const parsed = normalizeHeomQrPayload('heom-asset:ASSET-000001');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.id, 'ASSET-000001');
});

test('rejeita payload sem prefixo HEOM ou com identificador inválido', () => {
  assert.equal(normalizeHeomQrPayload('550e8400-e29b-41d4-a716-446655440000').valid, false);
  assert.equal(normalizeHeomQrPayload('HEOM-ASSET:').valid, false);
  assert.equal(normalizeHeomQrPayload('HEOM-ASSET:../../etc/passwd').valid, false);
});
