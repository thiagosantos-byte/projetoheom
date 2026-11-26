import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlateFields } from '../src/lib/plate-ocr.ts';

const empty = { manufacturer: '', model: '', serialNumber: '', reference: '', officialPropertyNumber: '' };

test('parser retorna campos vazios quando não há texto', () => {
  assert.deepEqual(parsePlateFields(''), empty);
  assert.deepEqual(parsePlateFields('   \n  '), empty);
});

test('reconhece fabricante, modelo composto, série e patrimônio em linhas consecutivas', () => {
  assert.deepEqual(parsePlateFields('Fabricante:\nMINDRAY\nModelo:\nBeneVision N17\nSN:\nEN17A2305487\nPatrimônio:\n12345678'), {
    manufacturer: 'MINDRAY', model: 'BeneVision N17', serialNumber: 'EN17A2305487', reference: '', officialPropertyNumber: '12345678'
  });
});

test('aceita número de série nos formatos SN, S/N, S.N. e SERIAL NUMBER', () => {
  for (const label of ['SN', 'S/N', 'S.N.', 'SERIAL NUMBER']) {
    const result = parsePlateFields(`${label}: EN17A2305487`);
    assert.equal(result.serialNumber, 'EN17A2305487', `rótulo ${label}`);
  }
});

test('aceita número de série em português e rótulo dividido em duas linhas', () => {
  assert.equal(parsePlateFields('Nº DE SÉRIE\nEN17A2305487').serialNumber, 'EN17A2305487');
});

test('reconhece referência e patrimônio oficial/tombamento', () => {
  const result = parsePlateFields('REFERÊNCIA: REF-900/2\nTOMBAMENTO: 0042-991');
  assert.equal(result.reference, 'REF-900/2');
  assert.equal(result.officialPropertyNumber, '0042-991');
  assert.equal(parsePlateFields('ASSET NO: PAT-12345').officialPropertyNumber, 'PAT-12345');
});

test('normaliza acentos e permite fabricante não listado quando rotulado', () => {
  const result = parsePlateFields('FABRICANTE:\nAcme Medical\nMODELO: Série Clínica 4000');
  assert.equal(result.manufacturer, 'Acme Medical');
  assert.equal(result.model, 'Série Clínica 4000');
});

test('usa lista de fabricantes conhecidos sem inventar modelo ou série', () => {
  const result = parsePlateFields('Mindray\nMonitor multiparamétrico');
  assert.equal(result.manufacturer, 'Mindray');
  assert.equal(result.model, '');
  assert.equal(result.serialNumber, '');
  assert.equal(result.officialPropertyNumber, '');
});

test('não inventa campos quando o texto não possui rótulos ou fabricante conhecido', () => {
  assert.deepEqual(parsePlateFields('Equipamento hospitalar XY-900\nLote 3344'), empty);
});

test('interrompe busca de valor em vez de usar o rótulo seguinte como dado', () => {
  const result = parsePlateFields('FABRICANTE:\nMODELO:\nBeneVision N17\nSN:\nSN-123456');
  assert.equal(result.manufacturer, '');
  assert.equal(result.model, 'BeneVision N17');
  assert.equal(result.serialNumber, 'SN-123456');
});
