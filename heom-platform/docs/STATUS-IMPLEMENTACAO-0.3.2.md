# Estado da implementação — HEOM 0.3.2

## Perfis de avaliação

Foram adicionados quatro perfis fictícios ao modo de demonstração local:

- Administrador de teste (`ADMIN`);
- Gestor patrimonial (`GESTOR`);
- Operador de inventário (`OPERADOR`);
- Acesso para consulta (`CONSULTA`).

O backend cria as contas ausentes no arquivo JSON, sem modificar usuários existentes. As senhas internas são segredos aleatórios e só seus hashes são persistidos. A tela de login consulta `/api/demo/profiles` e apresenta cartões que chamam `/api/demo/quick-login`. A rota gera uma sessão de oito horas e registra o acesso na auditoria.

## Limites e proteção

- O fluxo de entrada rápida existe somente no `demo-server.ts`.
- O servidor PostgreSQL institucional (`server.ts`) não registra essas rotas.
- O fluxo fica desativado se `ENABLE_DEMO_PROFILES=false` ou `NODE_ENV=production`.
- O Vite e a API de demonstração ficam ligados a `127.0.0.1` por padrão.
- O script institucional define `VITE_DEV_HOST=0.0.0.0` para permitir o acesso controlado pela LAN cabeada; a API institucional não possui entrada rápida.
- Contas e dados são fictícios; nunca usar como acesso real do HEOM.

## Validações executadas nesta alteração

- Verificação sintática TypeScript/TSX dos arquivos alterados: aprovada pelo parser global TypeScript.
- Teste isolado da lista de perfis: quatro funções, quatro e-mails únicos e detecção de e-mail não cadastrado — aprovado.
- `npm run typecheck`, `npm run test` do workspace e `npm run build` completo: não executados nesta sessão, pois as dependências npm do projeto não estão instaladas no ambiente de edição.
