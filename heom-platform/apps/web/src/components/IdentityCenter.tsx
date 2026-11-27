import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, apiBlob, formatDate } from '../lib/api';
import { recognizePlateImage, type PlateOcrResult } from '../lib/plate-ocr';
import { normalizeHeomQrPayload } from '../lib/qr-code';
import type { Asset } from '../types';
import { Camera, Check, FileImage, ImagePlus, LoaderCircle, QrCode, Search, ShieldCheck, Trash2, Upload, WandSparkles, Download, Printer, XCircle } from 'lucide-react';

type Photo = { id: string; assetId: string; originalName: string; mimeType: string; sizeBytes: number; imageRole: string; createdAt: string; fileUrl: string };
type OcrRecord = PlateOcrResult & { id: string };
type Match = { photoId: string; assetId: string; assetNumber: string; name: string; manufacturer?: string | null; model?: string | null; similarity: number; confidence: string; fileUrl: string };
type ScannerControls = { stop: () => void | Promise<void> };
type ZXingApi = {
  BrowserQRCodeReader: new () => {
    decodeFromVideoDevice: (deviceId: string | undefined, video: HTMLVideoElement, callback: (result?: { getText: () => string }, error?: unknown, controls?: ScannerControls) => void) => Promise<ScannerControls>;
  };
  BrowserCodeReader: { listVideoInputDevices: () => Promise<Array<{ deviceId: string; label: string }>> };
};
declare global { interface Window { ZXingBrowser?: ZXingApi } }

let zxingPromise: Promise<ZXingApi> | null = null;
function loadZXing(): Promise<ZXingApi> {
  if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
  if (!zxingPromise) {
    zxingPromise = new Promise<ZXingApi>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-heom-zxing]');
      const script = existing || document.createElement('script');
      const cleanup = () => { script.removeEventListener('load', loaded); script.removeEventListener('error', failed); };
      const loaded = () => { cleanup(); if (window.ZXingBrowser) resolve(window.ZXingBrowser); else { script.remove(); reject(new Error('A biblioteca ZXing carregou, mas não disponibilizou o leitor.')); } };
      const failed = () => { cleanup(); script.remove(); reject(new Error('Não foi possível carregar a biblioteca de leitura QR ZXing. Verifique a conexão e a política de rede.')); };
      script.addEventListener('load', loaded, { once: true });
      script.addEventListener('error', failed, { once: true });
      if (!existing) {
        script.src = 'https://unpkg.com/@zxing/browser@0.2.1';
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.dataset.heomZxing = 'true';
        document.head.appendChild(script);
      } else if (window.ZXingBrowser) loaded();
    }).catch((error) => { zxingPromise = null; throw error; });
  }
  return zxingPromise;
}

function cameraErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name || '') : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Permissão da câmera recusada. Autorize o acesso à câmera nas configurações do navegador e tente novamente.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Nenhuma câmera foi encontrada neste dispositivo.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'A câmera está ocupada por outro aplicativo ou não pôde ser inicializada. Feche outros aplicativos que estejam usando a câmera.';
  if (name === 'OverconstrainedError') return 'A câmera não oferece o modo solicitado. Selecione outra câmera e tente novamente.';
  if (name === 'SecurityError') return 'O navegador bloqueou a câmera por segurança. Abra o HEOM por HTTPS ou em localhost.';
  return error instanceof Error ? `Falha ao iniciar o leitor QR: ${error.message}` : 'Não foi possível iniciar a câmera. Verifique permissões, dispositivo e conexão segura.';
}

type Props = { assets: Asset[]; canManage: boolean; canArchive: boolean; onToast: (message: string, type?: 'success' | 'error' | 'info') => void; onRefresh: () => void };

export default function IdentityCenter({ assets, canManage, canArchive, onToast, onRefresh }: Props) {
  const [assetId, setAssetId] = useState(assets[0]?.id || '');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [role, setRole] = useState('EQUIPAMENTO');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [searchFile, setSearchFile] = useState<File | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [disclaimer, setDisclaimer] = useState('');
  const [busy, setBusy] = useState(false);
  const [ocr, setOcr] = useState<OcrRecord | null>(null);
  const [ocrMessage, setOcrMessage] = useState('');
  const [ocrProgress, setOcrProgress] = useState('');
  const [ocrValues, setOcrValues] = useState({ manufacturer: '', model: '', serialNumber: '', reference: '', officialPropertyNumber: '' });
  const [qrUrl, setQrUrl] = useState('');
  const [qrPngUrl, setQrPngUrl] = useState('');
  const [cameraMessage, setCameraMessage] = useState('');
  const [videoDevices, setVideoDevices] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState('');
  const [qrInput, setQrInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const cameraStartingRef = useRef(false);

  useEffect(() => { if (!assetId && assets[0]) setAssetId(assets[0].id); }, [assets, assetId]);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      const attached = video.srcObject;
      if (attached instanceof MediaStream) attached.getTracks().forEach((track) => track.stop());
      video.pause(); video.srcObject = null;
    }
    cameraStartingRef.current = false;
    setCameraActive(false);
  }, []);

  const loadPhotos = useCallback(async () => {
    if (!assetId) { setPhotos([]); return; }
    try {
      const result = await api<{ data: Photo[] }>(`/assets/${assetId}/photos`);
      setPhotos(result.data);
      const urls: Record<string, string> = {};
      let unavailable = 0;
      await Promise.all(result.data.map(async (photo) => {
        try { urls[photo.id] = URL.createObjectURL(await apiBlob(`/assets/${assetId}/photos/${photo.id}/file`)); }
        catch { unavailable += 1; }
      }));
      setPhotoUrls((current) => { Object.values(current).forEach((url) => URL.revokeObjectURL(url)); return urls; });
      if (unavailable) onToast(`${unavailable} fotografia(s) aparecem nos metadados, mas o arquivo não pôde ser recuperado deste navegador.`, 'error');
    } catch (error) { onToast(error instanceof Error ? error.message : 'Falha ao consultar fotografias.', 'error'); }
  }, [assetId, onToast]);

  useEffect(() => { void loadPhotos(); setOcr(null); setQrUrl(''); setQrPngUrl(''); }, [loadPhotos]);
  useEffect(() => () => { Object.values(photoUrls).forEach((url) => URL.revokeObjectURL(url)); }, [photoUrls]);
  useEffect(() => () => { if (qrUrl) URL.revokeObjectURL(qrUrl); if (qrPngUrl) URL.revokeObjectURL(qrPngUrl); }, [qrUrl, qrPngUrl]);
  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  async function uploadPhoto(event: FormEvent) {
    event.preventDefault(); if (!assetId || !uploadFiles.length) return;
    setBusy(true); let uploaded = 0;
    try {
      for (const file of uploadFiles) {
        const body = new FormData(); body.append('photo', file); body.append('imageRole', role);
        await api(`/assets/${assetId}/photos`, { method: 'POST', body }); uploaded += 1;
      }
      setUploadFiles([]);
      const input = document.getElementById('asset-photo-input') as HTMLInputElement | null; if (input) input.value = '';
      onToast(`${uploaded} fotografia(s) armazenada(s) no navegador atual.`); await loadPhotos(); onRefresh();
    } catch (error) {
      onToast(`${uploaded} de ${uploadFiles.length} fotografia(s) foram armazenadas. ${error instanceof Error ? error.message : 'Falha no armazenamento local. Tente novamente.'}`, 'error');
      await loadPhotos();
    } finally { setBusy(false); }
  }

  async function searchByImage(event: FormEvent) {
    event.preventDefault(); if (!searchFile) return;
    setBusy(true); setMatches([]);
    try {
      const body = new FormData(); body.append('photo', searchFile);
      const result = await api<{ data: Match[]; disclaimer: string }>('/assets/search-by-image', { method: 'POST', body });
      setMatches(result.data); setDisclaimer(result.disclaimer);
      if (!result.data.length) onToast('Nenhuma fotografia cadastrada para comparação nesta base local.', 'info');
    } catch (error) { onToast(error instanceof Error ? error.message : 'Falha na busca visual.', 'error'); }
    finally { setBusy(false); }
  }

  async function runOcr(photo: Photo) {
    setBusy(true); setOcr(null); setOcrMessage('Recuperando fotografia…'); setOcrProgress('');
    try {
      const blob = await apiBlob(`/assets/${assetId}/photos/${photo.id}/file`);
      const file = new File([blob], photo.originalName || 'plaqueta', { type: photo.mimeType || blob.type });
      const result = await recognizePlateImage(file, (_step, progress, message) => {
        setOcrProgress(progress === null ? message : `${message} ${Math.round(progress * 100)}%`);
      });
      setOcr({ ...result, id: `browser-${Date.now()}` });
      setOcrMessage(result.message);
      setOcrValues({
        manufacturer: result.fields.manufacturer,
        model: result.fields.model,
        serialNumber: result.fields.serialNumber,
        reference: result.fields.reference,
        officialPropertyNumber: result.fields.officialPropertyNumber
      });
    } catch (error) {
      setOcrMessage(error instanceof Error ? `Não foi possível executar OCR sobre esta fotografia: ${error.message}` : 'Falha ao carregar a fotografia ou iniciar o OCR.');
      onToast(error instanceof Error ? error.message : 'Falha no OCR local.', 'error');
    } finally { setBusy(false); }
  }

  async function confirmOcr(event: FormEvent) {
    event.preventDefault(); if (!ocr || !assetId) return;
    const selected = assets.find((item) => item.id === assetId);
    if (!selected) { onToast('O equipamento não está mais disponível na base local.', 'error'); return; }
    setBusy(true);
    try {
      const body = {
        assetNumber: selected.assetNumber,
        officialPropertyNumber: ocrValues.officialPropertyNumber || selected.officialPropertyNumber || null,
        reference: ocrValues.reference || selected.reference || null,
        name: selected.name,
        category: selected.category,
        description: selected.description || null,
        manufacturer: ocrValues.manufacturer || selected.manufacturer || null,
        model: ocrValues.model || selected.model || null,
        serialNumber: ocrValues.serialNumber || selected.serialNumber || null,
        departmentId: selected.departmentId || '',
        roomId: selected.roomId || null,
        operationalStatus: selected.operationalStatus,
        criticality: selected.criticality,
        trackingTagId: selected.trackingTagId || null
      };
      await api(`/assets/${assetId}`, { method: 'PUT', body: JSON.stringify(body) });
      onToast('Campos revisados e atualizados no cadastro.'); setOcr(null); setOcrMessage(''); onRefresh();
    } catch (error) { onToast(error instanceof Error ? error.message : 'Não foi possível confirmar os dados extraídos.', 'error'); }
    finally { setBusy(false); }
  }

  async function deletePhoto(photo: Photo) {
    if (!window.confirm(`Remover a fotografia “${photo.originalName}”?`)) return;
    try { await api(`/assets/${assetId}/photos/${photo.id}`, { method: 'DELETE' }); onToast('Fotografia removida deste navegador.'); await loadPhotos(); }
    catch (error) { onToast(error instanceof Error ? error.message : 'Não foi possível remover a fotografia.', 'error'); }
  }

  async function loadQr() {
    if (!assetId) return;
    try {
      const [svg, png] = await Promise.all([apiBlob(`/assets/${assetId}/qr.svg`), apiBlob(`/assets/${assetId}/qr.png`)]);
      const nextSvg = URL.createObjectURL(svg); const nextPng = URL.createObjectURL(png);
      setQrUrl((old) => { if (old) URL.revokeObjectURL(old); return nextSvg; });
      setQrPngUrl((old) => { if (old) URL.revokeObjectURL(old); return nextPng; });
    } catch (error) { onToast(error instanceof Error ? error.message : 'Não foi possível gerar o QR Code SVG e PNG.', 'error'); }
  }

  function downloadQr(format: 'svg' | 'png') {
    const url = format === 'svg' ? qrUrl : qrPngUrl;
    if (!url || !selectedAsset) return;
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `HEOM-${selectedAsset.assetNumber.replace(/[^a-z0-9_-]/gi, '-')}.${format}`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
  }

  function printLabel() {
    if (!qrPngUrl || !selectedAsset) return;
    const popup = window.open('', '_blank', 'width=460,height=340');
    if (!popup) { setCameraMessage('A impressão da etiqueta foi bloqueada pelo navegador. Permita pop-ups para o HEOM e tente novamente.'); return; }
    const escapeHtml = (value: string) => { const replacements: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }; return value.replace(/[&<>"']/g, (char) => replacements[char] || char); };
    const propertyNumber = selectedAsset.officialPropertyNumber || selectedAsset.assetNumber;
    const internalNumber = selectedAsset.officialPropertyNumber ? `Identificação HEOM · ${selectedAsset.assetNumber}` : 'Identificação HEOM';
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta HEOM ${escapeHtml(propertyNumber)}</title><style>
      @page{size:70mm 45mm;margin:0}*{box-sizing:border-box}body{margin:0;font:10pt Arial,sans-serif;color:#102a43}.label{width:70mm;height:45mm;padding:3mm;display:grid;grid-template-columns:35mm 1fr;gap:2mm;align-items:center}.qr{width:34mm;height:34mm;object-fit:contain}.data{min-width:0}.brand{font-size:7pt;letter-spacing:.08em;font-weight:700;color:#526b81}.number{font-size:13pt;font-weight:800;overflow-wrap:anywhere;margin:3mm 0 1.5mm}.name{font-size:8pt;line-height:1.25;overflow-wrap:anywhere}.internal{font-size:6.5pt;color:#526b81;margin-top:2mm;overflow-wrap:anywhere}@media screen{body{background:#edf2f6}.label{margin:10mm auto;background:#fff;box-shadow:0 3px 16px #0002}}</style></head><body><main class="label"><img class="qr" src="${qrPngUrl}" alt="QR Code HEOM"><section class="data"><div class="brand">HEOM · IDENTIFICAÇÃO PATRIMONIAL</div><div class="number">${escapeHtml(propertyNumber)}</div><div class="name">${escapeHtml(selectedAsset.name)}</div><div class="internal">${escapeHtml(internalNumber)}</div></section></main><script>window.onload=()=>setTimeout(()=>window.print(),250);</script></body></html>`);
    popup.document.close();
  }

  function resolveQrPayload(payload: string) {
    const parsed = normalizeHeomQrPayload(payload);
    if (!parsed.valid) { setCameraMessage(parsed.message); return false; }
    const found = assets.find((item) => item.id.toLocaleUpperCase('en-US') === parsed.id.toLocaleUpperCase('en-US'));
    if (!found) { setCameraMessage('QR Code HEOM válido, mas o identificador não existe na base local deste navegador. Os dados de outro computador não são compartilhados.'); return false; }
    setAssetId(found.id); setCameraMessage(`Equipamento localizado nesta base: ${found.name} · ${found.assetNumber}.`);
    setQrInput(''); onToast(`QR Code identificado: ${found.assetNumber}.`); return true;
  }

  function resolveQrInput(event: FormEvent) {
    event.preventDefault();
    if (resolveQrPayload(qrInput)) setQrInput('');
  }

  async function startCamera() {
    if (cameraStartingRef.current || cameraActive) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage('Este navegador não disponibiliza acesso à câmera. Use um leitor USB ou a entrada manual do identificador.'); return;
    }
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      setCameraMessage('A câmera exige uma origem segura. Abra o HEOM usando HTTPS ou localhost.'); return;
    }
    cameraStartingRef.current = true; setCameraMessage('Solicitando permissão e procurando câmeras disponíveis…');
    let permissionStream: MediaStream | null = null;
    try {
      const zxing = await loadZXing();
      permissionStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      const permissionDeviceId = permissionStream.getVideoTracks()[0]?.getSettings().deviceId;
      const devices = await zxing.BrowserCodeReader.listVideoInputDevices();
      setVideoDevices(devices);
      const selected = devices.find((device) => device.deviceId === cameraDeviceId)
        || devices.find((device) => /back|rear|environment|traseira|posterior/i.test(device.label))
        || devices.find((device) => device.deviceId === permissionDeviceId)
        || devices[0];
      if (selected) setCameraDeviceId(selected.deviceId);
      permissionStream.getTracks().forEach((track) => track.stop()); permissionStream = null;
      if (!selected?.deviceId) throw new DOMException('Nenhuma câmera disponível.', 'NotFoundError');
      const video = videoRef.current;
      if (!video) throw new Error('A área de visualização da câmera ainda não está pronta.');
      const reader = new zxing.BrowserQRCodeReader();
      setCameraActive(true); setCameraMessage('Câmera iniciada. Aponte para uma etiqueta HEOM.');
      const controls = await reader.decodeFromVideoDevice(selected.deviceId, video, (result, error, scanControls) => {
        if (result) {
          const payload = result.getText();
          const found = resolveQrPayload(payload);
          if (found) { void scanControls?.stop(); stopCamera(); }
        } else if (error instanceof Error && !['NotFoundException', 'ChecksumException', 'FormatException'].includes(error.name)) {
          setCameraMessage(`Falha durante a leitura QR: ${error.message}`);
        }
      });
      if (cameraStartingRef.current) controlsRef.current = controls; else void controls.stop();
      cameraStartingRef.current = false;
    } catch (error) {
      permissionStream?.getTracks().forEach((track) => track.stop());
      setCameraMessage(cameraErrorMessage(error)); stopCamera();
    }
  }

  const selectedAsset = assets.find((item) => item.id === assetId);
  return <div className="identity-page">
    <div className="section-heading"><div><div className="eyebrow">IDENTIFICAÇÃO DIGITAL DO PATRIMÔNIO</div><h1>Identificação por fotografia</h1><p>Registre imagens, leia plaquetas com OCR no navegador, compare fotografias e identifique ativos por QR Code.</p></div></div>
    <div className="identity-asset-select panel">
      <label>Equipamento selecionado
        <select value={assetId} onChange={(event) => setAssetId(event.target.value)}>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.assetNumber} · {asset.name}</option>)}
        </select>
      </label>
      {selectedAsset && <div className="identity-current"><strong>{selectedAsset.name}</strong><span>{selectedAsset.assetNumber} · {selectedAsset.manufacturer || 'Fabricante não informado'} · {selectedAsset.model || 'Modelo não informado'}</span></div>}
    </div>

    <div className="identity-grid">
      <section className="panel identity-panel">
        <div className="panel-heading"><div><span className="eyebrow">ACERVO FOTOGRÁFICO</span><h2>Fotografias do equipamento</h2><p>Inclua vistas gerais, plaqueta técnica e etiqueta patrimonial.</p></div><span className="identity-count">{photos.length} imagens</span></div>
        {canManage && <form className="photo-upload-form" onSubmit={uploadPhoto}>
          <div className="photo-source-options">
            <label className="photo-drop"><input id="asset-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setUploadFiles(Array.from(event.target.files || []))} /><ImagePlus size={22}/><strong>{uploadFiles.length ? `${uploadFiles.length} arquivo(s) selecionado(s)` : 'Selecionar fotos da galeria'}</strong><small>Escolha uma ou mais imagens que já estão no dispositivo</small></label>
            <label className="photo-camera-drop"><Camera size={18}/><span>Abrir câmera</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) setUploadFiles((current) => [...current, file]); }} /></label>
          </div>
          <div className="form-grid"><label>Tipo de fotografia<select value={role} onChange={(event) => setRole(event.target.value)}><option value="EQUIPAMENTO">Vista do equipamento</option><option value="PLAQUETA">Plaqueta de identificação</option><option value="ETIQUETA">Etiqueta patrimonial</option><option value="OUTRA">Outra</option></select></label><div className="photo-submit"><button className="button button-primary" disabled={!uploadFiles.length || busy}><Upload size={15}/> {busy ? 'Enviando…' : 'Armazenar fotografia'}</button></div></div>
        </form>}
        <div className="photo-gallery">{photos.length ? photos.map((photo) => <article className="photo-card" key={photo.id}>{photoUrls[photo.id] ? <img src={photoUrls[photo.id]} alt={`Fotografia ${photo.imageRole} do equipamento ${selectedAsset?.name || ''}`}/> : <div className="photo-unavailable"><FileImage/></div>}<div className="photo-card-info"><strong>{photo.imageRole === 'PLAQUETA' ? 'Plaqueta' : photo.imageRole === 'ETIQUETA' ? 'Etiqueta patrimonial' : photo.imageRole === 'OUTRA' ? 'Outra imagem' : 'Equipamento'}</strong><small>{photo.originalName}</small><small>{formatDate(photo.createdAt)}</small><div className="photo-actions"><button className="button button-outline button-small" onClick={() => void runOcr(photo)} disabled={busy}><WandSparkles size={13}/> Ler plaqueta</button>{canArchive && <button className="icon-button danger-icon" aria-label="Remover fotografia" onClick={() => void deletePhoto(photo)}><Trash2 size={15}/></button>}</div></div></article>) : <div className="empty-inline">Nenhuma fotografia cadastrada para este equipamento.</div>}</div>
        {(ocr || ocrMessage) && <div className="ocr-review"><div className="ocr-review-head"><div><span className="eyebrow">LEITURA DA PLAQUETA · REVISÃO HUMANA</span><h3>Revisão do reconhecimento</h3></div><span className={`ocr-status ${(ocr?.status || 'erro').toLowerCase()}`}>{ocr?.status || 'Falha de leitura'}</span></div>
          <p>{ocrMessage}</p>{ocrProgress && busy && <small>{ocrProgress}</small>}
          {ocr?.confidence !== null && ocr?.confidence !== undefined && <small>Confiança média reportada pelo mecanismo: {Math.round(ocr.confidence)}% — não representa garantia de precisão por campo.</small>}
          {ocr?.rawText ? <details open><summary>Texto bruto realmente reconhecido</summary><pre>{ocr.rawText}</pre></details> : ocr && <p className="form-hint">Nenhum texto bruto foi retornado pelo mecanismo. A leitura não será tratada como sucesso.</p>}
          {ocr && <><div className="ocr-extracted-fields"><strong>Campos extraídos</strong><p>Fabricante: {ocr.fields.manufacturer || 'Não identificado'} · Modelo: {ocr.fields.model || 'Não identificado'} · Série: {ocr.fields.serialNumber || 'Não identificada'} · Referência: {ocr.fields.reference || 'Não identificada'} · Patrimônio: {ocr.fields.officialPropertyNumber || 'Não identificado'}</p></div>
          {canManage && <form className="form-grid" onSubmit={confirmOcr}><label>Fabricante<input value={ocrValues.manufacturer} onChange={(e) => setOcrValues((v) => ({ ...v, manufacturer: e.target.value }))}/></label><label>Modelo<input value={ocrValues.model} onChange={(e) => setOcrValues((v) => ({ ...v, model: e.target.value }))}/></label><label>Número de série<input value={ocrValues.serialNumber} onChange={(e) => setOcrValues((v) => ({ ...v, serialNumber: e.target.value }))}/></label><label>Referência<input value={ocrValues.reference} onChange={(e) => setOcrValues((v) => ({ ...v, reference: e.target.value }))}/></label><label>Patrimônio oficial<input value={ocrValues.officialPropertyNumber} onChange={(e) => setOcrValues((v) => ({ ...v, officialPropertyNumber: e.target.value }))}/></label><div className="field-span-2"><button className="button button-primary" disabled={busy || !selectedAsset}><Check size={15}/> Confirmar campos revisados no cadastro</button></div></form>}</>}
          <button className="button button-outline button-small" type="button" onClick={() => { setOcr(null); setOcrMessage(''); setOcrProgress(''); }}><XCircle size={14}/> Fechar revisão</button>
        </div>}
      </section>

      <div className="identity-side">
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">PESQUISA VISUAL</span><h2>Buscar por imagem</h2><p>Compare a fotografia com imagens já registradas no inventário local.</p></div><Search size={19}/></div>
          <form onSubmit={searchByImage} className="visual-search-form"><div className="photo-source-options photo-source-compact"><label className="photo-drop compact-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setSearchFile(event.target.files?.[0] || null)}/><Search size={20}/><strong>{searchFile?.name || 'Escolher imagem da galeria'}</strong><small>Comparação dHash local: indica semelhança visual, não confirma a identidade do equipamento.</small></label><label className="photo-camera-drop"><Camera size={18}/><span>Usar câmera</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setSearchFile(event.target.files?.[0] || null)}/></label></div><button className="button button-primary button-full" disabled={!searchFile || busy}>{busy ? <LoaderCircle size={15} className="spin"/> : <Search size={15}/>} Comparar com o inventário</button></form>
          {matches.length > 0 && <div className="similarity-results"><h3>Resultados mais próximos</h3>{matches.map((match) => <div className="similarity-item" key={`${match.assetId}-${match.photoId}`}><div><strong>{match.name}</strong><small>{match.assetNumber} · {match.manufacturer || 'Fabricante não informado'} · {match.model || 'Modelo não informado'}</small><div className="similarity-meter"><i style={{ width: `${match.similarity * 100}%` }}/></div><small>{Math.round(match.similarity * 100)}% · {match.confidence === 'ALTA_SIMILARIDADE' ? 'Alta semelhança visual' : match.confidence === 'POSSIVEL_CORRESPONDENCIA' ? 'Possível correspondência' : match.confidence === 'BAIXA_SIMILARIDADE' ? 'Baixa semelhança' : 'Sem correspondência confiável'}</small></div><button className="button button-outline button-small" onClick={() => setAssetId(match.assetId)}>Abrir ativo</button></div>)}<p className="disclaimer-text">{disclaimer}</p></div>}
        </section>
        <section className="panel qr-panel">
          <div className="panel-heading"><div><span className="eyebrow">IDENTIFICADOR PERMANENTE</span><h2>QR Code patrimonial</h2><p>Payload compacto contendo somente o identificador estável HEOM-ASSET.</p></div><QrCode size={20}/></div>
          <button className="button button-outline button-full" onClick={() => void loadQr()} disabled={!assetId}><QrCode size={15}/> Gerar QR Code</button>
          {qrUrl && <div className="qr-preview"><span>HEOM · IDENTIFICAÇÃO PATRIMONIAL</span><img src={qrUrl} alt={`QR Code do equipamento ${selectedAsset?.assetNumber || ''}`}/><strong>{selectedAsset?.assetNumber}</strong><small>{selectedAsset?.name}</small><div className="photo-actions"><button className="button button-outline button-small" onClick={() => downloadQr('svg')}><Download size={13}/> SVG</button><button className="button button-outline button-small" onClick={() => downloadQr('png')}><Download size={13}/> PNG</button></div><button className="button button-primary button-small" onClick={printLabel} disabled={!qrPngUrl}><Printer size={14}/> Imprimir etiqueta 70 × 45 mm</button></div>}
          <div className="qr-scan-area"><div><strong>Leitura pela câmera</strong><small>Leitor ZXing carregado sob demanda; prioriza a câmera traseira em celulares e permite trocar a câmera. Exige internet na primeira carga e HTTPS ou localhost.</small></div><button className="button button-outline button-small" onClick={() => cameraActive ? stopCamera() : void startCamera()}><Camera size={14}/>{cameraActive ? 'Parar câmera' : 'Abrir câmera'}</button></div>
          {videoDevices.length > 0 && <label className="camera-device-select">Câmera disponível<select value={cameraDeviceId} onChange={(event) => { stopCamera(); setCameraDeviceId(event.target.value); }}><option value="">Selecionar câmera</option>{videoDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Câmera ${index + 1}`}</option>)}</select></label>}
          {cameraMessage && <p className="camera-message" role="status">{cameraMessage}</p>}
          <form className="qr-manual-form" onSubmit={resolveQrInput}>
            <label>Leitura por scanner USB ou entrada manual<input value={qrInput} onChange={(event) => setQrInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void resolveQrPayload(qrInput); } }} placeholder="HEOM-ASSET:identificador" autoComplete="off"/></label>
            <button className="button button-outline button-small" type="submit" disabled={!qrInput.trim()}>Localizar equipamento</button>
          </form>
          <video ref={videoRef} className="qr-camera" playsInline muted style={{ display: cameraActive ? 'block' : 'none' }}/>
          <div className="form-hint"><ShieldCheck size={14}/> O QR Code não contém dados pessoais. A leitura só localiza equipamentos já existentes na base local do navegador atual; não existe sincronização entre computadores.</div>
        </section>
      </div>
    </div>
  </div>;
}
