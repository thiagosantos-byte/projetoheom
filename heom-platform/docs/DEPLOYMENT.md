# Implantação nativa do HEOM (sem Docker)

## Modo de demonstração local

Usa o arquivo JSON e o simulador interno. Execute `bash ./scripts/iniciar.sh` no Git Bash ou `scripts/iniciar.ps1` no PowerShell. Não exige PostgreSQL, Mosquitto, internet em tempo de execução ou privilégios administrativos.

## Modo institucional nativo

Pré-requisitos: PostgreSQL e Mosquitto instalados como serviços nativos. A equipe de TI deve configurar usuários, senhas, ACL, firewall, diretório de dados, backup e certificados antes de iniciar.

O script `scripts/iniciar-institucional.sh` aplica migrações e seed e inicia `dev:infra`. Ele não instala nem inicia PostgreSQL/Mosquitto: a instalação desses serviços é uma etapa administrativa do host e deve obedecer à política local.

## Windows 10/11

1. Instale Node.js 22 LTS ou superior compatível e npm para o usuário/desenvolvedor.
2. No modo institucional, instale PostgreSQL por instalador nativo e configure banco/usuário `heom` com senha própria. Restrinja o listener e o firewall à rede aprovada.
3. Instale Mosquitto como serviço nativo. Crie arquivo de senha e ACL; não permita publicação anônima na rede do hospital.
4. Configure `.env` e execute o script correspondente ao modo desejado.
5. Para parar os processos Node de desenvolvimento, pressione `Ctrl+C` no terminal que iniciou o sistema. Os serviços PostgreSQL/Mosquitto continuam gerenciados pelo Windows.

O modo de demonstração local não requer privilégios administrativos nem instala PostgreSQL/Mosquitto. Para OCR, instale Tesseract e os dados `por`/`eng` por um pacote institucional aprovado; não há download de modelo OCR em tempo de execução.

## Git Bash

A partir da raiz do monorepositório:

```bash
npm install
npm run typecheck
npm run test
npm run build
bash ./scripts/iniciar.sh
```

Para o modo institucional, use `bash ./scripts/iniciar-institucional.sh`.

## Produção

O servidor Vite é exclusivo para desenvolvimento/homologação. Em produção, sirva `apps/web/dist` por servidor HTTP/proxy reverso nativo aprovado pela TI, encaminhando `/api` à API Node e `/ws` ao WebSocket. Use HTTPS interno, hostname DNS interno, portas restritas e contas de serviço com privilégios mínimos.

## OCR e imagens

O armazenamento fica em `HEOM_STORAGE_DIR` (padrão `storage/` na raiz). Instale Tesseract e os modelos de idioma localmente. A inicialização normal não baixa dados OCR. O índice visual usa dHash gerado com Sharp e permanece no processo/aplicação, não chama APIs remotas.

## Backup/restauração

Demonstração: `scripts/backup-demonstracao.sh` copia JSON e imagens.
Institucional: agende `pg_dump` e cópia consistente de `storage/`; armazene em destino protegido, retenha versões e faça restaurações de teste. Não há promessa de backup institucional automaticamente configurado.
