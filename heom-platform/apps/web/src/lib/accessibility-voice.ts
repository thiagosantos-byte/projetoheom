export type AccessibilityVoiceCommand = 'READ_OPTIONS' | 'STOP_READING' | 'UNKNOWN';

/** Normalizes short Portuguese voice phrases without sending audio to the application. */
export function parseAccessibilityVoiceCommand(transcript: string): AccessibilityVoiceCommand {
  const normalized = transcript
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

  if (/\b(ler|leia|leiam|leitura)\b.*\b(opcoes|ajustes)\b/.test(normalized)) return 'READ_OPTIONS';
  if (/\b(parar|pare|interromper|interrompa|cancelar|cancele)\b.*\b(leitura|fala)\b/.test(normalized) || normalized === 'parar') return 'STOP_READING';
  return 'UNKNOWN';
}
