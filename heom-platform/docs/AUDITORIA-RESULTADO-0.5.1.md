# HEOM 0.5.1 — resultado da auditoria técnica

## Escopo e origem

Auditoria realizada sobre o arquivo ZIP fornecido nesta conversa, na pasta `heom-platform/`. O repositório remoto não foi alterado e esta entrega não contém commit/push. A execução ocorreu em Node.js 22.16.0 e npm 10.9.2.

## Problemas reproduzidos na inspeção do código

1. O formulário de cadastro e o Centro de Identificação mantinham caminhos distintos de OCR; o segundo utilizava um endpoint do modo demonstrativo que respondia com indisponibilidade.
2. Existia um segundo mecanismo OCR baseado em executável Tesseract na API institucional; a rota de execução no servidor também estava desabilitada no modo demonstrativo.
3. O parser tinha dificuldade com rótulo em linha separada, modelos compostos e preservação de grafia/acentos; uma série iniciada por `SN-` também podia ser confundida com outro rótulo.
4. O cadastro aceitava ausência de setor em alguns caminhos e não verificava, de forma centralizada, a relação setor/ambiente e as chaves patrimoniais duplicadas.
5. O fluxo de cadastro não preservava de maneira adequada o identificador do equipamento quando a gravação da fotografia falhava após a gravação do cadastro.
6. O leitor QR dependia de `BarcodeDetector`, sem biblioteca alternativa empacotada/gerenciada pelo frontend; a etiqueta era impressa usando a janela/página inteira.
7. O arquivo QR PNG ainda não tinha rota equivalente nos caminhos Express usados pelo ambiente institucional/local.
8. A validação das fotografias dependia parcialmente do MIME declarado; as operações IndexedDB precisavam de mensagens e encerramento transacional mais explícitos.

## Correções aplicadas

### OCR e cadastro assistido

- Criado `apps/web/src/lib/plate-ocr.ts`, utilizado pelos dois módulos de interface.
- Reconhecimento Tesseract.js no navegador, com pré-processamento local, orientação EXIF quando suportada, escala, tons de cinza, contraste, nitidez, Otsu, segmentações alternativas e rotações/inclinações com caixa delimitadora corrigida.
- Parser com rótulos em português/inglês, fabricantes conhecidos, fabricante desconhecido quando rotulado, modelo composto e valores em linhas consecutivas.
- O texto bruto é mantido nos resultados sem texto/campos e nos erros retornados pelo mecanismo; não há mensagem de sucesso para imagem sem texto ou texto sem campos.
- O carregamento de script/worker/idiomas é informado na interface. A fotografia fica no dispositivo; CDN entrega somente código/worker/WASM/modelos.
- O campo setor é obrigatório no formulário e no adaptador. O ambiente é filtrado e validado contra o setor selecionado.
- Criado `apps/web/src/lib/asset-validation.ts`, usado no adaptador local para validar identificação, nome, categoria, setor ativo, sala e duplicidades de identificação HEOM, patrimônio oficial, série e etiqueta.
- Se a fotografia falhar depois do cadastro, o ID fica pendente e a nova tentativa atualiza o mesmo registro em vez de criar duplicata.

### QR Code e fotografias

- Criado `apps/web/src/lib/qr-code.ts` para normalizar payloads `HEOM-ASSET:` existentes e a leitura de scanner tipo teclado.
- `IdentityCenter.tsx` utiliza ZXing via UMD CDN sob demanda, oferece seleção de dispositivo, prioriza câmera traseira e interrompe scanner/trilhas de mídia ao sair.
- A interface apresenta erros específicos de permissão, câmera ausente/ocupada, contexto inseguro e falha de carregamento da biblioteca. A identificação é limitada aos ativos armazenados na base local daquele navegador.
- Geração SVG/PNG usa correção de erro alta, margem e contraste; foi adicionada impressão em janela isolada com etiqueta 70 × 45 mm. O número principal é o patrimônio oficial, quando existe, e o identificador HEOM aparece como informação secundária.
- As rotas Express/demo passam a entregar PNG além de SVG. As rotas antigas de OCR no servidor, tanto no adaptador demo quanto na API institucional, respondem HTTP 410; o código do executável Tesseract foi removido de `apps/api/src/media.ts`.
- Fotografias validam assinatura binária real JPEG/PNG/WEBP (incluindo assinatura PNG completa), limite e dimensões; gravação IndexedDB usa transação, fecha conexões e tenta desfazer gravações parciais de metadados/blob.

### API, inventário e documentação

- Inclusão do campo `reference` nos contratos/CSV e migração `004_asset_reference.sql` para o caminho PostgreSQL legado.
- Validação de setor/sala e duplicidade também reforçada nos endpoints Express.
- Versões dos workspaces/root sincronizadas para `0.5.1`, sem alterar deliberadamente a árvore de dependências.
- `README.md`, arquitetura, limitações e instruções de Vercel atualizados; notas antigas de deploy foram marcadas como históricas/obsoletas.

## Arquivos alterados/adicionados

- Raiz: `README.md`, `package.json`, `package-lock.json`, `vercel.json`.
- API: `apps/api/package.json`, `apps/api/src/csv.ts`, `apps/api/src/demo-server.ts`, `apps/api/src/media.ts`, `apps/api/src/server.ts`, `apps/api/migrations/004_asset_reference.sql`.
- Web: `apps/web/package.json`, `apps/web/src/App.tsx`, `apps/web/src/components/IdentityCenter.tsx`, `apps/web/src/lib/local-demo-api.ts`, `apps/web/src/lib/plate-ocr.ts`, `apps/web/src/lib/asset-validation.ts`, `apps/web/src/lib/image-validation.ts`, `apps/web/src/lib/qr-code.ts`, `apps/web/src/types.ts`.
- Testes: `apps/web/tests/asset-validation.test.ts`, `image-validation.test.ts`, `plate-ocr.test.ts`, `qr-code.test.ts`, `qr-generation.test.ts` e `apps/web/tests/fixtures/`.
- Documentação: `docs/ARCHITECTURE.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/DEPLOY-VERCEL.md`, `docs/DEPLOY-VERCEL-RENDER.md`, `docs/DEPLOYMENT.md`.

## Validações executadas

| Verificação | Resultado observado | Interpretação |
|---|---|---|
| `node --experimental-strip-types --test apps/web/tests/asset-validation.test.ts apps/web/tests/image-validation.test.ts apps/web/tests/plate-ocr.test.ts apps/web/tests/qr-code.test.ts` | **23 testes aprovados, 0 falhas** | Executa validação de cadastro, parser OCR e normalização QR puros. |
| Parse sintático TypeScript/TSX com TypeScript 5.8.3 global | **34 arquivos, 0 diagnósticos sintáticos** | Não substitui o typecheck completo. |
| Typecheck isolado estrito de `plate-ocr.ts`, `qr-code.ts`, `asset-validation.ts` e `image-validation.ts`, com `DOM` e `typeRoots` vazio | **Passou** | Verifica os módulos puros; não verifica React/API nem declarações de dependências. |
| Tesseract local 5.5.0 sobre `plaqueta-sintetica.png` (`por+eng`, PSM 6) + parser HEOM | **5 campos esperados reconhecidos** | Ensaio sintético do executável local e parser, não do worker Tesseract.js no Chrome. |
| QR gerado com Python `qrcode` + decodificação OpenCV | **Payload `HEOM-ASSET:<UUID>` recuperado exatamente** | Ensaio independente do padrão de payload; não executa a dependência Node `qrcode` usada pelo app. |
| `apps/web/tests/qr-generation.test.ts` | **Adicionado, não executado** | Testa a criação de PNG/SVG com `qrcode`; dependência Node não pôde ser instalada nesta sessão. |
| `npm ci` | **Timeout durante instalação** | O ambiente não concluiu acesso ao registry npm; `node_modules` ficou sem dependências utilizáveis. |
| `npm run typecheck` | **Falhou: não encontrou `@types/node`** | Consequência direta das dependências não instaladas. |
| `npm test` | **Falhou: `tsx: not found`** | Não foi possível executar os testes API/workspaces pela suíte padrão. |
| `npm run build` | **Falhou: não encontrou `@types/node`** | Build integral não pôde ser validado sem instalar dependências. |
| `npm audit --omit=dev` | **Falhou: `EAI_AGAIN registry.npmjs.org`** | A consulta de vulnerabilidades ao registry não foi concluída; não há resultado de auditoria de segurança. |
| Chrome headless | Chromium 144.0.7559.96 presente; execução de smoke test excedeu o timeout | Sem automação funcional configurada/instalada, não foi possível validar a interface no navegador. |

## Homologação pendente — não declarar concluído

Esta versão contém correções de código, mas ainda **não está homologada integralmente**. Permanecem pendentes:

1. Instalar dependências em uma máquina com acesso ao npm registry e executar `npm ci`, `npm run typecheck`, `npm test`, `npm run build` e `npm audit --omit=dev` sem erros.
2. Abrir a aplicação compilada no Chrome e testar Tesseract.js 6 + modelos `por+eng`, inclusive a imagem de fixture e uma fotografia real legível; conferir texto bruto, campos e recuperação de falhas de CDN.
3. Gerar SVG/PNG pelo pacote Node `qrcode` usado pelo aplicativo, decodificar exatamente o arquivo gerado por um leitor independente e testar a etiqueta impressa.
4. Testar câmera real no Chrome desktop e celular (permissão concedida/negada, seleção traseira/frontal, troca de câmera e encerramento das trilhas), scanner USB e QR válido/inválido/não cadastrado.
5. Executar cadastro manual e assistido completo: gravação, foto, atualização, falha de anexo, nova tentativa sem duplicar, atualização da página e persistência IndexedDB/localStorage.
6. Percorrer os quatro perfis e os módulos principais no navegador; este ensaio de interface não foi possível nesta execução.

## Execução e publicação após homologação local

Na pasta `heom-platform`, com Node.js 22.x e npm 10+ e acesso ao registry:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm audit --omit=dev
npm run dev
```

Depois de todos os comandos passarem, conectar `thiagosantos-byte/projetoheom` à Vercel usando Root Directory `heom-platform`, Node 22.x, Install Command `npm ci`, Build Command `npm run build` e Output Directory `apps/web/dist`. Não são necessários Render, Railway, Docker ou `.env` para o modo demonstrativo. A Vercel não foi publicada/alterada por esta auditoria.
