import assert from 'node:assert/strict';
import test from 'node:test';
import { detectImageMime, validateImageSignature } from '../src/lib/image-validation.ts';

test('reconhece o cabeçalho JPEG', () => {
  assert.equal(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
});

test('exige a assinatura PNG completa', () => {
  assert.equal(detectImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
  assert.equal(detectImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
});

test('reconhece WEBP pela assinatura RIFF/WEBP', () => {
  const bytes = new Uint8Array(12);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  assert.equal(detectImageMime(bytes), 'image/webp');
});

test('rejeita formato desconhecido e MIME divergente', () => {
  assert.equal(detectImageMime(new Uint8Array([1, 2, 3, 4])), null);
  assert.notEqual(validateImageSignature(new Uint8Array([0xff, 0xd8, 0xff]), 'image/png'), null);
  assert.equal(validateImageSignature(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg'), null);
});
