# Arquitetura HEOM 0.4.0

## Aplicação única

A raiz `heom-platform` contém um único `package.json`, uma instalação npm por workspaces e scripts de desenvolvimento/build centralizados.

- **Local:** `apps/api/src/demo-server.ts` cria um servidor HTTP Express. As rotas `/api/*` são registradas primeiro e o middleware Vite/React é montado no mesmo servidor. Porta padrão: `5173`. Um único `npm run dev` inicia tudo.
- **Build:** `npm run build` compila a API e gera `apps/web/dist`.
- **Vercel:** o diretório `apps/web/dist` é a publicação estática; `api/[...path].ts` exporta o handler HTTP para `/api/*` no mesmo projeto/domínio. O código não chama `server.listen()` na Function.

## Modo demonstrativo local-first

A interface mantém os contratos `api()` e `apiBlob()`, mas em `VITE_HEOM_MODE=demo` direciona as operações para `local-demo-api.ts` em vez de depender de autenticação ou de uma API com estado em servidor.

- `localStorage`: equipamentos, setores, ambientes, alertas, movimentações, ordens, notificações e eventos de teste.
- `IndexedDB`: arquivos de imagem em formato Blob.
- Perfil ativo: `localStorage['heom.demo.role']`, com os identificadores `ADMIN`, `GESTOR`, `OPERADOR` e `CONSULTA`.
- `User.id` é um identificador local determinístico por função. Não existe e-mail, senha, token, registro de usuário nem provedor de autenticação.
- As restrições de permissão são aplicadas nas operações do adaptador e na interface. Como os perfis são públicos e editáveis, isso não substitui autorização de servidor para produção.

A base local é isolada por origem e navegador. Não sincroniza visitantes nem dispositivos diferentes. O objetivo é uma demonstração sem banco externo e sem gravação temporária na infraestrutura serverless.

## Fotografias, imagem, OCR e QR

- Fotos JPG/PNG/WEBP são armazenadas em IndexedDB; metadados e associação com equipamento ficam em localStorage.
- Hash dHash 64-bit é calculado em canvas para busca aproximada por similaridade.
- O cadastro novo oferece OCR Tesseract.js no navegador, sem enviar a imagem a um serviço de OCR. O script, o worker, o core WASM e os modelos `por`/`eng` são carregados sob demanda via CDN; a primeira leitura exige internet. O OCR tenta extrair fabricante, modelo, número de série e patrimônio oficial e preenche os campos para revisão humana. O backend/serverless não executa binário Tesseract.
- QR Code é gerado no cliente como SVG pelo pacote `qrcode`, com payload `HEOM-ASSET:<UUID>`.
- A câmera QR utiliza `BarcodeDetector` se o navegador suportar; há campo de leitura manual/scanner USB como alternativa.

## API Express legada e Function

O Express mantém as rotas demonstrativas para diagnóstico/compatibilidade e a Function Vercel exporta o handler. A Function não grava em `/tmp`; seu estado em memória é transitório. A interface pública não depende desse estado: os dados operacionais de demonstração são persistidos localmente no navegador.

## Serviços externos

O modo público não conecta PostgreSQL, MQTT, gateways, WebSocket, Tesseract remoto ou mapa externo. A planta e o rastreamento são explicitamente demonstrativos. O modo institucional legado permanece em `apps/api/src/server.ts`, mas não é o comando padrão, não é usado pela demonstração Vercel e requer configuração de infraestrutura própria.
