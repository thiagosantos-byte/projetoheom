# Registro histórico — HEOM 0.3.2 (substituído)

Este documento descreve o antigo fluxo de demonstração por cartões de login rápido, e-mails internos fictícios e JWT. Ele foi substituído na versão 0.4.0.

Na versão atual:
- não existem e-mails, senhas, contas ou JWT para os perfis públicos;
- a seleção é feita diretamente por papel (ADMIN, GESTOR, OPERADOR, CONSULTA);
- os dados da demonstração ficam no navegador (localStorage e IndexedDB);
- frontend e API têm uma única instalação raiz e uma única publicação Vercel;
- o fluxo padrão local usa um processo/porta e não exige `.env`.

Consulte `README.md`, `docs/ARCHITECTURE.md` e `docs/DEPLOY-VERCEL.md` para as instruções válidas.
