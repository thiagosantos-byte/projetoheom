# Limitações conhecidas e estado de homologação — HEOM 0.4.0

## Funcionalidades existentes no modo demonstrativo

- Interface React/TypeScript integrada a um servidor local único e build raiz.
- Quatro perfis selecionáveis sem e-mail, senha, token ou cadastro.
- Permissões por função aplicadas na interface e no adaptador local.
- Equipamentos com criação, edição, consulta, busca, filtros e arquivamento lógico.
- Setores, ambientes, mapa esquemático e indicadores calculados conforme o inventário atual.
- Movimentações: solicitação, aprovação/rejeição e conclusão com atualização de setor.
- Ordens preventivas/corretivas, atualização de estado e efeito demonstrativo na disponibilidade.
- Alertas operacionais e simulador de detecção.
- Fotografias com seleção/captura, pré-visualização, associação ao ativo e remoção.
- Similaridade aproximada por dHash calculada em canvas local.
- Geração de QR Code SVG local e leitura por `BarcodeDetector` quando disponível; entrada manual/scanner USB alternativos.
- Exportação/importação CSV, com validação básica e dados fictícios.
- Dados em localStorage e fotografias em IndexedDB, persistentes no navegador que criou as alterações.
- Função HTTP `/api/*` no mesmo projeto/domínio Vercel; sem filesystem persistente `/tmp`.

## Limitações que devem ser mostradas ao avaliador

- **Persistência isolada por navegador:** os dados não são compartilhados entre visitantes, dispositivos ou navegadores. Sem banco externo não há sincronização multiusuário.
- **OCR de plaqueta:** o cadastro assistido executa Tesseract.js no navegador e baixa o mecanismo/modelos `por` e `eng` sob demanda via CDN; requer internet na primeira utilização. A extração é heurística e pode errar. Fabricante, modelo, série e patrimônio são preenchidos somente quando reconhecidos; número interno HEOM, nome, categoria e localização continuam manuais. Conferência humana obrigatória.
- **Busca visual:** dHash de 64 bits é similaridade de aparência, não IA/embedding nem reconhecimento confiável. Pode gerar falsos positivos/negativos e exige confirmação por patrimônio/série.
- **QR câmera:** depende do navegador oferecer `BarcodeDetector` e permissão em contexto seguro. Campo manual/scanner USB são alternativas.
- **Rastreamento:** simulador no navegador, sem gateway BLE/RFID/UWB físico, MQTT ou localização em tempo real.
- **Planta:** esquemática/ilustrativa, sem coordenadas físicas homologadas.
- **Relatório PDF:** não há gerador PDF customizado; impressão do navegador pode ser usada como alternativa. CSV está disponível.
- **Notificações:** ficam no próprio navegador e na sessão local; não há push de servidor nem entrega com navegador fechado.
- **Histórico/auditoria:** histórico funcional de movimentações, manutenção e eventos simulados; não é trilha inviolável ou auditoria institucional.
- **Storage do navegador:** sujeito a quota/política de limpeza do navegador. Faça exportação CSV para guardar o inventário demonstrativo; fotos não são incluídas no CSV.

## Compatibilidade

- O modo público não exige `.env`, PostgreSQL, MQTT, Tesseract, Docker ou servidor de backend separado.
- A aplicação local roda em um único processo/porta `5173`.
- A Vercel publica a interface e a Function no mesmo projeto/domínio; Functions não mantêm WebSocket ou arquivos persistentes.
- A Function não grava JSON ou fotografias em `/tmp`. O adaptador principal da UI mantém os dados no navegador.

## Validações nesta entrega

- Parser TypeScript/TSX: 26 arquivos analisados, zero erros sintáticos.
- Configuração: seis arquivos JSON válidos.
- Sintaxe: `scripts/start-production.mjs`, `scripts/iniciar.sh` e `scripts/iniciar-sem-docker.sh` verificados.
- Testes puros do projeto (`domain`, `csv`, `visual`, `demo-accounts`): 10 aprovados, zero falhas.
- Testes isolados do adaptador local-first, com mocks para APIs de navegador: 7 aprovados, zero falhas.
- Verificação TypeScript estrita isolada de `local-demo-api.ts`: aprovada com declaração temporária para `qrcode`.

A instalação (`npm install`) foi tentada duas vezes, mas o registry npm não respondeu antes do timeout e o cache local estava vazio. Assim, `npm run typecheck` global, `npm run build`, `npm start`, inicialização HTTP, execução visual em browser, responsividade real, câmera/BarcodeDetector e publicação Vercel **não foram executados**. Esses itens não devem ser considerados aprovados nesta entrega.
