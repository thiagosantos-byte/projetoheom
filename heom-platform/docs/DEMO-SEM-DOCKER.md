# Modo de demonstração integrado — HEOM 0.4.0

A demonstração padrão não utiliza Docker, PostgreSQL, Mosquitto, JWT, conta, e-mail, senha ou `.env`.

## Iniciar

Na raiz `heom-platform`:

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. A aplicação React, o middleware Vite e as rotas Express compartilham um único processo HTTP e uma única porta. Não execute a API e a interface em terminais separados.

## Perfis

Na primeira visita, selecione Administrador, Gestor, Operador ou Consulta. O seletor no cabeçalho permite alternar durante a navegação. São personagens para testar a interface, não contas autenticadas nem controles de segurança de produção.

## Dados e fotografias

- Registros estruturados: `localStorage`.
- Fotografias: `IndexedDB`.
- As alterações persistem no navegador e origem que as criaram; não são compartilhadas entre visitantes ou dispositivos.
- Todos os dados iniciais são fictícios e identificados como `SIMULADO`.

## Recursos condicionais

- Similaridade fotográfica: dHash local, somente triagem visual.
- QR Code: geração local; leitura por `BarcodeDetector` quando disponível, ou entrada manual/leitor USB.
- OCR Tesseract: não está embarcado na demonstração web; a interface informa a indisponibilidade e oferece revisão manual dos campos da plaqueta.
- Rastreamento: simulador local sem gateways, MQTT, BLE, RFID ou UWB físicos.
- Planta: esquema ilustrativo, não é planta arquitetônica oficial.

## Build

```bash
npm run typecheck
npm test
npm run build
npm start
```

Consulte `README.md`, `docs/ARCHITECTURE.md` e `docs/KNOWN_LIMITATIONS.md`.
