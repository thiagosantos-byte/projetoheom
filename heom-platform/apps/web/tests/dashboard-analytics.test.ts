import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeDashboardAssets } from '../src/lib/dashboard-analytics.ts';

test('calcula categorias e cobertura com base apenas nos bens recebidos', () => {
  const result = summarizeDashboardAssets([
    {
      category: 'Monitorização', departmentId: 'setor-1', roomId: 'sala-1',
      manufacturer: 'Fabricante', model: 'Modelo', serialNumber: 'SN-1',
      officialPropertyNumber: 'PAT-1', trackingTagId: 'TAG-1'
    },
    {
      category: 'Monitorização', departmentId: null, roomId: null,
      manufacturer: 'Fabricante', model: '', serialNumber: '',
      officialPropertyNumber: '', reference: 'REF-2', trackingTagId: null
    },
    {
      category: '', departmentId: 'setor-2', roomId: null,
      manufacturer: null, model: null, serialNumber: 'SN-3',
      officialPropertyNumber: null, reference: null, trackingTagId: 'TAG-3'
    }
  ]);

  assert.deepEqual(result.categories, [
    { name: 'Monitorização', value: 2 },
    { name: 'Categoria não informada', value: 1 }
  ]);
  assert.deepEqual(result.coverage, {
    total: 3,
    department: 2,
    room: 1,
    manufacturerModel: 1,
    serialNumber: 2,
    propertyReference: 2,
    trackingTag: 2
  });
});

test('retorna categorias e contagens vazias sem inventar dados', () => {
  assert.deepEqual(summarizeDashboardAssets([]), {
    categories: [],
    coverage: {
      total: 0, department: 0, room: 0, manufacturerModel: 0,
      serialNumber: 0, propertyReference: 0, trackingTag: 0
    }
  });
});
