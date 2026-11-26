# Publicação do HEOM na Vercel — projeto único

A implantação é exclusivamente demonstrativa. A Vercel publica o build React/Vite e a Function `/api/*` no mesmo projeto e domínio. Não há serviço Render, Railway, banco de dados, Docker, credenciais ou servidor Node permanente.

## 1. Conectar GitHub

1. Entre na Vercel e escolha **Add New → Project**.
2. Importe `thiagosantos-byte/projetoheom` e selecione a branch `main`.
3. Em **Root Directory**, escolha `heom-platform` (não a raiz externa do repositório).
4. Configure os campos abaixo ou confirme os valores já detectados do `vercel.json`.

| Configuração | Valor |
|---|---|
| Framework Preset | Vite |
| Node.js Version | 22.x |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `apps/web/dist` |

5. Não cadastre variáveis de ambiente. A distribuição de demonstração não exige `.env`, `JWT_SECRET`, `DATABASE_URL`, MQTT ou endereço de backend.
6. Clique em **Deploy**.

## 2. Rotas e domínio

- A interface estática é publicada em `apps/web/dist`.
- `api/[...path].ts` atende `/api/*` como Vercel Function.
- A interface usa o adaptador local-first em `apps/web/src/lib/local-demo-api.ts`; não chama um segundo domínio nem depende de API hospedada à parte.
- `/api/health` é disponibilizado no mesmo domínio para diagnóstico.

Não configure `VITE_API_URL`, CORS adicional, Render ou um projeto separado para frontend/backend.

## 3. Conferência após a publicação

Substitua o domínio de exemplo pelo endereço que a Vercel atribuiu:

```text
https://SEU-PROJETO.vercel.app/
https://SEU-PROJETO.vercel.app/api/health
```

Na interface, confirme a abertura direta do dashboard, a troca entre os quatro perfis e o cadastro de um equipamento fictício. Atualize a página e confirme que o cadastro permanece no mesmo navegador.

## 4. Armazenamento e limite de escopo

Os registros são guardados no `localStorage` e as imagens no `IndexedDB` do navegador visitante. Cada pessoa/dispositivo tem uma base isolada. Não são enviados ao servidor nem compartilhados com outros visitantes. Limpar os dados do site apaga o conjunto local. Isso é intencional: sem banco persistente externo, não existe uma base pública comum com sincronização multiusuário.

As Vercel Functions não gravam a demonstração em `/tmp`. O handler serverless não depende de filesystem persistente, banco de dados ou processo residente.

## 5. Limitações funcionais da hospedagem

- WebSocket persistente foi removido do fluxo demonstrativo; atualizações são feitas sob demanda.
- OCR Tesseract.js é executado no navegador, fora da Function. O primeiro uso exige acesso à CDN para carregar script, worker, core WASM e modelos português/inglês. As imagens são processadas no dispositivo; a fotografia original é armazenada no IndexedDB da demonstração do navegador.
- Leitura QR por câmera depende de `BarcodeDetector`; scanner USB/entrada manual são alternativas.
- Similaridade por imagem é dHash local, não IA de reconhecimento.
- Planta e rastreamento são demonstrativos, sem hardware físico.

Consulte `KNOWN_LIMITATIONS.md`. Não utilize a implantação pública para inventário real, dados pessoais, decisões clínicas ou operação hospitalar.
