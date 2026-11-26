import crypto from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import sharp from 'sharp';
import QRCode from 'qrcode';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../');
// O armazenamento por filesystem pertence somente ao modo institucional local.
// A demonstração pública mantém fotografias no IndexedDB do navegador.
const configuredStorage = process.env.HEOM_STORAGE_DIR || 'storage';
const configuredMaxPhotoMb = Number(process.env.MAX_ASSET_PHOTO_MB || 12);
const maxPhotoBytes = Number.isFinite(configuredMaxPhotoMb) ? Math.min(12, Math.max(1, configuredMaxPhotoMb)) * 1024 * 1024 : 12 * 1024 * 1024;
export const mediaRoot = isAbsolute(configuredStorage) ? resolve(configuredStorage) : resolve(projectRoot, configuredStorage);
export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxPhotoBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    const accepted = ['image/jpeg', 'image/png', 'image/webp'];
    if (!accepted.includes(file.mimetype)) return callback(new Error('Formato inválido. Envie uma imagem JPG, PNG ou WEBP.'));
    callback(null, true);
  }
});
export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extensionAllowed = /\.csv$/i.test(file.originalname);
    const mimeAllowed = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'application/octet-stream', 'text/plain'].includes(file.mimetype);
    if (!extensionAllowed || !mimeAllowed) return callback(new Error('Formato inválido. Envie um arquivo CSV separado por ponto e vírgula ou vírgula.'));
    callback(null, true);
  }
});

export const maxAssetPhotoMb = Math.round(maxPhotoBytes / (1024 * 1024));

export type SavedPhoto = {
  id: string; assetId: string; originalName: string; fileName: string; relativePath: string;
  mimeType: string; sizeBytes: number; imageRole: 'EQUIPAMENTO' | 'PLAQUETA' | 'ETIQUETA' | 'OUTRA';
  dhash: string; uploadedBy: string; createdAt: string; archivedAt?: string | null;
};

function detectMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export async function createDifferenceHash(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer).rotate().resize(9, 8, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 9 || info.height !== 8) throw new Error('Não foi possível normalizar a imagem para análise visual.');
  let bits = 0n;
  let index = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (data[y * 9 + x]! > data[y * 9 + x + 1]!) bits |= 1n << index;
      index++;
    }
  }
  return bits.toString(16).padStart(16, '0');
}


export async function saveAssetPhoto(input: {
  assetId: string; file: Express.Multer.File; uploadedBy: string;
  imageRole?: string;
}): Promise<SavedPhoto> {
  const mimeType = detectMime(input.file.buffer);
  if (!mimeType || mimeType !== input.file.mimetype) throw new Error('O conteúdo do arquivo não corresponde a uma imagem JPG, PNG ou WEBP válida.');
  const metadata = await sharp(input.file.buffer, { failOn: 'error' }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 80 || metadata.height < 80 || metadata.width > 10000 || metadata.height > 10000) {
    throw new Error('A imagem deve ter entre 80 e 10.000 pixels em cada dimensão.');
  }
  const id = crypto.randomUUID();
  const safeExtension = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
  const fileName = `${id}${safeExtension}`;
  const relativePath = `assets/${input.assetId}/${fileName}`;
  const absolutePath = resolve(mediaRoot, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.file.buffer, { flag: 'wx', mode: 0o600 });
  let dhash: string;
  try { dhash = await createDifferenceHash(input.file.buffer); }
  catch (error) { await unlink(absolutePath).catch(() => undefined); throw error; }
  const role = ['EQUIPAMENTO', 'PLAQUETA', 'ETIQUETA', 'OUTRA'].includes(input.imageRole || '') ? input.imageRole as SavedPhoto['imageRole'] : 'EQUIPAMENTO';
  return {
    id, assetId: input.assetId, originalName: input.file.originalname.slice(0, 240), fileName,
    relativePath, mimeType, sizeBytes: input.file.size, imageRole: role, dhash,
    uploadedBy: input.uploadedBy, createdAt: new Date().toISOString()
  };
}

export async function readStoredPhoto(relativePath: string): Promise<Buffer> {
  const absolute = resolve(mediaRoot, relativePath);
  if (!absolute.startsWith(`${mediaRoot}${sep}`) && absolute !== mediaRoot) throw new Error('Caminho de imagem inválido.');
  return readFile(absolute);
}

export async function deleteStoredPhoto(relativePath: string): Promise<void> {
  const absolute = resolve(mediaRoot, relativePath);
  if (!absolute.startsWith(`${mediaRoot}${sep}`)) throw new Error('Caminho de imagem inválido.');
  await unlink(absolute).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
}

export async function makeQrSvg(value: string): Promise<string> {
  return QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'H', margin: 4, width: 640, color: { dark: '#102A43', light: '#FFFFFF' } });
}

export async function makeQrPng(value: string): Promise<Buffer> {
  return QRCode.toBuffer(value, { type: 'png', errorCorrectionLevel: 'H', margin: 4, width: 640, color: { dark: '#102A43', light: '#FFFFFF' } });
}

export function similarityLabel(similarity: number): 'ALTA_SIMILARIDADE' | 'POSSIVEL_CORRESPONDENCIA' | 'BAIXA_SIMILARIDADE' | 'SEM_CORRESPONDENCIA' {
  if (similarity >= 0.85) return 'ALTA_SIMILARIDADE';
  if (similarity >= 0.70) return 'POSSIVEL_CORRESPONDENCIA';
  if (similarity >= 0.55) return 'BAIXA_SIMILARIDADE';
  return 'SEM_CORRESPONDENCIA';
}
