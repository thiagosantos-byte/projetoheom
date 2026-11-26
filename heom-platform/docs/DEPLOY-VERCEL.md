# Publicar HEOM na Vercel (frontend + API no mesmo projeto)

Este modo é exclusivamente demonstrativo. A interface Vite e a API Express são publicadas no mesmo projeto Vercel, sob o mesmo domínio. Não usa Render, Docker nem um servidor Express permanente.

## 1. Configuração do projeto Vercel

No projeto `projetoheom`, em **Settings → Build and Deployment**, configure:

| Campo | Valor |
|---|---|
| Root Directory | `heom-platform` |
| Framework Preset | `Vite` |
| Node.js Version | `22.x` |
| Install Command | `npm install` |
| Build Command | `npm run build -w @heom/api && npm run build -w @heom/web` |
| Output Directory | `apps/web/dist` |

O arquivo `vercel.json` já declara os comandos de instalação/build e a função catch-all em `api/[...path].ts`.

## 2. Variáveis de ambiente

Cadastre no ambiente **Production** (e também Preview caso queira testar previews):

| Chave | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `ENABLE_DEMO_PROFILES` | `true` |
| `JWT_SECRET` | segredo aleatório com pelo menos 32 caracteres |
| `HEOM_DATA_FILE` | `/tmp/heom-demo.json` |
| `HEOM_STORAGE_DIR` | `/tmp/heom-storage` |
| `MAX_ASSET_PHOTO_MB` | `3` |
| `VITE_HEOM_MODE` | `demo` |
| `VITE_HEOM_WS` | `false` |

Não configure `VITE_API_URL`: o frontend chama `/api` no mesmo domínio da Vercel. Não configure `INITIAL_ADMIN_PASSWORD`: os quatro perfis de teste entram pelos cartões sem senha.

Gere o segredo técnico localmente no Git Bash com:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Copie a saída diretamente para `JWT_SECRET` na Vercel. Esse valor assina as sessões e não é solicitado na tela de login.

## 3. Fluxo de demonstração

A API é publicada pela Function `api/[...path].ts`, que encaminha as rotas `/api/*` para a aplicação Express. O servidor demonstrativo exporta o Express quando `VERCEL=1` e mantém `server.listen` apenas na execução local.

Os cartões exibem quatro perfis fictícios:

- Administrador de teste
- Gestor patrimonial
- Operador de inventário
- Acesso para consulta

Os IDs de demonstração são determinísticos para que o token emitido continue reconhecido quando outra instância serverless atender a próxima requisição.

## 4. Testes após o deploy

Abra primeiro:

```text
https://projetoheom.vercel.app/api/health
```

A resposta deve ser JSON com `application: HEOM` e `status: operacional`.

Depois abra:

```text
https://projetoheom.vercel.app/api/demo/profiles
```

A resposta deve listar os quatro perfis. Na interface, clique em qualquer cartão e confirme que o dashboard abre.

## 5. Limitações do modo demonstrativo serverless

- Vercel Functions não mantêm WebSocket persistente. `VITE_HEOM_WS=false` desativa o canal em tempo real na hospedagem; o WebSocket continua disponível na execução local/institucional.
- O sistema JSON e as fotografias são gravados em `/tmp`, área temporária e isolada por instância. O conteúdo pode desaparecer após cold starts/redeploys e não é compartilhado entre instâncias. Isso permite testar login e navegação, mas não garante consistência de alterações de inventário entre visitantes.
- As funções Vercel têm limite de payload de requisição de 4,5 MB no padrão geral; mantenha o envio de fotos pequeno. Para uploads maiores, use upload direto para Vercel Blob.
- OCR com Tesseract depende de binário externo e não está disponível automaticamente na Function. O sistema deve sinalizar mecanismo OCR indisponível e permitir conferência/preenchimento manual.
- Não insira dados de pacientes, servidores, equipamentos reais ou qualquer dado institucional. Todos os registros desta instância são fictícios e o acesso sem senha é público.

Para uma demonstração multiusuário com cadastros/fotos persistentes, conecte posteriormente um banco PostgreSQL e Vercel Blob. O modo institucional com PostgreSQL/MQTT e autenticação própria permanece separado e não deve habilitar acesso rápido público.
