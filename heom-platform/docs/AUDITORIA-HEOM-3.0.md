# Relatório de implementação e auditoria técnica — HEOM 0.3.1

**Produto:** HEOM — Plataforma de Inteligência Patrimonial  
**Instituição de destino:** Hospital Especializado Octávio Mangabeira (HEOM), Salvador/BA  
**Versão desta distribuição:** 0.3.1  
**Execução:** serviços nativos, sem Docker  
**Idioma da interface:** pt-BR  
**Fuso de apresentação:** America/Bahia

## 1. Origem e escopo dos arquivos disponíveis

O pacote `HEOM-Correcoes-Auditoria-0.2.1.zip` recebido nesta conversa era uma atualização incremental, não o repositório integral. A implementação 0.3.1 foi consolidada usando a fundação 0.2.0 anteriormente disponível nesta conversa e os arquivos de correção 0.2.1. Portanto, esta entrega é uma base reconstruída e ampliada a partir dos artefatos disponíveis; não é possível atestar a preservação de arquivos de um repositório institucional que não estava contido no último ZIP.

A estrutura agora inclui os arquivos de configuração e inicialização necessários para o monorepositório entregue: `tsconfig.json` dos dois workspaces, `vite.config.ts`, `index.html`, `main.tsx`, bibliotecas comuns, API, migrações, scripts e documentação.

## 2. Modos de execução

### 2.1 Demonstração local

- API: `apps/api/src/demo-server.ts`;
- interface: React/Vite;
- persistência: `apps/api/data/heom-demo.json`, com gravação atômica e fila de escrita;
- imagens: armazenamento local em `storage/assets`;
- rastreamento: simulador interno;
- dependências de infraestrutura: não exige PostgreSQL nem MQTT;
- Docker: não utilizado.

Este modo é apropriado para desenvolvimento e demonstração controlada em uma máquina. O arquivo JSON não deve ser usado como banco de uma operação hospitalar concorrente ou de produção.

### 2.2 Institucional nativo

- API: `apps/api/src/server.ts`;
- banco: PostgreSQL instalado diretamente no host;
- mensageria: Mosquitto/MQTT instalado diretamente no host;
- migrações: `apps/api/migrations/*.sql`;
- imagens: sistema de arquivos local, com metadados no PostgreSQL;
- rastreamento: ingestão MQTT e simulador quando `DEMO_MODE=true`;
- Docker: não utilizado.

Os scripts aplicam migrações e iniciam os processos Node, mas não instalam nem iniciam PostgreSQL ou Mosquitto. Esses serviços precisam ser provisionados e administrados pela equipe responsável pelo computador/servidor.

## 3. Funcionalidades implementadas nesta base

### Inventário e identidade

- autenticação local e perfis `ADMIN`, `GESTOR`, `OPERADOR` e `CONSULTA`;
- cadastro, edição, consulta e arquivamento lógico de equipamentos;
- validação de patrimônio, patrimônio oficial, série e etiqueta de rastreamento;
- QR Code estável vinculado ao UUID do equipamento;
- pesquisa textual por campos principais;
- setores, ambientes, movimentações, alertas, notificações e auditoria;
- indicação explícita de registros fictícios como `SIMULADO`.

### Fotografias

- múltiplas fotografias associadas ao ativo;
- upload JPG, PNG e WEBP;
- validação de assinatura do arquivo, dimensões e limite de tamanho;
- armazenamento local fora do banco relacional;
- metadados e hash visual persistidos no JSON demonstrativo ou PostgreSQL institucional;
- leitura de fotografias por rota autenticada;
- arquivamento lógico para preservar trilha histórica.

### OCR local

- pré-processamento com Sharp: orientação EXIF, redimensionamento, escala de cinza, normalização e nitidez;
- chamada ao executável Tesseract instalado no próprio host;
- idiomas configuráveis, padrão `por+eng`;
- sugestão de fabricante, modelo, série e referência a partir do texto reconhecido;
- revisão e confirmação humana antes de alterar o cadastro;
- registro do resultado bruto, campos extraídos, confiança média e revisão.

A confiança exibida é a média dos tokens que o Tesseract classificou, não uma precisão por campo nem uma taxa de acerto validada no HEOM.

### Busca visual aproximada

- cálculo local de hash perceptual dHash de 64 bits por fotografia;
- comparação por distância de Hamming;
- ranking dos resultados por similaridade;
- classificação de similaridade com aviso de que imagem semelhante não comprova identidade.

Este mecanismo é uma triagem simples baseada em aparência. Não usa embeddings de modelo treinado, reconhecimento por IA, classificação semântica ou confirmação automática de identidade.

### QR Code

- geração local de SVG com payload estável `HEOM-ASSET:<UUID>`;
- etiqueta associada ao identificador permanente do ativo;
- leitura pela API `BarcodeDetector` quando disponível no navegador;
- alternativa com leitor USB em modo teclado ou entrada manual.

A leitura por câmera depende de suporte do navegador, permissão de câmera e contexto seguro (localhost ou HTTPS). O QR é gerado no servidor e mostrado no módulo de identificação.

### Manutenção

- criação e listagem de ordens preventiva, corretiva, calibração e inspeção;
- prioridade, prazo, responsável e descrição;
- atualização de status;
- ordem corretiva afeta o status operacional do ativo;
- restauração do status após fechamento das ordens corretivas abertas;
- histórico de transições por tabela/trigger no modo PostgreSQL.

### Importação e relatórios

- leitura CSV com BOM, aspas e delimitadores comuns;
- cabeçalhos reconhecidos em português e inglês;
- validação de campos obrigatórios e enumerações;
- detecção de patrimônio, patrimônio oficial e série duplicados;
- validação de setor e ambiente;
- importação integral ou rejeição integral do lote;
- exportação CSV e modelo CSV;
- opção de impressão do navegador para salvar a tela atual em PDF.

## 4. Validações executadas nesta sessão

| Verificação | Resultado | Observação |
|---|---|---|
| Análise sintática TypeScript/TSX | Aprovada | 21 arquivos analisados pelo parser TypeScript global, sem erros de sintaxe |
| Testes puros de domínio | Aprovados | Regras de movimentação e classificação de localização |
| Testes do parser CSV | Aprovados | Cabeçalhos, BOM, aspas e duplicidades |
| Testes dHash | Aprovados | Hash igual, hash oposto e classificação por faixa |
| Total de testes puros | 8 aprovados, 0 falhas | Executados com `node:test` após transpilar os módulos puros com TypeScript global |
| `npm run typecheck` | Não executado com sucesso | Dependências/types do workspace não puderam ser instalados neste ambiente |
| `npm run build` | Não executado com sucesso | Registro npm indisponível durante a preparação desta entrega |
| HTTP end-to-end | Não executado | O ambiente não tinha dependências locais da aplicação instaladas |
| PostgreSQL/migrações | Não executado | Não havia serviço PostgreSQL disponível |
| MQTT/hardware | Não executado | Não havia broker nem gateways físicos disponíveis |
| OCR integrado com foto real | Não executado | Tesseract local estava presente no ambiente, mas Sharp/dependências do projeto não foram instaladas |

Os testes puros não substituem typecheck, build, integração HTTP, validação de banco ou homologação de hardware.

## 5. Limitações e requisitos de homologação

- **PostgreSQL e Mosquitto:** requerem instalação e configuração nativas no host para o modo institucional.
- **Fotos/OCR:** requerem Tesseract e arquivos de idioma locais no computador que executa a API. A instalação desses componentes não é automatizada pelos scripts npm.
- **Busca visual:** dHash é sensível a enquadramento, ângulo, iluminação e fundo; falsos positivos e falsos negativos são esperados.
- **OCR:** extração por padrões de texto precisa ser revisada por funcionário; fotos reais de plaquetas do hospital ainda não foram usadas em ensaios de acurácia.
- **Câmera QR:** suporte depende do navegador e de contexto seguro; leitor USB/manual é alternativa.
- **Planilha:** esta versão importa/exporta CSV, não arquivos XLSX.
- **PDF:** não há relatório PDF personalizado gerado no backend; a impressão do navegador é a alternativa atual.
- **Planta:** o desenho é ilustrativo. É necessário importar e validar desenho arquitetônico oficial e mapear setores/ambientes com o HEOM.
- **Rastreamento:** simulador não é gateway real. BLE/RFID/UWB, cobertura, RSSI, calibração, PoE e instalação física não foram homologados.
- **Operação offline:** a aplicação não exige internet pública, mas as estações precisam alcançar o servidor pela LAN cabeada. Não há fila IndexedDB de alterações para operar desconectado da LAN.
- **Notificações fora do navegador:** não existe agente Windows para alertas com navegador fechado.
- **Backup institucional:** a equipe de TI deve configurar `pg_dump`, cópia consistente das imagens, retenção e teste de restauração.
- **Produção:** o modo demonstrativo JSON é apenas para desenvolvimento/apresentação. O uso real exige PostgreSQL, segurança de rede, HTTPS interno, políticas de acesso, teste de carga, backup e aprovação institucional.

## 6. Conclusão técnica

A versão 0.3.1 entrega uma base executável com dois modos nativos e um conjunto funcional de fluxos locais para inventário, fotografias, OCR assistido, busca visual aproximada, QR, manutenção, CSV, movimentações e alertas. Ela não deve ser descrita como solução institucional homologada, porque as dependências de host, banco, rede, arquitetura predial e hardware ainda exigem instalação e ensaios no ambiente do hospital.

Nenhum teste ou integração listado como não executado deve ser considerado aprovado.
