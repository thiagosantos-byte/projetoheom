/** OCR de plaquetas no navegador. As imagens nunca são enviadas a uma API de OCR. */
export type PlateOcrFields = {
  manufacturer: string;
  model: string;
  serialNumber: string;
  reference: string;
  officialPropertyNumber: string;
};

export type PlateOcrResult = {
  status: 'PROCESSADO' | 'SEM_TEXTO' | 'SEM_CAMPOS' | 'ERRO_MOTOR' | 'ERRO_IDIOMA' | 'ERRO_IMAGEM' | 'ERRO_PROCESSAMENTO';
  rawText: string;
  confidence: number | null;
  fields: PlateOcrFields;
  message: string;
};

export type PlateOcrProgress = (step: 'VALIDANDO_IMAGEM' | 'CARREGANDO_MOTOR' | 'CARREGANDO_IDIOMAS' | 'PRE_PROCESSANDO' | 'RECONHECENDO', progress: number | null, message: string) => void;

type TesseractResult = { data: { text?: string; confidence?: number } };
type TesseractWorker = {
  recognize: (image: HTMLCanvasElement) => Promise<TesseractResult>;
  setParameters?: (parameters: Record<string, string>) => Promise<void>;
  terminate: () => Promise<void>;
};
type TesseractApi = { createWorker: (languages: string, oem?: number, options?: Record<string, unknown>) => Promise<TesseractWorker> };
declare global { interface Window { Tesseract?: TesseractApi } }

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let tesseractPromise: Promise<TesseractApi> | null = null;
let workerPromise: Promise<TesseractWorker> | null = null;
let workerQueue: Promise<void> = Promise.resolve();

const EMPTY_FIELDS: PlateOcrFields = {
  manufacturer: '', model: '', serialNumber: '', reference: '', officialPropertyNumber: ''
};

const KNOWN_MANUFACTURERS = [
  'GE Healthcare', 'General Electric', 'Mindray', 'Philips', 'Dräger', 'Draeger',
  'Siemens Healthineers', 'Siemens', 'B. Braun', 'Fresenius', 'Nihon Kohden',
  'Medtronic', 'Zoll', 'Instramed', 'CMOS Drake', 'Schiller', 'Edan', 'Welch Allyn',
  'Baxter', 'Hamilton Medical', 'Maquet', 'Getinge', 'Olympus', 'Stryker',
  'Canon Medical', 'Abbott', 'Roche', 'BioSystems', 'Fanem', 'Mindray'
];

function normalizeLine(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[|]/g, 'I').replace(/[：]/g, ':').replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
}

function isAnotherLabel(value: string): boolean {
  const line = normalizeLine(value);
  return /^(FABRICANTE|MANUFACTURER|MARCA|BRAND|MODELO|MODEL(?:\s+NO\.?)?|SERIAL(?:\s+NUMBER|\s+NO\.?)?|S\/N|SN|S\.N\.?|N[ºO.]? DE SERIE|N[ºO.]? SERIE|REFERENCIA|REFERENCE|REF\.?|PATRIMONIO|TOMBAMENTO|ASSET NO\.?|ASSET NUMBER|PROPERTY NUMBER)(?=\s|[:#=]|$)/.test(line);
}

function originalSuffix(line: string, normalizedValue: string): string {
  const target = normalizedValue.trim();
  if (!target) return '';
  for (let start = 0; start <= line.length; start += 1) {
    const candidate = line.slice(start);
    if (normalizeLine(candidate) === target) return candidate.trim();
  }
  return normalizedValue;
}

function labelValue(lines: string[], patterns: RegExp[]): string {
  for (let index = 0; index < lines.length; index += 1) {
    const original = lines[index];
    const normalized = normalizeLine(original);
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match) continue;
      let value = originalSuffix(original, match[1] || '').replace(/^[:#=\-\s]+/, '').trim();
      if (!value) {
        for (let next = index + 1; next < Math.min(lines.length, index + 3); next += 1) {
          if (!normalizeLine(lines[next])) continue;
          if (isAnotherLabel(lines[next])) break;
          value = lines[next].trim();
          break;
        }
      }
      if (value) return value.replace(/^[:#=\-\s]+|[\s;|]+$/g, '').slice(0, 140);
    }
  }
  return '';
}

function compactSerial(value: string): string {
  return value.replace(/^[:#=\-\s]+/, '').split(/\s+/)[0]?.replace(/[^A-Z0-9./_-]/gi, '') || '';
}

/** Parser puro, exportado para testes sem depender do mecanismo OCR ou do DOM. */
export function parsePlateFields(rawText: string): PlateOcrFields {
  if (!rawText.trim()) return { ...EMPTY_FIELDS };
  const lines = rawText.replace(/\r/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);

  const manufacturer = labelValue(lines, [
    /^(?:FABRICANTE|MANUFACTURER|MARCA|BRAND)\s*(?:[:#=\-]\s*)?(.*)$/
  ]);
  const model = labelValue(lines, [
    /^(?:MODELO|MODEL(?:\s+(?:NO\.?|NUMBER))?)\s*(?:[:#=\-]\s*)?(.*)$/
  ]);
  const serial = labelValue(lines, [
    /^(?:NUMERO\s+DE\s+SERIE|N[ºO.]?\s*DE\s*SERIE|N[ºO.]?\s*SERIE|SERIAL(?:\s+(?:NUMBER|NO\.?))?|S\s*\/\s*N|S\.N\.?|SN)\s*(?:[:#=\-]\s*)?(.*)$/
  ]);
  const reference = labelValue(lines, [
    /^(?:REFERENCIA|REFERENCE|REF\.?)\s*(?:[:#=\-]\s*)?(.*)$/
  ]);
  const officialPropertyNumber = labelValue(lines, [
    /^(?:PATRIMONIO(?:\s+OFICIAL)?|TOMBAMENTO|ETIQUETA\s+PATRIMONIAL|PLAQUETA\s+PATRIMONIAL|ASSET\s*(?:NO\.?|NUMBER)?|PROPERTY\s+NUMBER)\s*(?:[:#=\-]\s*)?(.*)$/
  ]);

  let recognizedManufacturer = manufacturer;
  if (!recognizedManufacturer) {
    const normalizedText = normalizeLine(rawText);
    recognizedManufacturer = KNOWN_MANUFACTURERS.find((brand) => normalizedText.includes(normalizeLine(brand))) || '';
  }

  return {
    manufacturer: recognizedManufacturer.slice(0, 140),
    model: model.slice(0, 140),
    serialNumber: compactSerial(serial).slice(0, 140),
    reference: reference.slice(0, 140),
    officialPropertyNumber: compactSerial(officialPropertyNumber).slice(0, 100)
  };
}

function loadTesseract(onProgress?: PlateOcrProgress): Promise<TesseractApi> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractPromise) {
    tesseractPromise = new Promise<TesseractApi>((resolve, reject) => {
      onProgress?.('CARREGANDO_MOTOR', null, 'Carregando a biblioteca Tesseract.js no navegador…');
      const existing = document.querySelector<HTMLScriptElement>('script[data-heom-tesseract]');
      const script = existing || document.createElement('script');
      const cleanup = () => { script.removeEventListener('load', loaded); script.removeEventListener('error', failed); };
      const loaded = () => {
        cleanup();
        if (window.Tesseract) resolve(window.Tesseract);
        else { script.remove(); reject(new Error('A biblioteca Tesseract.js carregou, mas não disponibilizou o mecanismo esperado.')); }
      };
      const failed = () => { cleanup(); script.remove(); reject(new Error('Não foi possível carregar Tesseract.js. Verifique a conexão e a política de rede do navegador.')); };
      script.addEventListener('load', loaded, { once: true });
      script.addEventListener('error', failed, { once: true });
      if (!existing) {
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
        script.async = true;
        script.dataset.heomTesseract = 'true';
        document.head.appendChild(script);
      } else if (window.Tesseract) loaded();
    }).catch((error) => { tesseractPromise = null; throw error; });
  }
  return tesseractPromise;
}

async function loadWorker(onProgress?: PlateOcrProgress): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract = await loadTesseract(onProgress);
      onProgress?.('CARREGANDO_IDIOMAS', null, 'Carregando os idiomas português e inglês…');
      return Tesseract.createWorker('por+eng', 1, {
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        logger: (event: { status?: string; progress?: number }) => {
          if (event.status?.includes('traineddata') || event.status?.includes('language')) {
            onProgress?.('CARREGANDO_IDIOMAS', typeof event.progress === 'number' ? event.progress : null, `Carregando idiomas… ${typeof event.progress === 'number' ? Math.round(event.progress * 100) : ''}%`);
          } else if (event.status?.toLowerCase().includes('recognizing')) {
            onProgress?.('RECONHECENDO', typeof event.progress === 'number' ? event.progress : null, `Reconhecimento OCR em andamento… ${typeof event.progress === 'number' ? Math.round(event.progress * 100) : ''}%`);
          } else if (event.status) {
            onProgress?.('CARREGANDO_MOTOR', typeof event.progress === 'number' ? event.progress : null, 'Inicializando o mecanismo OCR…');
          }
        }
      });
    })().catch((error) => { workerPromise = null; throw error; });
  }
  return workerPromise;
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { return await createImageBitmap(file); }
  }
  throw new Error('Este navegador não oferece decodificação local compatível com a imagem selecionada.');
}

function preprocess(bitmap: ImageBitmap, rotation: number, threshold = false): HTMLCanvasElement {
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  // Calcula a caixa delimitadora também para pequenas inclinações; trocar
  // largura/altura só em 90°/270° cortava quase toda a imagem em ±2°/±4°.
  const rotatedWidth = Math.ceil(bitmap.width * cosine + bitmap.height * sine);
  const rotatedHeight = Math.ceil(bitmap.height * cosine + bitmap.width * sine);
  const scale = Math.min(1.5, 2400 / Math.max(rotatedWidth, rotatedHeight));
  const width = Math.max(1, Math.round(rotatedWidth * scale));
  const height = Math.max(1, Math.round(rotatedHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: threshold });
  if (!context) throw new Error('Não foi possível inicializar o processamento de imagem no navegador.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.translate(width / 2, height / 2);
  context.rotate(radians);
  context.filter = 'grayscale(1) contrast(1.35) brightness(1.04)';
  context.drawImage(bitmap, -bitmap.width * scale / 2, -bitmap.height * scale / 2, bitmap.width * scale, bitmap.height * scale);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.filter = 'none';
  // Nitidez moderada (kernel 5-centro / -1-vizinhos) para recuperar contornos
  // sem alterar a imagem original armazenada no cadastro.
  const sharpened = context.getImageData(0, 0, width, height);
  const source = new Uint8ClampedArray(sharpened.data);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[index + channel]! * 5;
        const neighbors = source[index - 4 + channel]! + source[index + 4 + channel]!
          + source[index - width * 4 + channel]! + source[index + width * 4 + channel]!;
        sharpened.data[index + channel] = Math.max(0, Math.min(255, center - neighbors));
      }
    }
  }
  context.putImageData(sharpened, 0, 0);
  if (threshold) {
    const image = context.getImageData(0, 0, width, height);
    const histogram = new Uint32Array(256);
    for (let i = 0; i < image.data.length; i += 4) {
      const luminance = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114);
      histogram[luminance] += 1;
    }
    const total = width * height;
    let sum = 0; for (let i = 0; i < 256; i += 1) sum += i * histogram[i];
    let sumBackground = 0; let weightBackground = 0; let maxVariance = -1; let cutoff = 150;
    for (let i = 0; i < 256; i += 1) {
      weightBackground += histogram[i];
      if (!weightBackground) continue;
      const weightForeground = total - weightBackground;
      if (!weightForeground) break;
      sumBackground += i * histogram[i];
      const meanBackground = sumBackground / weightBackground;
      const meanForeground = (sum - sumBackground) / weightForeground;
      const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
      if (variance > maxVariance) { maxVariance = variance; cutoff = i; }
    }
    for (let i = 0; i < image.data.length; i += 4) {
      const luminance = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114;
      const value = luminance > cutoff ? 255 : 0;
      image.data[i] = value; image.data[i + 1] = value; image.data[i + 2] = value;
    }
    context.putImageData(image, 0, 0);
  }
  return canvas;
}

function bestResult(current: { text: string; confidence: number | null }, next: TesseractResult['data']) {
  const text = (next.text || '').trim();
  const score = parsePlateFields(text);
  const count = Object.values(score).filter(Boolean).length;
  const currentCount = Object.values(parsePlateFields(current.text)).filter(Boolean).length;
  if (count > currentCount || (count === currentCount && text.length > current.text.length)) {
    return { text, confidence: typeof next.confidence === 'number' ? next.confidence : null };
  }
  return current;
}

export async function recognizePlateImage(file: File, onProgress?: PlateOcrProgress): Promise<PlateOcrResult> {
  let rawText = '';
  if (!(file instanceof Blob) || !ALLOWED_TYPES.has(file.type)) {
    return { status: 'ERRO_IMAGEM', rawText, confidence: null, fields: { ...EMPTY_FIELDS }, message: 'Arquivo inválido. Selecione uma imagem JPEG, PNG ou WEBP.' };
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return { status: 'ERRO_IMAGEM', rawText, confidence: null, fields: { ...EMPTY_FIELDS }, message: file.size <= 0 ? 'A imagem selecionada está vazia.' : 'A imagem excede o limite de 12 MB. Reduza o tamanho e tente novamente.' };
  }
  onProgress?.('VALIDANDO_IMAGEM', 1, 'Imagem validada.');

  const execute = async (): Promise<PlateOcrResult> => {
    let bitmap: ImageBitmap | null = null;
    let worker: TesseractWorker | null = null;
    try {
      onProgress?.('PRE_PROCESSANDO', null, 'Corrigindo orientação, escala, tons de cinza e contraste…');
      bitmap = await decodeImage(file);
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) {
        return { status: 'ERRO_IMAGEM', rawText, confidence: null, fields: { ...EMPTY_FIELDS }, message: 'A imagem possui dimensões inválidas ou excede o limite seguro de processamento (40 megapixels).' };
      }
      worker = await loadWorker(onProgress);
      const variants = [
        preprocess(bitmap, 0, false),
        preprocess(bitmap, 0, true)
      ];
      let best = { text: '', confidence: null as number | null };
      for (let index = 0; index < variants.length; index += 1) {
        await worker.setParameters?.({ tessedit_pageseg_mode: index === 0 ? '6' : '11' });
        onProgress?.('RECONHECENDO', null, index === 0 ? 'Reconhecendo texto da plaqueta…' : 'Tentando segmentação alternativa de texto…');
        const result = await worker.recognize(variants[index]);
        best = bestResult(best, result.data);
        rawText = best.text;
        const fields = parsePlateFields(rawText);
        if (Object.values(fields).some(Boolean)) break;
      }
      if (!Object.values(parsePlateFields(rawText)).some(Boolean)) {
        for (const angle of [90, 270, 180, -2, 2, -4, 4]) {
          const rotatedCanvas = preprocess(bitmap, angle, false);
          await worker.setParameters?.({ tessedit_pageseg_mode: '6' });
          onProgress?.('RECONHECENDO', null, `${Math.abs(angle) < 90 ? 'Corrigindo inclinação' : 'Verificando orientação'} ${angle}°…`);
          const result = await worker.recognize(rotatedCanvas);
          best = bestResult(best, result.data);
          rawText = best.text;
          if (Object.values(parsePlateFields(rawText)).some(Boolean)) break;
        }
      }
      const fields = parsePlateFields(rawText);
      const found = Object.values(fields).filter(Boolean).length;
      if (!rawText.trim()) return { status: 'SEM_TEXTO', rawText: '', confidence: best.confidence, fields, message: 'O mecanismo executou, mas não identificou texto legível. Tente aproximar a câmera, melhorar a iluminação ou fotografar a plaqueta de frente.' };
      if (!found) return { status: 'SEM_CAMPOS', rawText, confidence: best.confidence, fields, message: 'O texto foi reconhecido, mas nenhum campo conhecido pôde ser extraído. Consulte o texto bruto e preencha os campos manualmente; nenhum dado foi inventado.' };
      return { status: 'PROCESSADO', rawText, confidence: best.confidence, fields, message: `${found} campo(s) extraído(s). Revise e corrija todos os valores antes de confirmar o cadastro.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida durante o OCR.';
      const status = /traineddata|language|Error opening data file|Failed loading language/i.test(message) ? 'ERRO_IDIOMA' : /tesseract|worker|wasm|script|carregar/i.test(message) ? 'ERRO_MOTOR' : 'ERRO_PROCESSAMENTO';
      return { status, rawText, confidence: null, fields: parsePlateFields(rawText), message: status === 'ERRO_IDIOMA' ? `Não foi possível carregar os idiomas português/inglês: ${message}` : status === 'ERRO_MOTOR' ? `O mecanismo OCR não pôde ser carregado: ${message}` : `Falha no processamento da imagem: ${message}` };
    } finally {
      bitmap?.close();
    }
  };

  const operation = workerQueue.then(execute, execute);
  workerQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
