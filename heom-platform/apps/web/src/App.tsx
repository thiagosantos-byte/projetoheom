import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, AlertOctagon, AlertTriangle, ArrowDownRight, ArrowLeftRight, ArrowUpRight, Bell,
  Check, CheckCheck, ChevronDown, CircleHelp, ClipboardList, Clock3, Database, FileDown,
  HardDrive, LayoutDashboard, LoaderCircle, MapPinned, Menu, MonitorCog, Package, Plus, RadioTower,
  RefreshCw, ScanLine, Search, Settings2, ShieldCheck, Signal, Siren, Stethoscope, Truck, Users,
  Wifi, WifiOff, X, LogOut, Wrench, Boxes, CircleDot, ExternalLink, Camera, FileSpreadsheet,
  Accessibility, Sun, Moon, Contrast, Type, Layers, Focus, RotateCcw, Minus, BookOpen, Link2,
  Mic, Volume2, VolumeX, Home, Compass, Hand
} from 'lucide-react';
import { api, apiUrl, ApiError, formatClock, formatDate, getToken, labelStatus, setToken, websocketUrl, getActiveDemoUser, setActiveDemoRole } from './lib/api';
import type { Alert, Asset, DashboardData, Department, Movement, Room, User } from './types';
import IdentityCenter from './components/IdentityCenter';
import MaintenanceCenter from './components/MaintenanceCenter';
import ReportsCenter from './components/ReportsCenter';
import { recognizePlateImage, type PlateOcrFields } from './lib/plate-ocr';
import { parseAccessibilityVoiceCommand } from './lib/accessibility-voice';

type Page = 'overview' | 'assets' | 'identification' | 'map' | 'movements' | 'alerts' | 'maintenance' | 'reports' | 'admin';
type Health = { status: string; database: string; mqtt: string; mode: string; persistence?: string; persistenceStatus?: string; tracking?: string; message?: string };
type Gateway = { id: string; code: string; name: string; status: string; lastSeenAt?: string; roomName?: string; dataOrigin: string };
type DemoProfile = { name: string; role: User['role']; description: string; title: string };

type AccessibilityPreferences = {
  theme: 'light' | 'dark';
  highContrast: boolean;
  textScale: '100' | '110' | '125' | '150' | '175' | '200';
  reducedMotion: boolean;
  reducedTransparency: boolean;
  textSpacing: boolean;
  focusHighlight: boolean;
  readableFont: boolean;
  underlineLinks: boolean;
  libras: boolean;
  guidedMode: boolean;
  motorSupport: boolean;
};

const ACCESSIBILITY_STORAGE_KEY = 'heom.accessibility.preferences.v1';
const DEFAULT_ACCESSIBILITY: AccessibilityPreferences = {
  theme: 'light', highContrast: false, textScale: '100', reducedMotion: false,
  reducedTransparency: false, textSpacing: false, focusHighlight: true,
  readableFont: false, underlineLinks: false, libras: false, guidedMode: false, motorSupport: false
};

function readAccessibilityPreferences(): AccessibilityPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCESSIBILITY_STORAGE_KEY) || 'null') as Partial<AccessibilityPreferences> | null;
    if (!saved) return DEFAULT_ACCESSIBILITY;
    const allowedScales: AccessibilityPreferences['textScale'][] = ['100', '110', '125', '150', '175', '200'];
    return {
      theme: saved.theme === 'dark' ? 'dark' : 'light',
      highContrast: saved.highContrast === true,
      textScale: allowedScales.includes(saved.textScale as AccessibilityPreferences['textScale']) ? saved.textScale as AccessibilityPreferences['textScale'] : '100',
      reducedMotion: saved.reducedMotion === true,
      reducedTransparency: saved.reducedTransparency === true,
      textSpacing: saved.textSpacing === true,
      focusHighlight: saved.focusHighlight !== false,
      readableFont: saved.readableFont === true,
      underlineLinks: saved.underlineLinks === true,
      libras: saved.libras === true,
      guidedMode: saved.guidedMode === true,
      motorSupport: saved.motorSupport === true
    };
  } catch { return DEFAULT_ACCESSIBILITY; }
}

type SpeechRecognitionResultItem = { transcript: string };
type SpeechRecognitionResultLike = ArrayLike<SpeechRecognitionResultItem>;
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
}

type AccessibilityCenterProps = {
  preferences: AccessibilityPreferences;
  onChange: <K extends keyof AccessibilityPreferences>(key: K, value: AccessibilityPreferences[K]) => void;
  onReset: () => void;
  librasMessage: string;
  onClose: () => void;
};

function AccessibilityCenter({ preferences, onChange, onReset, librasMessage, onClose }: AccessibilityCenterProps) {
  const panelRef = useRef<HTMLElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [voiceStatus, setVoiceStatus] = useState(() => {
    if (typeof window === 'undefined' || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return 'A leitura em voz alta não está disponível neste navegador. Use um leitor de tela do sistema.';
    if (!getSpeechRecognitionConstructor()) return 'A leitura em voz alta está disponível. O comando por microfone não é compatível com este navegador.';
    return 'Use “Ouvir opções” para escutar os ajustes ou “Comando de voz” para falar “ler opções” e “parar leitura”.';
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const speechRequestRef = useRef(0);
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const recognitionSupported = typeof window !== 'undefined' && Boolean(getSpeechRecognitionConstructor());

  useEffect(() => {
    const firstControl = panelRef.current?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    firstControl?.focus();
    return () => {
      speechRequestRef.current += 1;
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const stopReading = () => {
    speechRequestRef.current += 1;
    if (speechSupported) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setVoiceStatus('Leitura interrompida.');
  };

  const readOptions = () => {
    if (!speechSupported) {
      setVoiceStatus('A leitura em voz alta não está disponível neste navegador. Use um leitor de tela do sistema.');
      return;
    }
    const requestId = speechRequestRef.current + 1;
    speechRequestRef.current = requestId;
    window.speechSynthesis.cancel();
    const state = (enabled: boolean) => enabled ? 'ativado' : 'desativado';
    const theme = preferences.theme === 'dark' ? 'escuro' : 'claro';
    const options = [
      `Tema ${theme}.`,
      `Alto contraste ${state(preferences.highContrast)}. Reforça textos e limites dos controles.`,
      `Reduzir transparências ${state(preferences.reducedTransparency)}. Usa superfícies mais sólidas.`,
      `Tamanho do conteúdo: ${preferences.textScale} por cento.`,
      `Aumentar espaçamento do texto ${state(preferences.textSpacing)}. Melhora a separação das linhas e palavras.`,
      `Fonte de leitura simples ${state(preferences.readableFont)}.`,
      `Sublinhar links e ações ${state(preferences.underlineLinks)}.`,
      `Destacar foco do teclado ${state(preferences.focusHighlight)}.`,
      `Reduzir animações ${state(preferences.reducedMotion)}.`,
      `Modo de orientação simplificada ${state(preferences.guidedMode)}. Mostra a área atual, explica a finalidade da tela e oferece retorno ao início.`,
      `Modo de interação motora facilitada ${state(preferences.motorSupport)}. Aumenta botões e espaços, ajudando quem tem tremores ou movimentos menos precisos.`,
      `Intérprete VLibras ${state(preferences.libras)}. Recurso opcional para tradução em Libras.`,
    ];
    const utterance = new SpeechSynthesisUtterance(
      `Central de acessibilidade do HEOM. Vou ler as opções e o estado atual de cada uma. ${options.join(' ')}. ` +
      'Para mudar uma opção, use a tecla Tab até encontrar o controle e pressione Enter ou Espaço. Você também pode usar o comando de voz e dizer: ler opções, ou parar leitura.'
    );
    utterance.lang = 'pt-BR';
    utterance.rate = 0.88;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => { if (speechRequestRef.current === requestId) { setIsSpeaking(false); setVoiceStatus('Leitura das opções concluída.'); } };
    utterance.onerror = () => { if (speechRequestRef.current === requestId) { setIsSpeaking(false); setVoiceStatus('Não foi possível reproduzir a leitura. Verifique o áudio do dispositivo.'); } };
    setIsSpeaking(true);
    setVoiceStatus('Lendo as opções de acessibilidade em português.');
    window.speechSynthesis.speak(utterance);
  };

  const startVoiceCommand = () => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setVoiceStatus('O reconhecimento de voz não é compatível com este navegador. Use “Ouvir opções” ou um leitor de tela.');
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript || '';
      const command = parseAccessibilityVoiceCommand(transcript);
      if (command === 'READ_OPTIONS') {
        setVoiceStatus('Comando reconhecido: ler opções.');
        readOptions();
      } else if (command === 'STOP_READING') {
        stopReading();
      } else {
        setVoiceStatus(`Comando não reconhecido: “${transcript || 'nenhuma fala detectada'}”. Diga “ler opções” ou “parar leitura”.`);
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      setVoiceStatus('Não foi possível reconhecer a fala. Verifique a permissão do microfone e tente novamente.');
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    try {
      setIsListening(true);
      setVoiceStatus('Ouvindo. Diga “ler opções” ou “parar leitura”.');
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceStatus('O microfone não pôde ser iniciado. Tente novamente ou use a leitura em voz alta.');
    }
  };

  const toggle = (
    key: 'highContrast' | 'reducedMotion' | 'reducedTransparency' | 'textSpacing' | 'focusHighlight' | 'readableFont' | 'underlineLinks' | 'libras' | 'guidedMode' | 'motorSupport',
    label: string,
    description: string,
    icon: ReactNode
  ) => (
    <div className="accessibility-setting">
      <div className="accessibility-setting-copy"><span className="accessibility-setting-icon" aria-hidden="true">{icon}</span><span><strong>{label}</strong><small>{description}</small></span></div>
      <button type="button" className={`accessibility-switch ${preferences[key] ? 'is-on' : ''}`} role="switch" aria-checked={preferences[key]} aria-label={label} onClick={() => onChange(key, !preferences[key])}><span aria-hidden="true" />{preferences[key] ? 'Ativado' : 'Desativado'}</button>
    </div>
  );

  const scales: AccessibilityPreferences['textScale'][] = ['100', '110', '125', '150', '175', '200'];
  return <section ref={panelRef} id="heom-accessibility-panel" className="accessibility-panel" role="dialog" aria-modal="false" aria-labelledby="accessibility-title" aria-describedby="accessibility-description">
    <div className="accessibility-panel-header">
      <div><span className="eyebrow">PERSONALIZAÇÃO DA INTERFACE</span><h2 id="accessibility-title">Central de acessibilidade</h2><p id="accessibility-description">Ajustes salvos neste navegador. Use Tab e Shift + Tab para percorrer os controles; Esc fecha este painel.</p></div>
      <button type="button" className="icon-button" aria-label="Fechar central de acessibilidade" onClick={onClose}><X size={18}/></button>
    </div>
    <div className="accessibility-voice-card" aria-labelledby="accessibility-voice-title">
      <div className="accessibility-voice-heading"><span className="accessibility-setting-icon" aria-hidden="true"><Volume2 size={19}/></span><div><strong id="accessibility-voice-title">Leitura e comandos por voz</strong><p>Ouça os ajustes ou use o microfone para pedir que as opções sejam lidas.</p></div></div>
      <div className="accessibility-voice-actions">
        <button type="button" className="button button-primary" onClick={readOptions} disabled={!speechSupported}><Volume2 size={17} aria-hidden="true"/> Ouvir opções</button>
        <button type="button" className="button button-outline" onClick={stopReading} disabled={!isSpeaking}><VolumeX size={17} aria-hidden="true"/> Parar leitura</button>
        <button type="button" className={`button ${isListening ? 'button-listening' : 'button-outline'}`} aria-pressed={isListening} onClick={startVoiceCommand} disabled={!recognitionSupported || isListening}><Mic size={17} aria-hidden="true"/> {isListening ? 'Ouvindo…' : 'Comando de voz'}</button>
      </div>
      <p className="accessibility-voice-status" role="status" aria-live="polite">{voiceStatus}</p>
      <p className="accessibility-voice-note">Comandos aceitos: “ler opções” e “parar leitura”. {recognitionSupported ? 'O navegador pode solicitar acesso ao microfone e pode usar um serviço externo de reconhecimento.' : 'O reconhecimento por microfone não está disponível neste navegador; use “Ouvir opções”.'} Não fale informações pessoais ou dados de pacientes.</p>
    </div>
    <div className="accessibility-group"><h3>Aparência e contraste</h3>
      <div className="accessibility-theme-options" role="group" aria-label="Tema da interface">
        <button type="button" className={preferences.theme === 'light' ? 'selected' : ''} aria-pressed={preferences.theme === 'light'} onClick={() => onChange('theme', 'light')}><Sun size={17} aria-hidden="true"/> Claro</button>
        <button type="button" className={preferences.theme === 'dark' ? 'selected' : ''} aria-pressed={preferences.theme === 'dark'} onClick={() => onChange('theme', 'dark')}><Moon size={17} aria-hidden="true"/> Escuro</button>
      </div>
      {toggle('highContrast', 'Alto contraste', 'Reforça textos, limites, estados e controles interativos.', <Contrast size={18}/>)}
      {toggle('reducedTransparency', 'Reduzir transparências', 'Troca superfícies de vidro por fundos mais sólidos.', <Layers size={18}/>)}
    </div>
    <div className="accessibility-group"><h3>Leitura e compreensão</h3>
      <div className="accessibility-setting accessibility-scale-setting">
        <div className="accessibility-setting-copy"><span className="accessibility-setting-icon" aria-hidden="true"><Type size={18}/></span><span><strong>Tamanho do conteúdo</strong><small>Ampliação progressiva da interface, de 100% até 200%.</small></span></div>
        <div className="accessibility-scale" role="group" aria-label="Tamanho do conteúdo">
          {scales.map((scale) => <button key={scale} type="button" aria-label={`Definir tamanho em ${scale}%`} aria-pressed={preferences.textScale === scale} className={preferences.textScale === scale ? 'selected' : ''} onClick={() => onChange('textScale', scale)}>{scale}%</button>)}
        </div>
      </div>
      {toggle('textSpacing', 'Aumentar espaçamento do texto', 'Amplia o espaço entre linhas, letras e palavras.', <Type size={18}/>)}
      {toggle('readableFont', 'Fonte de leitura simples', 'Usa uma família sem serifa e reduz detalhes tipográficos.', <BookOpen size={18}/>)}
      {toggle('underlineLinks', 'Sublinhar links e ações', 'Ajuda a distinguir links e controles sem depender da cor.', <Link2 size={18}/>)}
    </div>
    <div className="accessibility-group"><h3>Orientação, memória e mobilidade</h3>
      {toggle('guidedMode', 'Modo de orientação simplificada', 'Mantém o nome da área atual visível, apresenta instruções curtas e oferece um botão sempre no mesmo local para voltar ao início. Apoia pessoas com dificuldades de memória e orientação, inclusive pessoas com Alzheimer ou outras demências.', <Compass size={18}/>)}
      {toggle('motorSupport', 'Modo de interação motora facilitada', 'Aumenta os botões e o espaço entre controles, reduz efeitos de movimento e evita ações que dependam de precisão fina. Apoia pessoas com Parkinson, tremores ou mobilidade reduzida.', <Hand size={18}/>)}
    </div>
    <div className="accessibility-group"><h3>Interação e movimento</h3>
      {toggle('focusHighlight', 'Destacar foco do teclado', 'Contorno reforçado para localizar o controle ativo.', <Focus size={18}/>)}
      {toggle('reducedMotion', 'Reduzir animações', 'Desativa movimentos e transições não essenciais.', <Minus size={18}/>)}
    </div>
    <div className="accessibility-group"><h3>Comunicação</h3>
      {toggle('libras', 'Ativar intérprete VLibras', 'Serviço externo opcional; precisa de internet quando ativado.', <Accessibility size={18}/>)}
      <p className="accessibility-service-status" role="status" aria-live="polite">{librasMessage}</p>
    </div>
    <div className="accessibility-panel-footer"><button type="button" className="button button-outline" onClick={onReset}><RotateCcw size={15} aria-hidden="true"/> Restaurar padrão</button><button type="button" className="button button-primary" onClick={onClose}>Concluir</button></div>
  </section>;
}
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

const PAGE_GUIDANCE: Record<Page, string> = {
  overview: 'Esta é a página inicial. Aqui você acompanha o resumo do patrimônio e os principais avisos.',
  assets: 'Aqui você consulta, pesquisa e cadastra os bens do hospital.',
  identification: 'Aqui você identifica equipamentos usando fotografias e confere os dados encontrados.',
  map: 'Aqui você consulta os setores e ambientes registrados na planta digital.',
  movements: 'Aqui você acompanha as movimentações dos bens entre setores e ambientes.',
  alerts: 'Aqui você consulta avisos e situações que precisam de atenção.',
  maintenance: 'Aqui você acompanha manutenções e registros de serviço dos equipamentos.',
  reports: 'Aqui você consulta e exporta relatórios do patrimônio.',
  admin: 'Aqui você consulta configurações administrativas e informações técnicas do sistema.'
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
  const profiles: DemoProfile[] = [
    { name: 'Administrador de demonstração', role: 'ADMIN', title: 'Administração completa', description: 'Visão administrativa e configurações demonstrativas.' },
    { name: 'Gestor patrimonial', role: 'GESTOR', title: 'Gestão e aprovações', description: 'Indicadores, movimentações e manutenção.' },
    { name: 'Operador de inventário', role: 'OPERADOR', title: 'Rotina operacional', description: 'Cadastro, atualização e atividades operacionais.' },
    { name: 'Perfil de consulta', role: 'CONSULTA', title: 'Somente leitura', description: 'Consulta de informações sem alterações.' }
  ];
  return <main className="login-layout"><div className="login-brand-panel"><div className="brand-lockup"><div className="brand-mark"><Stethoscope size={25} /></div><div><strong>HEOM</strong><span>INTELIGÊNCIA PATRIMONIAL</span></div></div><div className="login-story"><div className="eyebrow eyebrow-light">GESTÃO HOSPITALAR INTEGRADA</div><h1>O cuidado também depende de saber onde cada recurso está.</h1><p>Ambiente público de demonstração com dados totalmente fictícios.</p></div><div className="login-foot"><span>HEOM · Ambiente demonstrativo</span><span>Salvador · Bahia</span></div></div><div className="login-form-panel"><section className="login-form"><div className="login-kicker"><ShieldCheck size={17} /> AMBIENTE DE DEMONSTRAÇÃO</div><h2>Escolha um perfil de teste</h2><p className="muted">Não é necessário informar e-mail, senha ou cadastrar uma conta.</p><section className="demo-access">{profiles.map((profile) => <button key={profile.role} type="button" className="demo-profile-card" onClick={() => { setActiveDemoRole(profile.role); onLogin(getActiveDemoUser() as User, ''); }}><strong>{profile.name}</strong><span>{profile.title}</span><small>{profile.description}</small></button>)}</section><p className="demo-access-warning">Personagens demonstrativos. As permissões servem para avaliar a interface e não representam autenticação ou proteção de produção.</p></section></div></main>;
}

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
  const [modal, setModal] = useState<'asset' | 'movement' | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [pendingPhotoAssetId, setPendingPhotoAssetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; message: string; severity: string; createdAt: string; readAt?: string | null }>>([]);
  const { toast, show } = useToast();
  const [accessibility, setAccessibility] = useState<AccessibilityPreferences>(readAccessibilityPreferences);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const accessibilityTriggerRef = useRef<HTMLButtonElement>(null);
  const accessibilityWasOpen = useRef(false);
  const [librasMessage, setLibrasMessage] = useState('O intérprete permanece desligado até você ativá-lo.');
  const [globalSearch, setGlobalSearch] = useState('');

  const updateAccessibility = <K extends keyof AccessibilityPreferences>(key: K, value: AccessibilityPreferences[K]) => {
    setAccessibility((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    try { localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(accessibility)); } catch { /* Preferência continua ativa nesta sessão. */ }
  }, [accessibility]);

  useEffect(() => {
    if (!user || !accessibility.libras) return;
    setLibrasMessage('Carregando o intérprete VLibras…');
    const script = document.createElement('script');
    script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
    script.async = true;
    script.dataset.heomVlibras = 'true';
    script.onload = () => setLibrasMessage('Widget VLibras carregado. Use o botão flutuante para abrir o intérprete.');
    script.onerror = () => setLibrasMessage('Não foi possível carregar o VLibras. Verifique a conexão e tente novamente.');
    document.body.appendChild(script);
    return () => { script.onload = null; script.onerror = null; script.remove(); };
  }, [accessibility.libras, user]);

  useEffect(() => {
    if (!accessibilityOpen && accessibilityWasOpen.current) accessibilityTriggerRef.current?.focus();
    accessibilityWasOpen.current = accessibilityOpen;
  }, [accessibilityOpen]);

  useEffect(() => {
    if (!accessibilityOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAccessibilityOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [accessibilityOpen]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        if (import.meta.env.VITE_HEOM_MODE === 'demo') {
          // O perfil é uma persona local; não há login, e-mail, senha ou token.
          const demoUser = getActiveDemoUser();
          if (!cancelled) { setToken(null); setUser(demoUser as User | null); }
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
    if (import.meta.env.VITE_HEOM_MODE === 'demo') {
      setHealth({ status: 'operacional', database: 'indexeddb', mqtt: 'nao_utilizado', tracking: 'simulador_local', mode: 'DEMONSTRACAO_NAVEGADOR', persistence: 'IndexedDB e localStorage do navegador', persistenceStatus: 'operacional', message: 'Os dados e fotografias desta demonstração ficam no navegador atual.' });
      return;
    }
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
      if (page === 'overview') {
        const [dashboardData, assetData] = await Promise.all([api<DashboardData>('/dashboard'), api<{ data: Asset[] }>('/assets')]);
        setDashboard(dashboardData); setAssets(assetData.data);
      }
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
      setActiveDemoRole(role);
      setToken(null);
      setUser(getActiveDemoUser() as User);
      setPage('overview');
      setNotificationOpen(false);
      setNotifications([]);
      show(`Perfil alterado para ${labelStatus(role)}.`, 'info');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Não foi possível trocar o perfil.', 'error');
    } finally {
      setProfileSwitchBusy(false);
    }
  }

  async function saveAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      assetNumber: String(form.get('assetNumber') || '').trim(),
      officialPropertyNumber: String(form.get('officialPropertyNumber') || '').trim() || null,
      reference: String(form.get('reference') || '').trim() || null,
      name: String(form.get('name') || '').trim(),
      category: String(form.get('category') || '').trim(),
      manufacturer: String(form.get('manufacturer') || '').trim() || null,
      model: String(form.get('model') || '').trim() || null,
      serialNumber: String(form.get('serialNumber') || '').trim() || null,
      departmentId: String(form.get('departmentId') || '').trim(),
      roomId: String(form.get('roomId') || '').trim() || null,
      operationalStatus: String(form.get('operationalStatus') || 'EM_OPERACAO'),
      criticality: String(form.get('criticality') || 'MEDIA'),
      trackingTagId: String(form.get('trackingTagId') || '').trim() || null,
      description: String(form.get('description') || '').trim() || null
    };
    if (!body.departmentId) { show('Selecione o setor do equipamento antes de salvar.', 'error'); return; }
    if (body.roomId && !rooms.some((room) => room.id === body.roomId && room.departmentId === body.departmentId)) {
      show('O ambiente selecionado não pertence ao setor escolhido. Selecione novamente o ambiente.', 'error'); return;
    }
    setBusy(true);
    try {
      const galleryPhoto = form.get('assetPhoto');
      const cameraPhoto = form.get('assetPhotoCamera');
      const photo = galleryPhoto instanceof File && galleryPhoto.size > 0 ? galleryPhoto : cameraPhoto;
      let savedAssetId = pendingPhotoAssetId || editingAsset?.id || '';
      let savedAsset: Asset | null = editingAsset;
      if (editingAsset || pendingPhotoAssetId) {
        await api(`/assets/${savedAssetId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        const created = await api<{ id?: string; data?: Asset }>('/assets', { method: 'POST', body: JSON.stringify(body) });
        savedAsset = created.data || null;
        savedAssetId = created.data?.id || created.id || '';
      }
      if (!savedAssetId) {
        throw new Error('A API confirmou o cadastro, mas não retornou o identificador do equipamento. Não repita o cadastro: atualize o inventário e confira se o registro já foi criado.');
      }
      if (photo instanceof File && photo.size > 0) {
        try {
          const photoBody = new FormData(); photoBody.append('photo', photo); photoBody.append('imageRole', 'PLAQUETA');
          await api(`/assets/${savedAssetId}/photos`, { method: 'POST', body: photoBody });
        } catch (photoError) {
          setPendingPhotoAssetId(savedAssetId);
          if (!savedAsset) {
            try { savedAsset = (await api<{ data: Asset }>(`/assets/${savedAssetId}`)).data; } catch { /* o identificador fica preservado para não duplicar o registro na próxima tentativa */ }
          }
          if (savedAsset) setEditingAsset(savedAsset);
          await loadPage();
          show(`O equipamento foi salvo com sucesso, mas a fotografia não foi anexada: ${photoError instanceof Error ? photoError.message : 'falha no armazenamento'}. O cadastro permanece aberto; tente salvar novamente para anexar a mesma foto sem criar outro equipamento.`, 'error');
          return;
        }
      }
      const hadPhoto = photo instanceof File && photo.size > 0;
      show(editingAsset ? 'Cadastro atualizado.' : hadPhoto ? 'Equipamento cadastrado e fotografia anexada.' : 'Equipamento cadastrado.');
      setModal(null); setEditingAsset(null); setPendingPhotoAssetId(null); await loadPage();
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


  if (initializing) return <div className="app-loading"><div className="brand-mark"><Stethoscope size={24} /></div><span>Preparando ambiente local…</span></div>;
  if (!user && import.meta.env.VITE_HEOM_MODE === 'demo' && demoInitError) return <main className="demo-start-error">
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
  return <div className="app-shell" data-theme={accessibility.theme} data-contrast={accessibility.highContrast ? 'high' : 'normal'} data-glass={accessibility.reducedTransparency ? 'reduced' : 'full'} data-motion={accessibility.reducedMotion ? 'reduced' : 'full'} data-text-scale={accessibility.textScale} data-text-spacing={accessibility.textSpacing ? 'wide' : 'normal'} data-focus={accessibility.focusHighlight ? 'enhanced' : 'standard'} data-font={accessibility.readableFont ? 'readable' : 'standard'} data-links={accessibility.underlineLinks ? 'underlined' : 'standard'} data-guided={accessibility.guidedMode ? 'enabled' : 'disabled'} data-motor={accessibility.motorSupport ? 'enabled' : 'disabled'}>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <header className="topbar">
      <div className="brand-lockup compact"><div className="brand-mark"><Stethoscope size={21} /></div><div><strong>HEOM</strong><span>HOSPITAL ESPECIALIZADO OCTÁVIO MANGABEIRA</span></div></div>
      <div className="topbar-module"><span className="topbar-divider" /><span className="module-label">{activeTitle}</span></div>
      <div className="topbar-right">
        <form className="global-search" role="search" onSubmit={(event) => { event.preventDefault(); setAssetQuery(globalSearch.trim()); setAssetStatus(''); setPage('assets'); setNotificationOpen(false); }}>
          <Search size={16}/><input aria-label="Pesquisar patrimônio em todo o sistema" value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Buscar patrimônio…"/><button type="submit" aria-label="Pesquisar">Ir</button>
        </form>
        <div className="connection-indicators">
          <span className={`connection-chip ${health?.status === 'operacional' ? 'connected' : 'disconnected'}`}><span className="pulse-dot" />{health?.status === 'operacional' ? (health?.mode === 'DEMONSTRACAO_NAVEGADOR' ? 'Demonstração ativa' : 'Aplicação local ativa') : health?.status === 'degradado' ? 'Persistência degradada' : 'Servidor indisponível'}</span>
          <span className="connection-chip secondary"><Wifi size={13} /> Dados locais no navegador</span>
        </div>
        <div className="topbar-date"><Clock3 size={14} /><span>{formatClock(clock)}</span></div>
        <button type="button" className="icon-button theme-quick-toggle" aria-label={accessibility.theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'} title={accessibility.theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'} onClick={() => updateAccessibility('theme', accessibility.theme === 'light' ? 'dark' : 'light')}>{accessibility.theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button>
        <div className="accessibility-wrap">
          <button ref={accessibilityTriggerRef} type="button" className={`icon-button accessibility-trigger ${accessibilityOpen ? 'is-open' : ''}`} aria-label="Abrir central de acessibilidade" aria-haspopup="dialog" aria-controls="heom-accessibility-panel" aria-expanded={accessibilityOpen} onClick={() => setAccessibilityOpen((open) => !open)}><Accessibility size={19}/></button>
          {accessibilityOpen && <AccessibilityCenter preferences={accessibility} onChange={updateAccessibility} onReset={() => setAccessibility(DEFAULT_ACCESSIBILITY)} librasMessage={librasMessage} onClose={() => setAccessibilityOpen(false)}/>}
        </div>
        <div className="notification-wrap">
          <button type="button" className="icon-button notification-button" aria-label={`Notificações, ${unreadCount} não lidas`} aria-expanded={notificationOpen} onClick={() => { setNotificationOpen((value) => !value); void loadNotifications(); }}><Bell size={18} />{unreadCount > 0 && <i>{unreadCount}</i>}</button>
          {notificationOpen && <div className="notification-popover" role="region" aria-label="Central de notificações"><div className="popover-heading"><strong>Notificações</strong><button className="text-button" onClick={() => void loadNotifications()}>Atualizar</button></div>{notifications.length ? notifications.map((item) => <div className={`notification-item ${item.readAt ? 'read' : 'unread'}`} key={item.id}><span className="notification-dot" /><div><strong>{item.title}</strong><p>{item.message}</p><small>{formatDate(item.createdAt)} · {item.readAt ? 'Lida' : 'Não lida'}</small>{!item.readAt && <button className="text-button" onClick={() => void markNotificationRead(item.id)}>Marcar como lida</button>}</div></div>) : <div className="empty-inline">Nenhuma notificação registrada.</div>}</div>}
        </div>
        <div className="user-menu"><div className="avatar">{user.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div className="user-copy"><strong>{user.name}</strong><span>{import.meta.env.VITE_HEOM_MODE === 'demo' ? 'Perfil de teste · ' + labelStatus(user.role) : labelStatus(user.role)}</span></div>{import.meta.env.VITE_HEOM_MODE === 'demo' ? <select className="demo-profile-select" aria-label="Trocar perfil de demonstração" value={user.role} disabled={profileSwitchBusy} onChange={(event) => void switchDemoProfile(event.target.value as User['role'])}><option value="ADMIN">Administrador</option><option value="GESTOR">Gestor</option><option value="OPERADOR">Operador</option><option value="CONSULTA">Consulta</option></select> : <button className="icon-button logout" aria-label="Sair" onClick={logout}><LogOut size={17} /></button>}</div>
      </div>
    </header>

    <nav className="primary-nav" aria-label="Navegação principal">
      {NAV.filter(({ id }) => id !== 'admin' || user.role === 'ADMIN' || user.role === 'GESTOR').map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => { setPage(id); setNotificationOpen(false); }}><Icon size={17} strokeWidth={page === id ? 2.3 : 1.8} /><span>{label}</span>{id === 'alerts' && dashboard?.metrics.critical ? <i className="nav-alert" /> : null}</button>)}
      <div className="nav-spacer" /><span className="timezone-label">BAHIA · UTC−03</span>
    </nav>

    {import.meta.env.VITE_HEOM_MODE === 'demo' && <div className="demo-banner"><span><CircleDot size={14} /> AMBIENTE DE DEMONSTRAÇÃO — PERFIL DE TESTE</span><p>Dados fictícios armazenados neste navegador. Os perfis permitem avaliar permissões de interface e não são autenticação de produção.</p></div>}

    <main className="main-content" id="main-content" tabIndex={-1} aria-label="Conteúdo principal">
      {accessibility.guidedMode && <section className="guided-orientation" role="region" aria-labelledby="guided-orientation-title">
        <div className="guided-orientation-icon" aria-hidden="true"><Compass size={22}/></div>
        <div className="guided-orientation-copy"><span className="eyebrow">ORIENTAÇÃO DA TELA</span><h2 id="guided-orientation-title">Você está em: {activeTitle}</h2><p>{PAGE_GUIDANCE[page]}</p><small>Para voltar à página inicial, use o botão “Ir para o início”.</small></div>
        <button type="button" className="button button-primary guided-home-button" onClick={() => { setPage('overview'); setNotificationOpen(false); }}><Home size={18} aria-hidden="true"/> Ir para o início</button>
      </section>}
      {page === 'overview' && <Overview data={dashboard} loading={!dashboard} onNavigate={setPage} onAssetFilter={(filter) => { setAssetQuery(''); setAssetStatus(filter); setPage('assets'); }} onRefresh={refreshAll} />}
      {page === 'assets' && <Inventory assets={assets} departments={departments} canEdit={user.role !== 'CONSULTA'} canArchive={user.role === 'ADMIN' || user.role === 'GESTOR'} query={assetQuery} setQuery={setAssetQuery} status={assetStatus} setStatus={setAssetStatus} onAdd={() => { setEditingAsset(null); setPendingPhotoAssetId(null); setModal('asset'); }} onEdit={(asset) => { setPendingPhotoAssetId(null); setEditingAsset(asset); setModal('asset'); }} onRefresh={() => void loadPage()} onToast={show} />}
      {page === 'identification' && <IdentityCenter assets={assets} canManage={user.role !== 'CONSULTA'} canArchive={user.role === 'ADMIN' || user.role === 'GESTOR'} onToast={show} onRefresh={() => void loadPage()} />}
      {page === 'map' && <FloorPlan rooms={rooms} />}
      {page === 'movements' && <Movements movements={movements} canRequest={user.role !== 'CONSULTA'} canManage={user.role === 'ADMIN' || user.role === 'GESTOR'} onAdd={() => setModal('movement')} onUpdate={updateMovement} />}
      {page === 'alerts' && <Alerts alerts={alerts} status={alertStatus} setStatus={setAlertStatus} canManage={user.role !== 'CONSULTA'} onUpdate={updateAlert} />}
      {page === 'maintenance' && <MaintenanceCenter assets={assets} canManage={user.role !== 'CONSULTA'} onToast={show} />}
      {page === 'reports' && <ReportsCenter onToast={show} onRefresh={() => void loadPage()} canImport={user.role !== 'CONSULTA'} />}
      {page === 'admin' && <Administration gateways={gateways} assets={assets} health={health} user={user} onSimulate={simulateMovement} onRefresh={() => void loadPage()} onToast={show} />}
    </main>

    <footer className="app-footer"><span>HEOM · Plataforma de Inteligência Patrimonial</span><span><ShieldCheck size={13} /> Demonstração local-first · America/Bahia</span><span>Versão 0.8.0 — voz, memória e mobilidade</span></footer>

    <div {...{ vw: true }} className={`enabled heom-vlibras-widget ${accessibility.libras ? 'heom-vlibras-on' : 'heom-vlibras-off'}`} aria-hidden={!accessibility.libras}>
      <div {...{ 'vw-access-button': true }} className="active" />
      <div {...{ 'vw-plugin-wrapper': true }}><div className="vw-plugin-top-wrapper" /></div>
    </div>

    {modal === 'asset' && <Modal title={editingAsset ? 'Editar equipamento' : 'Cadastrar equipamento'} description={(health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' || health?.mode === 'DEMONSTRACAO_NAVEGADOR') ? 'Os dados serão salvos localmente neste navegador (localStorage/IndexedDB).' : health ? 'Os dados serão persistidos no PostgreSQL da infraestrutura local.' : 'Identificando o mecanismo de persistência do ambiente…'} onClose={() => { setModal(null); setEditingAsset(null); setPendingPhotoAssetId(null); }} wide><AssetForm asset={editingAsset} departments={departments} rooms={rooms} busy={busy} onSubmit={saveAsset} onCancel={() => { setModal(null); setEditingAsset(null); setPendingPhotoAssetId(null); }} /></Modal>}
    {modal === 'movement' && <Modal title="Solicitar movimentação" description="A movimentação ficará pendente até a aprovação de um gestor autorizado." onClose={() => setModal(null)}><MovementForm assets={assets} departments={departments} rooms={rooms} busy={busy} onSubmit={saveMovement} /></Modal>}
    {toast && <Toast toast={toast} />}
  </div>;
}

function Toast({ toast }: { toast: { type: string; message: string } }) {
  return <div className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'} aria-live={toast.type === 'error' ? 'assertive' : 'polite'}><span>{toast.type === 'success' ? <CheckCircleIcon /> : toast.type === 'error' ? <AlertTriangle size={17} /> : <Activity size={17} />}</span>{toast.message}</div>;
}
function CheckCircleIcon() { return <CheckCheck size={17} />; }

function Overview({ data, loading, onNavigate, onAssetFilter, onRefresh }: { data: DashboardData | null; loading: boolean; onNavigate: (page: Page) => void; onAssetFilter: (status: string) => void; onRefresh: () => void }) {
  const metrics = data?.metrics;
  const total = metrics?.total ?? data?.coverage?.total ?? 0;
  const operating = metrics?.operating ?? 0;
  const maintenance = metrics?.maintenance ?? 0;
  const unavailable = metrics?.unavailable ?? 0;
  const operatingPercent = total > 0 ? Math.min(100, Math.round((operating / total) * 100)) : 0;
  const remaining = Math.max(0, total - operating - maintenance - unavailable);
  const statusRows = [
    { label: 'Em operação', value: operating, tone: 'operating', filter: 'EM_OPERACAO' },
    { label: 'Em manutenção', value: maintenance, tone: 'maintenance', filter: 'EM_MANUTENCAO' },
    { label: 'Indisponíveis', value: unavailable, tone: 'unavailable', filter: 'INDISPONIVEL' },
    { label: 'Outras situações', value: remaining, tone: 'other', filter: '' }
  ].map((row) => ({ ...row, percent: total > 0 ? Math.round((row.value / total) * 100) : 0 }));
  const cards = [
    { label: 'Bens cadastrados', value: metrics?.total ?? '—', note: `${metrics?.simulated ?? 0} registros simulados`, icon: Boxes, tone: 'blue', target: 'assets' as Page, filter: '' },
    { label: 'Em operação', value: metrics?.operating ?? '—', note: 'Disponibilidade registrada', icon: CheckCheck, tone: 'green', target: 'assets' as Page, filter: 'EM_OPERACAO' },
    { label: 'Em manutenção', value: metrics?.maintenance ?? '—', note: 'Acompanhamento técnico', icon: Wrench, tone: 'amber', target: 'assets' as Page, filter: 'EM_MANUTENCAO' },
    { label: 'Alertas críticos', value: metrics?.critical ?? '—', note: `${metrics?.open ?? 0} ocorrências em aberto`, icon: AlertOctagon, tone: 'red', target: 'alerts' as Page, filter: '' }
  ];

  const allCategoryRows = (data?.categories ?? []).map((category) => ({
    name: category.name, value: category.value,
    percent: total > 0 ? Math.round((category.value / total) * 100) : 0
  })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'));
  const categoryRows = allCategoryRows.slice(0, 7);

  const reportedDepartments = (data?.departments ?? []).map((department) => ({ ...department }));
  const assignedToActiveDepartments = reportedDepartments.reduce((sum, department) => sum + department.assetCount, 0);
  const operatingInActiveDepartments = reportedDepartments.reduce((sum, department) => sum + department.operatingCount, 0);
  const outsideActiveDepartments = Math.max(0, total - assignedToActiveDepartments);
  const outsideActiveDepartmentsOperating = Math.max(0, operating - operatingInActiveDepartments);
  const allDepartmentRows = [
    ...reportedDepartments,
    ...(outsideActiveDepartments > 0 ? [{
      id: '__without-active-department__',
      name: 'Sem setor ativo associado',
      dataOrigin: 'DERIVADO',
      assetCount: outsideActiveDepartments,
      operatingCount: Math.min(outsideActiveDepartments, outsideActiveDepartmentsOperating)
    }] : [])
  ].map((department) => ({
    ...department,
    percent: total > 0 ? Math.round((department.assetCount / total) * 100) : 0
  })).sort((a, b) => b.assetCount - a.assetCount || a.name.localeCompare(b.name, 'pt-BR'));
  const departmentRows = allDepartmentRows.slice(0, 6);

  const coverageTotal = data?.coverage?.total ?? total;
  const coverageSource = data?.coverage;
  const coverageRows = [
    { label: 'Setor associado', count: coverageSource?.department ?? 0 },
    { label: 'Ambiente informado', count: coverageSource?.room ?? 0 },
    { label: 'Fabricante e modelo', count: coverageSource?.manufacturerModel ?? 0 },
    { label: 'Número de série', count: coverageSource?.serialNumber ?? 0 },
    { label: 'Etiqueta ou referência oficial', count: coverageSource?.propertyReference ?? 0 },
    { label: 'Etiqueta de rastreamento cadastrada', count: coverageSource?.trackingTag ?? 0 }
  ].map((row) => ({ ...row, percent: coverageTotal > 0 ? Math.round((row.count / coverageTotal) * 100) : 0 }));
  const coverageAverage = coverageRows.length > 0
    ? Math.round(coverageRows.reduce((sum, row) => sum + row.percent, 0) / coverageRows.length)
    : 0;

  return <>
    <SectionHeading eyebrow="CENTRAL DE OPERAÇÕES · HEOM" title="Visão geral" description="Acompanhamento patrimonial e operacional em um único ambiente local."
      action={<button className="button button-outline dashboard-refresh" onClick={onRefresh}><RefreshCw size={15} aria-hidden="true" /> Atualizar dados</button>} />

    <section className="dashboard-hero" aria-label="Resumo da operação patrimonial">
      <div className="dashboard-hero-copy">
        <div className="dashboard-hero-kicker"><span className="hero-live-dot" aria-hidden="true" /> INTELIGÊNCIA PATRIMONIAL · OPERAÇÃO LOCAL</div>
        <h2>Visibilidade para cuidar melhor de cada recurso.</h2>
        <p>Inventário, disponibilidade, movimentações e rastreamento reunidos em uma leitura clara da operação hospitalar.</p>
        <div className="dashboard-hero-actions">
          <button className="hero-action-primary" onClick={() => onNavigate('assets')}><Package size={16} aria-hidden="true" /> Consultar inventário <ArrowUpRight size={15} aria-hidden="true" /></button>
          <button className="hero-action-secondary" onClick={() => onNavigate('identification')}><Camera size={16} aria-hidden="true" /> Identificar por fotografia</button>
        </div>
        <div className="hero-trust-row"><span><ShieldCheck size={14} aria-hidden="true" /> Dados mantidos localmente</span><span><WifiOff size={14} aria-hidden="true" /> Internet não necessária</span></div>
      </div>
      <div className="dashboard-hero-side">
        <div className="hero-orbit orbit-one" aria-hidden="true" /><div className="hero-orbit orbit-two" aria-hidden="true" />
        <div className="hero-ring-card">
          <div className="hero-ring" role="meter" aria-label="Percentual de equipamentos em operação" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loading ? 0 : operatingPercent} aria-valuetext={loading ? 'Carregando disponibilidade' : `${operatingPercent}% dos equipamentos cadastrados estão em operação`} style={{ background: `conic-gradient(#67d7ce ${operatingPercent}%, rgba(255,255,255,.13) 0)` }}>
            <div className="hero-ring-inner"><strong>{loading ? '—' : `${operatingPercent}%`}</strong><span>em operação</span></div>
          </div>
          <div className="hero-ring-caption"><span className="hero-ring-label">DISPONIBILIDADE REGISTRADA</span><strong>{loading ? '—' : `${operating} de ${total}`}</strong><small>equipamentos cadastrados</small></div>
        </div>
        <div className="hero-side-footer"><span><span className="hero-live-dot" aria-hidden="true" /> Painel demonstrativo no navegador</span><span>HEOM <b>·</b> BA</span></div>
      </div>
    </section>

    <div className="metric-grid dashboard-metric-grid">{cards.map(({ label, value, note, icon: Icon, tone, target, filter }, index) => <button type="button" className={`metric-card metric-${tone}`} aria-label={`${label}: ${loading ? 'carregando' : value}. ${note}. Abrir detalhes.`} key={label} onClick={() => target === 'assets' ? onAssetFilter(filter) : onNavigate(target)} style={{ animationDelay: `${index * 65}ms` }}><div className="metric-top"><span>{label}</span><span className="metric-icon" aria-hidden="true"><Icon size={19} /></span></div><div className="metric-value">{loading ? <span className="skeleton skeleton-number" aria-label="Carregando" /> : value}</div><div className="metric-note"><span>{note}</span><ArrowUpRight size={14} aria-hidden="true" /></div><span className="metric-card-glow" aria-hidden="true" /></button>)}</div>

    <div className="dashboard-grid dashboard-primary-grid">
      <section className="panel panel-map dashboard-panel-map" aria-labelledby="dashboard-location-title">
        <div className="panel-heading"><div><span className="eyebrow">VISUALIZAÇÃO DE AMBIENTES</span><h2 id="dashboard-location-title">Planta digital</h2><p>Ambientes cadastrados e pontos de localização disponíveis.</p></div><button className="text-button" onClick={() => onNavigate('map')}>Abrir planta <ArrowUpRight size={14} aria-hidden="true" /></button></div>
        <div className="mini-floorplan"><div className="floorplan-caption"><span><MapPinned size={14} aria-hidden="true" /> Esquema ilustrativo</span><span className="caption-warning">Aguardando planta oficial</span></div><div className="floorplan-zones"><div className="zone zone-wide"><span>ÁREA DE REFERÊNCIA</span><strong>Ambientes cadastrados</strong><small>Os marcadores dependem de gateways e salas validadas.</small></div><div className="zone"><span>INVENTÁRIO</span><strong>{metrics?.total ?? '—'} itens</strong></div><div className="zone"><span>RASTREAMENTO</span><strong>{metrics?.tracking ?? '—'} com sinal</strong></div></div></div>
        <div className="asset-composition" aria-labelledby="inventory-status-title">
          <div className="composition-heading"><div><span className="eyebrow">COMPOSIÇÃO DO INVENTÁRIO</span><strong id="inventory-status-title">Situação operacional</strong></div><span>{loading ? '—' : `${total} bens`}</span></div>
          {loading ? <div className="empty-inline" role="status">Carregando a situação dos equipamentos…</div> : total > 0 ? <>
            <div className="composition-bar" role="img" aria-label={`Distribuição de ${total} bens: ${statusRows.map((row) => `${row.label}, ${row.value} (${row.percent}%)`).join('; ')}.`}>{statusRows.map((row) => <span key={row.tone} aria-hidden="true" className={`composition-segment ${row.tone}`} style={{ width: `${total > 0 ? (row.value / total) * 100 : 0}%` }} />)}</div>
            <div className="composition-legend">{statusRows.map((row) => <button type="button" key={row.tone} aria-label={row.filter ? `Filtrar inventário: ${row.label}, ${row.value} bens, ${row.percent}%` : `Abrir inventário completo; ${row.label}: ${row.value} bens, ${row.percent}%`} onClick={() => onAssetFilter(row.filter)}><span className={`legend-mark ${row.tone}`} aria-hidden="true"/><span className="legend-copy"><strong>{row.label}</strong><small>{row.percent}% do acervo</small></span><b>{row.value}</b></button>)}</div>
          </> : <EmptyState icon={<Boxes size={22}/>} title="Ainda não há bens cadastrados" description="Cadastre o primeiro equipamento para formar a visão de situação operacional."/>}
        </div>
      </section>

      <section className="panel panel-alerts dashboard-panel-priorities" aria-labelledby="dashboard-priorities-title"><div className="panel-heading"><div><span className="eyebrow">ATENÇÃO OPERACIONAL</span><h2 id="dashboard-priorities-title">Prioridades</h2><p>Ocorrências que exigem acompanhamento.</p></div><button className="text-button" onClick={() => onNavigate('alerts')}>Ver alertas <ArrowUpRight size={14} aria-hidden="true" /></button></div>
        <div className="priority-list"><PriorityRow tone="red" icon={<AlertOctagon size={18} />} title="Alertas críticos" value={metrics?.critical ?? '—'} note="Ocorrências críticas em aberto" /><PriorityRow tone="amber" icon={<ArrowLeftRight size={18} />} title="Movimentações pendentes" value={metrics?.pending ?? '—'} note="Aguardam decisão de gestor" /><PriorityRow tone="blue" icon={<Signal size={18} />} title="Rastreamento ativo" value={metrics?.tracking ?? '—'} note="Com localização recente registrada" /></div>
        <div className="priority-footer"><ShieldCheck size={15} aria-hidden="true" /><span>Consulte os detalhes antes de tomar decisões operacionais.</span></div>
      </section>

      <section className="panel panel-events dashboard-panel-events" aria-labelledby="dashboard-events-title"><div className="panel-heading"><div><span className="eyebrow">TELEMETRIA REGISTRADA</span><h2 id="dashboard-events-title">Últimas detecções</h2><p>Eventos recebidos pelo processador local.</p></div><button className="text-button" onClick={() => onNavigate('map')}>Consultar rastreamento <ArrowUpRight size={14} aria-hidden="true" /></button></div>
        {data?.recentEvents.length ? <div className="table-wrap"><table><caption className="visually-hidden">Últimas detecções de equipamentos, ambiente, origem e horário.</caption><thead><tr><th scope="col">Equipamento</th><th scope="col">Ambiente detectado</th><th scope="col">Origem</th><th scope="col">Horário</th></tr></thead><tbody>{data.recentEvents.slice(0, 5).map((event) => <tr key={event.id}><td><strong>{event.assetName}</strong><small>{event.assetNumber}</small></td><td>{event.roomName || 'Ambiente não identificado'}<small>{event.departmentName || 'Setor não identificado'}</small></td><td><StatusPill value={event.source === 'SIMULATED' ? 'ATENCAO' : 'EM_OPERACAO'} label={event.source === 'SIMULATED' ? 'Simulado' : 'Hardware'} /></td><td>{formatDate(event.detectedAt)}</td></tr>)}</tbody></table></div> : <EmptyState icon={<RadioTower size={23} />} title="Nenhuma detecção recebida" description="Quando os gateways ou o simulador enviarem eventos, eles aparecerão aqui com data e origem." />}
      </section>

      <section className="panel panel-departments dashboard-panel-departments" aria-labelledby="dashboard-departments-title">
        <div className="panel-heading"><div><span className="eyebrow">DISTRIBUIÇÃO PATRIMONIAL</span><h2 id="dashboard-departments-title">Patrimônio por setor</h2><p>Quantidade de bens por setor, incluindo os que ainda não estão associados a um setor ativo.</p></div><Users size={19} aria-hidden="true"/></div>
        {loading ? <div className="empty-inline" role="status">Carregando a distribuição por setor…</div> : departmentRows.length ? <>
          <ol className="infographic-list department-infographic-list">{departmentRows.map((department) => <li className="infographic-row" key={department.id}>
            <div className="infographic-row-heading"><strong>{department.name}</strong><span>{department.assetCount} {department.assetCount === 1 ? 'bem' : 'bens'} · {department.percent}%</span></div>
            <div className="infographic-track" role="progressbar" aria-label={`${department.name}: ${department.assetCount} bens, ${department.operatingCount} em operação, ${department.percent}% do inventário`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={department.percent}><span style={{ width: `${department.percent}%` }}/></div>
            <small>{department.operatingCount} em operação · {Math.max(0, department.assetCount - department.operatingCount)} em outras situações</small>
          </li>)}</ol>
          {allDepartmentRows.length > departmentRows.length && <details className="infographic-data-details"><summary>Consultar dados de todos os setores ({allDepartmentRows.length})</summary><div className="table-wrap"><table><caption className="visually-hidden">Contagem patrimonial de todos os setores ativos e bens sem setor ativo associado.</caption><thead><tr><th scope="col">Setor</th><th scope="col">Total de bens</th><th scope="col">Em operação</th><th scope="col">Percentual do acervo</th></tr></thead><tbody>{allDepartmentRows.map((department) => <tr key={department.id}><th scope="row">{department.name}</th><td>{department.assetCount}</td><td>{department.operatingCount}</td><td>{department.percent}%</td></tr>)}</tbody></table></div></details>}
        </> : <EmptyState icon={<Users size={22} />} title="Sem setores cadastrados" description="Cadastre setores para organizar o inventário."/>}
      </section>

      <section className="panel dashboard-category-panel" aria-labelledby="dashboard-categories-title"><div className="panel-heading"><div><span className="eyebrow">DISTRIBUIÇÃO POR TIPO</span><h2 id="dashboard-categories-title">Categorias patrimoniais</h2><p>Contagem calculada diretamente dos equipamentos ativos cadastrados.</p></div><Package size={19} aria-hidden="true"/></div>
        {loading ? <div className="empty-inline" role="status">Carregando a distribuição por categoria…</div> : categoryRows.length ? <>
          <ol className="infographic-list category-infographic-list">{categoryRows.map((row) => <li className="infographic-row" key={row.name}>
            <div className="infographic-row-heading"><strong>{row.name}</strong><span>{row.value} {row.value === 1 ? 'equipamento' : 'equipamentos'} · {row.percent}%</span></div>
            <div className="infographic-track category-track" role="progressbar" aria-label={`${row.name}: ${row.value} equipamentos, ${row.percent}% do inventário`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.percent}><span style={{ width: `${row.percent}%` }}/></div>
          </li>)}</ol>
          {allCategoryRows.length > categoryRows.length && <details className="infographic-data-details"><summary>Consultar dados de todas as categorias ({allCategoryRows.length})</summary><div className="table-wrap"><table><caption className="visually-hidden">Contagem de equipamentos em todas as categorias patrimoniais.</caption><thead><tr><th scope="col">Categoria</th><th scope="col">Quantidade</th><th scope="col">Percentual</th></tr></thead><tbody>{allCategoryRows.map((row) => <tr key={row.name}><th scope="row">{row.name}</th><td>{row.value}</td><td>{row.percent}%</td></tr>)}</tbody></table></div></details>}
        </> : <EmptyState icon={<Boxes size={22}/>} title="Sem categorias para exibir" description="Cadastre equipamentos para formar a distribuição patrimonial."/>}
      </section>

      <section className="panel dashboard-quality-panel" aria-labelledby="dashboard-quality-title">
        <div className="panel-heading"><div><span className="eyebrow">CONFIABILIDADE DO INVENTÁRIO</span><h2 id="dashboard-quality-title">Cobertura cadastral</h2><p>Presença de informações importantes para identificar e localizar os bens.</p></div><ClipboardList size={19} aria-hidden="true"/></div>
        {loading ? <div className="empty-inline" role="status">Calculando a cobertura cadastral…</div> : coverageTotal > 0 ? <>
          <div className="coverage-summary"><strong>{coverageAverage}%</strong><span>média simples dos {coverageRows.length} indicadores</span><small>Base de cálculo: {coverageTotal} {coverageTotal === 1 ? 'bem não arquivado' : 'bens não arquivados'}.</small></div>
          <ul className="infographic-list coverage-infographic-list">{coverageRows.map((row) => <li className="infographic-row" key={row.label}>
            <div className="infographic-row-heading"><strong>{row.label}</strong><span>{row.count} de {coverageTotal} · {row.percent}%</span></div>
            <div className="infographic-track coverage-track" role="progressbar" aria-label={`${row.label}: ${row.count} de ${coverageTotal} bens, ${row.percent}% preenchido`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.percent}><span style={{ width: `${row.percent}%` }}/></div>
          </li>)}</ul>
          <p className="coverage-note">Campos sem preenchimento não significam necessariamente erro: alguns podem não se aplicar a todos os tipos de patrimônio.</p>
        </> : <EmptyState icon={<ClipboardList size={22}/>} title="Sem dados para avaliar" description="A cobertura será calculada quando houver bens não arquivados cadastrados."/>}
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

type PlateFields = Pick<PlateOcrFields, 'officialPropertyNumber' | 'manufacturer' | 'model' | 'serialNumber' | 'reference'>;

function AssetForm({ asset, departments, rooms, busy, onSubmit, onCancel }: { asset: Asset | null; departments: Department[]; rooms: Room[]; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const [departmentId, setDepartmentId] = useState(asset?.departmentId || '');
  const [roomId, setRoomId] = useState(asset?.roomId || '');
  const [platePhoto, setPlatePhoto] = useState<File | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMessage, setOcrMessage] = useState('');
  const [rawOcrText, setRawOcrText] = useState('');
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [recognized, setRecognized] = useState<PlateFields>({
    officialPropertyNumber: asset?.officialPropertyNumber || '',
    manufacturer: asset?.manufacturer || '', model: asset?.model || '',
    serialNumber: asset?.serialNumber || '', reference: asset?.reference || ''
  });
  const previewUrl = useMemo(() => platePhoto ? URL.createObjectURL(platePhoto) : '', [platePhoto]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const filteredRooms = departmentId ? rooms.filter((room) => room.departmentId === departmentId) : [];

  async function readPlate() {
    if (!platePhoto) { setOcrMessage('Selecione ou fotografe a plaqueta antes de iniciar a leitura.'); return; }
    setOcrBusy(true); setOcrMessage('Validando imagem…'); setRawOcrText(''); setOcrConfidence(null);
    try {
      const result = await recognizePlateImage(platePhoto, (_step, progress, message) => {
        const percent = progress === null ? '' : ` ${Math.round(progress * 100)}%`;
        setOcrMessage(`${message}${percent}`);
      });
      setRawOcrText(result.rawText);
      setOcrConfidence(result.confidence);
      setRecognized((current) => ({
        officialPropertyNumber: result.fields.officialPropertyNumber || current.officialPropertyNumber,
        manufacturer: result.fields.manufacturer || current.manufacturer,
        model: result.fields.model || current.model,
        serialNumber: result.fields.serialNumber || current.serialNumber,
        reference: result.fields.reference || current.reference
      }));
      setOcrMessage(result.message);
    } catch (error) {
      setOcrMessage(error instanceof Error ? `Falha no OCR: ${error.message}` : 'Falha desconhecida no reconhecimento. O texto já identificado foi preservado.');
    } finally { setOcrBusy(false); }
  }

  return <form className="form-grid" onSubmit={onSubmit}>
    <section className="asset-photo-registration field-span-2">
      <div className="asset-photo-registration-heading"><div><span className="eyebrow">CADASTRO ASSISTIDO POR IMAGEM</span><strong>Fotografe a plaqueta de identificação</strong><p>O OCR comum aos módulos do HEOM processa a imagem neste navegador, sem enviar a fotografia a serviços externos.</p></div><Camera size={22}/></div>
      <div className="asset-photo-registration-body">
        <div className="asset-photo-picker-group">
          <label className="asset-photo-picker"><input type="file" name="assetPhoto" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setPlatePhoto(event.target.files?.[0] || null); setOcrMessage(''); setRawOcrText(''); }} /><span>{previewUrl ? <img src={previewUrl} alt="Pré-visualização da plaqueta selecionada"/> : <Camera size={24}/>}</span><strong>{platePhoto?.name || 'Selecionar imagem da galeria'}</strong><small>Escolha uma fotografia JPG, PNG ou WEBP já existente · até 12 MB</small></label>
          <label className="asset-camera-picker"><Camera size={17}/><span>Usar câmera do dispositivo</span><input type="file" name="assetPhotoCamera" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { const file = event.target.files?.[0] || null; if (file) { setPlatePhoto(file); setOcrMessage(''); setRawOcrText(''); } }} /></label>
        </div>
        <div className="asset-photo-ocr-actions"><button type="button" className="button button-primary" onClick={() => void readPlate()} disabled={!platePhoto || ocrBusy || busy}>{ocrBusy ? <><LoaderCircle size={15} className="spin"/> Lendo plaqueta…</> : <><ScanLine size={15}/> Ler e preencher dados</>}</button><p className="form-hint">A imagem é processada localmente. O arquivo original será anexado ao equipamento após a confirmação do cadastro; se o anexo falhar, o cadastro ficará aberto para nova tentativa.</p>{ocrMessage && <div className="ocr-inline-status" role="status">{ocrMessage}</div>}{ocrConfidence !== null && <small>Confiança média informada pelo OCR: {Math.round(ocrConfidence)}% (indicador do mecanismo, não garantia de acerto).</small>}</div>
      </div>
      {rawOcrText && <details className="asset-ocr-raw"><summary>Conferir texto reconhecido</summary><pre>{rawOcrText}</pre></details>}
      <div className="form-hint"><CircleHelp size={15}/> O reconhecimento não inventa patrimônio, nome, categoria ou localização. Esses campos continuam exigindo conferência e preenchimento pelo operador.</div>
    </section>
    <label>Número de identificação *<input name="assetNumber" required defaultValue={asset?.assetNumber || ''} placeholder="Ex.: PAT-000123 ou HEOM-000123" /></label>
    <label>Número patrimonial oficial<input name="officialPropertyNumber" value={recognized.officialPropertyNumber} onChange={(event) => setRecognized((current) => ({ ...current, officialPropertyNumber: event.target.value }))} placeholder="Preenchido pela leitura, quando identificado" /></label>
    <label className="field-span-2">Nome do equipamento *<input name="name" required defaultValue={asset?.name || ''} placeholder="Ex.: Monitor multiparamétrico" /></label>
    <label>Categoria *<input name="category" required defaultValue={asset?.category || ''} placeholder="Ex.: Monitorização" /></label>
    <label>Fabricante<input name="manufacturer" value={recognized.manufacturer} onChange={(event) => setRecognized((current) => ({ ...current, manufacturer: event.target.value }))} /></label>
    <label>Modelo<input name="model" value={recognized.model} onChange={(event) => setRecognized((current) => ({ ...current, model: event.target.value }))} /></label>
    <label>Referência do equipamento<input name="reference" value={recognized.reference} onChange={(event) => setRecognized((current) => ({ ...current, reference: event.target.value }))} /></label>
    <label>Número de série<input name="serialNumber" value={recognized.serialNumber} onChange={(event) => setRecognized((current) => ({ ...current, serialNumber: event.target.value }))} /></label>
    <label>Setor de referência *<select name="departmentId" required value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); if (!rooms.some((room) => room.id === roomId && room.departmentId === e.target.value)) setRoomId(''); }}><option value="">Selecione o setor</option>{departments.map((dep) => <option key={dep.id} value={dep.id}>{dep.name}</option>)}</select></label>
    <label>Ambiente / sala<select name="roomId" value={roomId} onChange={(event) => setRoomId(event.target.value)}><option value="">Não informado</option>{filteredRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
    <label>Situação operacional<select name="operationalStatus" defaultValue={asset?.operationalStatus || 'EM_OPERACAO'}><option value="EM_OPERACAO">Em operação</option><option value="INDISPONIVEL">Indisponível</option><option value="EM_MANUTENCAO">Em manutenção</option><option value="BAIXADO">Baixado</option></select></label>
    <label>Criticidade<select name="criticality" defaultValue={asset?.criticality || 'MEDIA'}><option value="BAIXA">Baixa</option><option value="MEDIA">Média</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select></label>
    <label className="field-span-2">Identificador da etiqueta de rastreamento<input name="trackingTagId" defaultValue={asset?.trackingTagId || ''} placeholder="Informe somente se houver etiqueta cadastrada" /></label>
    <label className="field-span-2">Observações<textarea name="description" rows={2} defaultValue={asset?.description || ''} placeholder="Informações adicionais relevantes para o inventário." /></label>
    <div className="form-hint field-span-2"><CircleHelp size={15} /> Campos sem informação devem permanecer em branco. Não invente patrimônio, série ou localização.</div>
    <div className="form-actions field-span-2"><button type="button" className="button button-outline" onClick={onCancel}>Cancelar</button><button className="button button-primary" disabled={busy || ocrBusy}>{busy ? 'Salvando…' : asset ? 'Salvar alterações' : 'Confirmar e cadastrar equipamento'}</button></div>
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

function Administration({ gateways, assets, health, user, onSimulate, onRefresh, onToast }: { gateways: Gateway[]; assets: Asset[]; health: Health | null; user: User; onSimulate: () => void; onRefresh: () => void; onToast: (message: string, type?: 'success' | 'error' | 'info') => void }) {
  const canAdmin = user.role === 'ADMIN';
  const [users, setUsers] = useState<Array<{ id: string; name: string; role: string; active: boolean; isDemoProfile?: boolean }>>([]);
  useEffect(() => { if (canAdmin) api<{ data: typeof users }>('/admin/users').then((result) => setUsers(result.data)).catch((err) => onToast(err.message, 'error')); }, [canAdmin, onToast]);
  return <>
    <SectionHeading eyebrow="CONFIGURAÇÃO E SERVIÇOS LOCAIS" title="Administração" description={(health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' || health?.mode === 'DEMONSTRACAO_NAVEGADOR') ? 'Modo demonstrativo local-first: dados no navegador atual e rastreamento exclusivamente simulado.' : 'Saúde da infraestrutura, gateways cadastrados e controle do ambiente de demonstração.'} action={<button className="button button-outline" onClick={onRefresh}><RefreshCw size={15} /> Atualizar</button>} />
    <div className="infra-grid"><InfraCard title="Aplicação demonstrativa" status={health?.status === 'operacional' ? 'Ativa' : health?.status === 'degradado' ? 'Com degradação' : 'Indisponível'} tone={health?.status === 'operacional' ? 'green' : 'red'} icon={<Activity size={19} />} detail="Operações executadas no navegador atual; sem sessão ou servidor de dados compartilhado" /><InfraCard title={(health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' || health?.mode === 'DEMONSTRACAO_NAVEGADOR') ? 'Persistência demonstrativa' : 'PostgreSQL'} status={(health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' || health?.mode === 'DEMONSTRACAO_NAVEGADOR') ? (health?.persistenceStatus === 'falha' ? 'Falha na gravação' : 'Armazenamento do navegador ativo') : health?.database === 'conectado' ? 'Conectado' : 'Indisponível'} tone={(health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' || health?.mode === 'DEMONSTRACAO_NAVEGADOR') ? (health?.persistenceStatus === 'falha' ? 'red' : 'blue') : health?.database === 'conectado' ? 'green' : 'red'} icon={<Database size={19} />} detail={health?.persistence || 'Persistência relacional local'} /><InfraCard title={(health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' || health?.mode === 'DEMONSTRACAO_NAVEGADOR') ? 'Rastreamento' : 'Broker MQTT'} status={(health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' || health?.mode === 'DEMONSTRACAO_NAVEGADOR') ? 'Simulador interno' : health?.mqtt === 'conectado' ? 'Conectado' : 'Aguardando conexão'} tone={(health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' || health?.mode === 'DEMONSTRACAO_NAVEGADOR') ? 'blue' : health?.mqtt === 'conectado' ? 'green' : 'amber'} icon={<RadioTower size={19} />} detail={(health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' || health?.mode === 'DEMONSTRACAO_NAVEGADOR') ? 'Evento fictício no navegador; sem broker ou hardware físico' : 'Recepção local de eventos de rastreamento'} /><InfraCard title="Conectividade externa" status="Não necessária" tone="blue" icon={<HardDrive size={19} />} detail="O modo de demonstração não consulta serviços externos" /></div>
    <section className="panel gateway-panel"><div className="panel-heading"><div><span className="eyebrow">{(health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' || health?.mode === 'DEMONSTRACAO_NAVEGADOR') ? 'TELEMETRIA · SIMULADOR LOCAL' : 'TELEMETRIA · MQTT'}</span><h2>Gateways de rastreamento</h2><p>Dispositivos cadastrados e seu último estado conhecido.</p></div></div>{gateways.length ? <div className="table-wrap"><table><thead><tr><th>Identificação</th><th>Ambiente vinculado</th><th>Comunicação</th><th>Último contato</th><th>Origem</th></tr></thead><tbody>{gateways.map((gateway) => <tr key={gateway.id}><td><strong>{gateway.name}</strong><small>{gateway.code}</small></td><td>{gateway.roomName || 'Ambiente não vinculado'}</td><td><StatusPill value={gateway.status} /></td><td>{formatDate(gateway.lastSeenAt)}</td><td>{gateway.dataOrigin === 'SIMULADO' ? <span className="demo-tag">SIMULADO</span> : 'Institucional'}</td></tr>)}</tbody></table></div> : <EmptyState icon={<RadioTower size={23} />} title="Nenhum gateway cadastrado" description="O cadastro e a instalação de gateways físicos serão feitos após validação da infraestrutura de rede e do projeto de cobertura." />}</section>
    <section className="panel simulator-panel"><div className="simulator-intro"><div className="simulator-icon"><Activity size={20} /></div><div><span className="eyebrow">AMBIENTE CONTROLADO</span><h2>Simulador de rastreamento</h2><p>{(health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' || health?.mode === 'DEMONSTRACAO_NAVEGADOR') ? 'Processa uma detecção fictícia no simulador interno e atualiza a persistência local. Não exige MQTT, Docker ou dispositivos físicos.' : 'Envia uma detecção de demonstração ao broker MQTT local. O backend recebe e processa o evento pela mesma rotina de entrada dos dispositivos.'}</p></div></div><div className="simulator-controls"><div className="simulator-sample"><span>Etiqueta selecionada</span><strong>{assets.find((asset) => asset.dataOrigin === 'SIMULADO' && asset.trackingTagId)?.trackingTagId || assets.find((asset) => asset.trackingTagId)?.trackingTagId || 'Sem etiqueta disponível'}</strong><small>{gateways.find((gateway) => gateway.dataOrigin === 'SIMULADO')?.code || gateways[0]?.code || 'Nenhum gateway cadastrado'} · RSSI −61 dBm</small></div><button className="button button-primary" onClick={onSimulate} disabled={!assets.some((asset) => asset.trackingTagId) || gateways.length === 0}><RadioTower size={16} /> Emitir detecção simulada</button></div><div className="form-hint"><CircleHelp size={15} /> {(health?.mode === 'DEMONSTRACAO_LOCAL_SEM_DOCKER' || health?.mode === 'DEMONSTRACAO_NAVEGADOR') ? 'Demonstração: evento guardado neste navegador. Não representa rastreamento físico.' : 'Disponível somente com DEMO_MODE=true e broker MQTT local conectado. Não representa rastreamento físico.'}</div></section>
    {canAdmin && <section className="panel users-panel"><div className="panel-heading"><div><span className="eyebrow">CONTROLE DE ACESSO DEMONSTRATIVO</span><h2>Perfis e matriz de permissões</h2><p>Personagens fixos de avaliação. Não há contas, e-mails, senhas ou usuários reais; altere o perfil pelo seletor no cabeçalho.</p></div></div>{users.length ? <div className="table-wrap"><table><thead><tr><th>Perfil demonstrativo</th><th>Inventário</th><th>Movimentações</th><th>Administração</th><th>Situação</th></tr></thead><tbody>{users.map((item) => { const permissions: Record<string, [string, string, string]> = { ADMIN: ['Cadastrar, editar e arquivar', 'Solicitar, aprovar e concluir', 'Acesso completo e perfis'], GESTOR: ['Cadastrar, editar e arquivar', 'Solicitar, aprovar e concluir', 'Gateways e operação'], OPERADOR: ['Cadastrar e editar', 'Solicitar movimentações', 'Sem acesso administrativo'], CONSULTA: ['Somente leitura', 'Somente leitura', 'Sem acesso administrativo'] }; const access = permissions[item.role] || ['Não definido', 'Não definido', 'Não definido']; return <tr key={item.id}><td><strong>{item.name}</strong><small>{labelStatus(item.role)}</small></td><td>{access[0]}</td><td>{access[1]}</td><td>{access[2]}</td><td><StatusPill value={item.active ? 'EM_OPERACAO' : 'INDISPONIVEL'} label={item.active ? 'Disponível' : 'Indisponível'} /></td></tr>; })}</tbody></table></div> : <EmptyState icon={<Users size={22} />} title="Perfis indisponíveis" description="Atualize a demonstração para carregar as personas de teste." />}</section>}
    <div className="security-note"><ShieldCheck size={17} /><p><strong>Nota de implantação:</strong> esta base inicial ainda exige revisão de segurança, definição de certificados/TLS internos, política de senhas, firewall, cópias de segurança e homologação institucional antes de uso real.</p></div>
  </>;
}
function InfraCard({ title, status, tone, icon, detail }: { title: string; status: string; tone: string; icon: ReactNode; detail: string }) {
  return <div className="infra-card"><span className={`infra-icon ${tone}`}>{icon}</span><div><small>{title}</small><strong>{status}</strong><p>{detail}</p></div></div>;
}

export default App;
