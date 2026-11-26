# Limitações conhecidas e estado de homologação — HEOM 0.5.1

## O que esta demonstração oferece

- React/TypeScript e API Express integrados em um único repositório e um único comando local.
- Quatro perfis de demonstração sem e-mail, senha ou contas reais.
- Cadastro manual e assistido por fotografia, edição, consulta, busca e arquivamento lógico de equipamentos.
- Setor obrigatório; ambiente opcional, mas vinculado ao setor escolhido.
- OCR local no navegador, texto bruto, campos extraídos, status de erro e revisão humana.
- Fotografias JPG/PNG/WEBP, até 12 MB e 40 megapixels, em IndexedDB; metadados em localStorage.
- QR Code SVG/PNG, identificação por câmera via ZXing, entrada manual e leitor USB tipo teclado.
- Similaridade visual dHash, galeria e associação de fotografias.
- Dashboard, movimentações, manutenções, alertas, notificações locais, importação/exportação CSV e planta ilustrativa.

## Limitações importantes

### Armazenamento e compartilhamento

- **Isolamento por navegador/origem:** os dados não são compartilhados entre visitantes, computadores, celulares, perfis de navegador ou navegadores diferentes. Uma etiqueta escaneada em outro computador só encontra o ativo se aquele ativo também existir na base local desse computador.
- `localStorage` e `IndexedDB` dependem da quota e políticas de armazenamento do browser. Limpar dados do site, usar janela privada, bloquear armazenamento, restaurar perfil ou exceder a quota pode remover ou impedir gravações. Faça exportação CSV do inventário de demonstração; fotografias não são incluídas no CSV.
- Não existe sincronização multiusuário, cópia de segurança remota, autenticação real ou banco compartilhado na demonstração Vercel.

### OCR

- O OCR utiliza Tesseract.js 6 com `por+eng`. Biblioteca, worker, WASM e modelos são baixados sob demanda de CDN; a primeira leitura exige internet, e falhas de rede/CSP/extensões podem impedir a carga.
- A imagem é processada no navegador e não é enviada para um serviço externo de OCR. A performance depende do dispositivo, memória, resolução, foco, iluminação, reflexo, ângulo, desgaste da plaqueta e qualidade do texto.
- Extração de campos é heurística baseada em rótulos/linhas e fabricantes conhecidos; não é um modelo treinado para cada marca. Pode deixar campos vazios ou confundir caracteres.
- A confiança disponibilizada é uma média global do Tesseract, não uma pontuação confiável por campo. **Todos os valores precisam de revisão humana.** O sistema não completa patrimônio, nome, categoria, setor ou sala por inferência.
- O reconhecimento automático não foi certificado para leitura de toda plaqueta ou equipamento hospitalar. Use cadastro manual quando a imagem não for legível.

### QR Code e câmeras

- Geração SVG/PNG usa `qrcode`; leitura de imagem/vídeo e câmera usa `@zxing/browser`, carregado sob demanda via unpkg. A primeira carga exige internet; falhas de rede/CSP/extensões podem impedir o scanner. A câmera precisa de HTTPS (ou localhost), permissão e dispositivo/navegador compatível.
- O scanner USB funciona como entrada de teclado e não precisa acessar câmera. A identificação ocorre apenas na base local aberta.
- QR Code contém o identificador HEOM, não uma conexão com equipamento, posição física ou dados patrimoniais de uma base remota.
- Embora o código libere controles e trilhas MediaStream ao parar, permissão, foco da aba, driver e hardware variam entre dispositivos; teste câmera/etiqueta no Chrome real do desktop e celular alvo antes de demonstração pública.

### Busca visual, rastreamento e planta

- dHash 64-bit é uma comparação perceptual simples. Não é inteligência artificial, embedding, reconhecimento definitivo de equipamentos nem verificação de número de série.
- Rastreamento e eventos são demonstrativos; não existe gateway BLE/RFID/UWB físico, medição RSSI real ou localização em tempo real.
- Planta de setores/salas é ilustrativa e não substitui planta arquitetônica homologada ou levantamento do hospital.

### Notificações, segurança e produção

- Notificações e histórico ficam no navegador atual. Não há push real de servidor, entrega com navegador fechado ou sincronização entre usuários.
- Perfis ADMIN/GESTOR/OPERADOR/CONSULTA são personagens públicos e alternáveis para demonstração; não são autenticação nem controle de acesso adequado para dados hospitalares em produção.
- Auditoria local pode ser alterada pelo usuário e não é trilha inviolável.
- A demonstração não deve receber nomes de funcionários, dados de pacientes, números patrimoniais reais ou documentos institucionais.
- Os endpoints antigos de OCR no servidor (demonstração e API institucional) respondem HTTP 410; a execução com binário Tesseract foi removida da API. Vercel Functions não mantêm filesystem nem estado duradouro.

## Homologação desta entrega

O parser OCR, as regras de cadastro, a assinatura de imagem e a normalização do payload QR possuem testes automatizados executados. Existe também um teste automatizado de geração PNG/SVG com a biblioteca `qrcode`, mas ele não foi executado nesta sessão porque as dependências não puderam ser instaladas. Não houve decodificação ponta a ponta do QR gerado pelo próprio app; câmera e etiqueta impressa exigem validação no Chrome real. Os testes de parser não equivalem a reconhecer uma plaqueta fotografada nem provam a qualidade do OCR em todos os modelos.

A homologação completa exige, em ambiente com dependências instaladas:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

E exige ainda validar manualmente no Chrome desktop/celular: OCR sobre plaqueta real (verificando texto bruto e correção dos campos), cadastro com/sem foto, recuperação de falha de anexo, geração/download/impressão de QR e leitura por câmera/scanner USB. Não considerar aprovado qualquer fluxo que não tenha sido executado no dispositivo alvo.
