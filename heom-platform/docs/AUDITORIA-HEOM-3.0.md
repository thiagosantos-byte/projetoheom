# Auditoria e reestruturação — HEOM 0.4.0

**Base analisada:** distribuição `heom-platform` enviada em `projetoheom-main (1).zip` e estrutura correspondente ao repositório `thiagosantos-byte/projetoheom`.  
**Objetivo:** manter o produto React/TypeScript e os módulos de gestão, simplificando a demonstração e sua publicação em um único projeto Vercel.

## 1. Diagnóstico da base anterior

A distribuição 0.3.2 era um monorepositório com workspaces `apps/api` e `apps/web`, mas o comando raiz iniciava dois processos por `concurrently`: Express na porta 4000 e Vite na porta 5173. Os guias também pediam `.env`, segredo JWT e perfis com e-mails fictícios, embora o usuário não precisasse digitar uma senha.

A demonstração hospedada usava `/tmp` para JSON e fotografias. Esse armazenamento não é durável nem compartilhado entre instâncias serverless. O OCR dependia de executável Tesseract instalado no host. O WebSocket do servidor local não poderia ser mantido como conexão persistente por Functions HTTP.

## 2. Arquitetura 0.4.0

- Um `package.json` raiz mantém os workspaces apenas como organização e centraliza instalação, comandos e build.
- `npm run dev` inicia um único processo Node e uma única porta (`5173`). Express registra `/api/*`; Vite serve React no mesmo servidor HTTP.
- `npm run build` compila a API e gera o site em `apps/web/dist`.
- A Vercel recebe o mesmo projeto: build estático e a Function `api/[...path].ts` no mesmo domínio. O handler não chama `server.listen()`.
- A interface padrão usa `local-demo-api.ts`, um adaptador local-first. A persistência operacional de demonstração fica no navegador: dados em localStorage e imagens em IndexedDB.

## 3. Perfis

A primeira visita apresenta Administrador, Gestor, Operador e Consulta. O papel ativo é salvo no próprio navegador e pode ser alternado no cabeçalho sem recarregar a aplicação. Não são criadas contas, e-mails, senhas, tokens ou provedores de autenticação.

A matriz preserva as regras identificadas na interface/rotas: Consulta é somente leitura; Operador cria/edita equipamentos e executa operações de rotina; Gestor e Administrador podem arquivar e aprovar movimentações; a área administrativa de perfis é exclusiva do Administrador, enquanto a visão operacional de gateways está disponível também ao Gestor.

Essas regras no navegador servem à demonstração. Não constituem controle de acesso confiável para produção.

## 4. Funcionalidades preservadas no adaptador local

- Inventário: consulta, pesquisa, filtros, cadastro, edição, duplicidade básica e arquivamento lógico.
- Dashboard: contadores e distribuição recalculados a partir dos registros persistidos.
- Setores/ambientes: seed fictício e planta esquemática.
- Movimentações: solicitação, aprovação/rejeição e conclusão com atualização de setor, respeitando transições.
- Manutenção: ordens preventivas/corretivas, alteração de estado e atualização demonstrativa da disponibilidade.
- Alertas, notificações locais, histórico de operações e simulador de detecção.
- Fotografias JPG/PNG/WEBP: seleção/captura, associação, galeria, IndexedDB e remoção.
- Busca visual por dHash no canvas do navegador. É similaridade aproximada, não reconhecimento por IA.
- QR Code SVG gerado no cliente; leitura por `BarcodeDetector` quando suportado, com campo manual/scanner USB alternativo.
- Plaquetas: formulário de revisão manual quando OCR automático não estiver disponível.
- Importação e exportação CSV.

## 5. Recursos explicitamente limitados

- Dados e fotos ficam isolados no navegador de cada visitante; não existe sincronização entre pessoas/dispositivos nem backup institucional.
- OCR Tesseract não está embarcado na Function; não é apresentada leitura inventada. O avaliador pode transcrever os campos manualmente.
- dHash pode produzir falsos positivos/negativos e exige confirmação por patrimônio/plaqueta/série.
- Rastreamento e gateways são simulados; não há hardware BLE/RFID/UWB nem MQTT público.
- A planta é ilustrativa; não representa planta arquitetônica oficial.
- A API serverless não grava fotografias em `/tmp`; endpoints de mídia no handler indicam indisponibilidade e a UI usa o armazenamento do navegador.
- O legado institucional `apps/api/src/server.ts`, PostgreSQL/MQTT e scripts associados não fazem parte do fluxo padrão de demonstração.

## 6. Validações executadas nesta edição

- Parser TypeScript/TSX: 26 arquivos analisados, zero erros sintáticos.
- Configuração: seis arquivos JSON válidos.
- Sintaxe: `scripts/start-production.mjs`, `scripts/iniciar.sh` e `scripts/iniciar-sem-docker.sh` verificados.
- Testes puros do projeto (`domain`, `csv`, `visual`, `demo-accounts`): 10 aprovados, zero falhas.
- Testes isolados do adaptador local-first, executados com mocks de localStorage/IndexedDB/canvas/QRCode: 7 aprovados, zero falhas.
- Verificação TypeScript estrita isolada de `local-demo-api.ts`, com declaração de tipo temporária para `qrcode`: aprovada.

**Não executado / não aprovado:** `npm install` tentou duas vezes, mas o registry npm não respondeu antes do timeout e o cache local estava vazio. Portanto não foi possível executar `npm run typecheck` global, `npm run build`, `npm start`, testes HTTP com Express/Vercel, testes visuais reais em browser, responsividade em dispositivos, câmera/BarcodeDetector ou publicação real na Vercel. Não declarar esses itens aprovados até rodá-los em ambiente com dependências instaláveis.
