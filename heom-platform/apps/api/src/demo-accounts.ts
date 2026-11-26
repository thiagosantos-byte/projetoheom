export type DemoProfileRole = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'CONSULTA';

/** Personas sem conta, e-mail ou senha; servem somente para avaliar permissões de interface. */
export const DEMO_PROFILE_DEFINITIONS = [
  { name: 'Administrador de demonstração', role: 'ADMIN', description: 'Visão administrativa e configurações demonstrativas.', title: 'Administração completa' },
  { name: 'Gestor patrimonial', role: 'GESTOR', description: 'Acompanha indicadores, movimentações e manutenção.', title: 'Gestão e aprovações' },
  { name: 'Operador de inventário', role: 'OPERADOR', description: 'Registra e atualiza equipamentos e atividades operacionais.', title: 'Rotina operacional' },
  { name: 'Perfil de consulta', role: 'CONSULTA', description: 'Consulta inventário, indicadores e histórico sem realizar alterações.', title: 'Somente leitura' }
] as const satisfies ReadonlyArray<{ name: string; role: DemoProfileRole; description: string; title: string }>;

export function isDemoProfileRole(role: string): boolean {
  return DEMO_PROFILE_DEFINITIONS.some((profile) => profile.role === role);
}
