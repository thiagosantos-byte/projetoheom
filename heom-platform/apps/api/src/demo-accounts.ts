export type DemoProfileRole = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'CONSULTA';

/** Perfis fictícios disponíveis exclusivamente no servidor de demonstração local. */
export const DEMO_PROFILE_DEFINITIONS = [
  {
    email: 'admin.teste@heom.local',
    name: 'Administrador de teste',
    role: 'ADMIN',
    description: 'Acesso completo, incluindo usuários, configurações e auditoria.',
    title: 'Administração completa'
  },
  {
    email: 'gestor.teste@heom.local',
    name: 'Gestor patrimonial',
    role: 'GESTOR',
    description: 'Gerencia inventário, aprova movimentações e acompanha alertas.',
    title: 'Gestão e aprovações'
  },
  {
    email: 'operador.teste@heom.local',
    name: 'Operador de inventário',
    role: 'OPERADOR',
    description: 'Cadastra equipamentos, registra fotos e solicita movimentações.',
    title: 'Rotina operacional'
  },
  {
    email: 'consulta.teste@heom.local',
    name: 'Acesso para consulta',
    role: 'CONSULTA',
    description: 'Visualiza inventário e informações sem alterar registros.',
    title: 'Somente leitura'
  }
] as const satisfies ReadonlyArray<{
  email: string;
  name: string;
  role: DemoProfileRole;
  description: string;
  title: string;
}>;

export function isDemoProfileEmail(email: string): boolean {
  return DEMO_PROFILE_DEFINITIONS.some((profile) => profile.email === email.toLowerCase());
}
