import test from 'node:test';
import assert from 'node:assert/strict';
import { findCsvDuplicates, parseInventoryCsv } from './csv.js';

test('importação CSV reconhece cabeçalhos em português, BOM e campos entre aspas', () => {
  const csv = '\uFEFFPatrimônio;Nome;Categoria;Fabricante;Setor\r\nHEOM-0001;"Monitor, multiparamétrico";Monitorização;Mindray;UTI';
  const rows = parseInventoryCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.assetNumber, 'HEOM-0001');
  assert.equal(rows[0]?.name, 'Monitor, multiparamétrico');
  assert.equal(rows[0]?.manufacturer, 'Mindray');
  assert.equal(rows[0]?.department, 'UTI');
  assert.deepEqual(rows[0]?.errors, []);
});

test('importação CSV exige patrimônio, nome e categoria', () => {
  assert.throws(() => parseInventoryCsv('Nome;Categoria\nMonitor;Monitorização'), /Coluna obrigatória ausente/);
});

test('importação CSV identifica patrimônio, patrimônio oficial e série duplicados', () => {
  const rows = parseInventoryCsv('Patrimônio;Nome;Categoria;Patrimônio oficial;Número de série\nA-1;Monitor;Monitorização;T-1;S-1\nA-1;Bomba;Infusão;T-1;S-1');
  const duplicates = findCsvDuplicates(rows);
  assert.equal(duplicates.has(3), true);
  assert.match(duplicates.get(3)?.join(' ') || '', /Patrimônio repetido/);
  assert.match(duplicates.get(3)?.join(' ') || '', /Patrimônio oficial repetido/);
  assert.match(duplicates.get(3)?.join(' ') || '', /Número de série repetido/);
});
