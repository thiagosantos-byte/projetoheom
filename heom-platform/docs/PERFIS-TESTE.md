# Perfis de teste do HEOM 0.3.2

## Objetivo

Permitir que avaliadores experimentem os diferentes níveis de permissão sem criar contas manualmente nem digitar senhas.

## Perfis disponíveis

| Nome exibido | E-mail | Perfil |
|---|---|---|
| Administrador de teste | `admin.teste@heom.local` | `ADMIN` |
| Gestor patrimonial | `gestor.teste@heom.local` | `GESTOR` |
| Operador de inventário | `operador.teste@heom.local` | `OPERADOR` |
| Acesso para consulta | `consulta.teste@heom.local` | `CONSULTA` |

Na tela de demonstração, clique em **Entrar sem senha** no cartão desejado. Não é necessário informar e-mail ou senha.

## Como são criadas

Na primeira inicialização do servidor demonstrativo, e também ao carregar uma base JSON já existente, o servidor verifica os quatro e-mails reservados e cria somente as contas ausentes. Cada conta recebe um segredo aleatório interno, cujo hash é armazenado na base JSON. Esse segredo não é mostrado nem solicitado ao avaliador.

A rota `POST /api/demo/quick-login` existe exclusivamente em `apps/api/src/demo-server.ts`. Ela não está registrada em `apps/api/src/server.ts`, que é o servidor institucional baseado em PostgreSQL.

## Habilitar ou desabilitar

Para habilitar na instância de demonstração hospedada, configure no serviço da API:

```dotenv
ENABLE_DEMO_PROFILES=true
```

Para desabilitar os cartões no ambiente local: 

```dotenv
ENABLE_DEMO_PROFILES=false
```

A hospedagem em `NODE_ENV=production` só habilita os cartões quando `ENABLE_DEMO_PROFILES=true` for definido explicitamente.

## Segurança e uso adequado

- Este acesso sem senha é exclusivamente para demonstração pública com registros fictícios.
- Qualquer visitante pode entrar nos perfis e alterar registros simulados; não trate a base como privada.
- Não cadastre pacientes, colaboradores, dados pessoais ou patrimônio real.
- Não habilite `ENABLE_DEMO_PROFILES` no servidor institucional. O servidor institucional não importa as rotas rápidas.
- `JWT_SECRET` continua obrigatório como segredo interno para assinar tokens; não é a senha do usuário e não deve ser compartilhado.
