export type Role = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'CONSULTA';
export type User = { id: string; name: string; role: Role };
export type Department = { id: string; code: string; name: string; description?: string; dataOrigin?: string };
export type Room = { id: string; code: string; name: string; floorLabel?: string; isRestricted: boolean; departmentId?: string; departmentName?: string; dataOrigin?: string; assetCount?: number };
export type Asset = {
  id: string; assetNumber: string; officialPropertyNumber?: string | null; name: string; category: string; description?: string | null; roomId?: string | null;
  manufacturer?: string | null; model?: string | null; serialNumber?: string | null; reference?: string | null; operationalStatus: string;
  criticality: string; trackingStatus: string; trackingTagId?: string | null; lastDetectedAt?: string | null;
  dataOrigin: string; qrCode?: string | null; departmentName?: string; departmentId?: string; roomName?: string;
};
export type Alert = {
  id: string; alertType: string; severity: string; title: string; description: string; status: string;
  createdAt: string; assetName?: string; assetNumber?: string;
};
export type Movement = {
  id: string; reason: string; movementType: string; status: string; requestedAt: string; expectedReturnAt?: string;
  assetName: string; assetNumber: string; originDepartment?: string; destinationDepartment: string; requesterName: string;
};
export type DashboardData = {
  metrics: { total: number; operating: number; unavailable: number; maintenance: number; tracking: number; simulated: number; open: number; critical: number; pending: number };
  recentEvents: Array<{ id: string; source: string; detectedAt: string; assetName: string; assetNumber: string; roomName?: string; departmentName?: string; rssi?: number }>;
  departments: Array<{ id: string; name: string; dataOrigin: string; assetCount: number; operatingCount: number }>;
  demoMode: boolean;
};
