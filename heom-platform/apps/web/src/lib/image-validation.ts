export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/** Identifica o formato pelo cabeçalho binário, sem confiar na extensão/nome do arquivo. */
export function detectImageMime(bytes: Uint8Array): SupportedImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export function validateImageSignature(bytes: Uint8Array, declaredMime: string): string | null {
  const actualMime = detectImageMime(bytes);
  if (!actualMime || actualMime !== declaredMime) return 'O conteúdo real do arquivo não corresponde ao tipo JPEG, PNG ou WEBP informado.';
  return null;
}
