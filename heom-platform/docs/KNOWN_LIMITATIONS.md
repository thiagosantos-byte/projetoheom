# Limitações e estado de homologação — HEOM 0.3.2

## Implementado nesta distribuição

- Dois modos de execução nativa preservados: demonstração JSON e institucional PostgreSQL/MQTT; ambos sem Docker.
- Autenticação local com hash de senha, token assinado e perfis RBAC nas rotas existentes.
- Quatro perfis fictícios de avaliação (administrador, gestor, operador e consulta), criados idempotentemente no modo demonstrativo e acessíveis por cartões de entrada rápida na tela de login. A entrada rápida existe apenas no servidor demonstrativo e fica desativada em `NODE_ENV=production`.
- Inventário básico, setores, ambientes, movimentações, aprovação/conclusão, alertas, notificações, auditoria e simulador de detecção.
- Fotografias múltiplas por equipamento, upload JPG/PNG/WEBP, validação de MIME real, limite configurável até 12 MB, armazenamento no disco local e leitura autenticada.
- Arquivamento lógico de fotografias; arquivos e resultados OCR ficam preservados para rastreabilidade.
- Pré-processamento local para OCR (orientação EXIF, redimensionamento, tons de cinza, normalização e nitidez) e chamada ao Tesseract instalado no host.
- Resultado OCR em revisão humana, confirmação explícita, prevenção de substituição não autorizada e verificação de número de série duplicado.
- Hash perceptual dHash, distância de Hamming e ranking visual aproximado, com classificação e ressalva de que semelhança não confirma identidade.
- QR SVG individual baseado no UUID estável do equipamento; leitura pela API `BarcodeDetector` do navegador e entrada para scanner USB em modo teclado ou código manual.
- Ordens de manutenção com status e efeito básico sobre a disponibilidade do equipamento.
- Importação CSV transacional (todas as linhas são validadas antes de gravar), detecção de duplicidade, vínculo opcional de setor/ambiente e exportação CSV; modelo CSV para download.
- Scripts nativos de configuração e inicialização PowerShell/Git Bash; nenhum Dockerfile, Compose ou runtime de contêiner é exigido.

## Limitações que não devem ser apresentadas como concluídas

- A busca visual usa dHash de 64 bits, não embeddings de aprendizado profundo. Pode produzir falsos positivos/negativos e deve ser usada somente como triagem com confirmação humana.
- O OCR depende do Tesseract e de modelos locais `por`/`eng`. Não há teste com plaquetas reais do HEOM nesta sessão; o índice de confiança é uma estimativa geral do Tesseract, não uma confiança por campo nem uma taxa de acurácia institucional.
- Não há correção de perspectiva automática nem ferramenta de recorte/rotação manual no cliente. A foto original é preservada; o pré-processamento ocorre em cópia temporária para OCR.
- A leitura por câmera depende de `BarcodeDetector` no navegador e permissão de câmera, em contexto seguro (localhost ou HTTPS). Há entrada manual/leitor USB alternativo.
- A importação suporta CSV, não XLSX. Não há mapeador visual de colunas configurável; os cabeçalhos reconhecem aliases documentados no código.
- PDF personalizado automatizado não está implementado. É possível usar impressão do navegador para salvar a página em PDF.
- Modo de demonstração grava um arquivo JSON. É voltado a desenvolvimento e apresentação controlada, não suporta concorrência/alta disponibilidade de um hospital.
- Modo institucional exige PostgreSQL e Mosquitto instalados nativamente e configurados pela TI. A integração e as migrações não foram executadas nesta sessão por falta de serviço PostgreSQL/MQTT disponível.
- Eventos de rastreamento reais BLE, RFID e UWB, cobertura/calibração, precisão de localização e gateways físicos não foram conectados nem homologados. O modo de demonstração usa apenas simulador.
- A planta permanece ilustrativa e precisa ser substituída por desenho arquitetônico oficial validado pelo hospital.
- Não há fila offline durável de alterações em estações que percam a LAN. A plataforma não depende de internet pública, mas precisa da LAN cabeada até o servidor central.
- Notificações no Windows quando o navegador está fechado/agente local não estão implementadas.
- Backup demonstrativo existe; política institucional, backup agendado com `pg_dump`, retenção, restauração automatizada e teste de recuperação precisam ser configurados pela TI.

## Validação executada nesta sessão

- Análise sintática: 21 arquivos TypeScript/TSX analisados com o parser TypeScript global; nenhum erro sintático.
- Testes de regras puras executados com `node:test`: 8 aprovados, 0 falhas (domínio, CSV e hash visual).
- O Tesseract 5.5.0 e idiomas `eng`/`por` estão disponíveis no ambiente de trabalho, mas o pipeline Sharp/Tesseract integrado ao backend não foi executado por ausência das dependências npm da aplicação.
- `npm install` foi tentado; o registro npm não respondeu no tempo limite. Portanto `npm run typecheck`, `npm run build`, teste HTTP, integração PostgreSQL/MQTT e fluxos com arquivos reais não foram executados e não podem ser declarados aprovados.
