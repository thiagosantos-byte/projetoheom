import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAssetDraft, type AssetValidationRecord } from '../src/lib/asset-validation.ts';

const departments = [{ id: 'dep-1', active: true }, { id: 'dep-2', active: true }];
const rooms = [{ id: 'room-1', departmentId: 'dep-1' }, { id: 'room-2', departmentId: 'dep-2' }];
const existing: AssetValidationRecord[] = [{
  id: 'asset-1', assetNumber: 'HEOM-001', officialPropertyNumber: 'PAT-001', serialNumber: 'SN-001',
  trackingTagId: 'TAG-001', departmentId: 'dep-1', roomId: 'room-1', archivedAt: null
}];
const validDraft = (): AssetValidationRecord => ({
  assetNumber: 'HEOM-002', name: 'Monitor multiparamétrico', category: 'Monitorização',
  departmentId: 'dep-1', roomId: 'room-1', manufacturer: 'Mindray'
});

test('exige identificação HEOM, nome, categoria e setor', () => {
  assert.match(validateAssetDraft({ ...validDraft(), name: '' }, departments, rooms, existing) || '', /nome/i);
  assert.match(validateAssetDraft({ ...validDraft(), departmentId: '' }, departments, rooms, existing) || '', /setor/i);
  assert.match(validateAssetDraft({ ...validDraft(), category: '' }, departments, rooms, existing) || '', /categoria/i);
  assert.match(validateAssetDraft({ ...validDraft(), assetNumber: '' }, departments, rooms, existing) || '', /identificação/i);
});

test('rejeita ambiente que pertence a outro setor', () => {
  assert.match(validateAssetDraft({ ...validDraft(), roomId: 'room-2' }, departments, rooms, existing) || '', /não pertence ao setor/i);
});

test('rejeita setor inativo ou inexistente', () => {
  assert.match(validateAssetDraft({ ...validDraft(), departmentId: 'dep-3' }, departments, rooms, existing) || '', /setor selecionado/i);
  assert.match(validateAssetDraft({ ...validDraft(), departmentId: 'dep-3', roomId: '' }, departments, rooms, existing) || '', /setor selecionado/i);
});

test('previne duplicidade da identificação HEOM e do patrimônio oficial', () => {
  assert.match(validateAssetDraft({ ...validDraft(), assetNumber: 'heom-001' }, departments, rooms, existing) || '', /duplicidade/i);
  assert.match(validateAssetDraft({ ...validDraft(), officialPropertyNumber: 'pat-001' }, departments, rooms, existing) || '', /duplicidade/i);
});

test('previne duplicidade do número de série e etiqueta sem diferenciar caixa', () => {
  assert.match(validateAssetDraft({ ...validDraft(), serialNumber: 'sn-001' }, departments, rooms, existing) || '', /duplicidade/i);
  assert.match(validateAssetDraft({ ...validDraft(), trackingTagId: 'tag-001' }, departments, rooms, existing) || '', /duplicidade/i);
});

test('permite editar o próprio registro sem acusar seus identificadores', () => {
  const current = { ...existing[0], name: 'Monitor atualizado', category: 'Monitorização', departmentId: 'dep-1', roomId: 'room-1' };
  assert.equal(validateAssetDraft(current, departments, rooms, existing, 'asset-1'), null);
});

test('aceita cadastro completo com sala vinculada corretamente', () => {
  assert.equal(validateAssetDraft(validDraft(), departments, rooms, existing), null);
});
