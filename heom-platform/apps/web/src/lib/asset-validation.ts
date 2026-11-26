export type AssetValidationRecord = {
  id?: string;
  archivedAt?: string | null;
  assetNumber?: unknown;
  officialPropertyNumber?: unknown;
  name?: unknown;
  category?: unknown;
  serialNumber?: unknown;
  trackingTagId?: unknown;
  departmentId?: unknown;
  roomId?: unknown;
};

type DepartmentReference = { id: string; active?: boolean };
type RoomReference = { id: string; departmentId: string };

function value(input: unknown): string {
  return String(input ?? '').trim();
}

function normalize(input: unknown): string {
  return value(input).toLocaleUpperCase('pt-BR');
}

/**
 * Validação compartilhada do adaptador demonstrativo para manter regras de
 * cadastro/edição testáveis sem depender de IndexedDB, localStorage ou React.
 */
export function validateAssetDraft(
  draft: AssetValidationRecord,
  departments: DepartmentReference[],
  rooms: RoomReference[],
  assets: AssetValidationRecord[],
  excludedAssetId?: string
): string | null {
  const assetNumber = value(draft.assetNumber);
  const name = value(draft.name);
  const category = value(draft.category);
  const departmentId = value(draft.departmentId);
  const roomId = value(draft.roomId);

  if (assetNumber.length < 2 || assetNumber.length > 80) return 'A identificação HEOM deve conter entre 2 e 80 caracteres.';
  if (name.length < 2 || name.length > 180) return 'O nome do equipamento deve conter entre 2 e 180 caracteres.';
  if (category.length < 2 || category.length > 100) return 'A categoria deve conter entre 2 e 100 caracteres.';
  if (!departmentId) return 'O setor é obrigatório para cadastrar ou atualizar um equipamento.';
  if (!departments.some((department) => department.id === departmentId && department.active !== false)) {
    return 'O setor selecionado não foi encontrado ou está inativo.';
  }
  if (roomId && !rooms.some((room) => room.id === roomId && room.departmentId === departmentId)) {
    return 'O ambiente selecionado não pertence ao setor informado.';
  }

  const activeAssets = assets.filter((asset) => asset.id !== excludedAssetId && !asset.archivedAt);
  const duplicate = activeAssets.some((asset) =>
    normalize(asset.assetNumber) === normalize(assetNumber) ||
    Boolean(value(draft.officialPropertyNumber) && normalize(asset.officialPropertyNumber) === normalize(draft.officialPropertyNumber)) ||
    Boolean(value(draft.serialNumber) && normalize(asset.serialNumber) === normalize(draft.serialNumber)) ||
    Boolean(value(draft.trackingTagId) && normalize(asset.trackingTagId) === normalize(draft.trackingTagId))
  );
  if (duplicate) return 'Possível duplicidade: identificação HEOM, patrimônio oficial, número de série ou etiqueta já cadastrados.';
  return null;
}
