import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, unlink, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { dirname, resolve, sep, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import sharp from 'sharp';
import QRCode from 'qrcode';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../');
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
  return QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 320, color: { dark: '#153D5C', light: '#FFFFFF' } });
}

function parseOcrFields(text: string) {
  const pick = (patterns: RegExp[]) => {
    for (const pattern of patterns) { const match = text.match(pattern); if (match?.[1]) return match[1].trim().replace(/[|]+/g, ' ').slice(0, 160); }
    return null;
  };
  return {
    manufacturer: pick([/(?:fabricante|manufacturer|marca|brand)\s*[:\-]?\s*([^\r\n]+)/i]),
    model: pick([/(?:modelo|model)\s*[:\-]?\s*([^\r\n]+)/i]),
    serialNumber: pick([/(?:n[ºo°.]?\s*(?:de\s*)?s[eé]rie|serial\s*(?:number|no\.?|#)?|s\s*\/\s*n)\s*[:#\-]?\s*([A-Z0-9./_-]{3,})/i]),
    reference: pick([/(?:refer[eê]ncia|reference|ref\.?)\s*[:#\-]?\s*([A-Z0-9./_-]{2,})/i])
  };
}

export type OcrResult = { status: 'PROCESSADO' | 'MOTOR_INDISPONIVEL' | 'SEM_TEXTO'; rawText: string; confidence: number | null; fields: ReturnType<typeof parseOcrFields>; message: string };

export async function runLocalOcr(relativePath: string): Promise<OcrResult> {
  const absolute = resolve(mediaRoot, relativePath);
  if (!absolute.startsWith(`${mediaRoot}${sep}`)) throw new Error('Caminho de imagem inválido.');
  const executable = process.env.TESSERACT_CMD || 'tesseract';
  const language = process.env.TESSERACT_LANG || 'por+eng';
  const temporaryDirectory = await mkdtemp(join(mediaRoot, '.ocr-'));
  const processedPath = join(temporaryDirectory, 'preprocessada.png');
  try {
    // Pré-processamento inteiramente local: orientação EXIF, escala, tons de cinza,
    // normalização de contraste e nitidez para facilitar a leitura das plaquetas.
    await sharp(absolute, { failOn: 'error' })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: false })
      .greyscale()
      .normalize()
      .sharpen({ sigma: 1.1 })
      .png()
      .toFile(processedPath);

    const { stdout } = await execFileAsync(executable, [processedPath, 'stdout', '-l', language, '--psm', '6', 'tsv'], { encoding: 'utf8', timeout: 45_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    const rows = stdout.split(/\r?\n/).slice(1);
    const words: string[] = [];
    const confidences: number[] = [];
    for (const row of rows) {
      const columns = row.split('\t');
      const confidence = Number(columns[10]);
      const word = columns.slice(11).join('\t').trim();
      if (word) words.push(word);
      if (Number.isFinite(confidence) && confidence >= 0 && word) confidences.push(confidence);
    }
    const rawText = words.join(' ').replace(/\s+/g, ' ').trim();
    const confidence = confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length / 100 : null;
    return { status: rawText ? 'PROCESSADO' : 'SEM_TEXTO', rawText, confidence, fields: parseOcrFields(rawText), message: rawText ? 'Leitura local concluída após pré-processamento da imagem. Confira e confirme cada campo antes de atualizar o cadastro.' : 'Não foi identificado texto legível. Tente uma foto mais nítida, aproxime a câmera ou preencha os campos manualmente.' };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message = error instanceof Error ? error.message : 'Falha desconhecida no OCR.';
    if (code === 'ENOENT' || /tesseract.*not found|não foi possível encontrar/i.test(message)) {
      return { status: 'MOTOR_INDISPONIVEL', rawText: '', confidence: null, fields: parseOcrFields(''), message: 'Tesseract não está instalado ou não foi encontrado. Instale o mecanismo OCR local e reinicie a API.' };
    }
    if (/Failed loading language|Error opening data file|Could not initialize tesseract/i.test(message)) {
      return { status: 'MOTOR_INDISPONIVEL', rawText: '', confidence: null, fields: parseOcrFields(''), message: `Pacote de idioma ${language} indisponível. Instale os dados de idioma português e inglês do Tesseract.` };
    }
    throw new Error(`Falha ao executar OCR local: ${message}`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function similarityLabel(similarity: number): 'ALTA_SIMILARIDADE' | 'POSSIVEL_CORRESPONDENCIA' | 'BAIXA_SIMILARIDADE' | 'SEM_CORRESPONDENCIA' {
  if (similarity >= 0.85) return 'ALTA_SIMILARIDADE';
  if (similarity >= 0.70) return 'POSSIVEL_CORRESPONDENCIA';
  if (similarity >= 0.55) return 'BAIXA_SIMILARIDADE';
  return 'SEM_CORRESPONDENCIA';
}
