# Estado de implementação — HEOM 0.3.1

## Entregue nesta distribuição

- Monorepositório React/Vite + Node/Express/TypeScript.
- Modo demonstrativo local com persistência JSON, autenticação local e simulador interno.
- Modo institucional separado com PostgreSQL e MQTT instalados nativamente.
- Inventário, setores/ambientes de leitura, movimentações, alertas, notificações, auditoria básica e administração de usuários.
- Upload e armazenamento local de fotografias múltiplas por equipamento.
- OCR local assistido por Tesseract, com revisão humana antes da atualização dos campos.
- Comparação visual aproximada baseada em dHash 64-bit e distância de Hamming.
- QR individual por UUID, geração SVG e leitura via `BarcodeDetector` ou scanner USB/manual.
- Ordens de manutenção preventiva, corretiva, calibração e inspeção.
- Importação/exportação CSV, validação integral de lote e modelo CSV.
- scripts PowerShell e Git Bash para configuração e inicialização nativas.
- migrações SQL para ativos, fotos, OCR, manutenção e histórico de status.

## Ainda não concluído/homologado

- Typecheck e build completos: não foram executados com sucesso nesta sessão porque o registro npm não respondeu e as dependências do monorepositório não estavam instaladas.
- HTTP end-to-end: não executado.
- PostgreSQL/Mosquitto: migrações e eventos institucionais ainda não executados em serviços reais nesta sessão.
- OCR integrado: não foi validado com plaquetas reais; depende do Tesseract e idiomas `por`/`eng` no host da API.
- Similaridade: é dHash simples, não modelo de embeddings/IA e não comprova identidade.
- XLSX e PDF personalizado: não implementados; CSV e impressão do navegador estão disponíveis.
- Planta real, BLE/RFID/UWB e agentes de notificação fora do navegador: dependem de dados, hardware e validação institucional.
- Fila offline para edição quando a estação perde a LAN: não implementada. O modo local dispensa internet pública, mas o cliente precisa alcançar o servidor na rede local.

## Testes executados no ambiente de desenvolvimento

- 21 arquivos `.ts`/`.tsx` verificados pelo parser sintático do TypeScript: 0 erros de sintaxe.
- 8 testes puros executados com `node:test`: 8 aprovados, 0 falhas.
- Não confundir esses testes com `npm run typecheck`, `npm run build` ou testes integrados; esses comandos precisam ser executados após `npm install` em uma máquina com acesso ao registro npm ou cache local de dependências.

## Como validar no Windows/Git Bash

Na raiz `heom-platform`:

```bash
cp .env.example .env
bash ./scripts/configurar-ambiente.sh
npm install
npm install-scripts approve esbuild
npm rebuild esbuild
npm run typecheck
npm run test
npm run build
bash ./scripts/iniciar.sh
```

`npm install-scripts approve esbuild` é necessário apenas se a versão do npm bloquear os scripts de instalação do esbuild. O modo demonstrativo usa `http://localhost:5173` e API em `http://localhost:4000`.
