# HEOM — Plataforma de Inteligência Patrimonial

**Versão 0.3.2 · pt-BR · Windows 10/11 · Serviços nativos · Sem Docker**

Sistema local para gestão de equipamentos hospitalares, identificação fotográfica, leitura de plaquetas, busca visual aproximada, QR Code, manutenção, movimentações, alertas e rastreamento indoor.

> Esta distribuição é uma base de desenvolvimento e demonstração. Dados iniciais são fictícios. A planta é ilustrativa. Nenhum gateway BLE/RFID/UWB físico foi homologado. Não utilizar como inventário institucional até a validação do HEOM e da TI responsável.

## Requisitos

- Node.js 22 LTS ou superior compatível com as dependências nativas;
- npm;
- Windows 10/11, PowerShell ou Git Bash;
- Para OCR: Tesseract instalado localmente, com os dados de idioma `por` e `eng`;
- Para modo institucional: PostgreSQL e Mosquitto instalados nativamente no sistema operacional;
- Nenhum recurso depende de Docker ou serviço de nuvem.
- O Vite do modo demonstrativo escuta somente em `127.0.0.1`; o script institucional define `VITE_DEV_HOST=0.0.0.0` para acesso controlado pela LAN cabeada.

## Dois modos de execução preservados

### 1. Demonstração local — padrão

- API: `apps/api/src/demo-server.ts`;
- Persistência: `apps/api/data/heom-demo.json`;
- Fotografias: diretório `storage/assets`;
- Rastreamento: simulador interno (não MQTT físico);
- Não exige PostgreSQL nem Mosquitto;
- adequado para validação local de interface e fluxos, não para uso hospitalar multiusuário de produção.

### 2. Institucional — PostgreSQL + MQTT nativos

- API: `apps/api/src/server.ts`;
- Banco PostgreSQL instalado no host;
- Mosquitto instalado no host;
- Migrações SQL em `apps/api/migrations`;
- armazenamento de fotos no disco local, metadados no PostgreSQL;
- não inicia os serviços do banco ou MQTT automaticamente: eles devem estar ativos como serviços nativos do sistema operacional.

## Instalação pelo Git Bash

Abra o Git Bash e entre na pasta raiz `heom-platform`.

```bash
cp .env.example .env
bash ./scripts/configurar-ambiente.sh
npm install
```

Se o npm bloquear o script nativo do `esbuild`, aprove a dependência e reconstrua o binário:

```bash
npm install-scripts approve esbuild
npm rebuild esbuild
```

Valide a base:

```bash
npm run typecheck
npm run test
npm run build
```

Inicie a demonstração:

```bash
bash ./scripts/iniciar.sh
```

`bash ./scripts/iniciar-sem-docker.sh` é o nome explícito equivalente para o mesmo modo.

## Instalação pelo PowerShell

Na pasta raiz do projeto:

```powershell
Copy-Item .env.example .env
powershell -ExecutionPolicy Bypass -File .\scripts\configurar-ambiente.ps1
npm install
npm run typecheck
npm run test
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1
```

## Acesso local

- Interface: http://localhost:5173
- API: http://localhost:4000/api/health
- Fuso horário de apresentação: `America/Bahia`;
- Locale: `pt-BR`.

A conta administrativa tradicional com senha é opcional (`INITIAL_ADMIN_PASSWORD`). Para avaliação, utilize os perfis de teste sem senha.

### Perfis de teste no modo de demonstração

Ao iniciar o modo demonstrativo, o HEOM cria quatro contas fictícias e exibe cartões **Perfis para testar** na tela de login:

| Perfil | Conta | O que permite avaliar |
|---|---|---|
| Administrador de teste | `admin.teste@heom.local` | Controle de usuários e acesso completo |
| Gestor patrimonial | `gestor.teste@heom.local` | Aprovações, alertas e gestão operacional |
| Operador de inventário | `operador.teste@heom.local` | Cadastros, fotografias e solicitações |
| Acesso para consulta | `consulta.teste@heom.local` | Consulta sem permissão de alteração |

Para entrar, basta selecionar **Entrar sem senha** no cartão desejado. O servidor mantém apenas hashes de segredos aleatórios internos, que não são exibidos nem solicitados. A entrada rápida usa uma rota exclusiva do servidor de demonstração; ela não existe no servidor institucional.

As contas são criadas automaticamente também quando uma base JSON de demonstração já existe, sem substituir contas existentes. Na hospedagem de demonstração, habilite explicitamente `ENABLE_DEMO_PROFILES=true`; em `NODE_ENV=production`, os cartões só aparecem quando essa variável é definida. Como qualquer visitante pode alterar os dados, use somente registros fictícios. Consulte `docs/PERFIS-TESTE.md`.

## Atualização visual 0.3.1

- Dashboard com hero operacional, indicador circular de disponibilidade calculado com dados da API, composição do inventário e distribuição de disponibilidade por setor.
- Tipografia e controles ampliados para leitura em estações de trabalho.
- Camadas visuais com superfícies translúcidas, profundidade e realces de foco.
- Fontes do sistema operacional; nenhuma fonte remota ou dependência de nuvem é carregada.
- Layout responsivo para desktop, tablet e telas menores.

## Identificação por fotografia

Na navegação, abra **Identificação por foto**:

1. Selecione um equipamento;
2. envie uma imagem JPG, PNG ou WEBP (até 12 MB) ou capture com câmera compatível;
3. defina se é vista geral, plaqueta ou etiqueta patrimonial;
4. solicite OCR local quando o Tesseract estiver instalado;
5. confira os dados extraídos antes de confirmar;
6. use **Buscar por imagem** para comparar a fotografia com imagens cadastradas;
7. gere, imprima e leia QR Codes em navegadores que ofereçam `BarcodeDetector` e acesso à câmera.

A busca visual utiliza hash perceptual dHash com comparação Hamming. É uma triagem visual simples e local; não é reconhecimento biométrico, classificação por IA nem confirmação de identidade. Sempre confira patrimônio, plaqueta e número de série.

O OCR chama o executável Tesseract local. A API não baixa modelos nem chama serviços externos. Se o motor ou os pacotes de idioma estiverem ausentes, a funcionalidade informa indisponibilidade e permite seguir com cadastro manual.

## Configuração de OCR no Windows

Instale Tesseract e os arquivos de idioma português (`por`) e inglês (`eng`) durante a preparação do computador. Configure no `.env` o caminho local do executável, por exemplo:

```dotenv
TESSERACT_CMD=C:/Program Files/Tesseract-OCR/tesseract.exe
TESSERACT_LANG=por+eng
```

Reinicie a API depois de editar o `.env`. O processamento ocorre localmente. Confiança OCR é apenas uma estimativa do motor e precisa de revisão humana.

## Modo institucional sem Docker

1. Instale PostgreSQL e Mosquitto nativamente no servidor aprovado pela instituição;
2. inicie os serviços PostgreSQL e Mosquitto pelo gerenciador de serviços do Windows (`services.msc`) ou pelo mecanismo nativo da distribuição Linux;
3. configure a base, credenciais e acesso restrito no `.env`;
4. configure `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD` e o broker com ACL;
5. execute as migrações e o seed com o script:

Git Bash:

```bash
bash ./scripts/iniciar-institucional.sh
```

PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\iniciar-institucional.ps1
```

Esse script valida/aplica migrações, cria/verifica a conta inicial e sobe API + frontend em modo de desenvolvimento. Para implantação de produção, use build estático e um servidor HTTP/proxy reverso institucional com HTTPS; não exponha o Vite como servidor público.

## Endpoints centrais

- `GET /api/health`
- `GET /api/assets`
- `POST /api/assets`
- `GET /api/assets/:id/photos`
- `POST /api/assets/:id/photos` (multipart `photo` e `imageRole`)
- `POST /api/assets/:id/photos/:photoId/ocr`
- `POST /api/assets/:id/ocr/:resultId/confirm`
- `POST /api/assets/search-by-image` (multipart `photo`)
- `GET /api/assets/:id/qr.svg`
- `GET /api/maintenance`
- `POST /api/maintenance`
- `GET /api/reports/inventory.csv`

As rotas privadas exigem `Authorization: Bearer <token>`.

## Backup

Modo demonstrativo Git Bash:

```bash
bash ./scripts/backup-demonstracao.sh
```

O backup inclui o JSON local e as fotografias locais presentes em `storage`. No modo institucional, configure backups com `pg_dump` do PostgreSQL e cópia consistente do diretório de imagens, com política de retenção e teste de restauração definidos pela TI. Nunca considere um backup como validado antes de executar uma restauração de teste.

## Demonstração hospedada (somente Vercel)

Consulte `docs/DEPLOY-VERCEL.md` para publicar a interface React e a API Express como Vercel Functions no mesmo projeto e domínio. O modo demonstrativo oferece quatro perfis fictícios de acesso sem senha. A persistência em `/tmp` é temporária e serve apenas para avaliação; para manter cadastros e fotografias entre instâncias, conecte um banco/armazenamento persistente da Vercel. O modo institucional PostgreSQL + MQTT continua separado.

## Segurança e implantação

- Não compartilhe `.env`, tokens ou senhas;
- limite o acesso às pastas `storage`, `backups` e ao banco;
- use TLS interno, firewall, ACL MQTT e política de backup antes de operação real;
- não cadastre dados de pacientes;
- registros simulados precisam continuar identificados como `SIMULADO`;
- a suspeita de movimentação não comprova furto ou conduta irregular;
- valide LGPD, segurança, planta arquitetônica, setores, hardware e processos com as áreas responsáveis do hospital.

Consulte `docs/` para arquitetura, instalação e limitações.
