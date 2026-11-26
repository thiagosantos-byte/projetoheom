import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { api, apiBlob, formatDate } from '../lib/api';
import type { Asset } from '../types';
import { Camera, Check, FileImage, ImagePlus, LoaderCircle, QrCode, ScanLine, Search, ShieldCheck, Trash2, Upload, WandSparkles } from 'lucide-react';

type Photo = { id: string; assetId: string; originalName: string; mimeType: string; sizeBytes: number; imageRole: string; createdAt: string; fileUrl: string };
type OcrRecord = { id: string; status: string; rawText: string; fields: { manufacturer?: string | null; model?: string | null; serialNumber?: string | null; reference?: string | null }; confidence: number | null; reviewStatus: string };
type Match = { photoId: string; assetId: string; assetNumber: string; name: string; manufacturer?: string | null; model?: string | null; similarity: number; confidence: string; fileUrl: string };
type BarcodeDetectorLike = { detect: (source: CanvasImageSource | ImageBitmap) => Promise<Array<{ rawValue: string }>> };

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
  const [ocrValues, setOcrValues] = useState({ manufacturer: '', model: '', serialNumber: '' });
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [cameraMessage, setCameraMessage] = useState('');
  const [qrInput, setQrInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);

  useEffect(() => { if (!assetId && assets[0]) setAssetId(assets[0].id); }, [assets, assetId]);

  const loadPhotos = useCallback(async () => {
    if (!assetId) { setPhotos([]); return; }
    try {
      const result = await api<{ data: Photo[] }>(`/assets/${assetId}/photos`);
      setPhotos(result.data);
      const urls: Record<string, string> = {};
      await Promise.all(result.data.map(async (photo) => {
        try { urls[photo.id] = URL.createObjectURL(await apiBlob(`/assets/${assetId}/photos/${photo.id}/file`)); } catch { /* arquivo ausente é indicado no cartão */ }
      }));
      setPhotoUrls((current) => { Object.values(current).forEach((url) => URL.revokeObjectURL(url)); return urls; });
    } catch (error) { onToast(error instanceof Error ? error.message : 'Falha ao consultar fotografias.', 'error'); }
  }, [assetId, onToast]);

  useEffect(() => { void loadPhotos(); setOcr(null); setQrUrl(''); }, [loadPhotos]);
  useEffect(() => () => { Object.values(photoUrls).forEach((url) => URL.revokeObjectURL(url)); }, [photoUrls]);

  async function uploadPhoto(event: FormEvent) {
    event.preventDefault(); if (!assetId || !uploadFiles.length) return;
    setBusy(true);
    let uploaded = 0;
    try {
      // O endpoint mantém limite de um arquivo por requisição; o cliente envia
      // cada fotografia em sequência para permitir múltiplas imagens sem elevar
      // o pico de memória do servidor.
      for (const file of uploadFiles) {
        const body = new FormData(); body.append('photo', file); body.append('imageRole', role);
        await api(`/assets/${assetId}/photos`, { method: 'POST', body });
        uploaded++;
      }
      setUploadFiles([]); const input = document.getElementById('asset-photo-input') as HTMLInputElement | null; if (input) input.value = '';
      onToast(`${uploaded} fotografia(s) armazenada(s) neste navegador.`); await loadPhotos(); onRefresh();
    } catch (error) {
      onToast(`${uploaded} de ${uploadFiles.length} fotografia(s) foram armazenadas. ${error instanceof Error && error.message ? error.message : 'Falha no armazenamento local. Verifique se o navegador permite dados do site e tente novamente.'}`, 'error');
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
      if (!result.data.length) onToast('Nenhuma fotografia cadastrada para comparação.', 'info');
    } catch (error) { onToast(error instanceof Error ? error.message : 'Falha na busca visual.', 'error'); }
    finally { setBusy(false); }
  }

  async function runOcr(photo: Photo) {
    setBusy(true); setOcr(null);
    try {
      const result = await api<{ data: OcrRecord; message: string }>(`/assets/${assetId}/photos/${photo.id}/ocr`, { method: 'POST' });
      setOcr(result.data); setOcrMessage(result.message);
      setOcrValues({ manufacturer: result.data.fields.manufacturer || '', model: result.data.fields.model || '', serialNumber: result.data.fields.serialNumber || '' });
    } catch (error) { onToast(error instanceof Error ? error.message : 'Falha no OCR local.', 'error'); }
    finally { setBusy(false); }
  }

  async function confirmOcr(event: FormEvent) {
    event.preventDefault(); if (!ocr || !assetId) return;
    setBusy(true);
    try {
      await api(`/assets/${assetId}/ocr/${ocr.id}/confirm`, { method: 'POST', body: JSON.stringify({ ...ocrValues, replaceExisting }) });
      onToast('Dados do OCR revisados e gravados no cadastro.'); setOcr(null); setReplaceExisting(false); onRefresh();
    } catch (error) { onToast(error instanceof Error ? error.message : 'Não foi possível confirmar os dados.', 'error'); }
    finally { setBusy(false); }
  }

  async function deletePhoto(photo: Photo) {
    if (!window.confirm(`Remover a fotografia “${photo.originalName}”?`)) return;
    try { await api(`/assets/${assetId}/photos/${photo.id}`, { method: 'DELETE' }); onToast('Fotografia removida.'); await loadPhotos(); }
    catch (error) { onToast(error instanceof Error ? error.message : 'Não foi possível remover a fotografia.', 'error'); }
  }

  async function loadQr() {
    if (!assetId) return;
    try { const blob = await apiBlob(`/assets/${assetId}/qr.svg`); const next = URL.createObjectURL(blob); setQrUrl((old) => { if (old) URL.revokeObjectURL(old); return next; }); }
    catch (error) { onToast(error instanceof Error ? error.message : 'Não foi possível gerar o QR Code.', 'error'); }
  }

  const stopCamera = useCallback(() => {
    if (scanFrameRef.current !== null) cancelAnimationFrame(scanFrameRef.current);
    scanFrameRef.current = null; streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setCameraActive(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  function resolveQrInput(event: FormEvent) {
    event.preventDefault();
    const value = qrInput.trim();
    const prefix = 'HEOM-ASSET:';
    if (!value.startsWith(prefix)) { setCameraMessage('Código não reconhecido. Use a etiqueta HEOM ou um leitor configurado para enviar o identificador.'); return; }
    const id = value.slice(prefix.length).trim();
    const found = assets.find((item) => item.id === id);
    if (!found) { setCameraMessage('Nenhum equipamento ativo corresponde a esse identificador nesta base.'); return; }
    setAssetId(found.id); setCameraMessage(`Equipamento identificado: ${found.name}.`); setQrInput(''); onToast(`QR Code identificado: ${found.assetNumber}.`);
  }

  async function startCamera() {
    const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
    if (!Detector) { setCameraMessage('Este navegador não oferece leitura QR nativa. Use um leitor USB ou abra o QR Code em outro dispositivo compatível.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream; setCameraActive(true); if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const detector = new Detector({ formats: ['qr_code'] }); setCameraMessage('Aponte a câmera para a etiqueta do equipamento.');
      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const code = codes[0]?.rawValue || '';
          if (code.startsWith('HEOM-ASSET:')) {
            const id = code.slice('HEOM-ASSET:'.length); const found = assets.find((item) => item.id === id);
            if (found) { setAssetId(found.id); setCameraMessage(`Equipamento identificado: ${found.name}.`); onToast(`QR Code identificado: ${found.assetNumber}.`); stopCamera(); return; }
          }
        } catch { /* continua a varredura sem bloquear a interface */ }
        scanFrameRef.current = requestAnimationFrame(() => void scan());
      };
      scanFrameRef.current = requestAnimationFrame(() => void scan());
    } catch (error) { setCameraMessage(error instanceof Error ? error.message : 'Não foi possível acessar a câmera.'); stopCamera(); }
  }
  useEffect(() => () => stopCamera(), [stopCamera]);

  const selectedAsset = assets.find((item) => item.id === assetId);
  return <div className="identity-page">
    <div className="section-heading"><div><div className="eyebrow">IDENTIFICAÇÃO DIGITAL DO PATRIMÔNIO</div><h1>Identificação por fotografia</h1><p>Registre imagens, leia plaquetas com OCR local, compare fotografias e identifique ativos por QR Code.</p></div></div>
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
          <label className="photo-drop"><input id="asset-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" onChange={(event) => setUploadFiles(Array.from(event.target.files || []))} /><ImagePlus size={22}/><strong>{uploadFiles.length ? `${uploadFiles.length} arquivo(s) selecionado(s)` : 'Selecionar ou fotografar'}</strong><small>JPG, PNG ou WEBP · até 12 MB nesta demonstração</small></label>
          <div className="form-grid"><label>Tipo de fotografia<select value={role} onChange={(event) => setRole(event.target.value)}><option value="EQUIPAMENTO">Vista do equipamento</option><option value="PLAQUETA">Plaqueta de identificação</option><option value="ETIQUETA">Etiqueta patrimonial</option><option value="OUTRA">Outra</option></select></label><div className="photo-submit"><button className="button button-primary" disabled={!uploadFiles.length || busy}><Upload size={15}/> {busy ? 'Enviando…' : 'Armazenar fotografia'}</button></div></div>
        </form>}
        <div className="photo-gallery">{photos.length ? photos.map((photo) => <article className="photo-card" key={photo.id}>{photoUrls[photo.id] ? <img src={photoUrls[photo.id]} alt={`Fotografia ${photo.imageRole} do equipamento ${selectedAsset?.name || ''}`}/> : <div className="photo-unavailable"><FileImage/></div>}<div className="photo-card-info"><strong>{photo.imageRole === 'PLAQUETA' ? 'Plaqueta' : photo.imageRole === 'ETIQUETA' ? 'Etiqueta patrimonial' : photo.imageRole === 'OUTRA' ? 'Outra imagem' : 'Equipamento'}</strong><small>{photo.originalName}</small><small>{formatDate(photo.createdAt)}</small><div className="photo-actions"><button className="button button-outline button-small" onClick={() => void runOcr(photo)} disabled={busy}><WandSparkles size={13}/> Ler plaqueta</button>{canArchive && <button className="icon-button danger-icon" aria-label="Remover fotografia" onClick={() => void deletePhoto(photo)}><Trash2 size={15}/></button>}</div></div></article>) : <div className="empty-inline">Nenhuma fotografia cadastrada para este equipamento.</div>}</div>
        {ocr && <div className="ocr-review"><div className="ocr-review-head"><div><span className="eyebrow">LEITURA DA PLAQUETA · REVISÃO HUMANA</span><h3>Revisão do reconhecimento</h3></div><span className={`ocr-status ${ocr.status.toLowerCase()}`}>{ocr.status === 'PROCESSADO' ? 'Texto identificado' : ocr.status === 'MOTOR_INDISPONIVEL' ? 'Motor indisponível' : 'Sem texto legível'}</span></div><p>{ocrMessage}</p>{ocr.confidence !== null && <small>Confiança média informada pelo OCR: {Math.round(ocr.confidence * 100)}% — não representa precisão garantida.</small>}
          {ocr.rawText && <details><summary>Texto bruto reconhecido</summary><pre>{ocr.rawText}</pre></details>}
          {canManage && <form className="form-grid" onSubmit={confirmOcr}><label>Fabricante<input value={ocrValues.manufacturer} onChange={(e) => setOcrValues((v) => ({...v,manufacturer:e.target.value}))}/></label><label>Modelo<input value={ocrValues.model} onChange={(e) => setOcrValues((v) => ({...v,model:e.target.value}))}/></label><label>Número de série<input value={ocrValues.serialNumber} onChange={(e) => setOcrValues((v) => ({...v,serialNumber:e.target.value}))}/></label><label className="checkbox-label"><input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)}/> Autorizar substituição de dados existentes (gestor/admin)</label><div className="field-span-2"><button className="button button-primary" disabled={busy}><Check size={15}/> Confirmar informações revisadas</button></div></form>}
        </div>}
      </section>

      <div className="identity-side">
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">PESQUISA VISUAL</span><h2>Buscar por imagem</h2><p>Compare a fotografia com imagens já registradas no inventário local.</p></div><Search size={19}/></div>
          <form onSubmit={searchByImage} className="visual-search-form"><label className="photo-drop compact-drop"><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setSearchFile(event.target.files?.[0] || null)}/><Search size={20}/><strong>{searchFile?.name || 'Escolher imagem para comparar'}</strong><small>A comparação é processada no navegador atual.</small></label><button className="button button-primary button-full" disabled={!searchFile || busy}>{busy ? <LoaderCircle size={15} className="spin"/> : <Search size={15}/>} Comparar com o inventário</button></form>
          {matches.length > 0 && <div className="similarity-results"><h3>Resultados mais próximos</h3>{matches.map((match) => <div className="similarity-item" key={`${match.assetId}-${match.photoId}`}><div><strong>{match.name}</strong><small>{match.assetNumber} · {match.manufacturer || 'Fabricante não informado'} · {match.model || 'Modelo não informado'}</small><div className="similarity-meter"><i style={{ width: `${match.similarity * 100}%` }}/></div><small>{Math.round(match.similarity * 100)}% · {match.confidence === 'ALTA_SIMILARIDADE' ? 'Alta semelhança visual' : match.confidence === 'POSSIVEL_CORRESPONDENCIA' ? 'Possível correspondência' : match.confidence === 'BAIXA_SIMILARIDADE' ? 'Baixa semelhança' : 'Sem correspondência confiável'}</small></div><button className="button button-outline button-small" onClick={() => setAssetId(match.assetId)}>Abrir ativo</button></div>)}<p className="disclaimer-text">{disclaimer}</p></div>}
        </section>
        <section className="panel qr-panel">
          <div className="panel-heading"><div><span className="eyebrow">IDENTIFICADOR PERMANENTE</span><h2>QR Code patrimonial</h2><p>Etiqueta vinculada ao identificador interno do equipamento.</p></div><QrCode size={20}/></div>
          <button className="button button-outline button-full" onClick={() => void loadQr()} disabled={!assetId}><QrCode size={15}/> Gerar QR Code</button>
          {qrUrl && <div className="qr-preview"><span>HEOM · IDENTIFICAÇÃO PATRIMONIAL</span><img src={qrUrl} alt={`QR Code do equipamento ${selectedAsset?.assetNumber || ''}`}/><strong>{selectedAsset?.assetNumber}</strong><small>{selectedAsset?.name}</small><button className="button button-primary button-small" onClick={() => window.print()}>Imprimir etiqueta</button></div>}
          <div className="qr-scan-area"><div><strong>Leitura pela câmera</strong><small>Disponível em navegadores que implementam BarcodeDetector e permitem câmera em contexto seguro.</small></div><button className="button button-outline button-small" onClick={() => cameraActive ? stopCamera() : void startCamera()}><Camera size={14}/>{cameraActive ? 'Parar câmera' : 'Abrir câmera'}</button></div>
          {cameraMessage && <p className="camera-message">{cameraMessage}</p>}
          <form className="qr-manual-form" onSubmit={resolveQrInput}>
            <label>Leitura por scanner USB ou entrada manual<input value={qrInput} onChange={(event) => setQrInput(event.target.value)} placeholder="HEOM-ASSET:identificador" autoComplete="off"/></label>
            <button className="button button-outline button-small" type="submit" disabled={!qrInput.trim()}>Localizar equipamento</button>
          </form>
          <video ref={videoRef} className="qr-camera" playsInline muted style={{ display: cameraActive ? 'block' : 'none' }}/>
          <div className="form-hint"><ShieldCheck size={14}/> O QR Code contém apenas o identificador interno, sem dados pessoais ou patrimoniais completos.</div>
        </section>
      </div>
    </div>
  </div>;
}
