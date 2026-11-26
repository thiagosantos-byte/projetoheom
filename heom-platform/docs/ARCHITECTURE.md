# Arquitetura HEOM 0.3.1

## Modos de execução

- `dev:local`: `demo-server.ts` + React/Vite; JSON persistente, imagens locais, simulador interno.
- `dev:infra`: `server.ts` + React/Vite; PostgreSQL e Mosquitto nativos, migrações SQL, arquivos de imagens no armazenamento local.

Os contratos centrais de inventário, identificação fotográfica, QR, manutenção, alertas, movimentações e relatórios são disponibilizados nos dois modos.

## Identificação de imagens

- Upload multipart com limite de 12 MB, MIME allow-list e validação de assinatura real do arquivo;
- JPG, PNG e WEBP;
- nomes físicos aleatórios e diretório separado por UUID do ativo;
- metadados e hash visual guardados em JSON (demonstração) ou PostgreSQL (institucional);
- rota de arquivo autenticada;
- OCR local executado com Tesseract CLI; ausência de engine/idioma retorna estado explícito;
- dHash 64-bit calculado localmente por Sharp (9×8 grayscale), similaridade por distância de Hamming;
- QR Code local com payload `HEOM-ASSET:<UUID>`.

A similaridade visual é um método de triagem, não um classificador de identidade. A precisão depende de ângulo, iluminação, fundo e enquadramento; confirmação humana por patrimônio/plaqueta/série é obrigatória.

## Manutenção

Ordens com tipo preventiva, corretiva, calibração ou inspeção, prioridade, prazos, responsável e ciclo de status. Uma ordem corretiva marca o ativo em manutenção; a conclusão de todas as ordens abertas permite retornar para operação. Regras mais sofisticadas por categoria/calibração são etapas de homologação.

## Rastreamento

O modo local processa eventos pelo simulador interno. O modo institucional recebe eventos MQTT e armazena eventos no PostgreSQL. BLE/UWB/RFID físicos exigem gateways, tags, configuração, levantamento de cobertura, autenticação MQTT e ensaios. RSSI é uma estimativa de zona, não uma coordenada precisa.

## Rede e dependências

Nenhuma aplicação usa Docker. Nenhum recurso essencial depende de cloud, CDN ou API pública. Para modo institucional, PostgreSQL e Mosquitto devem ser executados nativamente como serviços do host.
