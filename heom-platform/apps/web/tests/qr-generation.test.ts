import assert from 'node:assert/strict';
import test from 'node:test';
import QRCode from 'qrcode';

const payload = 'HEOM-ASSET:550e8400-e29b-41d4-a716-446655440000';

test('gera QR PNG com correção alta, margem e cabeçalho PNG válido', async () => {
  const png = await QRCode.toBuffer(payload, {
    type: 'png', errorCorrectionLevel: 'H', margin: 4, width: 640,
    color: { dark: '#102A43', light: '#FFFFFF' }
  });
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.length > 2_000, 'PNG não deve estar vazio ou conter apenas um placeholder');
});

test('gera QR SVG com dimensões e margem de segurança', async () => {
  const svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'H', margin: 4, width: 640 });
  assert.match(svg, /<svg[\s>]/);
  assert.match(svg, /viewBox=/);
  assert.match(svg, /path/);
});
