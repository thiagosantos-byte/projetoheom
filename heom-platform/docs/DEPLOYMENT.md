# Implantação HEOM — referência histórica

Para a demonstração pública, siga exclusivamente `docs/DEPLOY-VERCEL.md`: um projeto Vercel, Root Directory `heom-platform`, `npm install`, `npm run build` e saída `apps/web/dist`.

O modo demonstrativo não exige PostgreSQL, MQTT, Docker, Render, credenciais nem `.env`.

O conteúdo deste documento foi mantido como referência histórica da arquitetura institucional nativa. Qualquer uso institucional exige projeto separado de segurança, autenticação servidor-side, banco persistente, mídia privada, infraestrutura de rede, backup e homologação; os scripts e o servidor institucional legados não são iniciados pela configuração padrão 0.5.1.

O `vercel.json` inclui fallback para as rotas da SPA, preservando o prefixo `/api/*` para a Function.
