# HEOM — Hospital Equipment Operations Management

**Versão 0.5.1 · OCR compartilhado no navegador · QR SVG/PNG e leitura ZXing · Demonstração institucional · React + TypeScript + Express + Vercel**

O HEOM nesta distribuição é uma aplicação integrada para demonstração de gestão de equipamentos hospitalares. Interface e API compartilham o mesmo projeto e, localmente, o mesmo processo HTTP. A demonstração pública abre sem login, e-mail, senha, criação de conta, `.env`, PostgreSQL, MQTT, Docker ou outro serviço externo.

> **Importante:** todos os registros são fictícios. Os quatro perfis são personagens para avaliar permissões de interface, não autenticação ou segurança de produção. Os dados criados ficam no armazenamento do navegador que os criou; visitantes diferentes não compartilham alterações. Não cadastrar dados de pacientes, profissionais, equipamentos reais ou patrimônio institucional.

## Correção 0.5.1 — OCR, cadastro e identidade digital

- OCR único em `apps/web/src/lib/plate-ocr.ts`, utilizado tanto no formulário de cadastro quanto no Centro de Identificação. O reconhecimento acontece dentro do navegador; a fotografia não é enviada para serviço externo de OCR.
- Pré-processamento local: orientação EXIF quando suportada, redimensionamento, tons de cinza, contraste, nitidez, binarização adaptativa por Otsu, segmentação alternativa e tentativas adicionais de rotação/inclinação.
- Extração assistida de fabricante, modelo (inclusive composto), série, referência e patrimônio/tombamento. Rótulos em linha separada são aceitos. O texto bruto é preservado e campos devem ser revisados por uma pessoa.
- Diagnóstico do OCR: carga do motor/idiomas, reconhecimento, texto bruto, status específico, confiança média do mecanismo (não por campo) e mensagens diferentes para texto vazio, nenhum campo extraído e falha de motor/idioma/imagem.
- OCR Tesseract.js 6 e modelos `por+eng` são obtidos sob demanda via CDN; a primeira utilização requer internet. A imagem não é transmitida para esses hosts.
- Setor é obrigatório no cadastro e na importação CSV; a sala/ambiente precisa pertencer ao setor selecionado.
- Após falha no anexo da foto, o identificador do equipamento permanece pendente no formulário. A próxima tentativa atualiza esse cadastro e não cria um segundo ativo.
- QR Code com identificador estável `HEOM-ASSET:<UUID>`, correção de erro alta e margem de segurança; visualização, download SVG/PNG e etiqueta de 70 × 45 mm em janela própria de impressão.
- Leitura QR com `@zxing/browser` carregado sob demanda via unpkg, seleção de câmera, prioridade à câmera traseira, alternativa manual/scanner USB e liberação das trilhas da câmera ao encerrar.
- Validação do tipo real do arquivo, MIME, limite de 12 MB e dimensões; operações de foto e cadastro no adaptador local tentam evitar metadados/arquivos parcialmente gravados.

## Correção 0.4.1 — fotografias

- Transações do IndexedDB encerram a conexão em sucesso e falha.
- Mensagens específicas para armazenamento bloqueado, falta de espaço, conexão ocupada e formato incompatível.
- JPG, PNG e WEBP até 12 MB são aceitos; HEIC/HEIF precisa ser convertido para um desses formatos.
- As imagens ficam no navegador que as enviou, sem depender do filesystem temporário da Vercel.

**Importante:** OCR e similaridade visual são mecanismos auxiliares, não validação clínica ou patrimonial automática. Confirme todos os valores e não cadastre dados reais na demonstração.

## Iniciar localmente

Requisitos: Node.js 22.x e npm 10 ou superior.

Na pasta `heom-platform`:

```bash
npm ci
npm run dev
```

Abra `http://localhost:5173`. O comando inicia um único processo Node, uma única porta e um único servidor HTTP. A API Express e o middleware React/Vite são montados nesse servidor. Não inicie `apps/api` e `apps/web` em terminais separados.

Para encerrar, pressione `Ctrl+C`.

## Build e execução de produção local

```bash
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serve a interface já compilada e as rotas `/api/*` no mesmo endereço `http://127.0.0.1:5173`. Execute `npm run build` antes de iniciar a versão de produção.

## Publicar na Vercel

O repositório é um único projeto Vercel. Configure:

| Campo | Valor |
|---|---|
| Repositório | `thiagosantos-byte/projetoheom` |
| Root Directory | `heom-platform` |
| Framework Preset | Vite |
| Node.js | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `apps/web/dist` |

O `vercel.json` já define o build, o diretório estático, a Function `api/[...path].ts` e o fallback de SPA para rotas do frontend, excluindo `/api/*`. Não configure Render, Railway, Docker, banco, JWT, credenciais ou variáveis de ambiente para abrir a demonstração. Não configure `VITE_API_URL`.

Depois de conectar o repositório à Vercel, basta publicar. A interface e o endpoint `/api/health` serão entregues no mesmo domínio.

Instruções detalhadas: [`docs/DEPLOY-VERCEL.md`](docs/DEPLOY-VERCEL.md).

## Perfis demonstrativos

Na primeira visita, a tela inicial apresenta os quatro perfis para seleção. Após escolher um perfil, o seletor do cabeçalho permite alternar a qualquer momento entre:

| Perfil | Escopo de demonstração |
|---|---|
| Administrador | Acesso administrativo demonstrativo, visão de gateways, perfis e configurações. |
| Gestor | Gestão operacional, aprovação de movimentações, acompanhamento de alertas e gateways. |
| Operador | Cadastro/edição de equipamentos, fotos, movimentações, manutenção e tratamento operacional de alertas. |
| Consulta | Consulta de indicadores e registros, sem operações de alteração. |

As permissões seguem a matriz de papéis existente no código: `CONSULTA` não altera; `ADMIN` e `GESTOR` podem arquivar e aprovar movimentações; `ADMIN` e `GESTOR` acessam administração; `ADMIN` vê a lista dos quatro perfis. A alternância é imediata e não emite token.

## Armazenamento demonstrativo

- **Dados estruturados:** `localStorage` do navegador.
- **Fotografias:** `IndexedDB` do navegador, como blobs; metadados e hash visual ficam no registro local.
- **Escopo:** origem/domínio e navegador atuais. No domínio Vercel, cada visitante possui sua própria base local.
- **Persistência Vercel:** a demonstração não grava JSON nem fotografias em `/tmp` ou no filesystem das Functions.
- **Reset:** limpar os dados do site no navegador remove o conjunto daquela instalação. Faça exportação CSV antes de limpar se precisar guardar o inventário de teste.

Esta escolha mantém as alterações após atualizar/reabrir o navegador sem exigir banco externo. Não é persistência compartilhada, sincronização entre dispositivos, backup institucional nem sistema multiusuário.

## Módulos presentes

- Dashboard com contadores calculados a partir do inventário, distribuição por setor, prioridades e últimas detecções de demonstração.
- Inventário com cadastro, edição, busca, filtros e arquivamento lógico.
- Identificação por fotografia: seleção/captura no navegador, pré-visualização, associação ao equipamento, galeria e remoção.
- Busca visual aproximada por dHash de 64 bits, calculada em canvas no navegador. É triagem por aparência, não reconhecimento por IA e não confirma identidade.
- Leitura de plaquetas: OCR Tesseract.js compartilhado no navegador para fabricante, modelo, série, referência e patrimônio oficial, com texto bruto e revisão humana. A primeira leitura exige baixar motor e idiomas de CDN; a imagem permanece no dispositivo.
- QR Code SVG/PNG gerado com `qrcode`, vinculado ao UUID demonstrativo do equipamento. A leitura por câmera usa `@zxing/browser` carregado sob demanda de unpkg, sem depender de `BarcodeDetector`; entrada manual/leitor USB continua disponível.
- Planta de setores e ambientes ilustrativos, com coordenadas esquemáticas. Não representa planta arquitetônica oficial nem localização física em tempo real.
- Movimentações com solicitação, aprovação, rejeição e conclusão conforme perfil.
- Manutenções preventivas/corretivas, status e efeito demonstrativo na disponibilidade do equipamento.
- Alertas, notificações locais, simulador de rastreamento e histórico operacional.
- Relatórios e exportação/importação CSV.

## O que não deve ser confundido com uma integração real

- Rastreamento é um simulador local; não existe gateway BLE/RFID/UWB físico conectado.
- RSSI e setores de localização são dados demonstrativos; não são coordenadas ou medições reais.
- O OCR público não depende de executável Tesseract na Vercel: roda no navegador com Tesseract.js e dados de idioma obtidos sob demanda via CDN. Sem conexão na primeira carga do mecanismo/idiomas, a leitura pode falhar e deve ser informada ao operador.
- Similaridade visual é dHash; não utiliza modelo de aprendizado profundo.
- QR por câmera depende do suporte do navegador e de permissão de câmera em contexto seguro (localhost/HTTPS).
- A planta é esquemática e precisa ser substituída por desenho validado antes de qualquer uso operacional.

Consulte [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) para o estado e os limites completos.

## Estrutura principal

```text
heom-platform/
├── api/[...path].ts              # Function HTTP /api/* da Vercel
├── apps/
│   ├── api/src/demo-server.ts    # API Express e servidor integrado local
│   └── web/
│       ├── src/App.tsx           # Interface React
│       ├── src/lib/api.ts        # Contrato da API e seleção do modo demo
│       └── src/lib/local-demo-api.ts # Operações local-first e IndexedDB
├── docs/                         # Arquitetura, limitações e implantação
├── scripts/start-production.mjs  # Início local do build com NODE_ENV=production
├── package.json                  # Instalação, scripts e workspaces
└── vercel.json                   # Build e Function
```

Os workspaces mantêm o código organizado, mas há uma única instalação na raiz e o usuário executa apenas os scripts da raiz.
