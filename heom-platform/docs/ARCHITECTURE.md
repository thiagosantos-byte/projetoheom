# Arquitetura HEOM 0.5.1

## Aplicação única e publicação

A raiz `heom-platform` mantém um único `package.json`, workspaces npm (`apps/api` e `apps/web`) e uma instalação única com `npm ci`.

- **Local:** `apps/api/src/demo-server.ts` sobe Express e middleware Vite/React no mesmo processo e na porta 5173. O comando `npm run dev` inicia a aplicação integrada; não é necessário separar frontend e backend.
- **Build:** `npm run build` compila a API e gera a interface em `apps/web/dist`.
- **Vercel:** o diretório `apps/web/dist` é servido como frontend estático e `api/[...path].ts` atende `/api/*` no mesmo domínio. A instalação é `npm ci`, build `npm run build`, Node.js 22.x e output `apps/web/dist`.

A interface pública seleciona o modo demonstrativo local-first no build Vite. Não exige `.env`, conta real, email, senha, PostgreSQL, MQTT, Docker ou serviço externo.

## Perfis demonstrativos e persistência

- Quatro papéis de teste: `ADMIN`, `GESTOR`, `OPERADOR` e `CONSULTA`, sem identidade real ou senha. A troca de perfil é somente uma simulação de permissões de interface e adaptador local.
- `localStorage`: equipamentos, setores, ambientes, alertas, movimentações, ordens, notificações, eventos e metadados de fotos.
- `IndexedDB`: blobs das fotografias.
- A base é isolada por origem/navegador/perfil de armazenamento. Não existe sincronização de visitantes ou dispositivos, backup remoto ou persistência compartilhada entre instâncias serverless.
- O adaptador `apps/web/src/lib/local-demo-api.ts` mantém os contratos `api()` e `apiBlob()` e valida setor/ambiente, identificadores repetidos, conteúdo/tamanho de imagens e gravação local.

## OCR de plaquetas

`apps/web/src/lib/plate-ocr.ts` é o único mecanismo OCR utilizado pelos dois fluxos de interface:

1. Cadastro assistido por fotografia (`apps/web/src/App.tsx`).
2. Releitura de uma fotografia já associada (`apps/web/src/components/IdentityCenter.tsx`).

O módulo valida JPG/PNG/WEBP até 12 MB e 40 megapixels, decodifica a imagem no navegador, aplica orientação EXIF quando suportada, escala, tons de cinza, contraste, nitidez, limiarização de Otsu e tentativas de segmentação/orientação. O motor Tesseract.js 6, worker, WASM e modelos de idioma `por+eng` são carregados sob demanda de CDN; a primeira execução exige internet. **A fotografia não é enviada aos hosts de OCR**: somente o código do motor e os dados de idioma são baixados. Depois do processamento o parser extrai, quando consegue, fabricante, modelo, série, referência e patrimônio/tombamento.

O parser aceita rótulos na mesma linha ou em linhas consecutivas, remove acentos para reconhecer variações e usa um conjunto de fabricantes conhecidos apenas como fallback. Um fabricante não listado só é preenchido quando aparece claramente associado ao rótulo de fabricante. Nenhum nome, modelo, série ou número patrimonial é fabricado pelo código. O texto bruto é preservado; a confiança exposta é a média global retornada pelo Tesseract, não uma confiança independente por campo. Toda informação exige revisão humana.

As rotas `/assets/:id/photos/:photoId/ocr` dos adaptadores demo e institucional respondem HTTP 410 e não executam OCR no servidor. O caminho institucional legado mantém apenas a leitura/confirmação de resultados históricos; a execução é exclusivamente o módulo `plate-ocr.ts` no navegador.

## Fotografias e busca visual

- As fotografias são validadas por MIME e assinatura binária, tamanho e dimensões, transformadas em dHash de 64 bits no navegador e salvas em IndexedDB; os metadados ficam em localStorage.
- A gravação tenta fazer rollback do blob se persistência dos metadados falhar. A exclusão arquiva o metadado antes de apagar o blob; se o apagamento físico falhar, a interface informa que o vínculo foi arquivado, mas o blob permaneceu.
- O dHash mede semelhança aproximada de aparência; não é IA, não identifica modelo/fabricante e não confirma identidade.

## QR Code e identificação

- O pacote `qrcode` gera SVG e PNG de 640 px, correção de erro nível H e margem de quatro módulos.
- O payload é somente `HEOM-ASSET:<UUID>`; compatibilidade é mantida para etiquetas antigas com esse prefixo. A etiqueta para impressão tem dimensões de 70 × 45 mm e abre uma janela separada, não imprime a página inteira do HEOM.
- `@zxing/browser` é carregado sob demanda de unpkg como UMD. A câmera requer HTTPS (ou localhost), permissão do usuário e dispositivo compatível. É possível escolher uma câmera e a interface tenta priorizar a traseira em celulares.
- A entrada manual e leitores USB que simulam teclado continuam disponíveis. A leitura só localiza um equipamento se o identificador existir na base do navegador atual.
- Ao encerrar o scanner, os controles do ZXing e trilhas do MediaStream são interrompidos.

## Validação de localização, setor e sala

O setor é obrigatório no formulário React, no adaptador local e no schema da API. Um ambiente só pode ser associado se seu `departmentId` corresponder ao setor selecionado. O mesmo requisito vale para importações CSV. A planta atual é esquemática/ilustrativa, sem precisão arquitetônica ou rastreamento físico.

## API, segurança demonstrativa e modo institucional

O Express mantém rotas locais e de compatibilidade, com Zod para contratos e validações de cadastro. Na demonstração pública os registros de uso continuam client-side; a Function Vercel não deve ser interpretada como banco multiusuário. Os perfis públicos não são uma fronteira de autenticação para produção.

`apps/api/src/server.ts` é o caminho legado institucional com PostgreSQL e migrações; não é necessário para abrir a demonstração. Nenhum endpoint do sistema executa um binário Tesseract no servidor.
