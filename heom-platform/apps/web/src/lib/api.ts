const TOKEN_KEY = 'heom.local.session';
let accessToken: string | null = localStorage.getItem(TOKEN_KEY);

export function getToken() { return accessToken; }
export function setToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload?: unknown) { super(message); this.status = status; this.payload = payload; }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...init, headers }); }
  catch { throw new ApiError('Não foi possível alcançar o servidor local. Verifique a conexão com a rede cabeada.', 0); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || 'O sistema não conseguiu concluir a operação.', response.status, body);
  return body as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let response: Response;
  try { response = await fetch(`/api${path}`, { headers }); }
  catch { throw new ApiError('Não foi possível alcançar o servidor local.', 0); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || 'Não foi possível obter o arquivo.', response.status);
  }
  return response.blob();
}

export function formatDate(value?: string | null) {
  if (!value) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bahia' }).format(new Date(value));
}
export function formatClock(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Bahia' }).format(value);
}
export function labelStatus(value?: string) {
  const labels: Record<string, string> = {
    EM_OPERACAO: 'Em operação', INDISPONIVEL: 'Indisponível', EM_MANUTENCAO: 'Em manutenção', BAIXADO: 'Baixado',
    PENDENTE: 'Aguardando aprovação', APROVADA: 'Aprovada', REJEITADA: 'Rejeitada', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada',
    ABERTO: 'Aberta', RECONHECIDO: 'Em análise', RESOLVIDO: 'Resolvido',
    LOCALIZACAO_CONFIRMADA: 'Localização confirmada', SETOR_ESTIMADO: 'Setor estimado', ULTIMA_LOCALIZACAO: 'Última localização conhecida',
    SEM_COMUNICACAO: 'Sem comunicação', RASTREAMENTO_DESATIVADO: 'Rastreamento desativado',
    CRITICO: 'Crítico', ALTO: 'Alto', ATENCAO: 'Atenção', INFORMATIVO: 'Informativo',
    ADMIN: 'Administrador', GESTOR: 'Gestor', OPERADOR: 'Operador', CONSULTA: 'Consulta',
    TEMPORARIA: 'Temporária', PERMANENTE: 'Permanente', MANUTENCAO: 'Manutenção', EMERGENCIAL: 'Emergencial',
    PREVENTIVA: 'Preventiva', CORRETIVA: 'Corretiva', CALIBRACAO: 'Calibração', INSPECAO: 'Inspeção',
    PROGRAMADA: 'Programada', EM_ANDAMENTO: 'Em andamento', AGUARDANDO_PECA: 'Aguardando peça'
  };
  return value ? labels[value] || value.replaceAll('_', ' ').toLowerCase() : 'Não informado';
}
