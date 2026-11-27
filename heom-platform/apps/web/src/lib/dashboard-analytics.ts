export type DashboardAssetFields = {
  category?: string | null;
  departmentId?: string | null;
  roomId?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  officialPropertyNumber?: string | null;
  reference?: string | null;
  trackingTagId?: string | null;
};

export type DashboardAnalytics = {
  categories: Array<{ name: string; value: number }>;
  coverage: {
    total: number;
    department: number;
    room: number;
    manufacturerModel: number;
    serialNumber: number;
    propertyReference: number;
    trackingTag: number;
  };
};

/** Calcula indicadores exclusivamente a partir dos bens ativos recebidos. */
export function summarizeDashboardAssets(assets: DashboardAssetFields[]): DashboardAnalytics {
  const categoryCounts = new Map<string, number>();
  for (const asset of assets) {
    const category = asset.category?.trim() || 'Categoria não informada';
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }

  const categories = Array.from(categoryCounts, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'));

  const hasText = (value?: string | null) => Boolean(value?.trim());
  const coverage = {
    total: assets.length,
    department: assets.filter((asset) => hasText(asset.departmentId)).length,
    room: assets.filter((asset) => hasText(asset.roomId)).length,
    manufacturerModel: assets.filter((asset) => hasText(asset.manufacturer) && hasText(asset.model)).length,
    serialNumber: assets.filter((asset) => hasText(asset.serialNumber)).length,
    propertyReference: assets.filter((asset) => hasText(asset.officialPropertyNumber) || hasText(asset.reference)).length,
    trackingTag: assets.filter((asset) => hasText(asset.trackingTagId)).length
  };

  return { categories, coverage };
}
