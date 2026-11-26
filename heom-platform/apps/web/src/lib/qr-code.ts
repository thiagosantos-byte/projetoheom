/** Payload compacto compatível com as etiquetas antigas HEOM-ASSET:<UUID>. */
export function normalizeHeomQrPayload(input: string): { id: string; valid: boolean; message: string } {
  const value = input.replace(/[\r\n\t]/g, '').replace(/\s+/g, '').trim();
  const match = value.match(/^HEOM-ASSET\s*:\s*([A-Z0-9-]{8,80})$/i);
  if (!match?.[1]) return { id: '', valid: false, message: 'QR Code inválido. A etiqueta deve conter o identificador HEOM-ASSET.' };
  return { id: match[1], valid: true, message: 'Identificador HEOM reconhecido.' };
}
