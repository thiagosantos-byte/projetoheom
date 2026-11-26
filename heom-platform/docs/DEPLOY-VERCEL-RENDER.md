# Publicar o HEOM para demonstração — Vercel + Render (sem Docker)

Este roteiro publica a interface no Vercel e a API Express no Render. O servidor demonstrativo continua separado do servidor institucional: `demo-server.ts` usa dados fictícios em JSON e simulador interno; `server.ts` continua reservado ao modo institucional com PostgreSQL e MQTT.

> **Uso demonstrativo:** não insira dados de pacientes, dados pessoais reais nem patrimônio hospitalar oficial. O modo JSON é voltado à demonstração, não à operação hospitalar multiusuário.

## 1. Publicar a API no Render

Crie um **Web Service** ligado ao repositório `thiagosantos-byte/projetoheom`, com estas configurações:

| Campo | Valor |
|---|---|
| Root Directory | `heom-platform` |
| Language / Runtime | `Node` |
| Branch | `main` |
| Build Command | `npm install && npm run build -w @heom/api` |
| Start Command | `npm run start:demo -w @heom/api` |
| Health Check Path | `/api/health` |

Não use Docker. O build compila `src/demo-server.ts` para `dist/demo-server.js`; o comando de inicialização executa esse servidor compilado.

### Variáveis de ambiente do Render

Cadastre estas variáveis no serviço. Não coloque segredos no GitHub ou no código-fonte.

| Chave | Valor |
|---|---|
| `NODE_VERSION` | `22.12.0` (ou uma versão Node 22 aceita pelo Render) |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `WEB_ORIGIN` | `https://SEU-PROJETO.vercel.app` |
| `JWT_SECRET` | Segredo aleatório com pelo menos 32 caracteres |
| `ENABLE_DEMO_PROFILES` | `true` |
| `HEOM_DATA_FILE` | `/var/data/heom-demo.json` |
| `HEOM_STORAGE_DIR` | `/var/data/storage` |
| `MAX_ASSET_PHOTO_MB` | `12` |

Gere o valor de `JWT_SECRET` no seu computador com:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Copie o valor gerado diretamente para a variável `JWT_SECRET` no Render. Esse segredo fica somente no ambiente do servidor; não é uma senha de login e não precisa ser digitado pelo avaliador.

`ENABLE_DEMO_PROFILES=true` habilita os quatro perfis de avaliação sem senha também nesta instância de demonstração hospedada. Não configure `INITIAL_ADMIN_PASSWORD` para esse fluxo. `JWT_SECRET` continua obrigatório, mas é um segredo técnico usado pelo servidor para assinar sessões; ninguém digita esse valor na tela de login. Não habilite os perfis sem senha no servidor institucional.

### Persistência no Render

O HEOM demonstrativo grava o banco JSON e as fotos no sistema de arquivos. Para conservar esses arquivos após reinicializações e novos deploys, adicione um **Persistent Disk** ao serviço e use `/var/data` como Mount Path. Discos persistentes exigem um Web Service pago no Render; sem disco, os arquivos são efêmeros e podem desaparecer em reinicializações ou deploys. Um disco também mantém o serviço em uma única instância e os deploys podem causar uma breve interrupção.

Para apenas testar o login, o serviço pode ser iniciado sem disco, mas não conte com a preservação dos cadastros ou fotografias.

Depois do deploy, copie o endereço HTTPS do serviço, por exemplo `https://heom-api-xxxx.onrender.com`. Teste abrindo:

```text
https://SEU-SERVICO.onrender.com/api/health
```

A resposta esperada é um JSON com `application: HEOM` e `status: operacional`.

## 2. Conectar o frontend da Vercel à API

No projeto Vercel já criado para o frontend, mantenha:

| Campo | Valor |
|---|---|
| Root Directory | `heom-platform/apps/web` |
| Framework Preset | `Vite` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

Em **Settings → Environment Variables**, adicione:

| Chave | Valor | Ambientes |
|---|---|---|
| `VITE_API_URL` | URL HTTPS do serviço Render, sem `/api` no final | Production e Preview, se usar ambos |
| `VITE_HEOM_MODE` | `demo` | Production e Preview, se usar ambos |

Exemplo de `VITE_API_URL`: `https://heom-api-xxxx.onrender.com`.

Salve e faça um novo deploy do frontend. O Vite incorpora variáveis `VITE_*` durante o build; alterar a variável não atualiza um deploy antigo.

## 3. Ajustar CORS no Render

Depois de copiar o domínio exato da Vercel, volte às variáveis do Render e ajuste `WEB_ORIGIN` para esse domínio. Exemplo:

```text
https://heom-web.vercel.app
```

Se também usar um domínio próprio, informe os dois separados por vírgula:

```text
https://heom-web.vercel.app,https://heom.exemplo.com.br
```

Salve e redeploy a API.

## 4. Entrar no HEOM publicado — sem senha

Na tela de login da Vercel, a instância em `VITE_HEOM_MODE=demo` apresenta quatro cartões. Basta clicar no perfil desejado:

| Perfil | E-mail exibido | Permissão principal |
|---|---|---|
| Administrador de teste | `admin.teste@heom.local` | Acesso completo à demonstração |
| Gestor patrimonial | `gestor.teste@heom.local` | Gestão e aprovações |
| Operador de inventário | `operador.teste@heom.local` | Cadastro e movimentação |
| Acesso para consulta | `consulta.teste@heom.local` | Somente leitura |

Não existe senha para digitar nos perfis de avaliação. As contas recebem segredos aleatórios internos que não são apresentados ao visitante; o botão de entrada rápida cria a sessão demonstrativa. O modo institucional continua usando autenticação própria e não registra essa rota.

Como os cartões permitem acesso público sem senha, qualquer visitante pode entrar nos perfis e alterar dados fictícios. Não use dados reais, de pacientes, funcionários ou patrimônio oficial nesta instância.

## 5. Diagnóstico rápido

- **Erro de rede / API não alcançável:** confirme se `VITE_API_URL` contém somente a origem HTTPS do Render e faça novo deploy na Vercel.
- **Erro de CORS:** confira se `WEB_ORIGIN` no Render corresponde exatamente ao domínio que aparece na barra do navegador; depois redeploy a API.
- **Cartões de teste não aparecem:** confirme `ENABLE_DEMO_PROFILES=true` no Render, `VITE_HEOM_MODE=demo` na Vercel, `VITE_API_URL` com a URL correta e `WEB_ORIGIN` com o domínio exato da Vercel; redeploy os serviços após alterar as variáveis.
- **API indisponível:** abra `/api/health` no domínio Render e confira os logs do serviço.
- **Dados/fotos sumiram após reinício:** confirme se há Persistent Disk montado em `/var/data` e se as duas variáveis de caminho estão apontando para ele.

## 6. Modo institucional preservado

Este ajuste não substitui nem remove `apps/api/src/server.ts`, as migrações PostgreSQL, o seed ou os scripts institucionais. Para operação real, a equipe de TI deve implantar o servidor institucional com PostgreSQL/MQTT nativos ou serviços gerenciados adequados, revisar segurança e LGPD, habilitar HTTPS e validar o sistema. A instância JSON publicada neste roteiro permanece identificada como demonstração.
