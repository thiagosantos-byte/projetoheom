# Perfis de teste do HEOM 0.3.2

## Objetivo

Permitir que uma pessoa avaliadora experimente os diferentes níveis de permissão sem precisar criar manualmente várias contas.

## Contas disponíveis no modo demonstrativo local

| Nome exibido | E-mail | Perfil |
|---|---|---|
| Administrador de teste | `admin.teste@heom.local` | `ADMIN` |
| Gestor patrimonial | `gestor.teste@heom.local` | `GESTOR` |
| Operador de inventário | `operador.teste@heom.local` | `OPERADOR` |
| Acesso para consulta | `consulta.teste@heom.local` | `CONSULTA` |

Os perfis aparecem como cartões na própria tela de login. Clique em **Entrar com este perfil** para iniciar uma sessão de avaliação. Não é necessário memorizar nem digitar senhas.

## Como são criadas

Na primeira inicialização do modo local, e também ao carregar uma base JSON de uma versão anterior, o servidor demonstrativo verifica os quatro e-mails reservados e cria somente as contas ausentes. Cada conta recebe um segredo aleatório, cujo hash é armazenado na base JSON. A rotina não modifica usuários já existentes.

A rota de entrada rápida (`POST /api/demo/quick-login`) existe exclusivamente em `apps/api/src/demo-server.ts`. Ela não está registrada em `apps/api/src/server.ts`, que é o servidor institucional baseado em PostgreSQL. As contas de teste não são criadas pelo seed institucional.

## Desativar

No `.env`, defina:

```dotenv
ENABLE_DEMO_PROFILES=false
```

Reinicie a aplicação. Os cartões e as rotas de entrada rápida deixam de ser disponibilizados.

## Segurança e uso adequado

- Os perfis e todos os registros gerados no modo demonstrativo são fictícios.
- A entrada rápida dispensa senha e existe para facilitar a avaliação local.
- Não exponha o servidor demonstrativo em redes públicas ou institucionais.
- Não use contas de teste para qualquer operação oficial do HEOM.
- O ambiente institucional exige contas próprias, com senhas individuais e permissões atribuídas pela administração.
