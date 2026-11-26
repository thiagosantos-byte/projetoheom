export type MovementStatus = 'PENDENTE' | 'APROVADA' | 'REJEITADA' | 'CONCLUIDA' | 'CANCELADA';

export function canTransitionMovement(current: string, next: string): boolean {
  return (current === 'PENDENTE' && (next === 'APROVADA' || next === 'REJEITADA')) ||
    (current === 'APROVADA' && next === 'CONCLUIDA');
}

export function trackingStatusForObservation(hasKnownRoom: boolean): 'SETOR_ESTIMADO' | 'ULTIMA_LOCALIZACAO' {
  return hasKnownRoom ? 'SETOR_ESTIMADO' : 'ULTIMA_LOCALIZACAO';
}
