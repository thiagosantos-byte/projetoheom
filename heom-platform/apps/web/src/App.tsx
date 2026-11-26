import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, AlertOctagon, AlertTriangle, ArrowDownRight, ArrowLeftRight, ArrowUpRight, Bell,
  Check, CheckCheck, ChevronDown, CircleHelp, ClipboardList, Clock3, Database, FileDown,
  HardDrive, LayoutDashboard, MapPinned, Menu, MonitorCog, Package, Plus, RadioTower,
  RefreshCw, Search, Settings2, ShieldCheck, Signal, Siren, Stethoscope, Truck, Users,
  Wifi, WifiOff, X, LogOut, Wrench, Boxes, CircleDot, ExternalLink, Camera, FileSpreadsheet
} from 'lucide-react';
import { api, apiUrl, ApiError, formatClock, formatDate, getToken, labelStatus, setToken, websocketUrl } from './lib/api';
import type { Alert, Asset, DashboardData, Department, Movement, Room, User } from './types';
import IdentityCenter from './components/IdentityCenter';
import MaintenanceCenter from './components/MaintenanceCenter';
import ReportsCenter from './components/ReportsCenter';

type Page = 'overview' | 'assets' | 'identification' | 'map' | 'movements' | 'alerts' | 'maintenance' | 'reports' | 'admin';
type Health = { status: string; database: string; mqtt: string; mode: string; persistence?: string; persistenceStatus?: string; tracking?: string; message?: string };
type Gateway = { id: string; code: string; name: string; status: string; lastSeenAt?: string; roomName?: string; dataOrigin: string };
type DemoProfile = { email: string; name: string; role: User['role']; description: string; title: string };

const NAV: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'assets', label: 'Inventário', icon: Package },
  { id: 'identification', label: 'Identificação por foto', icon: Camera },
  { id: 'map', label: 'Planta digital', icon: MapPinned },
  { id: 'movements', label: 'Movimentações', icon: ArrowLeftRight },
  { id: 'alerts', label: 'Alertas', icon: Siren },
  { id: 'maintenance', label: 'Manutenção', icon: Wrench },
  { id: 'reports', label: 'Relatórios', icon: FileSpreadsheet },
  { id: 'admin', label: 'Administração', icon: Settings2 }
];

const DEMO_PROFILE_EMAILS: Record<User['role'], string> = {
  ADMIN: 'admin.teste@heom.local',
  GESTOR: 'gestor.teste@heom.local',
  OPERADOR: 'operador.teste@heom.local',
  CONSULTA: 'consulta.teste@heom.local'
};

function useToast() {
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const show = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4200);
  }, []);
  return { toast, show };
}

function StatusPill({ value, label }: { value?: string; label?: string }) {
  const normalized = value || '';
  let tone = 'neutral';
  if (['EM_OPERACAO', 'APROVADA', 'CONCLUIDA', 'ONLINE', 'RESOLVIDO', 'LOCALIZACAO_CONFIRMADA'].includes(normalized)) tone = 'green';
  if (['EM_MANUTENCAO', 'PENDENTE', 'ATENCAO', 'RECONHECIDO', 'SETOR_ESTIMADO'].includes(normalized)) tone = 'amber';
  if (['INDISPONIVEL', 'CRITICO', 'ALTO', 'ABERTO', 'SEM_COMUNICACAO', 'REJEITADA'].includes(normalized)) tone = 'red';
  return <span className={`status-pill ${tone}`}><i />{label || labelStatus(normalized)}</span>;
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="section-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="section-action">{action}</div>}</div>;
}

function Modal({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Fechar janela"><X size={19} /></button></div>
      {children}
    </section>
  </div>;
}

function LoginScreen({ onLogin }: { onLogin: (user: User, token: string) => void }) {
  const isDemoMode = import.meta.env.VITE_HEOM_MODE === 'demo';
  const [email, setEmail] = useState('admin@heom.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoProfiles, setDemoProfiles] = useState<DemoProfile[]>([]);
  const [demoProfilesLoading, setDemoProfilesLoading] = useState(true);
  const [demoProfilesError, setDemoProfilesError] = useState('');

  useEffect(() => {
    let mounted = true;
    api<{ data: DemoProfile[] }>('/demo/profiles')
      .then((result) => {
        if (!mounted) return;
        setDemoProfiles(result.data || []);
        setDemoProfilesError('');
      })
      .catch((err) => {
        if (!mounted) return;
        setDemoProfiles([]);
        setDemoProfilesError(err instanceof Error ? err.message : 'Não foi possível carregar os perfis de teste.');
      })
      .finally(() => { if (mounted) setDemoProfilesLoading(false); });
    return () => { mounted = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password })
      });
      onLogin(result.user, result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  async function enterDemoProfile(profile: DemoProfile) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ token: string; user: User }>('/demo/quick-login', {
        method: 'POST', body: JSON.stringify({ email: profile.email })
      });
      onLogin(result.user, result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o perfil de demonstração.');
    } finally {
      setBusy(false);
    }
  }

  const showDemoProfiles = isDemoMode || demoProfiles.length > 0;

  return <main className="login-layout">
    <div className="login-brand-panel">
      <div className="brand-lockup"><div className="brand-mark"><Stethoscope size={25} /></div><div><strong>HEOM</strong><span>INTELIGÊNCIA PATRIMONIAL</span></div></div>
      <div className="login-story"><div className="eyebrow eyebrow-light">GESTÃO HOSPITALAR INTEGRADA</div><h1>O cuidado também depende de saber onde cada recurso está.</h1><p>Uma plataforma local para organizar o inventário, acompanhar movimentações e dar visibilidade operacional aos equipamentos hospitalares.</p></div>
      <div className="login-foot"><span>Hospital Especializado Octávio Mangabeira</span><span>Salvador · Bahia</span></div>
    </div>
    <div className="login-form-panel"><form className="login-form" onSubmit={submit}>
      <div className="login-kicker"><ShieldCheck size={17} /> {showDemoProfiles ? 'AMBIENTE DE DEMONSTRAÇÃO' : 'ACESSO INSTITUCIONAL'}</div>
      <h2>{isDemoMode ? 'Entrar na demonstração' : 'Entrar no sistema'}</h2>
      <p className="muted">{isDemoMode ? 'Escolha um perfil de avaliação para acessar o sistema. Não é necessário informar e-mail ou senha.' : 'Utilize suas credenciais de acesso para entrar na plataforma.'}</p>

      {!isDemoMode && <>
        <label>E-mail institucional<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="nome@instituicao.gov.br" /></label>
        <label>Senha<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Digite sua senha" /></label>
        {error && <div className="form-error"><AlertTriangle size={16} />{error}</div>}
        <button className="button button-primary button-full" disabled={busy}>{busy ? 'Validando acesso…' : 'Acessar plataforma'}</button>
      </>}

      {showDemoProfiles && <section className="demo-access" aria-label="Perfis de demonstração">
        <div className="demo-access-heading"><div><span className="eyebrow">ACESSO SEM SENHA</span><h3>Escolha um perfil para testar</h3></div><span className="demo-access-badge">SIMULADO</span></div>
        <p className="demo-access-copy">Cada opção abre o sistema com permissões diferentes. Os dados são fictícios e nenhuma senha é solicitada.</p>
        {demoProfilesLoading ? <p className="muted">Carregando perfis de teste…</p> : demoProfiles.length > 0 ? <div className="demo-profile-grid">
          {demoProfiles.map((profile) => <button key={profile.email} type="button" className="demo-profile-card" disabled={busy} onClick={() => void enterDemoProfile(profile)}>
            <span className={`demo-profile-role role-${profile.role.toLowerCase()}`}>{labelStatus(profile.role)}</span>
            <strong>{profile.name}</strong>
            <span className="demo-profile-email">{profile.email}</span>
            <small>{profile.description}</small>
            <span className="demo-profile-action">{busy ? 'Abrindo perfil…' : 'Entrar sem senha'} <span aria-hidden="true">↗</span></span>
          </button>)}
        </div> : <div className="form-error"><AlertTriangle size={16} />{demoProfilesError || 'Os perfis de teste não foram encontrados. Verifique se a API está publicada e se ENABLE_DEMO_PROFILES=true.'}</div>}
        {error && <div className="form-error"><AlertTriangle size={16} />{error}</div>}
        <p className="demo-access-warning">Ambiente público de avaliação. Todos os cadastros são simulados e podem ser alterados por outras pessoas que acessarem esta demonstração. Não insira dados reais.</p>
      </section>}
      <div className="login-security"><LockIcon /> <span>{isDemoMode ? 'Acesso temporário de avaliação, sem senha pessoal.' : 'Autenticação protegida pela API configurada para este ambiente.'}</span></div>
    </form></div>
  </main>;
}
function LockIcon() { return <ShieldCheck size={16} />; }

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [demoInitError, setDemoInitError] = useState('');
  const [profileSwitchBusy, setProfileSwitchBusy] = useState(false);
  const [page, setPage] = useState<Page>('overview');
  const [health, setHealth] = useState<Health | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [assetQuery, setAssetQuery] = useState('');
  const [assetStatus, setAssetStatus] = useState('');
  const [alertStatus, setAlertStatus] = useState('');
  const [modal, setModal] = useState<'asset' | 'movement' | 'user' | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; message: string; severity: string; createdAt: string; readAt?: string | null }>>([]);
  const { toast, show } = useToast();

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        if (import.meta.env.VITE_HEOM_MODE === 'demo') {
          // Entrada direta: token de demonstração gerado internamente pela API.
          const result = await api<{ token: string; user: User }>('/demo/quick-login', {
            method: 'POST', body: JSON.stringify({ email: DEMO_PROFILE_EMAILS.ADMIN })
          });
          if (!cancelled) { setToken(result.token); setUser(result.user); }
          return;
        }
        const token = getToken();
        if (!token) return;
        const result = await api<{ user: User }>('/auth/me');
        if (!cancelled) setUser(result.user);
      } catch (err) {
        if (!cancelled) {
          setToken(null);
          if (import.meta.env.VITE_HEOM_MODE === 'demo') {
            setDemoInitError(err instanceof Error ? err.message : 'Não foi possível iniciar a demonstração.');
          }
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    };
    void start();
    return () => { cancelled = true; };
  }, []);

  const loadHealth = useCallback(async () => {
    try { const result = await fetch(apiUrl('/health')); setHealth(await result.json()); }
    catch { setHealth(null); }
  }, []);

  const loadPage = useCallback(async () => {
    if (!user) return;
    try {
      const [depData, roomData] = await Promise.all([
        api<{ data: Department[] }>('/departments'), api<{ data: Room[] }>('/rooms')
      ]);
      setDepartments(depData.data); setRooms(roomData.data);
      if (page === 'overview') setDashboard(await api<DashboardData>('/dashboard'));
      if (page === 'assets') {
        const params = new URLSearchParams(); if (assetQuery.trim()) params.set('q', assetQuery.trim()); if (assetStatus) params.set('status', assetStatus);
        setAssets((await api<{ data: Asset[] }>(`/assets?${params.toString()}`)).data);
      }
      if (page === 'identification' || page === 'maintenance' || page === 'reports') {
        setAssets((await api<{ data: Asset[] }>('/assets')).data);
      }
      if (page === 'movements') {
        const [movementData, assetData] = await Promise.all([api<{ data: Movement[] }>('/movements'), api<{ data: Asset[] }>('/assets')]);
        setMovements(movementData.data); setAssets(assetData.data);
      }
      if (page === 'alerts') {
        const params = new URLSearchParams(); if (alertStatus) params.set('status', alertStatus);
        setAlerts((await api<{ data: Alert[] }>(`/alerts?${params.toString()}`)).data);
      }
      if (page === 'map') {
        const result = await api<{ data: Room[] }>('/floor-plan');
        setRooms(result.data);
      }
      if (page === 'admin' && (user.role === 'ADMIN' || user.role === 'GESTOR')) {
        const [gatewayData, assetData] = await Promise.all([api<{ data: Gateway[] }>('/gateways'), api<{ data: Asset[] }>('/assets')]);
        setGateways(gatewayData.data); setAssets(assetData.data);
      }
    } catch (err) { show(err instanceof Error ? err.message : 'Falha ao atualizar os dados.', 'error'); }
  }, [user, page, assetQuery, assetStatus, alertStatus, show]);

  useEffect(() => { void loadHealth(); const timer = window.setInterval(() => void loadHealth(), 15_000); return () => window.clearInterval(timer); }, [loadHealth]);
  useEffect(() => { void loadPage(); }, [loadPage]);

  useEffect(() => {
    // Vercel Functions atendem HTTP sob demanda e não mantêm WebSocket permanente.
    // Em desenvolvimento/institucional, o WebSocket local continua habilitado.
    if (!user || !getToken() || import.meta.env.VITE_HEOM_WS === 'false') return;
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(websocketUrl());
      socket.onopen = () => socket?.send(JSON.stringify({ type: 'AUTH', token: getToken() }));
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type: string };
          if (message.type !== 'AUTHENTICATED') void loadPage();
        } catch { /* mensagem não reconhecida */ }
      };
      socket.onclose = () => { if (!disposed) retry = window.setTimeout(connect, 4000); };
    };
    connect();
    return () => { disposed = true; if (retry) window.clearTimeout(retry); socket?.close(); };
  }, [user, loadPage]);

  const refreshAll = async () => { await loadHealth(); await loadPage(); show('Informações atualizadas.', 'info'); };
  const login = (loggedUser: User, token: string) => { setToken(token); setUser(loggedUser); setPage('overview'); };
  const logout = () => { setToken(null); setUser(null); setDashboard(null); setNotifications([]); };

  async function switchDemoProfile(role: User['role']) {
    setProfileSwitchBusy(true);
    try {
      const result = await api<{ token: string; user: User }>('/demo/quick-login', {
        method: 'POST', body: JSON.stringify({ email: DEMO_PROFILE_EMAILS[role] })
      });
      setToken(result.token);
      setUser(result.user);
      setPage('overview');
      setNotificationOpen(false);
      show(`Perfil alterado para ${labelStatus(role)}.`, 'info');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Não foi possível trocar o perfil.', 'error');
    } finally {
      setProfileSwitchBusy(false);
    }
  }

  async function saveAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = {
      assetNumber: String(form.get('assetNumber') || ''), officialPropertyNumber: String(form.get('officialPropertyNumber') || '') || null,
      name: String(form.get('name') || ''), category: String(form.get('category') || ''), manufacturer: String(form.get('manufacturer') || '') || null,
      model: String(form.get('model') || '') || null, serialNumber: String(form.get('serialNumber') || '') || null,
      departmentId: String(form.get('departmentId') || '') || null, roomId: String(form.get('roomId') || '') || null,
      operationalStatus: String(form.get('operationalStatus') || 'EM_OPERACAO'), criticality: String(form.get('criticality') || 'MEDIA'),
      trackingTagId: String(form.get('trackingTagId') || '') || null, description: String(form.get('description') || '') || null
    };
    try {
      if (editingAsset) await api(`/assets/${editingAsset.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/assets', { method: 'POST', body: JSON.stringify(body) });
      show(editingAsset ? 'Cadastro atualizado.' : 'Equipamento cadastrado.'); setModal(null); setEditingAsset(null); await loadPage();
    } catch (err) { show(err instanceof Error ? err.message : 'Não foi possível salvar o equipamento.', 'error'); }
    finally { setBusy(false); }
  }

  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    const body = { assetId: String(form.get('assetId')), destinationDepartmentId: String(form.get('destinationDepartmentId')),
      destinationRoomId: String(form.get('destinationRoomId') || '') || null, reason: String(form.get('reason') || ''),
      movementType: String(form.get('movementType') || 'TEMPORARIA'), expectedReturnAt: null };
    try { await api('/movements', { method: 'POST', body: JSON.stringify(body) }); show('Solicitação encaminhada para aprovação.'); setModal(null); await loadPage(); }
    catch (err) { show(err instanceof Error ? err.message : 'Não foi possível registrar a movimentação.', 'error'); }
    finally { setBusy(false); }
  }

  async function updateMovement(id: string, status: string) {
    try { await api(`/movements/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); show('Movimentação atualizada.'); await loadPage(); }
    catch (err) { show(err instanceof Error ? err.message : 'Falha ao atualizar movimentação.', 'error'); }
  }
  async function updateAlert(id: string, status: string) {
    const note = status === 'RESOLVIDO' ? window.prompt('Registre uma nota de resolução (opcional):') || '' : undefined;
    try { await api(`/alerts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, note }) }); show('Alerta atualizado.'); await loadPage(); }
    catch (err) { show(err instanceof Error ? err.message : 'Falha ao atualizar alerta.', 'error'); }
  }

  async function simulateMovement() {
    const demoAsset = assets.find((asset) => asset.dataOrigin === 'SIMULADO' && asset.trackingTagId)
      || assets.find((asset) => asset.trackingTagId);
    const demoGateway = gateways.find((gateway) => gateway.dataOrigin === 'SIMULADO') || gateways[0];
    if (!demoAsset?.trackingTagId || !demoGateway?.code) {
      show('Não há equipamento etiquetado e gateway cadastrados para a simulação neste ambiente.', 'error');
      return;
    }
    try {
      const result = await api<{ message: string }>('/simulator/observation', {
        method: 'POST',
        body: JSON.stringify({ tagId: demoAsset.trackingTagId, gatewayCode: demoGateway.code, rssi: -61 })
      });
      show(result.message, 'success');
      await loadPage();
    } catch (err) { show(err instanceof Error ? err.message : 'Não foi possível enviar evento.', 'error'); }
  }

  async function loadNotifications() {
    try { const result = await api<{ data: typeof notifications }>('/notifications'); setNotifications(result.data); }
    catch (err) { show(err instanceof Error ? err.message : 'Não foi possível consultar notificações.', 'error'); }
  }

  async function markNotificationRead(id: string) {
    try {
      const result = await api<{ data: { id: string; readAt: string } }>(`/notifications/${id}/read`, { method: 'POST' });
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: result.data.readAt } : item));
    } catch (err) {
      show(err instanceof Error ? err.message : 'Não foi possível atualizar a notificação.', 'error');
    }
  }
  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    const body = { name: String(form.get('name')), email: String(form.get('email')), password: String(form.get('password')), role: String(form.get('role')) };
    try { await api('/admin/users', { method: 'POST', body: JSON.stringify(body) }); show('Usuário cadastrado.'); setModal(null); }
    catch (err) { show(err instanceof Error ? err.message : 'Não foi possível cadastrar usuário.', 'error'); }
    finally { setBusy(false); }
  }

  if (initializing) return <div className="app-loading"><div className="brand-mark"><Stethoscope size={24} /></div><span>Preparando ambiente local…</span></div>;
  if (!user && import.meta.env.VITE_HEOM_MODE === 'demo') return <main className="demo-start-error">
    <div className="brand-mark"><Stethoscope size={24} /></div>
    <span className="eyebrow">HEOM · AMBIENTE DE DEMONSTRAÇÃO</span>
    <h1>Não foi possível abrir o ambiente</h1>
    <p>{demoInitError || 'A API ainda está inicializando. Verifique a publicação e tente novamente.'}</p>
    <button className="button button-primary" onClick={() => window.location.reload()}>Tentar novamente</button>
    <small>Não é necessário criar conta nem informar senha.</small>
    {toast && <Toast toast={toast} />}
  </main>;
  if (!user) return <><LoginScreen onLogin={login} />{toast && <Toast toast={toast} />}</>;

  const activeTitle = NAV.find((item) => item.id === page)?.label || 'Visão geral';
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-lockup compact"><div className="brand-mark"><Stethoscope size={21} /></div><div><strong>HEOM</strong><span>GESTÃO DE ATIVOS</span></div></div>
      <div className="topbar-module"><span className="topbar-divider" /><span className="module-label">{activeTitle}</span></div>
      <div className="topbar-right">
        <div className="connection-indicators">
          <span className={`connection-chip ${health?.status === 'operacional' ? 'connected' : 'disconnected'}`}><span className="pulse-dot" />{health?.status === 'operacional' ? 'Aplicação local ativa' : health?.status === 'degradado' ? 'Persistência degradada' : 'Servidor indisponível'}</span>
          <span className="connection-chip secondary"><Wifi size={13} /> Internet não necessária</span>
        </div>
        <div className="topbar-date"><Clock3 size={14} /><span>{formatClock(clock)}</span></div>
        <div className="notification-wrap">
          <button className="icon-button notification-button" aria-label="Notificações" onClick={() => { setNotificationOpen((value) => !value); void loadNotifications(); }}><Bell size={18} />{unreadCount > 0 && <i>{unreadCount}</i>}</button>
          {notificationOpen && <div className="notification-popover"><div className="popover-heading"><strong>Notificações</strong><button className="text-button" onClick={() => void loadNotifications()}>Atualizar</button></div>{notifications.length ? notifications.map((item) => <div className={`notification-item ${item.readAt ? 'read' : 'unread'}`} key={item.id}><span className="notification-dot" /><div><strong>{item.title}</strong><p>{item.message}</p><small>{formatDate(item.createdAt)} · {item.readAt ? 'Lida' : 'Não lida'}</small>{!item.readAt && <button className="text-button" onClick={() => void markNotificationRead(item.id)}>Marcar como lida</button>}</div></div>) : <div className="empty-inline">Nenhuma notificação registrada.</div>}</div>}
        </div>
        <div className="user-menu"><div className="avatar">{user.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div className="user-copy"><strong>{import.meta.env.VITE_HEOM_MODE === 'demo' ? 'Demonstração aberta' : user.name}</strong><span>{import.meta.env.VITE_HEOM_MODE === 'demo' ? 'Perfil ativo · ' + labelStatus(user.role) : labelStatus(user.role)}</span></div>{import.meta.env.VITE_HEOM_MODE === 'demo' ? <select className="demo-profile-select" aria-label="Trocar perfil de demonstração" value={user.role} disabled={profileSwitchBusy} onChange={(event) => void switchDemoProfile(event.target.value as User['role'])}><option value="ADMIN">Administrador</option><option value="GESTOR">Gestor</option><option value="OPERADOR">Operador</option><option value="CONSULTA">Consulta</option></select> : <button className="icon-button logout" aria-label="Sair" onClick={logout}><LogOut size={17} /></button>}</div>
      </div>
    </header>

    <nav className="primary-nav" aria-label="Navegação principal">
      {NAV.filter(({ id }) => id !== 'admin' || user.role === 'ADMIN' || user.role === 'GESTOR').map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setNotificationOpen(false); }}><Icon size={17} strokeWidth={page === id ? 2.3 : 1.8} /><span>{label}</span>{id === 'alerts' && dashboard?.metrics.critical ? <i className="nav-alert" /> : null}</button>)}
      <div className="nav-spacer" /><span className="timezone-label">BAHIA · UTC−03</span>
    </nav>

    {dashboard?.demoMode && <div className="demo-banner"><span><CircleDot size={14} /> AMBIENTE DE DEMONSTRAÇÃO</span><p>Registros identificados como SIMULADO são fictícios e não representam o inventário oficial do HEOM.</p></div>}

    <main className="main-content">
      {page === 'overview' && <Overview data={dashboard} loading={!dashboard} onNavigate={setPage} onAssetFilter={(filter) => { setAssetQuery(''); setAssetStatus(filter); setPage('assets'); }} onRefresh={refreshAll} />}
      {page === 'assets' && <Inventory assets={assets} departments={departments} canEdit={user.role !== 'CONSULTA'} canArchive={user.role === 'ADMIN' || user.role === 'GESTOR'} query={assetQuery} setQuery={setAssetQuery} status={assetStatus} setStatus={setAssetStatus} onAdd={() => { setEditingAsset(null); setModal('asset'); }} onEdit={(asset) => { setEditingAsset(asset); setModal('asset'); }} onRefresh={() => void loadPage()} onToast={show} />}
      {page === 'identification' && <IdentityCenter assets={assets} canManage={user.role !== 'CONSULTA'} canArchive={user.role === 'ADMIN' || user.role === 'GESTOR'} onToast={show} onRefresh={() => void loadPage()} />}
      {page === 'map' && <FloorPlan rooms={rooms} />}
      {page === 'movements' && <Movements movements={movements} canRequest={user.role !== 'CONSULTA'} canManage={user.role === 'ADMIN' || user.role === 'GESTOR'} onAdd={() => setModal('movement')} onUpdate={updateMovement} />}
      {page === 'alerts' && <Alerts alerts={alerts} status={alertStatus} setStatus={setAlertStatus} canManage={user.role !== 'CONSULTA'} onUpdate={updateAlert} />}
      {page === 'maintenance' && <MaintenanceCenter assets={assets} canManage={user.role !== 'CONSULTA'} onToast={show} />}
      {page === 'reports' && <ReportsCenter onToast={show} onRefresh={() => void loadPage()} canImport={user.role !== 'CONSULTA'} />}
      {page === 'admin' && <Administration gateways={gateways} assets={assets} health={health} user={user} onSimulate={simulateMovement} onAddUser={() => setModal('user')} onRefresh={() => void loadPage()} onToast={show} />}
    </main>

    <footer className="app-footer"><span>HEOM · Plataforma de Inteligência Patrimonial</span><span><ShieldCheck size={13} /> Operação local · America/Bahia</span><span>Versão 0.3.1 — Interface aprimorada · Operação nativa sem Docker</span></footer>

    {modal === 'asset' && <Modal title={editingAsset ? 'Editar equipamento' : 'Cadastrar equipamento'} description={health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' ? 'Os dados serão persistidos no arquivo JSON local desta demonstração.' : health ? 'Os dados serão persistidos no PostgreSQL da infraestrutura local.' : 'Identificando o mecanismo de persistência do ambiente…'} onClose={() => { setModal(null); setEditingAsset(null); }} wide><AssetForm asset={editingAsset} departments={departments} rooms={rooms} busy={busy} onSubmit={saveAsset} onCancel={() => { setModal(null); setEditingAsset(null); }} /></Modal>}
    {modal === 'movement' && <Modal title="Solicitar movimentação" description="A movimentação ficará pendente até a aprovação de um gestor autorizado." onClose={() => setModal(null)}><MovementForm assets={assets} departments={departments} rooms={rooms} busy={busy} onSubmit={saveMovement} /></Modal>}
    {modal === 'user' && <Modal title="Cadastrar usuário" description="Crie uma conta local e atribua o perfil de acesso adequado." onClose={() => setModal(null)}><UserForm busy={busy} onSubmit={createUser} /></Modal>}
    {toast && <Toast toast={toast} />}
  </div>;
}

function Toast({ toast }: { toast: { type: string; message: string } }) {
  return <div className={`toast toast-${toast.type}`}><span>{toast.type === 'success' ? <CheckCircleIcon /> : toast.type === 'error' ? <AlertTriangle size={17} /> : <Activity size={17} />}</span>{toast.message}</div>;
}
function CheckCircleIcon() { return <CheckCheck size={17} />; }

function Overview({ data, loading, onNavigate, onAssetFilter, onRefresh }: { data: DashboardData | null; loading: boolean; onNavigate: (page: Page) => void; onAssetFilter: (status: string) => void; onRefresh: () => void }) {
  const metrics = data?.metrics;
  const total = metrics?.total ?? 0;
  const operatingPercent = total > 0 ? Math.min(100, Math.round(((metrics?.operating ?? 0) / total) * 100)) : 0;
  const remaining = Math.max(0, total - (metrics?.operating ?? 0) - (metrics?.maintenance ?? 0) - (metrics?.unavailable ?? 0));
  const statusRows = [
    { label: 'Em operação', value: metrics?.operating ?? 0, tone: 'operating', filter: 'EM_OPERACAO' },
    { label: 'Em manutenção', value: metrics?.maintenance ?? 0, tone: 'maintenance', filter: 'EM_MANUTENCAO' },
    { label: 'Indisponíveis', value: metrics?.unavailable ?? 0, tone: 'unavailable', filter: 'INDISPONIVEL' },
    { label: 'Outras situações', value: remaining, tone: 'other', filter: '' }
  ];
  const cards = [
    { label: 'Equipamentos cadastrados', value: metrics?.total ?? '—', note: `${metrics?.simulated ?? 0} registros simulados`, icon: Boxes, tone: 'blue', target: 'assets' as Page, filter: '' },
    { label: 'Em operação', value: metrics?.operating ?? '—', note: 'Disponibilidade registrada', icon: CheckCheck, tone: 'green', target: 'assets' as Page, filter: 'EM_OPERACAO' },
    { label: 'Em manutenção', value: metrics?.maintenance ?? '—', note: 'Acompanhamento técnico', icon: Wrench, tone: 'amber', target: 'assets' as Page, filter: 'EM_MANUTENCAO' },
    { label: 'Alertas críticos', value: metrics?.critical ?? '—', note: `${metrics?.open ?? 0} ocorrências em aberto`, icon: AlertOctagon, tone: 'red', target: 'alerts' as Page, filter: '' }
  ];
  return <>
    <SectionHeading eyebrow="CENTRAL DE OPERAÇÕES · HEOM" title="Visão geral" description="Acompanhamento patrimonial e operacional em um único ambiente local."
      action={<button className="button button-outline dashboard-refresh" onClick={onRefresh}><RefreshCw size={15} /> Atualizar dados</button>} />

    <section className="dashboard-hero" aria-label="Resumo da operação patrimonial">
      <div className="dashboard-hero-copy">
        <div className="dashboard-hero-kicker"><span className="hero-live-dot" /> INTELIGÊNCIA PATRIMONIAL · OPERAÇÃO LOCAL</div>
        <h2>Visibilidade para cuidar melhor de cada recurso.</h2>
        <p>Inventário, disponibilidade, movimentações e rastreamento reunidos em uma leitura clara da operação hospitalar.</p>
        <div className="dashboard-hero-actions">
          <button className="hero-action-primary" onClick={() => onNavigate('assets')}><Package size={16} /> Consultar inventário <ArrowUpRight size={15} /></button>
          <button className="hero-action-secondary" onClick={() => onNavigate('identification')}><Camera size={16} /> Identificar por fotografia</button>
        </div>
        <div className="hero-trust-row"><span><ShieldCheck size={14} /> Dados mantidos localmente</span><span><WifiOff size={14} /> Internet não necessária</span></div>
      </div>
      <div className="dashboard-hero-side">
        <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        <div className="hero-ring-card">
          <div className="hero-ring" style={{ background: `conic-gradient(#67d7ce ${operatingPercent}%, rgba(255,255,255,.13) 0)` }}>
            <div className="hero-ring-inner"><strong>{loading ? '—' : `${operatingPercent}%`}</strong><span>em operação</span></div>
          </div>
          <div className="hero-ring-caption"><span className="hero-ring-label">DISPONIBILIDADE REGISTRADA</span><strong>{loading ? '—' : `${metrics?.operating ?? 0} de ${total}`}</strong><small>equipamentos cadastrados</small></div>
        </div>
        <div className="hero-side-footer"><span><span className="hero-live-dot" /> Painel conectado à API local</span><span>HEOM <b>·</b> BA</span></div>
      </div>
    </section>

    <div className="metric-grid dashboard-metric-grid">{cards.map(({ label, value, note, icon: Icon, tone, target, filter }, index) => <button className={`metric-card metric-${tone}`} key={label} onClick={() => target === 'assets' ? onAssetFilter(filter) : onNavigate(target)} style={{ animationDelay: `${index * 65}ms` }}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={19} /></span></div><div className="metric-value">{loading ? <span className="skeleton skeleton-number" /> : value}</div><div className="metric-note"><span>{note}</span><ArrowUpRight size={14} /></div><span className="metric-card-glow" /></button>)}</div>

    <div className="dashboard-grid dashboard-primary-grid">
      <section className="panel panel-map dashboard-panel-map"><div className="panel-heading"><div><span className="eyebrow">VISUALIZAÇÃO DE AMBIENTES</span><h2>Planta digital</h2><p>Ambientes cadastrados e pontos de localização disponíveis.</p></div><button className="text-button" onClick={() => onNavigate('map')}>Abrir planta <ArrowUpRight size={14} /></button></div>
        <div className="mini-floorplan"><div className="floorplan-caption"><span><MapPinned size={14} /> Esquema ilustrativo</span><span className="caption-warning">Aguardando planta oficial</span></div><div className="floorplan-zones"><div className="zone zone-wide"><span>ÁREA DE REFERÊNCIA</span><strong>Ambientes cadastrados</strong><small>Os marcadores dependem de gateways e salas validadas.</small></div><div className="zone"><span>INVENTÁRIO</span><strong>{metrics?.total ?? '—'} itens</strong></div><div className="zone"><span>RASTREAMENTO</span><strong>{metrics?.tracking ?? '—'} com sinal</strong></div></div></div>
        <div className="asset-composition"><div className="composition-heading"><div><span className="eyebrow">COMPOSIÇÃO DO INVENTÁRIO</span><strong>Situação operacional</strong></div><span>{loading ? '—' : `${total} ativos`}</span></div>
          <div className="composition-bar" role="img" aria-label={`Composição: ${metrics?.operating ?? 0} em operação, ${metrics?.maintenance ?? 0} em manutenção, ${metrics?.unavailable ?? 0} indisponíveis e ${remaining} em outras situações.`}>{statusRows.map((row) => <span key={row.tone} className={`composition-segment ${row.tone}`} style={{ width: total > 0 ? `${(row.value / total) * 100}%` : '0%' }} />)}</div>
          <div className="composition-legend">{statusRows.map((row) => <button type="button" key={row.tone} onClick={() => onAssetFilter(row.filter)}><i className={row.tone} /><span>{row.label}</span><strong>{loading ? '—' : row.value}</strong></button>)}</div>
        </div>
      </section>
      <section className="panel panel-alerts dashboard-panel-priorities"><div className="panel-heading"><div><span className="eyebrow">ATENÇÃO OPERACIONAL</span><h2>Prioridades</h2><p>Ocorrências que exigem acompanhamento.</p></div><button className="text-button" onClick={() => onNavigate('alerts')}>Ver alertas <ArrowUpRight size={14} /></button></div>
        <div className="priority-list"><PriorityRow tone="red" icon={<AlertOctagon size={18} />} title="Alertas críticos" value={metrics?.critical ?? '—'} note="Ocorrências críticas em aberto" /><PriorityRow tone="amber" icon={<ArrowLeftRight size={18} />} title="Movimentações pendentes" value={metrics?.pending ?? '—'} note="Aguardam decisão de gestor" /><PriorityRow tone="blue" icon={<Signal size={18} />} title="Rastreamento ativo" value={metrics?.tracking ?? '—'} note="Com localização recente registrada" /></div>
        <div className="priority-footer"><ShieldCheck size={15} /><span>Consulte os detalhes antes de tomar decisões operacionais.</span></div>
      </section>
      <section className="panel panel-events dashboard-panel-events"><div className="panel-heading"><div><span className="eyebrow">TELEMETRIA REGISTRADA</span><h2>Últimas detecções</h2><p>Eventos recebidos pelo processador local.</p></div><button className="text-button" onClick={() => onNavigate('map')}>Consultar rastreamento <ArrowUpRight size={14} /></button></div>
        {data?.recentEvents.length ? <div className="table-wrap"><table><thead><tr><th>Equipamento</th><th>Ambiente detectado</th><th>Origem</th><th>Horário</th></tr></thead><tbody>{data.recentEvents.slice(0, 5).map((event) => <tr key={event.id}><td><strong>{event.assetName}</strong><small>{event.assetNumber}</small></td><td>{event.roomName || 'Ambiente não identificado'}<small>{event.departmentName || 'Setor não identificado'}</small></td><td><StatusPill value={event.source === 'SIMULATED' ? 'ATENCAO' : 'EM_OPERACAO'} label={event.source === 'SIMULATED' ? 'Simulado' : 'Hardware'} /></td><td>{formatDate(event.detectedAt)}</td></tr>)}</tbody></table></div> : <EmptyState icon={<RadioTower size={23} />} title="Nenhuma detecção recebida" description="Quando os gateways ou o simulador enviarem eventos, eles aparecerão aqui com data e origem." />}
      </section>
      <section className="panel panel-departments dashboard-panel-departments"><div className="panel-heading"><div><span className="eyebrow">DISTRIBUIÇÃO PATRIMONIAL</span><h2>Setores cadastrados</h2><p>Contagem conforme vínculos existentes no inventário.</p></div></div>
        <div className="department-list">{data?.departments.length ? data.departments.slice(0, 5).map((department) => <div className="department-row" key={department.id}><span className="department-symbol"><Stethoscope size={17} /></span><div><strong>{department.name}</strong><small>{department.operatingCount} em operação de {department.assetCount} ativos</small><span className="department-progress"><i style={{ width: department.assetCount ? `${(department.operatingCount / department.assetCount) * 100}%` : '0%' }} /></span></div><div className="department-count">{department.assetCount}</div></div>) : <EmptyState icon={<Users size={22} />} title="Sem setores cadastrados" description="Cadastre setores para organizar o inventário." />}</div>
      </section>
    </div>
  </>;
}
function PriorityRow({ tone, icon, title, value, note }: { tone: string; icon: ReactNode; title: string; value: number | string; note: string }) {
  return <div className="priority-row"><span className={`priority-icon ${tone}`}>{icon}</span><div><strong>{title}</strong><small>{note}</small></div><b>{value}</b></div>;
}
function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><strong>{title}</strong><p>{description}</p></div>;
}

function Inventory({ assets, departments, canEdit, canArchive, query, setQuery, status, setStatus, onAdd, onEdit, onRefresh, onToast }: {
  assets: Asset[]; departments: Department[]; canEdit: boolean; canArchive: boolean; query: string; setQuery: (value: string) => void; status: string; setStatus: (value: string) => void;
  onAdd: () => void; onEdit: (asset: Asset) => void; onRefresh: () => void; onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [searchDraft, setSearchDraft] = useState(query);
  useEffect(() => { setSearchDraft(query); }, [query]);
  async function archive(asset: Asset) {
    if (!window.confirm(`Arquivar o equipamento ${asset.assetNumber}? O histórico será preservado.`)) return;
    try { await api(`/assets/${asset.id}/archive`, { method: 'POST' }); onToast('Equipamento arquivado. Histórico preservado.'); onRefresh(); }
    catch (err) { onToast(err instanceof Error ? err.message : 'Falha ao arquivar.', 'error'); }
  }
  return <>
    <SectionHeading eyebrow="PATRIMÔNIO · CADASTRO CENTRALIZADO" title="Inventário de equipamentos" description="Identificação, setor de referência e condição operacional dos ativos cadastrados."
      action={<><button className="button button-outline" onClick={onRefresh}><RefreshCw size={15} /> Atualizar</button>{canEdit && <button className="button button-primary" onClick={onAdd}><Plus size={16} /> Novo equipamento</button>}</>} />
    <div className="inventory-summary"><div><Package size={18} /><span><strong>{assets.length}</strong> registros nesta consulta</span></div><div><ShieldCheck size={18} /><span>Identificadores patrimoniais únicos</span></div><div><Database size={18} /><span>Persistência local do ambiente</span></div></div>
    <section className="panel inventory-panel"><div className="inventory-toolbar"><form className="search-box" onSubmit={(e) => { e.preventDefault(); setQuery(searchDraft); }}><Search size={17} /><input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Buscar por identificação, série, fabricante, modelo ou etiqueta…" /><button type="submit">Buscar</button></form><select aria-label="Filtrar por situação" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todas as situações</option><option value="EM_OPERACAO">Em operação</option><option value="INDISPONIVEL">Indisponível</option><option value="EM_MANUTENCAO">Em manutenção</option><option value="BAIXADO">Baixado</option></select></div>
      {assets.length ? <div className="table-wrap"><table className="inventory-table"><thead><tr><th>Identificação</th><th>Categoria</th><th>Setor de referência</th><th>Situação</th><th>Rastreamento</th><th>Origem</th><th></th></tr></thead><tbody>{assets.map((asset) => <tr key={asset.id}><td><div className="asset-cell"><span className="asset-symbol"><Package size={16} /></span><div><strong>{asset.name}</strong><small>{asset.assetNumber}{asset.officialPropertyNumber ? ` · Patrimônio ${asset.officialPropertyNumber}` : ''}</small></div></div></td><td>{asset.category}<small>{asset.manufacturer || 'Fabricante não informado'}{asset.model ? ` · ${asset.model}` : ''}</small></td><td>{asset.departmentName || 'Não atribuído'}<small>{asset.roomName || 'Ambiente não informado'}</small></td><td><StatusPill value={asset.operationalStatus} /></td><td><StatusPill value={asset.trackingStatus} /></td><td>{asset.dataOrigin === 'SIMULADO' ? <span className="demo-tag">SIMULADO</span> : <span className="origin-tag">Institucional</span>}</td><td><div className="row-actions">{canEdit && <button className="small-action" onClick={() => onEdit(asset)}>Editar</button>}{canArchive && <button className="small-action danger-action" onClick={() => void archive(asset)}>Arquivar</button>}</div></td></tr>)}</tbody></table></div> : <EmptyState icon={<Package size={24} />} title="Nenhum equipamento encontrado" description="Ajuste os filtros ou cadastre o primeiro equipamento do ambiente." />}
    </section>
  </>;
}

function AssetForm({ asset, departments, rooms, busy, onSubmit, onCancel }: { asset: Asset | null; departments: Department[]; rooms: Room[]; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const [departmentId, setDepartmentId] = useState(asset?.departmentId || '');
  const filteredRooms = departmentId ? rooms.filter((room) => room.departmentId === departmentId) : [];
  return <form className="form-grid" onSubmit={onSubmit}>
    <label>Número de identificação *<input name="assetNumber" required defaultValue={asset?.assetNumber || ''} placeholder="Ex.: PAT-000123 ou SIM-HEOM-005" /></label>
    <label>Número patrimonial oficial<input name="officialPropertyNumber" defaultValue={asset?.officialPropertyNumber || ''} placeholder="Conforme registro patrimonial" /></label>
    <label className="field-span-2">Nome do equipamento *<input name="name" required defaultValue={asset?.name || ''} placeholder="Ex.: Monitor multiparamétrico" /></label>
    <label>Categoria *<input name="category" required defaultValue={asset?.category || ''} placeholder="Ex.: Monitorização" /></label>
    <label>Fabricante<input name="manufacturer" defaultValue={asset?.manufacturer || ''} /></label>
    <label>Modelo<input name="model" defaultValue={asset?.model || ''} /></label>
    <label>Número de série<input name="serialNumber" defaultValue={asset?.serialNumber || ''} /></label>
    <label>Setor de referência<select name="departmentId" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">Não atribuído</option>{departments.map((dep) => <option key={dep.id} value={dep.id}>{dep.name}</option>)}</select></label>
    <label>Ambiente / sala<select name="roomId" defaultValue={asset?.roomId || ''}><option value="">Não informado</option>{filteredRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
    <label>Situação operacional<select name="operationalStatus" defaultValue={asset?.operationalStatus || 'EM_OPERACAO'}><option value="EM_OPERACAO">Em operação</option><option value="INDISPONIVEL">Indisponível</option><option value="EM_MANUTENCAO">Em manutenção</option><option value="BAIXADO">Baixado</option></select></label>
    <label>Criticidade<select name="criticality" defaultValue={asset?.criticality || 'MEDIA'}><option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select></label>
    <label className="field-span-2">Identificador da etiqueta de rastreamento<input name="trackingTagId" defaultValue={asset?.trackingTagId || ''} placeholder="Informe somente se houver etiqueta cadastrada" /></label>
    <label className="field-span-2">Observações<textarea name="description" rows={2} defaultValue={asset?.description || ''} placeholder="Informações adicionais relevantes para o inventário." /></label>
    <div className="form-hint field-span-2"><CircleHelp size={15} /> Campos sem informação devem permanecer em branco. Não invente patrimônio, série ou localização.</div>
    <div className="form-actions field-span-2"><button type="button" className="button button-outline" onClick={onCancel}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : asset ? 'Salvar alterações' : 'Cadastrar equipamento'}</button></div>
  </form>;
}

function FloorPlan({ rooms }: { rooms: Room[] }) {
  const [selected, setSelected] = useState<Room | null>(null);
  const simulated = rooms.some((room) => room.dataOrigin === 'SIMULADO');
  return <>
    <SectionHeading eyebrow="LOCALIZAÇÃO INTERNA · AMBIENTES" title="Planta digital" description="Consulta por setor e ambiente, com indicação da origem e da confiabilidade dos dados." action={<span className="status-pill amber"><i /> Planta ilustrativa</span>} />
    <div className="floorplan-notice"><AlertTriangle size={18} /><div><strong>Planta ilustrativa — aguardando validação institucional</strong><p>Este módulo apresenta apenas o cadastro de ambientes disponível no banco. A geometria real do HEOM, os pavimentos e as coordenadas dos gateways dependem de plantas arquitetônicas oficiais e validação da instituição.</p></div></div>
    <div className="floorplan-page-grid"><section className="panel registered-zones"><div className="panel-heading"><div><span className="eyebrow">CADASTRO DE AMBIENTES</span><h2>Setores e salas</h2><p>Selecione um ambiente para consultar seus vínculos.</p></div><span className="counter-chip">{rooms.length} ambientes</span></div>
      <div className="zones-grid">{rooms.map((room) => <button key={room.id} className={`room-tile ${selected?.id === room.id ? 'selected' : ''}`} onClick={() => setSelected(room)}><span className="room-glyph"><MapPinned size={17} /></span><strong>{room.name}</strong><small>{room.departmentName || 'Setor não vinculado'}</small><div className="room-tile-bottom"><span>{room.assetCount ?? 0} ativos detectados · {room.floorLabel || 'Pavimento não informado'}</span>{room.isRestricted && <span className="restricted-tag">Restrito</span>}</div>{room.dataOrigin === 'SIMULADO' && <span className="demo-tag">SIMULADO</span>}</button>)}</div>
      {!rooms.length && <EmptyState icon={<MapPinned size={22} />} title="Nenhum ambiente cadastrado" description="Os ambientes serão apresentados após o cadastro institucional." />}
    </section>
    <aside className="panel room-detail"><span className="eyebrow">DETALHE DO AMBIENTE</span>{selected ? <><div className="room-detail-icon"><MapPinned size={22} /></div><h2>{selected.name}</h2><p>{selected.departmentName || 'Setor não definido'}</p><div className="detail-divider" /><dl><div><dt>Código interno</dt><dd>{selected.code}</dd></div><div><dt>Pavimento</dt><dd>{selected.floorLabel || 'Não informado'}</dd></div><div><dt>Acesso</dt><dd>{selected.isRestricted ? 'Área restrita' : 'Não classificado como restrito'}</dd></div><div><dt>Origem</dt><dd>{selected.dataOrigin === 'SIMULADO' ? 'Simulado' : 'Institucional'}</dd></div></dl></> : <EmptyState icon={<MapPinned size={22} />} title="Nenhum ambiente selecionado" description="Escolha um dos ambientes cadastrados para visualizar os detalhes." />}</aside></div>
    {simulated && <div className="info-line"><CircleHelp size={15} /> Há ambientes de demonstração nesta base. Eles não devem ser interpretados como plantas ou setores oficiais do hospital.</div>}
  </>;
}

function Movements({ movements, canRequest, canManage, onAdd, onUpdate }: { movements: Movement[]; canRequest: boolean; canManage: boolean; onAdd: () => void; onUpdate: (id: string, status: string) => void }) {
  return <>
    <SectionHeading eyebrow="CONTROLE DE TRANSFERÊNCIAS" title="Movimentações" description="Solicitações, aprovações e conclusão de deslocamentos de equipamentos." action={canRequest ? <button className="button button-primary" onClick={onAdd}><Plus size={16} /> Solicitar movimentação</button> : undefined} />
    <div className="workflow-banner"><div className="workflow-icon"><ArrowLeftRight size={20} /></div><div><strong>Fluxo com aprovação e histórico</strong><p>Solicitações começam como pendentes. Gestores podem aprovar ou rejeitar; a conclusão atualiza o setor de referência do equipamento.</p></div><div className="workflow-steps"><span>Solicitada</span><ArrowUpRight size={13} /><span>Aprovada</span><ArrowUpRight size={13} /><span>Concluída</span></div></div>
    <section className="panel movement-panel"><div className="panel-heading"><div><span className="eyebrow">REGISTRO DE MOVIMENTAÇÕES</span><h2>Histórico de solicitações</h2><p>{movements.length} solicitações retornadas pelo banco local.</p></div></div>
      {movements.length ? <div className="table-wrap"><table><thead><tr><th>Equipamento</th><th>Origem e destino</th><th>Solicitante</th><th>Tipo</th><th>Data da solicitação</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td><strong>{movement.assetName}</strong><small>{movement.assetNumber}</small></td><td><div className="route-cell"><span>{movement.originDepartment || 'Origem não definida'}</span><ArrowDownRight size={14} /><strong>{movement.destinationDepartment}</strong></div></td><td>{movement.requesterName}</td><td>{labelStatus(movement.movementType)}</td><td>{formatDate(movement.requestedAt)}</td><td><StatusPill value={movement.status} /></td><td><div className="row-actions">{canManage && movement.status === 'PENDENTE' && <><button className="small-action approve-action" onClick={() => onUpdate(movement.id, 'APROVADA')}>Aprovar</button><button className="small-action danger-action" onClick={() => onUpdate(movement.id, 'REJEITADA')}>Rejeitar</button></>}{canManage && movement.status === 'APROVADA' && <button className="small-action approve-action" onClick={() => onUpdate(movement.id, 'CONCLUIDA')}>Concluir</button>}</div></td></tr>)}</tbody></table></div> : <EmptyState icon={<Truck size={23} />} title="Nenhuma movimentação registrada" description="Solicitações aprovadas e pendentes aparecerão nesta lista." />}
    </section>
  </>;
}

function MovementForm({ assets, departments, rooms, busy, onSubmit }: { assets: Asset[]; departments: Department[]; rooms: Room[]; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [destinationDepartment, setDestinationDepartment] = useState('');
  const destinationRooms = rooms.filter((room) => !destinationDepartment || room.departmentId === destinationDepartment);
  return <form className="form-grid one-column" onSubmit={onSubmit}>
    <label>Equipamento *<select name="assetId" required defaultValue=""><option value="" disabled>Selecione o equipamento</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.assetNumber} · {asset.name}</option>)}</select></label>
    <label>Setor de destino *<select name="destinationDepartmentId" required value={destinationDepartment} onChange={(e) => setDestinationDepartment(e.target.value)}><option value="" disabled>Selecione o setor</option>{departments.map((dep) => <option value={dep.id} key={dep.id}>{dep.name}</option>)}</select></label>
    <label>Ambiente de destino<select name="destinationRoomId" defaultValue=""><option value="">Não definido</option>{destinationRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
    <label>Tipo de movimentação<select name="movementType"><option value="TEMPORARIA">Temporária</option><option value="PERMANENTE">Permanente</option><option value="MANUTENCAO">Encaminhamento para manutenção</option><option value="EMERGENCIAL">Emergencial</option></select></label>
    <label>Justificativa *<textarea name="reason" required minLength={5} rows={3} placeholder="Informe a necessidade e o motivo do deslocamento." /></label>
    <div className="form-hint"><CircleHelp size={15} /> A solicitação não altera o setor do equipamento até ser aprovada e concluída.</div>
    <div className="form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Enviando…' : 'Registrar solicitação'}</button></div>
  </form>;
}

function Alerts({ alerts, status, setStatus, canManage, onUpdate }: { alerts: Alert[]; status: string; setStatus: (value: string) => void; canManage: boolean; onUpdate: (id: string, status: string) => void }) {
  return <>
    <SectionHeading eyebrow="CENTRO DE EVENTOS" title="Alertas operacionais" description="Ocorrências geradas por regras de negócio e eventos recebidos pela infraestrutura local." action={<select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar alertas"><option value="">Todos os alertas</option><option value="ABERTO">Abertos</option><option value="RECONHECIDO">Em análise</option><option value="RESOLVIDO">Resolvidos</option></select>} />
    <div className="alert-guidance"><AlertTriangle size={18} /><p>Um alerta de movimentação indica uma ocorrência que precisa ser verificada. Ele não constitui, isoladamente, evidência de furto, desvio ou conduta irregular.</p></div>
    <div className="alerts-list">{alerts.length ? alerts.map((alert) => <article className={`alert-card severity-${alert.severity.toLowerCase()}`} key={alert.id}><div className="alert-severity-mark">{alert.severity === 'CRITICO' ? <AlertOctagon size={20} /> : <AlertTriangle size={20} />}</div><div className="alert-body"><div className="alert-meta"><StatusPill value={alert.severity} /><StatusPill value={alert.status} /><span>{formatDate(alert.createdAt)}</span></div><h3>{alert.title}</h3><p>{alert.description}</p>{alert.assetName && <div className="alert-asset"><Package size={14} />{alert.assetName} · {alert.assetNumber}</div>}</div><div className="alert-actions">{canManage && alert.status === 'ABERTO' && <button className="button button-outline button-small" onClick={() => onUpdate(alert.id, 'RECONHECIDO')}>Reconhecer</button>}{canManage && alert.status !== 'RESOLVIDO' && <button className="button button-primary button-small" onClick={() => onUpdate(alert.id, 'RESOLVIDO')}>Resolver</button>}</div></article>) : <section className="panel"><EmptyState icon={<CheckCheck size={23} />} title="Nenhum alerta nesta consulta" description="Não há ocorrências que correspondam ao filtro selecionado." /></section>}</div>
  </>;
}

function Administration({ gateways, assets, health, user, onSimulate, onAddUser, onRefresh, onToast }: { gateways: Gateway[]; assets: Asset[]; health: Health | null; user: User; onSimulate: () => void; onAddUser: () => void; onRefresh: () => void; onToast: (message: string, type?: 'success' | 'error' | 'info') => void }) {
  const canAdmin = user.role === 'ADMIN';
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; role: string; active: boolean; isDemoProfile?: boolean }>>([]);
  useEffect(() => { if (canAdmin) api<{ data: typeof users }>('/admin/users').then((result) => setUsers(result.data)).catch((err) => onToast(err.message, 'error')); }, [canAdmin, onToast]);
  return <>
    <SectionHeading eyebrow="CONFIGURAÇÃO E SERVIÇOS LOCAIS" title="Administração" description={health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' ? 'Modo de avaliação sem Docker, com arquivo local persistente e simulador interno de rastreamento.' : 'Saúde da infraestrutura, gateways cadastrados e controle do ambiente de demonstração.'} action={<button className="button button-outline" onClick={onRefresh}><RefreshCw size={15} /> Atualizar</button>} />
    <div className="infra-grid"><InfraCard title="API local" status={health?.status === 'operacional' ? 'Conectada' : health?.status === 'degradado' ? 'Com degradação' : 'Indisponível'} tone={health?.status === 'operacional' ? 'green' : 'red'} icon={<Activity size={19} />} detail="Serviços de aplicação e regras de negócio" /><InfraCard title={health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' ? 'Persistência demonstrativa' : 'PostgreSQL'} status={health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' ? (health?.persistenceStatus === 'falha' ? 'Falha na gravação' : 'Arquivo JSON ativo') : health?.database === 'conectado' ? 'Conectado' : 'Indisponível'} tone={health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' ? (health?.persistenceStatus === 'falha' ? 'red' : 'blue') : health?.database === 'conectado' ? 'green' : 'red'} icon={<Database size={19} />} detail={health?.persistence || 'Persistência relacional local'} /><InfraCard title={health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' ? 'Rastreamento' : 'Broker MQTT'} status={health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' ? 'Simulador interno' : health?.mqtt === 'conectado' ? 'Conectado' : 'Aguardando conexão'} tone={health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' ? 'blue' : health?.mqtt === 'conectado' ? 'green' : 'amber'} icon={<RadioTower size={19} />} detail={health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' ? 'Evento fictício processado localmente; sem broker ou hardware' : 'Recepção local de eventos de rastreamento'} /><InfraCard title="Conectividade externa" status="Não necessária" tone="blue" icon={<HardDrive size={19} />} detail="O modo de demonstração não consulta serviços externos" /></div>
    <section className="panel gateway-panel"><div className="panel-heading"><div><span className="eyebrow">{health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' ? 'TELEMETRIA · SIMULADOR LOCAL' : 'TELEMETRIA · MQTT'}</span><h2>Gateways de rastreamento</h2><p>Dispositivos cadastrados e seu último estado conhecido.</p></div></div>{gateways.length ? <div className="table-wrap"><table><thead><tr><th>Identificação</th><th>Ambiente vinculado</th><th>Comunicação</th><th>Último contato</th><th>Origem</th></tr></thead><tbody>{gateways.map((gateway) => <tr key={gateway.id}><td><strong>{gateway.name}</strong><small>{gateway.code}</small></td><td>{gateway.roomName || 'Ambiente não vinculado'}</td><td><StatusPill value={gateway.status} /></td><td>{formatDate(gateway.lastSeenAt)}</td><td>{gateway.dataOrigin === 'SIMULADO' ? <span className="demo-tag">SIMULADO</span> : 'Institucional'}</td></tr>)}</tbody></table></div> : <EmptyState icon={<RadioTower size={23} />} title="Nenhum gateway cadastrado" description="O cadastro e a instalação de gateways físicos serão feitos após validação da infraestrutura de rede e do projeto de cobertura." />}</section>
    <section className="panel simulator-panel"><div className="simulator-intro"><div className="simulator-icon"><Activity size={20} /></div><div><span className="eyebrow">AMBIENTE CONTROLADO</span><h2>Simulador de rastreamento</h2><p>{health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' ? 'Processa uma detecção fictícia no simulador interno e atualiza a persistência local. Não exige MQTT, Docker ou dispositivos físicos.' : 'Envia uma detecção de demonstração ao broker MQTT local. O backend recebe e processa o evento pela mesma rotina de entrada dos dispositivos.'}</p></div></div><div className="simulator-controls"><div className="simulator-sample"><span>Etiqueta selecionada</span><strong>{assets.find((asset) => asset.dataOrigin === 'SIMULADO' && asset.trackingTagId)?.trackingTagId || assets.find((asset) => asset.trackingTagId)?.trackingTagId || 'Sem etiqueta disponível'}</strong><small>{gateways.find((gateway) => gateway.dataOrigin === 'SIMULADO')?.code || gateways[0]?.code || 'Nenhum gateway cadastrado'} · RSSI −61 dBm</small></div><button className="button button-primary" onClick={onSimulate} disabled={!assets.some((asset) => asset.trackingTagId) || gateways.length === 0}><RadioTower size={16} /> Emitir detecção simulada</button></div><div className="form-hint"><CircleHelp size={15} /> {health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' ? 'Modo sem Docker: evento processado pelo simulador local. Não representa rastreamento físico.' : 'Disponível somente com DEMO_MODE=true e broker MQTT local conectado. Não representa rastreamento físico.'}</div></section>
    {canAdmin && <section className="panel users-panel"><div className="panel-heading"><div><span className="eyebrow">CONTROLE DE ACESSO</span><h2>Usuários locais</h2><p>Contas autenticadas pela própria aplicação.</p></div><button className="button button-outline" onClick={onAddUser}><Plus size={15} /> Novo usuário</button></div>{users.length ? <div className="table-wrap"><table><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Situação</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.email}</td><td>{labelStatus(item.role)} {item.isDemoProfile && <span className="demo-tag">Teste</span>}</td><td><StatusPill value={item.active ? 'EM_OPERACAO' : 'INDISPONIVEL'} label={item.active ? 'Ativo' : 'Inativo'} /></td></tr>)}</tbody></table></div> : <EmptyState icon={<Users size={22} />} title="Nenhum usuário retornado" description="Cadastre usuários locais com o menor nível de permissão necessário." />}</section>}
    <div className="security-note"><ShieldCheck size={17} /><p><strong>Nota de implantação:</strong> esta base inicial ainda exige revisão de segurança, definição de certificados/TLS internos, política de senhas, firewall, cópias de segurança e homologação institucional antes de uso real.</p></div>
  </>;
}
function InfraCard({ title, status, tone, icon, detail }: { title: string; status: string; tone: string; icon: ReactNode; detail: string }) {
  return <div className="infra-card"><span className={`infra-icon ${tone}`}>{icon}</span><div><small>{title}</small><strong>{status}</strong><p>{detail}</p></div></div>;
}

function UserForm({ busy, onSubmit }: { busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="form-grid one-column" onSubmit={onSubmit}>
    <label>Nome completo *<input name="name" minLength={3} maxLength={140} required placeholder="Nome do colaborador" /></label>
    <label>E-mail *<input name="email" type="email" required placeholder="usuario@instituicao.gov.br" /></label>
    <label>Senha inicial *<input name="password" type="password" required minLength={12} placeholder="Mínimo de 12 caracteres" /></label>
    <label>Perfil de acesso<select name="role"><option value="CONSULTA">Consulta — somente leitura</option><option value="OPERADOR">Operador — cadastros e ocorrências</option><option value="GESTOR">Gestor — aprovações e gestão</option><option value="ADMIN">Administrador — controle total</option></select></label>
    <div className="form-hint"><ShieldCheck size={15} /> Conceda apenas as permissões necessárias à atividade do usuário.</div>
    <div className="form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Cadastrando…' : 'Criar usuário'}</button></div>
  </form>;
}

export default App;
